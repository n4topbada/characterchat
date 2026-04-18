"use client";
import { useEffect, useRef } from "react";
import { CharacterCard, type CarouselCharacter } from "./CharacterCard";

export function VerticalCarousel({
  characters,
}: {
  characters: CarouselCharacter[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const h = el.clientHeight;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: h, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -h, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!characters.length) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <div className="text-center max-w-sm">
          <div className="inline-block px-3 py-1 bg-tertiary-container text-on-tertiary-container label-scholastic-xs mb-4">
            ARCHIVE · EMPTY
          </div>
          <p className="font-headline text-2xl font-bold text-on-surface mb-2">
            NO SCHOLAR INDEXED
          </p>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            관리자가 INITIATE 프로토콜을 완료하면
            <br />이 인덱스에 등재됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="carousel-y h-full w-full overflow-y-scroll"
      tabIndex={0}
      aria-label="캐릭터 세로 캐러셀"
    >
      {characters.map((c, i) => (
        <CharacterCard key={c.slug} c={c} index={i} />
      ))}
    </div>
  );
}
