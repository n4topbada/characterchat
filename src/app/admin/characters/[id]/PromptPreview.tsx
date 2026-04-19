"use client";

// 관리자용 System Prompt 프리뷰.
// Gemini 에 실제로 주입되는 systemInstruction 을 합성해 보여준다.
// - 수정 입력창이 아니다. PersonaCore 를 고치면 다음 프리뷰에 반영된다.
// - RAG 주입을 확인하려면 "테스트 쿼리" 를 입력해 Refresh.
// - 클립보드 복사 지원.

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCcw, Check } from "lucide-react";

type PreviewResp = {
  systemInstruction: string;
  meta: {
    model: string | null;
    temperature: number | null;
    maxOutputTokens: number | null;
    characterName: string;
    characterSlug: string;
    query: string;
    chunkCounts: {
      knowledge: number;
      styleAnchors: number;
      episodes: number;
      relationSummary: number;
    };
  };
};

export function PromptPreview({ characterId }: { characterId: string }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PreviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = query ? `?query=${encodeURIComponent(query)}` : "";
      const res = await fetch(
        `/api/admin/characters/${characterId}/system-prompt${qs}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      setData((await res.json()) as PreviewResp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [characterId, query]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  async function handleCopy() {
    if (!data?.systemInstruction) return;
    try {
      await navigator.clipboard.writeText(data.systemInstruction);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            System Prompt 프리뷰
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Gemini 에 주입되는 systemInstruction 을 composer 가 매 요청마다
            합성한다. 여기 값은 <b>PersonaCore + 지식 + 설정</b>에서 자동 생성되며,
            편집은 Persona / Knowledge 탭에서 한다.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "로딩..." : "새로고침"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!data}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
          테스트 쿼리 (선택)
        </label>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 오늘 컨디션 어때? — 입력하면 이 쿼리로 RAG 검색 결과까지 합성"
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void load();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            적용
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Chip label="model" value={data.meta.model ?? "-"} />
            <Chip
              label="temp"
              value={
                data.meta.temperature != null
                  ? data.meta.temperature.toFixed(2)
                  : "-"
              }
            />
            <Chip
              label="max tokens"
              value={String(data.meta.maxOutputTokens ?? "-")}
            />
            <Chip
              label="knowledge"
              value={String(data.meta.chunkCounts.knowledge)}
            />
            <Chip
              label="style"
              value={String(data.meta.chunkCounts.styleAnchors)}
            />
            <Chip
              label="episodes"
              value={String(data.meta.chunkCounts.episodes)}
            />
            <Chip
              label="relation"
              value={String(data.meta.chunkCounts.relationSummary)}
            />
          </div>

          <textarea
            readOnly
            value={data.systemInstruction}
            spellCheck={false}
            className="h-[60vh] w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800"
          />

          <p className="text-[11px] text-slate-500">
            글자 수: {data.systemInstruction.length.toLocaleString()} · 줄 수:{" "}
            {data.systemInstruction.split("\n").length.toLocaleString()}
          </p>
        </>
      )}
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-2 py-0.5">
      <span className="font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="font-mono text-slate-800">{value}</span>
    </span>
  );
}
