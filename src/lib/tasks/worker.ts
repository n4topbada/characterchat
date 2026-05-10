import { Prisma, type BotTask } from "@prisma/client";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { elapsedMs, logEvent } from "@/lib/observability/log";
import { buildTemporalContext } from "@/lib/temporal/timeline";
import {
  draftProactiveNewsLine,
  saveRealtimeNewsChunk,
  searchRealtimeNews,
} from "@/lib/news/realtime";

const LOCK_MS = 2 * 60 * 1000;
const RETRY_MS = [30_000, 3 * 60_000, 15 * 60_000];

type WorkerResult = {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
  skipped: number;
};

function backoffForAttempt(attempt: number): number {
  return RETRY_MS[Math.min(Math.max(0, attempt - 1), RETRY_MS.length - 1)];
}

function asPayload(payload: Prisma.JsonValue | null): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

async function claimOne() {
  const now = new Date();
  const task = await prisma.botTask.findFirst({
    where: {
      status: { in: ["pending", "running"] },
      scheduledAt: { lte: now },
      OR: [
        { status: "pending" },
        { lockedUntil: { lt: now } },
        { lockedUntil: null },
      ],
      AND: [
        {
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
      ],
      type: { in: ["refresh_interest_news", "rollup_episode", "rollup_relation"] },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  if (!task) return null;

  try {
    return await prisma.botTask.update({
      where: { id: task.id },
      data: {
        status: "running",
        claimedAt: now,
        lockedUntil: new Date(now.getTime() + LOCK_MS),
        attemptCount: { increment: 1 },
      },
    });
  } catch {
    return null;
  }
}

async function completeTask(task: BotTask, metadata?: unknown) {
  await prisma.botTask.update({
    where: { id: task.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      lockedUntil: null,
      error: null,
    },
  });
  await logEvent({
    event: "task.completed",
    taskId: task.id,
    sessionId: task.sessionId,
    userId: task.userId,
    characterId: task.characterId,
    status: task.type,
    metadata,
  });
}

async function failTask(task: BotTask, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const exhausted = task.attemptCount >= task.maxAttempts;
  if (exhausted) {
    await prisma.botTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        lockedUntil: null,
        error: message,
      },
    });
    await logEvent({
      level: "error",
      event: "task.failed",
      message,
      taskId: task.id,
      sessionId: task.sessionId,
      userId: task.userId,
      characterId: task.characterId,
      status: task.type,
      metadata: { attemptCount: task.attemptCount, maxAttempts: task.maxAttempts },
    });
    return "failed" as const;
  }

  await prisma.botTask.update({
    where: { id: task.id },
    data: {
      status: "pending",
      lockedUntil: null,
      nextRetryAt: new Date(Date.now() + backoffForAttempt(task.attemptCount)),
      error: message,
    },
  });
  await logEvent({
    level: "warn",
    event: "task.retry_scheduled",
    message,
    taskId: task.id,
    sessionId: task.sessionId,
    userId: task.userId,
    characterId: task.characterId,
    status: task.type,
    metadata: { attemptCount: task.attemptCount, maxAttempts: task.maxAttempts },
  });
  return "retried" as const;
}

async function handleRefreshInterestNews(task: BotTask) {
  const payload = asPayload(task.payload);
  const query = typeof payload.query === "string" ? payload.query : "";
  const freshnessHours =
    typeof payload.freshnessHours === "number" ? payload.freshnessHours : 24;
  if (!query) throw new Error("query_missing");

  const session = await prisma.session.findUnique({
    where: { id: task.sessionId },
    include: {
      character: { include: { personaCore: true } },
    },
  });
  if (!session?.character.personaCore) throw new Error("session_or_persona_missing");
  const core = session.character.personaCore;
  const temporal = buildTemporalContext({
    lastInteractionAt: session.lastMessageAt,
    character: { slug: session.character.slug, role: core.role },
  });

  const startedAt = performance.now();
  const found = await searchRealtimeNews({
    query,
    characterName: core.displayName,
    nowLabel: temporal.localLabel,
  });
  await logEvent({
    event: "news.search.completed",
    taskId: task.id,
    sessionId: task.sessionId,
    userId: task.userId,
    characterId: task.characterId,
    latencyMs: elapsedMs(startedAt),
    metadata: { query, sourceCount: found.sourceUrls.length },
  });

  const chunkId = await saveRealtimeNewsChunk({
    characterId: task.characterId,
    userId: task.userId,
    sessionId: task.sessionId,
    topic: query,
    summary: found.summary,
    sourceUrls: found.sourceUrls,
    raw: found.raw,
    ttlHours: freshnessHours,
  });

  const text = await draftProactiveNewsLine({
    characterName: core.displayName,
    speechHint: core.speechRegister,
    summary: found.summary,
    nowLabel: temporal.localLabel,
  });
  if (!text) throw new Error("proactive_text_empty");

  await prisma.botTask.create({
    data: {
      id: newId(),
      sessionId: task.sessionId,
      characterId: task.characterId,
      userId: task.userId,
      type: "proactive_news",
      status: "pending",
      scheduledAt: new Date(),
      payload: {
        text,
        chunkId,
        query,
        sourceUrls: found.sourceUrls,
        parentTaskId: task.id,
      },
      dedupeKey: `deliver:${task.sessionId}:proactive_news:${chunkId}`,
    },
  });
  return { chunkId, query };
}

async function handleTask(task: BotTask) {
  await logEvent({
    event: "task.claimed",
    taskId: task.id,
    sessionId: task.sessionId,
    userId: task.userId,
    characterId: task.characterId,
    status: task.type,
    metadata: { attemptCount: task.attemptCount + 1 },
  });

  if (task.type === "refresh_interest_news") {
    return handleRefreshInterestNews(task);
  }
  return { skipped: true, reason: "handler_not_implemented", type: task.type };
}

export async function runBotTaskWorker(args?: { limit?: number }): Promise<WorkerResult> {
  const limit = Math.max(1, Math.min(args?.limit ?? 5, 25));
  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
  };

  for (let i = 0; i < limit; i++) {
    const task = await claimOne();
    if (!task) break;
    result.processed += 1;
    try {
      const metadata = await handleTask(task);
      if ((metadata as { skipped?: boolean })?.skipped) result.skipped += 1;
      await completeTask(task, metadata);
      result.completed += 1;
    } catch (e) {
      const status = await failTask(task, e);
      if (status === "failed") result.failed += 1;
      else result.retried += 1;
    }
  }

  return result;
}
