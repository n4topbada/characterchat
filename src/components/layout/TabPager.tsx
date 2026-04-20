"use client";
import { useRouter, usePathname } from "next/navigation";
import { useRef } from "react";

/**
 * TabPager — 하단 5탭(feed · history · create · find · me) 페이지 전역 래퍼.
 *
 * 유저 요청: "하단 5개 패널대로, 상단 메인뷰가 좌우 케러셀로 작동되게 해."
 *
 * 구현: 현재 탭 경로를 기준으로 좌/우 플릭 제스처를 인접 탭 경로로의
 * `router.push` 로 치환한다. 각 탭은 Next 라우트로 분리돼 있어 실제 캐러셀 DOM
 * 을 한 번에 렌더하진 않지만(권한·DB·SEO 때문에) 사용감은 동일한 페이지 전환.
 *
 * 규칙:
 *   - 가로 변위가 60px 이상이고, 세로 변위의 1.5배 이상일 때만 탭 이동. 세로 스크롤
 *     (특히 /find 의 vertical carousel) 을 삼키지 않는다.
 *   - 제스처 시간 > 600ms 면 탭 전환 취소(천천히 문지르는 이동은 무시).
 *   - 탭 경로 외부(예: /admin, /chat/*, /characters/*, /auth/*) 에서는 그냥 children
 *     만 렌더 — 가드만 통과.
 */

const TAB_ORDER = ["/feed", "/history", "/create", "/find", "/me"] as const;
type TabPath = (typeof TAB_ORDER)[number];

function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function TabPager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const touchRef = useRef<{
    x: number;
    y: number;
    t: number;
  } | null>(null);

  const idx = tabIndex(pathname);
  // 탭 페이지가 아니면 pass-through.
  if (idx === -1) return <>{children}</>;

  function go(nextIdx: number) {
    if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
    const next: TabPath = TAB_ORDER[nextIdx];
    router.push(next as never);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // swipe left(←) → 우측 탭으로, swipe right(→) → 좌측 탭으로.
    if (dx < 0) go(idx + 1);
    else go(idx - 1);
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}
