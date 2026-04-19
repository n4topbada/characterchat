"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// 채팅방 뒤에 깔리는 "현재 분위기" 배경 레이어.
//
// 구조:
//   - Fixed(=absolute inset-0) 두 장의 이미지를 겹쳐 두고, url 변경 시 두 번째 레이어를
//     새 URL 로 fadeIn. 전환 종료 후 두 레이어 교체.
//   - 강한 blur + 어두운 overlay 로 메시지 가독성 유지.
//   - url 이 null 이면 아무것도 렌더하지 않음 (상위에서 기존 패턴 bg 가 그대로 보이게).
//
// URL 이 연속해서 같은 값으로 오면 re-render/전환을 생략한다.

type Props = {
  url: string | null;
};

export function RoomBackdrop({ url }: Props) {
  const [current, setCurrent] = useState<string | null>(url);
  const [next, setNext] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const lastSeen = useRef<string | null>(url);

  useEffect(() => {
    if (url === lastSeen.current) return;
    lastSeen.current = url;

    if (!current) {
      // 처음 URL 세팅 — 페이드 없이 바로 고정
      setCurrent(url);
      return;
    }
    if (!url) {
      // 제거 — 그냥 즉시 비움
      setCurrent(null);
      setNext(null);
      setFading(false);
      return;
    }

    // 크로스페이드: next 에 새 URL 을 태우고 opacity 0→1.
    setNext(url);
    // 다음 프레임에 fading 켜서 transition 이 걸리게 함
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFading(true));
    });
  }, [url, current]);

  // 페이드 종료 시 current 를 next 로 교체.
  const handleTransitionEnd = () => {
    if (!fading || !next) return;
    setCurrent(next);
    setNext(null);
    setFading(false);
  };

  if (!current && !next) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {current ? (
        <div className="absolute inset-0">
          <Image
            src={current}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover scale-110"
            style={{ filter: "blur(24px) brightness(0.7) saturate(1.08)" }}
          />
        </div>
      ) : null}
      {next ? (
        <div
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{ opacity: fading ? 1 : 0 }}
          onTransitionEnd={handleTransitionEnd}
        >
          <Image
            src={next}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover scale-110"
            style={{ filter: "blur(24px) brightness(0.7) saturate(1.08)" }}
          />
        </div>
      ) : null}
      {/* 가독성을 위한 surface 톤 반투명 마스크 (--color-surface: #f8f9ff). */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(248,249,255,0.58) 0%, rgba(248,249,255,0.64) 55%, rgba(248,249,255,0.74) 100%)",
        }}
      />
    </div>
  );
}
