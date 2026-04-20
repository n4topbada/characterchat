"use client";
import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";
import { SafePortrait } from "@/components/character/SafePortrait";
import { PhysicalStats } from "@/components/character/PhysicalStats";

export type CarouselCharacter = {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  portraitUrl: string | null;
  tags?: string[];
  /** PersonaCore.backstorySummary — 원문. 카드에선 짧게 자른다 */
  backstorySummary?: string | null;
  /** 신체 스펙 — 카드 하단 스탯 박스 */
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

function firstSentence(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // 문장 경계(. / 。 / ! / ?) 우선, 없으면 max 에서 자르고 …
  const m = clean.slice(0, max).match(/^(.+?[.!?。])/);
  if (m) return m[1];
  return clean.slice(0, max - 1) + "…";
}

/**
 * Character card — Scholastic Archive 스타일 풀스크린 카드.
 * 레이아웃 (사용자 요청 슬림):
 *   이름 → 태그 칩 → 한 줄 소개 → 소개글 → 신체 스탯 (키/몸무게/3-size/MBTI) → CTA
 *
 * 이전에 있던 role/age/species 메타 한 줄, WORLD 블록, MOTIVATION 블록은 제거.
 */
export function CharacterCard({ c }: { c: CarouselCharacter; index: number }) {
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

            {/* 태그 칩 — 이름 바로 아래 */}
            {(c.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
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

            {/* 한 줄 소개 */}
            <p className="text-on-surface leading-relaxed line-clamp-2 text-sm font-medium">
              {c.tagline}
            </p>

            {/* 소개글 — 있으면 2줄까지 */}
            {c.backstorySummary && (
              <p className="text-on-surface-variant leading-relaxed line-clamp-2 text-xs">
                {firstSentence(c.backstorySummary, 140)}
              </p>
            )}

            {/* 신체 스탯 */}
            <PhysicalStats
              stats={{
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
