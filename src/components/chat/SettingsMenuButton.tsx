"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal,
  RotateCcw,
  Trash2,
  FileText,
  User,
  LogOut,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

/**
 * 채팅 헤더 우측 설정 버튼.
 *
 * 그동안 아이콘만 존재하고 클릭해도 아무 일도 일어나지 않아 '죽어 있는' UI 였다.
 * 여기서는 바텀시트 형태로 아래 항목을 노출한다:
 *   - 대화 삭제 (Session DELETE → /find 이동)
 *   - 대화 처음으로 되감기 (Session DELETE 후 새 세션 자동 생성 플로우로 보냄)
 *   - 캐릭터 정보 보기 (/characters/[slug] 대신 슬러그가 없으니 일단 생략, '내 정보' 로 이동)
 *   - 내 정보 (/me)
 *   - 로그아웃 (next-auth signOut)
 *
 * 바텀시트 패턴 — 모바일에서 손가락 동선 짧고 한 번에 한 축(세로) 만 보이므로
 * 풀스크린 dropdown 대신 시트가 어울린다. ESC / 배경 클릭 / X 로 닫힘.
 */
type Props = {
  sessionId: string;
  characterName: string;
};

export function SettingsMenuButton({ sessionId, characterName }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function deleteSessionAnd(redirectTo: "history" | "restart") {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!r.ok) {
        console.warn("[settings] delete session failed", r.status);
        setBusy(false);
        return;
      }
      if (redirectTo === "history") {
        router.push("/history");
      } else {
        // 같은 캐릭터로 세션 재시작 — /find 의 캐러셀에서 동일 캐릭터 찾아 대화 재개
        router.push("/find");
      }
      router.refresh();
    } catch (e) {
      console.warn("[settings] delete session error", e);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function doSignOut() {
    setBusy(true);
    await signOut({ callbackUrl: "/auth/signin" });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setOpen(true)}
        className="w-9 h-9 flex items-center justify-center text-primary hover:bg-surface-container-low transition-colors rounded-md"
      >
        <SlidersHorizontal size={16} strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={sheetRef}
            className="w-full bg-surface-container-lowest shadow-tinted-lg border-t-2 border-primary/60"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30">
              <h3 className="font-headline font-black tracking-[0.15em] text-on-surface uppercase text-xs">
                SETTINGS · {characterName}
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-md"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <ul className="py-1">
              <MenuItem
                Icon={RotateCcw}
                label="대화 처음으로 되감기"
                sub="지금까지의 기록을 버리고 새 세션으로 시작"
                danger
                disabled={busy}
                onClick={() => deleteSessionAnd("restart")}
              />
              <MenuItem
                Icon={Trash2}
                label="대화 삭제"
                sub="이 캐릭터와의 기록을 지우고 대화 목록으로 이동"
                danger
                disabled={busy}
                onClick={() => deleteSessionAnd("history")}
              />
              <Divider />
              <MenuItem
                Icon={FileText}
                label="대화 목록"
                onClick={() => {
                  setOpen(false);
                  router.push("/history");
                }}
              />
              <MenuItem
                Icon={User}
                label="내 정보"
                onClick={() => {
                  setOpen(false);
                  router.push("/me");
                }}
              />
              <Divider />
              <MenuItem
                Icon={LogOut}
                label="로그아웃"
                disabled={busy}
                onClick={doSignOut}
              />
            </ul>

            {/* Safe-area 하단 패딩 */}
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({
  Icon,
  label,
  sub,
  danger,
  disabled,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  sub?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={[
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-surface-container-low active:bg-surface-container",
          disabled ? "opacity-40 pointer-events-none" : "",
        ].join(" ")}
      >
        <Icon
          size={16}
          strokeWidth={2}
          className={danger ? "text-error shrink-0" : "text-primary shrink-0"}
        />
        <span className="flex-1 min-w-0">
          <span
            className={[
              "block text-sm font-medium truncate",
              danger ? "text-error" : "text-on-surface",
            ].join(" ")}
          >
            {label}
          </span>
          {sub && (
            <span className="block text-[11px] text-on-surface-variant truncate">
              {sub}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Divider() {
  return <li className="h-px bg-outline-variant/30 my-1 mx-4" />;
}
