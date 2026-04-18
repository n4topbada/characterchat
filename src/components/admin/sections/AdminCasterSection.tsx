"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export function AdminCasterSection() {
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2 text-indigo-600">
          <Sparkles size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Caster Console
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          디자이너 에이전트가 자연어 대화로 캐릭터 구조체를 수집합니다. 커버리지
          100% 도달 시 commit 프로세스 활성화.
        </p>
        <Link
          href={{ pathname: "/admin/caster" }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500"
        >
          <span>OPEN CASTER</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="rounded-md border border-dashed border-slate-300 p-4 text-[11px] leading-relaxed text-slate-500">
        Caster Phase B/C 툴 루프는 M4 마일스톤에서 확정. 현재는 skeleton 라우트만
        존재합니다.
      </div>
    </div>
  );
}
