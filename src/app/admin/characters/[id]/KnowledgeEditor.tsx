"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Globe, FileText } from "lucide-react";

type Chunk = {
  id: string;
  docId: string | null;
  type: "knowledge" | "belief" | "style_anchor";
  ordinal: number;
  content: string;
  tokens: number;
  createdAt: string;
};

type Doc = {
  id: string;
  title: string;
  source: string;
  sourceUrls: string[];
  createdAt: string;
  _count: { chunks: number };
};

type KnowledgeResp = { docs: Doc[]; chunks: Chunk[] };

type ResearchResp = { topic: string; summary: string; sourceUrls: string[] };

export function KnowledgeEditor({ characterId }: { characterId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<KnowledgeResp>({
    queryKey: ["admin", "knowledge", characterId],
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/characters/${characterId}/knowledge`,
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const [mode, setMode] = useState<"manual" | "research">("research");

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [type, setType] =
    useState<"knowledge" | "belief" | "style_anchor">("knowledge");
  const [researching, setResearching] = useState(false);
  const [posting, setPosting] = useState(false);

  const deleteChunk = useMutation({
    mutationFn: async (chunkId: string) => {
      const r = await fetch(
        `/api/admin/characters/${characterId}/knowledge/${chunkId}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "knowledge", characterId] }),
  });

  async function runResearch() {
    if (!topic.trim()) return;
    setResearching(true);
    try {
      const r = await fetch(
        `/api/admin/characters/${characterId}/knowledge/research`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic: topic.trim() }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as ResearchResp;
      setRawText(data.summary);
      setSourceUrls(data.sourceUrls);
      setTitle(topic.trim());
      setMode("manual");
    } catch (e) {
      alert("리서치 실패: " + (e as Error).message);
    } finally {
      setResearching(false);
    }
  }

  async function upload() {
    if (!title.trim() || !rawText.trim()) return;
    setPosting(true);
    try {
      const r = await fetch(
        `/api/admin/characters/${characterId}/knowledge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            rawText: rawText.trim(),
            type,
            source: sourceUrls.length > 0 ? "admin_research" : "admin_edit",
            sourceUrls,
          }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      setTitle("");
      setTopic("");
      setRawText("");
      setSourceUrls([]);
      qc.invalidateQueries({ queryKey: ["admin", "knowledge", characterId] });
    } catch (e) {
      alert("업로드 실패: " + (e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  const chunks = data?.chunks ?? [];
  const grouped: Record<string, Chunk[]> = {
    knowledge: [],
    belief: [],
    style_anchor: [],
  };
  for (const c of chunks) {
    grouped[c.type]?.push(c);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("research")}
            className={[
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold",
              mode === "research"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            <Globe size={12} />
            웹 리서치
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={[
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold",
              mode === "manual"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            <FileText size={12} />
            직접 입력
          </button>
        </div>

        {mode === "research" && (
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              주제
            </label>
            <div className="flex gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 재즈 피아노의 역사"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={runResearch}
                disabled={researching || !topic.trim()}
                className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {researching ? "조사 중..." : "조사"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Gemini 의 Google 검색 기반 grounding 을 사용. 결과가 나오면 직접
              입력 탭으로 넘어가 편집 후 저장하세요.
            </p>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  제목
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as typeof type)
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="knowledge">knowledge (사실)</option>
                  <option value="belief">belief (신념)</option>
                  <option value="style_anchor">style_anchor (말투)</option>
                </select>
              </div>
            </div>

            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              내용
            </label>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="텍스트를 여기에 붙여넣거나 직접 작성..."
            />

            {sourceUrls.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase text-slate-500">
                  출처 URL ({sourceUrls.length})
                </div>
                <ul className="space-y-0.5 text-[11px]">
                  {sourceUrls.map((u, i) => (
                    <li key={i} className="truncate">
                      <a
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {u}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={upload}
              disabled={posting || !title.trim() || !rawText.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Plus size={12} />
              {posting ? "업로드 중..." : "청크로 분할 + 임베딩 저장"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {isLoading && (
          <p className="text-xs text-slate-500">loading...</p>
        )}
        {(["knowledge", "belief", "style_anchor"] as const).map((t) => (
          <div
            key={t}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {t} ({grouped[t].length})
            </h4>
            {grouped[t].length === 0 ? (
              <p className="text-xs text-slate-400">(비어있음)</p>
            ) : (
              <ul className="space-y-2">
                {grouped[t].map((c) => (
                  <li
                    key={c.id}
                    className="group flex gap-2 rounded-md border border-slate-100 bg-slate-50 p-2"
                  >
                    <span className="font-mono text-[10px] text-slate-400">
                      #{c.ordinal}
                    </span>
                    <p className="flex-1 whitespace-pre-wrap text-xs text-slate-700">
                      {c.content}
                    </p>
                    <span className="self-start font-mono text-[10px] text-slate-400">
                      {c.tokens}t
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("이 청크를 삭제하시겠습니까?"))
                          deleteChunk.mutate(c.id);
                      }}
                      className="self-start rounded-md p-1 text-red-500 opacity-0 transition-opacity hover:bg-red-100 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
