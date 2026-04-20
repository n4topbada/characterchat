"use client";
import { useRouter, usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * TabPager — 하단 5탭(feed · history · create · find · me) 페이지 전역 래퍼.
 *
 * 유저 요청: "좌우 캐러셀 이동을, 실제 이동하는것처럼 중간 스와이프 보여줄수 있어?"
 *
 * 동작:
 *   1. 손가락 이동(touchmove) 을 `translate3d` 로 실시간 반영한다. 성능을 위해
 *      React 상태가 아니라 innerRef.current.style 을 직접 건드린다 (매 픽셀마다
 *      re-render 하면 /find 의 vertical carousel 과 chat SSE 리스트가 버벅임).
 *   2. 릴리즈 시 임계치(|dx| > 화면폭 22% 또는 300ms 미만 빠른 플릭 > 40px) 넘으면
 *      해당 방향으로 현재 페이지를 슬라이드 아웃 후 `router.push` 로 인접 탭으로.
 *   3. 새 탭 페이지가 붙는 순간, `sessionStorage.__tabSwipeIn` 시그널을 읽어 반대쪽
 *      오프스크린에서 슬라이드 인. `useLayoutEffect` 로 paint 이전에 초기 오프셋
 *      세팅 → RAF 로 transition 켜고 0 으로 복귀 (깜빡임 없는 1-프레임 전환).
 *   4. 첫/마지막 탭에서 경계 넘는 방향은 rubber-band (×0.3). pass 안 되면
 *      스프링백.
 *   5. 세로 변위가 우세하면 axis=y 로 락, 탭 이동 취소. `/find` 세로 캐러셀과
 *      충돌 금지를 위해 컨테이너에 `touch-action: pan-y`.
 *   6. 탭 페이지 외 경로(/admin, /chat/*, /characters/*, /auth/*) 에서는 그냥
 *      children 을 pass-through 하여 제스처·오프스크린 초기화 로직을 건너뛴다.
 *
 * 참고: 탭바 클릭으로 라우팅되는 경우에는 sig 가 없으므로 애니메이션 없이 즉시
 * 전환된다. (현재는 의도적으로 단순함 유지 — tabBar 쪽에서 시그널을 심어줄 수
 * 있지만 향후 확장.)
 */

const TAB_ORDER = ["/feed", "/history", "/create", "/find", "/me"] as const;
type TabPath = (typeof TAB_ORDER)[number];

const SIG_KEY = "__tabSwipeIn";
const ANIM_MS = 260;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const AXIS_LOCK_PX = 10;
const AXIS_X_RATIO = 1.5;
const QUICK_FLICK_MS = 300;
const QUICK_FLICK_PX = 40;
const THRESHOLD_RATIO = 0.22;
const THRESHOLD_CAP_PX = 120;
const RUBBER_BAND = 0.3;
const SIG_TTL_MS = 1500;

function tabIndex(pathname: string): number {
  return TAB_ORDER.findIndex(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

type Drag = {
  sx: number;
  sy: number;
  st: number;
  axis: "unknown" | "x" | "y";
};

export function TabPager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const idx = tabIndex(pathname);
  const inTabView = idx !== -1;

  const innerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const widthRef = useRef(0);
  const currentXRef = useRef(0);
  const animatingRef = useRef(false);
  const animTimerRef = useRef<number | null>(null);

  // 모든 transform 변경은 이 함수를 통한다. ref 기반이므로 React 리렌더 없음.
  function setTransform(x: number, withTransition: boolean) {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = withTransition
      ? `transform ${ANIM_MS}ms ${EASE}`
      : "none";
    el.style.transform = `translate3d(${x}px, 0, 0)`;
    currentXRef.current = x;
    animatingRef.current = withTransition;
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (withTransition) {
      animTimerRef.current = window.setTimeout(() => {
        animatingRef.current = false;
        animTimerRef.current = null;
      }, ANIM_MS + 40);
    }
  }

  // 새 탭 마운트 직후 실행. sig 가 있으면 오프스크린 → 0 으로 슬라이드 인.
  // useLayoutEffect 는 paint 전에 동기 실행되므로 깜빡임 없음.
  useLayoutEffect(() => {
    if (!inTabView) return;
    if (typeof window === "undefined") return;
    widthRef.current = window.innerWidth;

    const raw = sessionStorage.getItem(SIG_KEY);
    if (!raw) {
      // 탭바 클릭 · 딥링크 · 첫 진입. 이전 슬라이드 잔여 transform 을 리셋.
      setTransform(0, false);
      return;
    }
    sessionStorage.removeItem(SIG_KEY);

    let sig: { from: "left" | "right"; at: number };
    try {
      sig = JSON.parse(raw);
    } catch {
      setTransform(0, false);
      return;
    }
    if (
      !sig ||
      typeof sig.at !== "number" ||
      Date.now() - sig.at > SIG_TTL_MS
    ) {
      setTransform(0, false);
      return;
    }

    const W = widthRef.current;
    // 1) 초기: 오프스크린 (transition off).
    setTransform(sig.from === "right" ? W : -W, false);
    // 2) 다음 프레임: transition on + 0 으로.
    requestAnimationFrame(() => {
      setTransform(0, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, inTabView]);

  if (!inTabView) return <>{children}</>;

  function commit(nextIdx: number, dir: "left" | "right") {
    if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) {
      // 경계 밖. 스프링백만.
      setTransform(0, true);
      return;
    }
    const W = widthRef.current || window.innerWidth;
    const next: TabPath = TAB_ORDER[nextIdx];
    // 현재 페이지 슬라이드 아웃.
    setTransform(dir === "left" ? -W : W, true);
    // 새 페이지는 반대쪽에서 들어오도록 sig 저장.
    sessionStorage.setItem(
      SIG_KEY,
      JSON.stringify({
        from: dir === "left" ? "right" : "left",
        at: Date.now(),
      }),
    );
    router.push(next as never);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (animatingRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = {
      sx: t.clientX,
      sy: t.clientY,
      st: Date.now(),
      axis: "unknown",
    };
    widthRef.current = window.innerWidth;
  }

  function onTouchMove(e: React.TouchEvent) {
    const d = dragRef.current;
    if (!d || animatingRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - d.sx;
    const dy = t.clientY - d.sy;

    if (d.axis === "unknown") {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      if (Math.abs(dx) > Math.abs(dy) * AXIS_X_RATIO) {
        d.axis = "x";
      } else {
        d.axis = "y";
        return;
      }
    }
    if (d.axis !== "x") return;

    let follow = dx;
    if (idx === 0 && dx > 0) follow = dx * RUBBER_BAND;
    if (idx === TAB_ORDER.length - 1 && dx < 0) follow = dx * RUBBER_BAND;
    setTransform(follow, false);
  }

  function onTouchEnd() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const cur = currentXRef.current;
    if (d.axis !== "x") {
      if (cur !== 0) setTransform(0, true);
      return;
    }
    const W = widthRef.current || window.innerWidth;
    const threshold = Math.min(THRESHOLD_CAP_PX, W * THRESHOLD_RATIO);
    const abs = Math.abs(cur);
    const dt = Date.now() - d.st;
    const quick = dt < QUICK_FLICK_MS && abs > QUICK_FLICK_PX;
    const pass = abs > threshold || quick;
    if (!pass) {
      setTransform(0, true);
      return;
    }
    if (cur < 0) commit(idx + 1, "left");
    else commit(idx - 1, "right");
  }

  function onTouchCancel() {
    dragRef.current = null;
    if (currentXRef.current !== 0) setTransform(0, true);
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div
        ref={innerRef}
        className="flex h-full min-h-0 flex-1 flex-col"
        style={{
          willChange: "transform",
          transform: "translate3d(0, 0, 0)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
