import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * /admin/caster 는 리스트 페이지가 아니라 항상 "현재 작업 중인 초안" 하나를
 * 열어주는 엔트리다. 사용자당 active Caster run 은 1개로 강제된다:
 *
 *   1) 작업 중(running / draft_ready)이던 초안이 있으면 그리로 이동 (재개)
 *   2) 그런 초안이 하나도 없으면 새 초안을 즉석에서 만들어 그리로 이동
 *
 * 새 초안을 시작하려면 현재 run 을 commit(저장) 또는 cancel(삭제) 해야 한다.
 * 이 규칙은 API (POST /api/admin/caster/runs) 에도 동일하게 걸려 있어
 * 직접 호출로도 우회할 수 없다.
 */
export default async function CasterHome() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/caster");
  if (session.user.role !== "admin") redirect("/find");

  const active = await prisma.casterRun.findFirst({
    where: {
      adminUserId: session.user.id,
      status: { in: ["running", "draft_ready"] },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (active) redirect(`/admin/caster/${active.id}`);

  const fresh = await prisma.casterRun.create({
    data: {
      id: newId(),
      adminUserId: session.user.id,
      status: "running",
    },
    select: { id: true },
  });
  redirect(`/admin/caster/${fresh.id}`);
}
