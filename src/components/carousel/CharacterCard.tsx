"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bookmark } from "lucide-react";

export type CarouselCharacter = {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  portraitUrl: string | null;
  tags?: string[];
  /** PersonaCore.role — 한 줄 직업/포지션 */
  role?: string | null;
  /** PersonaCore.ageText */
  ageText?: string | null;
  /** PersonaCore.species — 인간/이종족 등 */
  species?: string | null;
  /** PersonaCore.worldContext — 세계 배경 한 줄 */
  worldContext?: string | null;
  /** PersonaCore.backstorySummary — 원문. 카드에선 짧게 자른다 */
  backstorySummary?: string | null;
};

function composeMeta(c: CarouselCharacter): string | null {
  const parts = [c.role, c.ageText, c.species].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function firstSentence(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // 문장 경계(. / 。 / ! / ?) 우선, 없으면 max 에서 자르고 …
  const m = clean.slice(0, max).match(/^(.+?[.!?。])/);
  if (m) return m[1];
  return clean.slice(0, max - 1) + "…";
}

const FALLBACK_BG =
  "linear-gradient(135deg, #3a5f94 0%, #a7c8ff 45%, #cee9d9 100%)";

/**
 * Character card — Scholastic Archive 스타일 풀스크린 카드.
 * - 배경에 포트레이트, 하단에 이름·한 줄 태그라인·태그 칩·CTA.
 * - 이전에 있던 SCHOLAR_NNN / REF_ARCHIVE.V1 같은 내부 식별자 라벨은
 *   유저 사이드로 노출되어 혼란을 주어 제거했다.
 */
export function CharacterCard({ c }: { c: CarouselCharacter; index: number }) {
  return (
    <section className="h-full w-full snap-start relative flex flex-col px-5 pt-6 pb-6">
      {/* Portrait frame */}
      <div className="absolute inset-0 z-0">
        {c.portraitUrl ? (
          <Image
            src={c.portraitUrl}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 480px"
            // animated webp (portraits/ani/*.webp) 는 Next 최적화가 정지 프레임으로 변환해버려
            // 애니메이션이 사라진다. URL 패턴으로 판별해 그때만 최적화 우회.
            unoptimized={/\/portraits\/ani\//.test(c.portraitUrl)}
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: FALLBACK_BG }}
          />
        )}
        <div className="absolute inset-0 diagonal-bg opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
      </div>

      {/* Geometric frame decoration (top-right, bottom-left corners) */}
      <div className="absolute top-32 right-5 w-16 h-16 border-t-2 border-r-2 border-primary/30 z-10 pointer-events-none" />
      <div className="absolute bottom-40 left-5 w-16 h-16 border-b-2 border-l-2 border-primary/30 z-10 pointer-events-none" />

      {/* Card shell — glass + sharp corners */}
      <div className="mt-auto relative z-10 max-w-md mx-auto w-full">
        <div className="glass-strong ghost-border rounded-lg overflow-hidden shadow-tinted-lg">
          {/* Accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

          <div className="p-6 pl-7">
            {/* Name */}
            <div className="flex items-start justify-between gap-3 mb-2">
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

            {/* Meta — role · age · species (있을 때만) */}
            {composeMeta(c) && (
              <p className="label-mono text-primary/70 text-[10px] mb-2 truncate">
                {composeMeta(c)}
              </p>
            )}

            {/* Tagline */}
            <p className="text-on-surface leading-relaxed mb-3 line-clamp-2 text-sm font-medium">
              {c.tagline}
            </p>

            {/* Backstory snippet — 있으면 2줄까지 회색 보조 */}
            {c.backstorySummary && (
              <p className="text-on-surface-variant leading-relaxed mb-3 line-clamp-2 text-xs">
                {firstSentence(c.backstorySummary, 140)}
              </p>
            )}

            {/* World context — 있으면 1줄 */}
            {c.worldContext && (
              <p className="text-on-surface-variant/80 leading-relaxed mb-4 line-clamp-1 text-[11px] italic">
                {firstSentence(c.worldContext, 90)}
              </p>
            )}

            {/* Tag chips — appearanceKeys / 기타 키워드. 샤프 직사각형. */}
            {(c.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {(c.tags ?? []).slice(0, 4).map((t, i) => (
                  <span
                    key={t}
                    className={[
                      "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm truncate max-w-[12rem]",
                      i === 0
                        ? "bg-tertiary-container text-on-tertiary-container"
                        : i === 1
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface-container-high text-on-surface-variant",
                    ].join(" ")}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* CTA — parallelogram with 15-degree skew */}
            <Link
              href={`/characters/${c.slug}`}
              className="relative group flex items-center justify-center overflow-hidden h-14 active:scale-[0.98] transition-transform"
            >
              <div className="absolute inset-0 btn-cta-gradient group-hover:brightness-110 transition-all" style={{ transform: "skewX(-12deg)" }} />
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
