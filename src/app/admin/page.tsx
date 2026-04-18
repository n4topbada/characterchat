import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TopAppBar } from "@/components/nav/TopAppBar";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin");
  if (session.user.role !== "admin") redirect("/find");

  const characters = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true, tagline: true, isPublic: true },
  });

  return (
    <main className="min-h-dvh bg-surface">
      <TopAppBar title="관리자" />
      <div className="max-w-md mx-auto px-6 pt-8 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              캐릭터 ({characters.length})
            </h2>
            <Link
              href={{ pathname: "/admin/caster" }}
              className="text-primary font-bold text-sm"
            >
              Caster 열기
            </Link>
          </div>
          <div className="space-y-3">
            {characters.map((c) => (
              <div
                key={c.id}
                className="bg-surface-container-lowest rounded-lg p-4 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-on-surface truncate">
                      {c.name}
                    </h3>
                    <p className="text-xs text-on-surface-variant truncate">
                      /{c.slug} · {c.tagline}
                    </p>
                  </div>
                  <span
                    className={[
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                      c.isPublic
                        ? "bg-secondary-container text-on-secondary-container"
                        : "bg-surface-container-high text-on-surface-variant",
                    ].join(" ")}
                  >
                    {c.isPublic ? "Public" : "Draft"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
