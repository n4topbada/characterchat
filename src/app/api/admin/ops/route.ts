import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [tasks, events, taskCounts] = await Promise.all([
    prisma.botTask.findMany({
      orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
      take: 40,
      include: {
        character: { select: { name: true, slug: true } },
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.appEventLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        character: { select: { name: true, slug: true } },
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.botTask.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    tasks: tasks.map((task) => ({
      id: task.id,
      type: task.type,
      status: task.status,
      scheduledAt: task.scheduledAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      claimedAt: task.claimedAt,
      lockedUntil: task.lockedUntil,
      completedAt: task.completedAt,
      nextRetryAt: task.nextRetryAt,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      dedupeKey: task.dedupeKey,
      error: task.error,
      character: task.character,
      user: task.user,
      payload: task.payload,
    })),
    events: events.map((event) => ({
      id: event.id,
      level: event.level,
      event: event.event,
      message: event.message,
      status: event.status,
      model: event.model,
      latencyMs: event.latencyMs,
      createdAt: event.createdAt,
      character: event.character,
      user: event.user,
      taskId: event.taskId,
      sessionId: event.sessionId,
      metadata: event.metadata,
    })),
    taskCounts: Object.fromEntries(
      taskCounts.map((row) => [row.status, row._count._all]),
    ),
  });
}
