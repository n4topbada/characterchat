"use client";

/**
 * AdminDock — PC 좌측 오버레이 패널 (admin 전용).
 *
 * Scholastic Archive 다크 팔레트와 대비되도록 밝은 슬레이트 톤 유지.
 * 탭: characters(캐릭터 관리) / assets(에셋 관리) / caster(Caster 링크) / analytics.
 */

import { useSession } from "next-auth/react";
import { useAdminDock } from "@/contexts/AdminDockContext";
import {
  X,
  GripVertical,
  Users,
  Image as ImageIcon,
  Sparkles,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCharactersSection } from "./sections/AdminCharactersSection";
import { AdminAssetsSection } from "./sections/AdminAssetsSection";
import { AdminCasterSection } from "./sections/AdminCasterSection";
import { AdminAnalyticsSection } from "./sections/AdminAnalyticsSection";

const MIN_WIDTH = 360;

export function AdminDock() {
  const { data: session } = useSession();
  const {
    open,
    tab,
    effectiveWidth,
    isPcViewport,
    setOpen,
    setTab,
    setWidthOverride,
  } = useAdminDock();

  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  const isAdmin = session?.user?.role === "admin";

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      startXRef.current = e.clientX;
      startWRef.current = effectiveWidth;
      setDragging(true);
    },
    [effectiveWidth],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startXRef.current;
      const next = Math.max(MIN_WIDTH, startWRef.current + dx);
      setWidthOverride(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setWidthOverride]);

  if (!isAdmin || !open || !isPcViewport) return null;

  const title =
    tab === "characters"
      ? "CHARACTER_REGISTRY"
      : tab === "assets"
        ? "ASSET_VAULT"
        : tab === "caster"
          ? "CASTER_CONSOLE"
          : "TELEMETRY";

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-dvh bg-white text-slate-900 shadow-[8px_0_32px_rgba(15,23,42,0.25)] ring-1 ring-slate-200"
      style={{ width: effectiveWidth }}
    >
      {/* Nav rail */}
      <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-900 py-3 text-slate-300">
        <div className="mb-1 flex items-center justify-center text-indigo-300">
          <ShieldCheck size={16} />
        </div>
        <NavBtn
          active={tab === "characters"}
          onClick={() => setTab("characters")}
          icon={<Users size={20} />}
          label="CHARS"
        />
        <NavBtn
          active={tab === "assets"}
          onClick={() => setTab("assets")}
          icon={<ImageIcon size={20} />}
          label="ASSETS"
        />
        <NavBtn
          active={tab === "caster"}
          onClick={() => setTab("caster")}
          icon={<Sparkles size={20} />}
          label="CASTER"
        />
        <NavBtn
          active={tab === "analytics"}
          onClick={() => setTab("analytics")}
          icon={<LineChart size={20} />}
          label="STATS"
        />
        <div className="mt-auto flex flex-col items-center gap-1 pb-2">
          <button
            type="button"
            onClick={() => setWidthOverride(null)}
            className="rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-100"
            title="너비 자동 맞춤"
          >
            auto
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Dock 닫기"
          >
            <X size={18} />
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
              ADMIN
            </span>
            <h1 className="text-sm font-semibold text-slate-800 tracking-wide">
              {title}
            </h1>
          </div>
          <div className="text-xs text-slate-500">{session?.user?.email}</div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {tab === "characters" && <AdminCharactersSection />}
          {tab === "assets" && <AdminAssetsSection />}
          {tab === "caster" && <AdminCasterSection />}
          {tab === "analytics" && <AdminAnalyticsSection />}
        </div>

        {/* Resizer */}
        <div
          onMouseDown={onDragStart}
          className={`absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center ${
            dragging ? "bg-indigo-500/30" : "hover:bg-slate-200"
          }`}
          title="드래그로 폭 조정"
        >
          <GripVertical size={12} className="text-slate-400 opacity-60" />
        </div>
      </div>
    </aside>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col items-center gap-0.5 rounded-md px-2 py-3 text-[10px] font-medium transition-colors ${
        active
          ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      <span className="tracking-wider">{label}</span>
    </button>
  );
}
