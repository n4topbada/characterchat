import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { StartChatButton } from "./StartChatButton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SafePortrait } from "@/components/character/SafePortrait";
import { PhysicalStats } from "@/components/character/PhysicalStats";
import { mergeIntro, deriveShortTags } from "@/lib/character-display";

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
          shortTags: true,
          role: true,
          species: true,
          backstorySummary: true,
          ageText: true,
          heightCm: true,
          weightKg: true,
          threeSize: true,
          mbti: true,
        },
      },
    },
  });
  if (!c || !c.isPublic) notFound();

  // 카드와 동일 규약: shortTags 우선, 비어 있으면 role 마지막 토큰 + species + MBTI 로 derive.
  const tags =
    c.personaCore?.shortTags && c.personaCore.shortTags.length > 0
      ? c.personaCore.shortTags.slice(0, 6)
      : deriveShortTags({
          role: c.personaCore?.role,
          species: c.personaCore?.species,
          mbti: c.personaCore?.mbti,
        }).slice(0, 6);

  // tagline + backstory 를 단일 intro 로 통합.
  const intro = mergeIntro(c.tagline, c.personaCore?.backstorySummary);

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

      {/* Card — 슬림 레이아웃: 이름 → (1줄) 단어형 태그 → 통합 intro → 신체 스탯 → CTA */}
      <section className="-mt-16 relative z-20 px-4">
        <div className="bg-surface-container-lowest rounded-lg shadow-tinted-lg relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="p-7 pl-8 space-y-3">
            {/* 이름 */}
            <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight tracking-tight">
              {c.name}
            </h2>

            {/* 단어형 태그 칩 — 1줄, 통일 스타일 (카드와 동일 규약). 길이 넘치면 가로 스크롤. */}
            {tags.length > 0 && (
              <div className="-mx-1 overflow-x-auto">
                <ul className="flex items-center gap-1.5 px-1 whitespace-nowrap">
                  {tags.map((t) => (
                    <li
                      key={t}
                      className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm border border-outline-variant/50 text-on-surface-variant bg-surface-container-low"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 통합 intro — tagline + backstory 합본. 디테일 페이지는 clamp 없이 전체 노출. */}
            <p className="text-on-surface text-sm leading-relaxed">{intro}</p>

            {/* 신체 스탯 (나이/키/몸무게/쓰리사이즈/MBTI) — 슬림 1줄 */}
            <PhysicalStats
              stats={{
                ageText: c.personaCore?.ageText,
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
