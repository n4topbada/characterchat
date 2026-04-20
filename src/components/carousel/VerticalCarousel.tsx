"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { CharacterCard, type CarouselCharacter } from "./CharacterCard";

export function VerticalCarousel({
  characters,
  focusSlug,
  autoGenerate,
}: {
  characters: CarouselCharacter[];
  /** 특정 슬러그의 카드로 마운트 시 즉시 스크롤. 없으면 첫 카드(=최신) 기본. */
  focusSlug?: string | null;
  /**
   * focusSlug 에 해당하는 카드가 portrait/animation 을 SSE 로 자동 생성할지.
   * Caster confirm-autocommit 후 /find?focus=...&gen=1 로 들어올 때 true.
   */
  autoGenerate?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 스크롤 위치에 따라 위/아래 화살표 힌트 가시성 토글.
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(characters.length <= 1);

  // focusSlug 로 찾은 카드 인덱스. SSR 결과가 바뀔 수 있으니 characters 기준으로 재계산.
  const focusIndex = useMemo(() => {
    if (!focusSlug) return -1;
    return characters.findIndex((c) => c.slug === focusSlug);
  }, [characters, focusSlug]);

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      setAtTop(top < 8);
      setAtBottom(top >= max - 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [characters.length]);

  // focusSlug 가 바뀌면 해당 카드로 바로 스크롤. Caster 커밋 직후 내려오면 index 0
  // 이 이미 최신(커밋된) 카드일 확률이 높지만 명시적으로 꽂아준다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusIndex < 0) return;
    // instant: 느낌상 "이미 보고 있던 것" 처럼 보이는 쪽이 UX 일관적.
    el.scrollTo({ top: el.clientHeight * focusIndex, behavior: "instant" });
  }, [focusIndex]);

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

  const showUp = !atTop;
  const showDown = !atBottom;

  return (
    <div className="relative h-full w-full">
      <div
        ref={ref}
        className="carousel-y h-full w-full overflow-y-scroll"
        tabIndex={0}
        aria-label="캐릭터 세로 캐러셀"
      >
        {characters.map((c, i) => (
          <CharacterCard
            key={c.slug}
            c={c}
            index={i}
            // autoGenerate 는 "포커스된 카드 한 장" 에만 준다 — 다른 카드가 마운트
            // 시 같이 SSE 를 때리면 무관한 에셋도 재생성될 위험이 있다.
            autoGenerate={!!autoGenerate && i === focusIndex}
          />
        ))}
      </div>

      {/* 상단/하단 캐러셀 방향 힌트 — 세로 스와이프를 유도.
          "옅게 깜빡이게" 요청에 맞춰 배경·테두리 없이 chevron 라인 아이콘만.
          primary 톤에 숨쉬듯 펄스. pointer-events-none 으로 탭 방해 X. */}
      {showUp && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
          <ChevronUp
            size={22}
            strokeWidth={2}
            className="animate-hint-up text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          />
        </div>
      )}
      {showDown && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
          <ChevronDown
            size={22}
            strokeWidth={2}
            className="animate-hint-down text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          />
        </div>
      )}
    </div>
  );
}
