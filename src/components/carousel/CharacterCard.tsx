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
};

const FALLBACK_BG =
  "linear-gradient(135deg, #3a5f94 0%, #a7c8ff 45%, #cee9d9 100%)";

/**
 * Character card — Scholastic Archive "Node" style.
 *  - Asymmetric portrait with slant-cut clip.
 *  - Tactical metadata row (mono label + node ID).
 *  - Parallelogram CTA ("INITIATE DIALOGUE").
 */
export function CharacterCard({ c, index }: { c: CarouselCharacter; index: number }) {
  const nodeId = String(index + 1).padStart(3, "0");

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

      {/* Archive frame corner markers */}
      <div className="absolute top-24 left-5 right-5 flex items-center justify-between z-10 pointer-events-none">
        <span className="label-mono text-primary/70">NODE_{nodeId}</span>
        <span className="label-mono text-primary/70">REF_ARCHIVE.V1</span>
      </div>
      <div className="absolute top-28 left-5 right-5 z-10 pointer-events-none">
        <div className="h-px w-full bg-primary/15" />
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
            {/* Meta row */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className="label-scholastic-xs px-2 py-0.5 bg-primary text-on-primary"
                style={{ transform: "skewX(-12deg)" }}
              >
                <span style={{ transform: "skewX(12deg)", display: "inline-block" }}>
                  SCHOLAR_{nodeId}
                </span>
              </span>
              <span className="label-mono text-on-surface-variant/60">
                STATUS: INDEXED
              </span>
            </div>

            {/* Name */}
            <div className="flex items-start justify-between gap-3 mb-3">
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

            {/* Tagline */}
            <p className="text-on-surface-variant leading-relaxed mb-5 line-clamp-3 text-sm">
              {c.tagline}
            </p>

            {/* Tag chips — sharp rectangles, no pills */}
            {(c.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {(c.tags ?? []).slice(0, 3).map((t, i) => (
                  <span
                    key={t}
                    className={[
                      "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm",
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
              <div className="relative flex items-center gap-3 text-on-primary font-headline font-bold uppercase tracking-[0.2em] text-xs">
                <span>INITIATE DIALOGUE</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
