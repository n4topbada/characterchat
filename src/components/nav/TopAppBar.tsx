"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Search, School, ShieldCheck } from "lucide-react";
import { useAdminDock } from "@/contexts/AdminDockContext";

type Props = {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  right?: React.ReactNode;
  /** 설정 시 좌측 로고 대신 ← 뒤로가기 버튼. Next Link 로 이동. */
  backHref?: string;
};

/**
 * TopAppBar — 페이지 공통 상단 바.
 *  - 좌측: 앱 로고 아이콘 + 페이지 타이틀(선택적으로 subtitle).
 *    backHref 가 오면 로고 대신 뒤로가기 버튼 렌더.
 *  - admin 계정이면 ADMIN 배지 + PC 에서 Dock 토글 버튼 노출.
 *  (이전에 ARCHIVE_v1.0 버전 라벨이 항상 헤더 큰 글자로 노출되어
 *   유저에게 불필요했던 내부 식별자 — 제거했다.)
 */
export function TopAppBar({ title, subtitle, showSearch, right, backHref }: Props) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { toggle, isPcViewport, open } = useAdminDock();

  return (
    <header className="glass sticky top-0 left-0 right-0 z-30">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {backHref ? (
            <Link
              href={backHref as never}
              aria-label="뒤로가기"
              className="w-10 h-10 flex items-center justify-center border-l-4 border-primary bg-surface-variant text-primary shrink-0 transition-colors hover:bg-surface-container-high active:brightness-90"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </Link>
          ) : (
            <div className="w-10 h-10 bg-surface-variant flex items-center justify-center border-l-4 border-primary shrink-0">
              <School size={18} className="text-primary" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-headline font-black tracking-[0.15em] text-on-surface text-base sm:text-lg truncate">
                {title}
              </h1>
              {isAdmin && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white"
                  title="관리자"
                >
                  <ShieldCheck size={9} />
                  ADMIN
                </span>
              )}
            </div>
            {subtitle ? (
              <p className="label-mono text-primary/80 text-[10px] truncate">
                {subtitle}
              </p>
            ) : null}
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
