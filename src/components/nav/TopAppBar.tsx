"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Search, School, ShieldCheck } from "lucide-react";
import { useAdminDock } from "@/contexts/AdminDockContext";

type Props = {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  right?: React.ReactNode;
};

/**
 * TopAppBar — Scholastic Archive signature header.
 *  - Archive logo + 버전 라벨.
 *  - admin 계정이면 ADMIN 배지 + PC 에서 Dock 토글 버튼 노출.
 */
export function TopAppBar({ title, subtitle, showSearch, right }: Props) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { toggle, isPcViewport, open } = useAdminDock();

  return (
    <header className="glass sticky top-0 left-0 right-0 z-30">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-surface-variant flex items-center justify-center border-l-4 border-primary shrink-0">
            <School size={18} className="text-primary" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-headline font-black tracking-[0.2em] text-on-surface uppercase text-sm truncate">
                ARCHIVE_v1.0
              </h1>
              {isAdmin && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white"
                  title="SENIOR_ARCHIVIST"
                >
                  <ShieldCheck size={9} />
                  ADMIN
                </span>
              )}
            </div>
            {subtitle ? (
              <p className="label-mono text-primary text-[9px] truncate">
                / {subtitle}
              </p>
            ) : (
              <p className="label-mono text-primary text-[9px] truncate">
                / {title}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {right}
          {showSearch && (
            <Link
              href={"/find" as "/find"}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant/60 hover:bg-surface-container-low transition-colors active:scale-95 rounded-md"
              aria-label="Search"
            >
              <Search size={18} strokeWidth={2} />
            </Link>
          )}
          {isAdmin && isPcViewport && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Admin dock toggle"
              className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors active:scale-95 ${
                open
                  ? "bg-indigo-600 text-white hover:bg-indigo-500"
                  : "text-indigo-600 hover:bg-indigo-50"
              }`}
              title={open ? "Dock 닫기" : "Dock 열기"}
            >
              <ShieldCheck size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
