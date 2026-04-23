// 전역 404. 기본 Next.js 404 는 한 줄짜리라 디자인 시스템과 튄다.
// `notFound()` 를 호출하는 세그먼트(예: `/chat/[sessionId]` 에서 세션이
// 삭제된 경우) 가 전부 이 화면으로 떨어진다.

import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface-container-low border-l-4 border-primary p-6 shadow-tinted">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-surface-variant flex items-center justify-center border-l-4 border-primary">
            <Search size={20} className="text-primary" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-headline font-black tracking-[0.2em] text-on-surface uppercase text-sm">
              404
            </h1>
            <p className="label-mono text-primary text-[10px]">
              / NOT_FOUND
            </p>
          </div>
        </div>
        <p className="text-on-surface text-sm leading-relaxed mb-5">
          찾는 페이지가 없거나 이동되었습니다.
        </p>
        <Link
          href={"/find" as "/find"}
          className="block bg-primary text-on-primary font-headline font-bold tracking-[0.15em] uppercase text-[11px] px-3 py-2 text-center"
        >
          RETURN TO ARCHIVE
        </Link>
      </div>
    </main>
  );
}
