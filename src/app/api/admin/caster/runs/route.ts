import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const runs = await prisma.casterRun.findMany({
    where: { adminUserId: guard.userId },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      startedAt: true,
      endedAt: true,
      savedCharacterId: true,
      draftJson: true,
    },
  });

  return NextResponse.json({ runs });
}

/**
 * POST /api/admin/caster/runs
 *
 * 사용자당 "작성 중" 캐스터 세션은 1개만 존재한다. 이미 active 한 run
 * (status=running | draft_ready) 이 있으면 그 run 을 그대로 돌려준다 (idempotent).
 * 없을 때만 새로 만든다.
 *
 * 이 규칙으로 하단 "내 초안" 패널이 사라진 UX 에서도 사용자가 실수로 여러
 * 미완성 초안을 양산하지 못한다. 새 초안이 필요하면 현재 run 을 commit(저장)
 * 하거나 cancel(삭제) 해야 다음 POST 가 새 run 을 반환.
 */
export async function POST() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const active = await prisma.casterRun.findFirst({
    where: {
      adminUserId: guard.userId,
      status: { in: ["running", "draft_ready"] },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, startedAt: true },
  });
  if (active) {
    return NextResponse.json({ run: active, reused: true });
  }

  const run = await prisma.casterRun.create({
    data: {
      id: newId(),
      adminUserId: guard.userId,
      status: "running",
    },
    select: { id: true, status: true, startedAt: true },
  });

  return NextResponse.json({ run, reused: false }, { status: 201 });
}
