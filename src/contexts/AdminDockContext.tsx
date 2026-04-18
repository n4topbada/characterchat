"use client";

/**
 * AdminDock — PC-only 관리자 오버레이 패널 상태.
 *
 * 모바일(<1024px) 에서는 dock 을 쓰지 않고 `/admin` 라우트로 이동한다.
 * PC 에서는 좌측에 가로로 긴 패널을 띄우고, 모바일 뷰포트 프레임은
 * 우측으로 밀려서 그대로 보이게 한다. (StoryGatcha=fictory 패턴 참조)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AdminTab = "characters" | "assets" | "caster" | "analytics";

const STORAGE_KEY = "admin-dock:chatbot:v1";
const MIN_WIDTH = 360;
const MOBILE_COLUMN = 430;
const RIGHT_GUTTER = 16;

interface DockState {
  open: boolean;
  tab: AdminTab;
  widthOverride: number | null;
}

interface AdminDockContextValue extends DockState {
  effectiveWidth: number;
  isPcViewport: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setTab: (t: AdminTab) => void;
  setWidthOverride: (w: number | null) => void;
}

const AdminDockContext = createContext<AdminDockContextValue | null>(null);

function readPersisted(): Partial<DockState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : undefined,
      tab: ["characters", "assets", "caster", "analytics"].includes(parsed.tab)
        ? parsed.tab
        : undefined,
      widthOverride:
        typeof parsed.widthOverride === "number" &&
        parsed.widthOverride >= MIN_WIDTH
          ? parsed.widthOverride
          : null,
    };
  } catch {
    return {};
  }
}

function computeAutoWidth(winWidth: number): number {
  const available = winWidth - MOBILE_COLUMN - RIGHT_GUTTER;
  return Math.max(MIN_WIDTH, available);
}

export function AdminDockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DockState>({
    open: false,
    tab: "characters",
    widthOverride: null,
  });
  const [winWidth, setWinWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1920 : window.innerWidth,
  );

  useEffect(() => {
    const persisted = readPersisted();
    setState((prev) => ({
      open: persisted.open ?? prev.open,
      tab: persisted.tab ?? prev.tab,
      widthOverride: persisted.widthOverride ?? prev.widthOverride,
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isPcViewport = winWidth >= 1024;
  const effectiveOpen = isPcViewport && state.open;

  const effectiveWidth = useMemo(() => {
    if (state.widthOverride != null) {
      const maxAllowed = Math.max(
        MIN_WIDTH,
        winWidth - MOBILE_COLUMN - RIGHT_GUTTER,
      );
      return Math.min(state.widthOverride, maxAllowed);
    }
    return computeAutoWidth(winWidth);
  }, [state.widthOverride, winWidth]);

  const setOpen = useCallback((v: boolean) => {
    setState((s) => ({ ...s, open: v }));
  }, []);
  const toggle = useCallback(() => {
    setState((s) => ({ ...s, open: !s.open }));
  }, []);
  const setTab = useCallback((t: AdminTab) => {
    setState((s) => ({ ...s, tab: t, open: true }));
  }, []);
  const setWidthOverride = useCallback((w: number | null) => {
    setState((s) => ({ ...s, widthOverride: w }));
  }, []);

  const value: AdminDockContextValue = {
    open: effectiveOpen,
    tab: state.tab,
    widthOverride: state.widthOverride,
    effectiveWidth,
    isPcViewport,
    setOpen,
    toggle,
    setTab,
    setWidthOverride,
  };

  return (
    <AdminDockContext.Provider value={value}>
      {children}
    </AdminDockContext.Provider>
  );
}

export function useAdminDock() {
  const ctx = useContext(AdminDockContext);
  if (!ctx) throw new Error("useAdminDock must be used within AdminDockProvider");
  return ctx;
}
