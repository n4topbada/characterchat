import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const [
    users,
    admins,
    characters,
    publicCharacters,
    sessions,
    messages,
    pendingTasks,
    runningTasks,
    failedTasks,
    recentErrors,
  ] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.character.count(),
      prisma.character.count({ where: { isPublic: true } }),
      prisma.session.count(),
      prisma.message.count(),
      prisma.botTask.count({ where: { status: "pending" } }),
      prisma.botTask.count({ where: { status: "running" } }),
      prisma.botTask.count({ where: { status: "failed" } }),
      prisma.appEventLog.count({
        where: {
          level: "error",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  return NextResponse.json({
    users,
    admins,
    characters,
    publicCharacters,
    sessions,
    messages,
    pendingTasks,
    runningTasks,
    failedTasks,
    recentErrors,
  });
}
