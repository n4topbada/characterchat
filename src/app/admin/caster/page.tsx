import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * /admin/caster 는 리스트 페이지가 아니라 항상 하나의 초안(=Caster run)을
 * 열어주는 엔트리다. 2단 뎁스를 없앴기 때문에:
 *
 *   1) 작업 중(running / draft_ready)이던 초안이 있으면 그리로 이동
 *   2) 그런 초안이 하나도 없으면 새 초안을 즉석에서 만들어 그리로 이동
 *
 * 다른 초안으로 전환하는 네비게이션은 /admin/caster/[runId] 하단의 "초안 목록"
 * 스트립에서 수행한다 (CasterConsole 하단 패널).
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
