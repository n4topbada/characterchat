"use client";
import Image from "next/image";
import { useState } from "react";
import { shouldBypassImageOptimizer } from "@/lib/assets/imageHint";

const FALLBACK_BG =
  "linear-gradient(135deg, #3a5f94 0%, #a7c8ff 50%, #cee9d9 100%)";

type Props = {
  src: string | null | undefined;
  alt?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** width/height vs fill. 기본 fill. */
  fill?: boolean;
  width?: number;
  height?: number;
};

/**
 * 모바일에서 broken-image 아이콘("그림이모지")이 고착되는 증상을 차단하는 Image 래퍼.
 *
 * 규칙:
 *   1. 소스가 없으면 처음부터 gradient fallback 을 표시한다.
 *   2. 로컬 public 경로(`/characters/*`, `/portraits/*`)는 `unoptimized` 로 Next Image
 *      옵티마이저(`/_next/image`) 를 우회한다 — dev cold-start 실패가 mobile 캐시에
 *      눌러 붙는 문제를 피한다.
 *   3. 렌더 중 로드 에러(onError) 가 나면 gradient fallback 으로 교체해 빈 공간을 없앤다.
 *   4. 초기에는 뒤에 gradient 를 깔아 두어 로딩 중에도 "그림이모지" 가 아닌 색면이 보인다.
 */
export function SafePortrait({
  src,
  alt = "",
  priority = false,
  sizes = "100vw",
  className = "object-cover",
  fill = true,
  width,
  height,
}: Props) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;
  const unoptimized = shouldBypassImageOptimizer(src ?? undefined);

  return (
    <>
      {/* Always-on gradient 배경: 로드 전/실패 시 빈 영역 대신 노출 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: FALLBACK_BG }}
      />
      {!showFallback && src ? (
        fill ? (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className={className}
            unoptimized={unoptimized}
            onError={() => setErrored(true)}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            width={width ?? 0}
            height={height ?? 0}
            priority={priority}
            sizes={sizes}
            className={className}
            unoptimized={unoptimized}
            onError={() => setErrored(true)}
          />
        )
      ) : null}
    </>
  );
}
