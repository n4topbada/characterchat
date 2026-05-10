import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";

type LogLevel = "debug" | "info" | "warn" | "error";

export async function logEvent(args: {
  level?: LogLevel;
  event: string;
  message?: string | null;
  userId?: string | null;
  characterId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  model?: string | null;
  status?: string | null;
  latencyMs?: number | null;
  metadata?: unknown;
}) {
  try {
    await prisma.appEventLog.create({
      data: {
        id: newId(),
        level: args.level ?? "info",
        event: args.event,
        message: args.message ?? null,
        userId: args.userId ?? null,
        characterId: args.characterId ?? null,
        sessionId: args.sessionId ?? null,
        taskId: args.taskId ?? null,
        model: args.model ?? null,
        status: args.status ?? null,
        latencyMs: args.latencyMs ?? null,
        metadata:
          args.metadata === undefined
            ? undefined
            : args.metadata === null
              ? Prisma.JsonNull
              : (args.metadata as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.warn("[observability] log failed", e);
  }
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
