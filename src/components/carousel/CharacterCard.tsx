"use client";
import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";
import { SafePortrait } from "@/components/character/SafePortrait";
import { PhysicalStats } from "@/components/character/PhysicalStats";
import { mergeIntro } from "@/lib/character-display";

export type CarouselCharacter = {
  slug: string;
  name: string;
  /** 한줄 소개 (tagline) — backstory 와 ','로 결합되어 단일 intro 가 된다 */
  tagline: string;
  accentColor: string;
  portraitUrl: string | null;
  /** PersonaCore.shortTags — 단어형, 1줄. 비어 있을 땐 derive. */
  tags?: string[];
  /** PersonaCore.backstorySummary — tagline 과 합쳐 하나의 intro 로 노출 */
  backstorySummary?: string | null;
  /** 신체 스펙 (+나이) — 슬림 1줄 스탯 스트립 */
  ageText?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

/**
 * Character card — Scholastic Archive 스타일 풀스크린 카드.
 *
 * 슬림 레이아웃:
 *   이름 → (1줄) 단어형 태그 → (2~3줄) 합쳐진 intro → 초슬림 스탯 스트립 → CTA
 */
export function CharacterCard({ c }: { c: CarouselCharacter; index: number }) {
  const tags = (c.tags ?? []).slice(0, 6);
  const intro = mergeIntro(c.tagline, c.backstorySummary);

  return (
    <section className="h-full w-full snap-start relative flex flex-col px-5 pt-6 pb-6">
      {/* Portrait frame — SafePortrait: local 은 unoptimized, 실패 시 gradient fallback */}
      <div className="absolute inset-0 z-0">
        <SafePortrait
          src={c.portraitUrl}
          priority
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover"
        />
        <div className="absolute inset-0 diagonal-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent pointer-events-none" />
      </div>

      {/* Geometric frame decoration */}
      <div className="absolute top-32 right-5 w-16 h-16 border-t-2 border-r-2 border-primary/30 z-10 pointer-events-none" />
      <div className="absolute bottom-40 left-5 w-16 h-16 border-b-2 border-l-2 border-primary/30 z-10 pointer-events-none" />

      {/* Card shell */}
      <div className="mt-auto relative z-10 max-w-md mx-auto w-full">
        <div className="glass-strong ghost-border rounded-lg overflow-hidden shadow-tinted-lg">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

          <div className="p-6 pl-7 space-y-3">
            {/* 이름 */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-headline text-3xl font-bold text-on-surface leading-tight tracking-tight truncate">
                {c.name}
              </h2>
              <button
                type="button"
                aria-label="Bookmark"
                className="shrink-0 p-2 bg-surface-container-high hover:bg-surface-container-highest transition-colors active:scale-95 rounded-md"
              >
                <Bookmark size={16} strokeWidth={2} className="text-primary" />
              </button>
            </div>

            {/* 단어형 태그 — 1줄, 통일 스타일 (no more 3-color rotation).
                길이 넘치면 가로 스크롤 허용. */}
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

            {/* 통합 intro — tagline + backstory 합본. 카드에서는 3줄까지. */}
            <p className="text-on-surface leading-relaxed line-clamp-3 text-sm">
              {intro}
            </p>

            {/* 신체 스탯 — 슬림 1줄 */}
            <PhysicalStats
              stats={{
                ageText: c.ageText,
                heightCm: c.heightCm,
                weightKg: c.weightKg,
                threeSize: c.threeSize,
                mbti: c.mbti,
              }}
            />

            {/* CTA — parallelogram */}
            <Link
              href={`/characters/${c.slug}`}
              className="relative group flex items-center justify-center overflow-hidden h-14 active:scale-[0.98] transition-transform mt-2"
            >
              <div
                className="absolute inset-0 btn-cta-gradient group-hover:brightness-110 transition-all"
                style={{ transform: "skewX(-12deg)" }}
              />
              <div className="relative flex items-center gap-3 text-on-primary font-headline font-bold tracking-[0.2em] text-sm">
                <span>대화 시작</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
