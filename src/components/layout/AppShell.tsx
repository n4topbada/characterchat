"use client";

/**
 * AppShell — 루트 flex 래퍼. fictory(StoryGatcha)의 AdminLayoutShell 패턴을 이식.
 *
 * 모바일 뷰포트(9:19.5 상당)를 중앙에 고정. max-width 430px.
 * Dock 이 열린 PC viewport 에서는 프레임이 우측으로 치우치게 보이도록
 * justify-end + 좌측 padding(dock width).
 *
 * Dock(AdminDock) 은 `position: fixed` 로 DOM 상 따로 렌더 → 레이아웃 밀림 없음.
 * BottomTabBar 는 프레임 내부의 flex child 로 렌더 → 프레임 폭에 clamp.
 */

import { usePathname } from "next/navigation";
import { useAdminDock } from "@/contexts/AdminDockContext";
import { AdminDock } from "@/components/admin/AdminDock";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

const TAB_ROUTES = ["/find", "/feed", "/history", "/create", "/me"];

function shouldShowTabs(pathname: string): boolean {
  return TAB_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { open, isPcViewport, effectiveWidth } = useAdminDock();
  const pathname = usePathname() ?? "/";
  const dockActive = open && isPcViewport;
  const showTabs = shouldShowTabs(pathname);

  return (
    <>
      <div
        className={`flex h-dvh w-full items-center ${
          dockActive ? "justify-end" : "justify-center"
        } bg-surface-container diagonal-bg`}
        style={
          dockActive
            ? { paddingLeft: effectiveWidth, paddingRight: 16 }
            : undefined
        }
      >
        <div
          className="
            relative flex h-dvh w-full max-w-[430px] flex-col
            overflow-hidden bg-surface shadow-2xl
            md:my-4 md:h-[calc(100dvh-2rem)]
            md:rounded-[2rem] md:border md:border-outline-variant/30
          "
        >
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
          {showTabs && <BottomTabBar />}
        </div>
      </div>
      <AdminDock />
    </>
  );
}
