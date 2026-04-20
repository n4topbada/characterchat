import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { StartChatButton } from "./StartChatButton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SafePortrait } from "@/components/character/SafePortrait";
import { PhysicalStats } from "@/components/character/PhysicalStats";

export const dynamic = "force-dynamic";

export default async function CharacterLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await prisma.character.findUnique({
    where: { slug },
    include: {
      assets: { orderBy: { order: "asc" } },
      personaCore: {
        select: {
          appearanceKeys: true,
          backstorySummary: true,
          heightCm: true,
          weightKg: true,
          threeSize: true,
          mbti: true,
        },
      },
    },
  });
  if (!c || !c.isPublic) notFound();

  // 카드 태그 칩: appearanceKeys 에서 'ref image:' prefix 같은 내부 라벨 제외.
  const tags = (c.personaCore?.appearanceKeys ?? [])
    .filter((k) => !/^ref\s+image\s*:/i.test(k))
    .slice(0, 4);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/characters/${slug}`);
  }

  const portraitAsset = c.assets.find((a) => a.kind === "portrait");
  const heroAsset = c.assets.find((a) => a.kind === "hero") ?? portraitAsset;
  const hero = heroAsset?.animationUrl ?? heroAsset?.blobUrl ?? null;

  return (
    <main className="flex-1 min-h-0 bg-surface relative overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none dot-pattern opacity-30 z-0" />

      <header className="glass sticky top-0 inset-x-0 z-30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={"/find" as "/find"}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-md transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </Link>
            <div>
              <h1 className="font-headline font-black tracking-[0.15em] text-on-surface uppercase text-sm truncate max-w-[60vw]">
                {c.name}
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Hero portrait — SafePortrait : local public 은 최적화 우회, onError 시 gradient fallback */}
      <div className="relative h-[58dvh] w-full overflow-hidden z-10 -mt-16 pt-16">
        <SafePortrait src={hero} priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 diagonal-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface pointer-events-none" />
      </div>

      {/* Card — 슬림 레이아웃: 이름 → 태그 → 한줄 → 소개글 → 신체스탯 → CTA */}
      <section className="-mt-16 relative z-20 px-4">
        <div className="bg-surface-container-lowest rounded-lg shadow-tinted-lg relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="p-7 pl-8 space-y-4">
            {/* 이름 */}
            <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight tracking-tight">
              {c.name}
            </h2>

            {/* 태그 칩 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <span
                    key={t}
                    className={[
                      "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm truncate max-w-[14rem]",
                      i % 3 === 0
                        ? "bg-tertiary-container text-on-tertiary-container"
                        : i % 3 === 1
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface-container-high text-on-surface-variant",
                    ].join(" ")}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* 한 줄 소개 */}
            <p className="text-on-surface text-sm leading-relaxed font-medium">
              {c.tagline}
            </p>

            {/* 소개글 */}
            {c.personaCore?.backstorySummary && (
              <p className="text-on-surface-variant text-sm leading-relaxed">
                {c.personaCore.backstorySummary}
              </p>
            )}

            {/* 신체 스탯 (키/몸무게/쓰리사이즈/MBTI) */}
            <PhysicalStats
              stats={{
                heightCm: c.personaCore?.heightCm,
                weightKg: c.personaCore?.weightKg,
                threeSize: c.personaCore?.threeSize,
                mbti: c.personaCore?.mbti,
              }}
            />

            {/* CTA */}
            <div className="pt-2">
              <StartChatButton characterId={c.id} />
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" />
    </main>
  );
}
