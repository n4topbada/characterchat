import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TopAppBar } from "@/components/nav/TopAppBar";
import Link from "next/link";
import { NewRunButton } from "./NewRunButton";

export const dynamic = "force-dynamic";

export default async function CasterHome() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/caster");
  if (session.user.role !== "admin") redirect("/find");

  const runs = await prisma.casterRun.findMany({
    where: { adminUserId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 30,
    select: {
      id: true,
      status: true,
      startedAt: true,
      savedCharacterId: true,
      draftJson: true,
    },
  });

  return (
    <main className="min-h-dvh bg-surface">
      <TopAppBar title="Caster" subtitle="character_designer" />
      <div className="max-w-md mx-auto px-6 pt-8 space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-headline text-lg font-bold text-on-surface">
            세션 ({runs.length})
          </h2>
          <NewRunButton />
        </div>

        <div className="space-y-3">
          {runs.length === 0 ? (
            <p className="text-sm text-on-surface-variant px-2">
              아직 시작된 세션이 없습니다. 새 세션을 시작해 캐릭터를 설계해
              보세요.
            </p>
          ) : (
            runs.map((r) => {
              const draftName =
                (r.draftJson as { name?: string } | null)?.name ?? null;
              return (
                <Link
                  key={r.id}
                  href={{ pathname: `/admin/caster/${r.id}` }}
                  className="block bg-surface-container-lowest rounded-lg p-4 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-on-surface-variant/70">
                        {r.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                      </p>
                      <h3 className="font-bold text-on-surface truncate mt-0.5">
                        {draftName ?? "이름 미정"}
                      </h3>
                    </div>
                    <span
                      className={[
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                        r.status === "saved"
                          ? "bg-secondary-container text-on-secondary-container"
                          : r.status === "draft_ready"
                            ? "bg-primary-container text-on-primary-container"
                            : "bg-surface-container-high text-on-surface-variant",
                      ].join(" ")}
                    >
                      {r.status}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
