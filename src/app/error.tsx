"use client";

// 전역 에러 바운더리. 이전엔 RSC 페이지에서 예외가 나면 Next.js 기본 하얀
// 화면이 떴다. 이제 같은 디자인 토큰(ARCHIVE 스타일) 을 유지한 복구 UI 로
// 묶어서, 사용자가 최소한 "다시 시도" / "홈으로" 는 선택할 수 있게 한다.
// 서버 스택 트레이스는 노출하지 않는다. `digest` 만 표시해서 로그에서 교차
// 조회 가능하게 한다.

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 클라 콘솔에만 남긴다. 실제 디버깅은 서버 로그의 digest 로.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <main className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface-container-low border-l-4 border-error p-6 shadow-tinted">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-error-container flex items-center justify-center border-l-4 border-error">
            <AlertTriangle size={20} className="text-error" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-headline font-black tracking-[0.2em] text-on-surface uppercase text-sm">
              SYSTEM_FAULT
            </h1>
            <p className="label-mono text-error text-[10px]">
              / UNEXPECTED_ERROR
            </p>
          </div>
        </div>
        <p className="text-on-surface text-sm leading-relaxed mb-5">
          요청을 처리하는 중에 오류가 발생했습니다. 잠시 후 다시 시도해
          주세요.
        </p>
        {error.digest ? (
          <p className="label-mono text-outline text-[10px] mb-5">
            trace: {error.digest}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 bg-primary text-on-primary font-headline font-bold tracking-[0.15em] uppercase text-[11px] px-3 py-2"
          >
            RETRY
          </button>
          <Link
            href={"/find" as "/find"}
            className="flex-1 bg-surface-variant text-on-surface font-headline font-bold tracking-[0.15em] uppercase text-[11px] px-3 py-2 text-center"
          >
            HOME
          </Link>
        </div>
      </div>
    </main>
  );
}
