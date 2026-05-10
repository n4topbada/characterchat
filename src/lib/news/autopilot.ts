import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { buildTemporalContext } from "@/lib/temporal/timeline";
import {
  draftProactiveNewsLine,
  saveRealtimeNewsChunk,
  searchRealtimeNews,
} from "@/lib/news/realtime";
import { GEMINI_MODELS, withGeminiFallback } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";

const PROACTIVE_COOLDOWN_MS = 45 * 60 * 1000;
const ACTIVE_STATES = new Set(["free", "personal", "late_night", "meal"]);

function isStale(lastCheckedAt: Date | null, freshnessHours: number): boolean {
  if (!lastCheckedAt) return true;
  return Date.now() - lastCheckedAt.getTime() > freshnessHours * 60 * 60 * 1000;
}

function parseJsonArray(text: string): unknown[] {
  const raw = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function inferAndCreateInterests(args: {
  characterId: string;
  name: string;
  role?: string | null;
  worldContext?: string | null;
  backstorySummary: string;
  coreMotivations: string[];
  shortTags: string[];
}) {
  const prompt = [
    "캐릭터의 최신 뉴스/트렌드 관심사 검색어를 만든다.",
    "JSON 배열만 출력한다. 설명 금지.",
    "각 원소: {\"label\":\"짧은 표시명\",\"query\":\"뉴스 검색어\",\"priority\":1-100,\"freshnessHours\":1-168}",
    "실제 최신 정보가 필요할 만한 관심사만 고른다. 작품 내부 고유 기억, 사적인 감정은 제외한다.",
    "K-POP, 배우, 작품명, 게임, 패션, 스포츠, 직업/업계, 지역 이벤트처럼 검색 가능한 주제를 우선한다.",
    "",
    `name: ${args.name}`,
    `role: ${args.role ?? ""}`,
    `worldContext: ${args.worldContext ?? ""}`,
    `backstory: ${args.backstorySummary}`,
    `motivations: ${args.coreMotivations.join(", ")}`,
    `tags: ${args.shortTags.join(", ")}`,
  ].join("\n");

  const text = await withGeminiFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODELS.pro,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.25,
        maxOutputTokens: 1024,
        safetySettings: PERMISSIVE_SAFETY,
      },
    });
    return resp.text ?? "[]";
  }).catch(() => "[]");

  const rows = parseJsonArray(text)
    .map((item) => item as Record<string, unknown>)
    .filter((item) => typeof item.label === "string" && typeof item.query === "string")
    .slice(0, 8);

  for (const item of rows) {
    await prisma.characterInterest.upsert({
      where: {
        characterId_query: {
          characterId: args.characterId,
          query: String(item.query).slice(0, 200),
        },
      },
      update: {
        label: String(item.label).slice(0, 80),
        priority: typeof item.priority === "number" ? Math.max(1, Math.min(100, Math.round(item.priority))) : 50,
        freshnessHours:
          typeof item.freshnessHours === "number"
            ? Math.max(1, Math.min(168, Math.round(item.freshnessHours)))
            : 24,
        enabled: true,
      },
      create: {
        id: newId(),
        characterId: args.characterId,
        label: String(item.label).slice(0, 80),
        query: String(item.query).slice(0, 200),
        priority: typeof item.priority === "number" ? Math.max(1, Math.min(100, Math.round(item.priority))) : 50,
        freshnessHours:
          typeof item.freshnessHours === "number"
            ? Math.max(1, Math.min(168, Math.round(item.freshnessHours)))
            : 24,
        enabled: true,
      },
    });
  }
}

export async function ensureProactiveNewsTask(args: {
  sessionId: string;
  userId: string;
}): Promise<{ queued: boolean; reason: string; taskId?: string }> {
  const pending = await prisma.botTask.findFirst({
    where: {
      sessionId: args.sessionId,
      userId: args.userId,
      status: { in: ["pending", "running"] },
      type: "proactive_news",
    },
    select: { id: true },
  });
  if (pending) return { queued: false, reason: "already_pending" };

  const recent = await prisma.botTask.findFirst({
    where: {
      sessionId: args.sessionId,
      userId: args.userId,
      type: "proactive_news",
      createdAt: { gte: new Date(Date.now() - PROACTIVE_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return { queued: false, reason: "cooldown" };

  const session = await prisma.session.findUnique({
    where: { id: args.sessionId },
    include: {
      character: {
        include: {
          personaCore: true,
          interests: {
            where: { enabled: true },
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
            take: 12,
          },
        },
      },
    },
  });
  if (!session || session.userId !== args.userId) {
    return { queued: false, reason: "session_not_found" };
  }
  const core = session.character.personaCore;
  if (!core) return { queued: false, reason: "persona_missing" };

  const temporal = buildTemporalContext({
    lastInteractionAt: session.lastMessageAt,
    character: { slug: session.character.slug, role: core.role },
  });
  if (!ACTIVE_STATES.has(temporal.lifeState)) {
    return { queued: false, reason: `inactive_time:${temporal.lifeState}` };
  }

  let interests = session.character.interests;
  if (interests.length === 0) {
    await inferAndCreateInterests({
      characterId: session.characterId,
      name: core.displayName,
      role: core.role,
      worldContext: core.worldContext,
      backstorySummary: core.backstorySummary,
      coreMotivations: core.coreMotivations,
      shortTags: core.shortTags,
    });
    interests = await prisma.characterInterest.findMany({
      where: { characterId: session.characterId, enabled: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 12,
    });
  }

  const interest = interests.find((item) =>
    isStale(item.lastCheckedAt, item.freshnessHours),
  );
  if (!interest) return { queued: false, reason: "fresh" };

  await prisma.characterInterest.update({
    where: { id: interest.id },
    data: { lastCheckedAt: new Date() },
  });

  const found = await searchRealtimeNews({
    query: interest.query,
    characterName: core.displayName,
    nowLabel: temporal.localLabel,
  }).catch((e) => {
    console.warn(
      "[news-autopilot] search failed:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  });
  if (!found?.summary) return { queued: false, reason: "search_empty" };

  const chunkId = await saveRealtimeNewsChunk({
    characterId: session.characterId,
    userId: args.userId,
    sessionId: session.id,
    topic: interest.query,
    summary: found.summary,
    sourceUrls: found.sourceUrls,
    raw: found.raw,
    ttlHours: interest.freshnessHours,
  });

  const text = await draftProactiveNewsLine({
    characterName: core.displayName,
    speechHint: core.speechRegister,
    summary: found.summary,
    nowLabel: temporal.localLabel,
  }).catch((e) => {
    console.warn(
      "[news-autopilot] draft failed:",
      e instanceof Error ? e.message : String(e),
    );
    return "";
  });
  if (!text) return { queued: false, reason: "draft_empty" };

  const task = await prisma.botTask.create({
    data: {
      id: newId(),
      sessionId: session.id,
      characterId: session.characterId,
      userId: args.userId,
      type: "proactive_news",
      status: "pending",
      scheduledAt: new Date(),
      payload: {
        text,
        chunkId,
        query: interest.query,
        sourceUrls: found.sourceUrls,
        reason: "auto_interest_stale",
      },
    },
    select: { id: true },
  });

  return { queued: true, reason: "queued", taskId: task.id };
}
