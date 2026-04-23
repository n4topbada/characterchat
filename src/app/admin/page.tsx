import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TopAppBar } from "@/components/nav/TopAppBar";
import Link from "next/link";
import { Wand2 } from "lucide-react";
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
      <TopAppBar title="관리자" backHref="/me" />
      <div className="max-w-md mx-auto px-6 pt-8 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              캐릭터 ({characters.length})
            </h2>
            {/* Caster 열기 — 카드 CTA 와 동일한 skew-parallelogram 아이콘블록 */}
            <Link
              href={{ pathname: "/admin/caster" }}
              className="relative group inline-flex items-center overflow-hidden active:scale-[0.98] transition-transform"
              aria-label="Caster 열기"
            >
              <div
                className="absolute inset-0 bg-primary group-hover:brightness-110 transition-all"
                style={{ transform: "skewX(-12deg)" }}
              />
              <div className="relative flex items-center gap-1.5 px-3 py-1.5 text-on-primary font-headline font-bold tracking-[0.15em] uppercase text-[11px]">
                <Wand2 size={14} strokeWidth={2.5} />
                <span>Caster</span>
              </div>
            </Link>
          </div>
          <div className="space-y-3">
            {characters.map((c) => (
              // 카드 전체 클릭 → 편집 화면. 편집 화면 헤더에 삭제 버튼 있음.
              // 그 전엔 div 라 클릭 불가였고 admin 이 편집/삭제에 도달할 경로가 없었다.
              <Link
                key={c.id}
                href={{ pathname: `/admin/characters/${c.id}` }}
                className="block bg-surface-container-lowest rounded-lg p-4 shadow-card hover:bg-surface-container-low active:scale-[0.99] transition-transform"
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
                  {/* 상태 칩 — 카드 태그와 동일 규약: 샤프 사각 + border. rounded-full pill 제거. */}
                  <span
                    className={[
                      "shrink-0 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border",
                      c.isPublic
                        ? "border-primary/40 text-primary bg-primary/10"
                        : "border-outline-variant/50 text-on-surface-variant bg-surface-container-low",
                    ].join(" ")}
                  >
                    {c.isPublic ? "Public" : "Draft"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
