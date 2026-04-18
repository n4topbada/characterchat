"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, Trash2 } from "lucide-react";

type Msg = {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
};

type Draft = Record<string, unknown> & {
  slug?: string;
  name?: string;
  tagline?: string;
  accentColor?: string;
  greeting?: string;
  persona?: Record<string, unknown>;
};

type Props = {
  runId: string;
  initialStatus: string;
  initialMessages: Msg[];
  initialDraft: Draft | null;
  savedCharacterId: string | null;
};

function formatDraft(draft: Draft | null): string {
  if (!draft) return "";
  return JSON.stringify(draft, null, 2);
}

export function CasterConsole({
  runId,
  initialStatus,
  initialMessages,
  initialDraft,
  savedCharacterId: initialSavedId,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [draftText, setDraftText] = useState(formatDraft(initialDraft));
  const [status, setStatus] = useState(initialStatus);
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const [commitBusy, setCommitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setDraftText(formatDraft(draft));
  }, [draft]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    const userMsg: Msg = {
      id: "tmp-u-" + Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const modelId = "tmp-m-" + Date.now();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: modelId, role: "model", content: "", createdAt: new Date().toISOString() },
    ]);
    setStreaming(true);

    try {
      const r = await fetch(`/api/admin/caster/runs/${runId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok || !r.body) {
        setError(`요청 실패 (${r.status})`);
        setStreaming(false);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          const evLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(6).trim();
          const data = dataLine.slice(5).trim();
          try {
            if (event === "delta") {
              const { text: t } = JSON.parse(data) as { text: string };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === modelId ? { ...m, content: m.content + t } : m,
                ),
              );
            } else if (event === "draft_ready") {
              const { draft: d } = JSON.parse(data) as { draft: Draft };
              setDraft(d);
              setStatus("draft_ready");
            } else if (event === "error") {
              const { message } = JSON.parse(data) as { message: string };
              setError(message);
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, runId]);

  const commit = useCallback(async () => {
    setError(null);
    let parsed: Draft;
    try {
      parsed = JSON.parse(draftText) as Draft;
    } catch {
      setError("드래프트 JSON 형식 오류");
      return;
    }
    setCommitBusy(true);
    try {
      const r = await fetch(`/api/admin/caster/runs/${runId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(j?.error ?? `commit 실패 (${r.status})`);
        return;
      }
      const j = (await r.json()) as {
        character: { id: string; slug: string; name: string };
      };
      setSavedId(j.character.id);
      setStatus("saved");
      router.refresh();
    } finally {
      setCommitBusy(false);
    }
  }, [draftText, runId, router]);

  const del = useCallback(async () => {
    if (!confirm("이 세션을 삭제할까요?")) return;
    const r = await fetch(`/api/admin/caster/runs/${runId}`, {
      method: "DELETE",
    });
    if (r.ok) router.push("/admin/caster");
  }, [runId, router]);

  const savedLink = useMemo(() => {
    if (!savedId) return null;
    return `/admin/characters/${savedId}`;
  }, [savedId]);

  return (
    <div className="max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-4 px-4 pt-4 pb-32">
      {/* LEFT: chat */}
      <section className="flex flex-col bg-surface-container-lowest rounded-lg shadow-card min-h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Caster 에게 원하는 캐릭터의 컨셉을 자연어로 설명해 보세요.
              <br />
              예: <span className="italic">&ldquo;조용한 사서 캐릭터. 20대 후반, 책을 매개로 세상을 읽는 사람&rdquo;</span>
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={[
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user"
                    ? "ml-auto bg-primary-container text-on-primary-container"
                    : "mr-auto bg-surface-container text-on-surface",
                ].join(" ")}
              >
                {m.content || (m.role === "model" && streaming ? "…" : "")}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-outline/30 p-3 flex gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="메시지 (Cmd/Ctrl+Enter 로 전송)"
            disabled={streaming || status === "saved"}
            className="flex-1 bg-surface-container text-on-surface px-3 py-2 rounded-md text-sm resize-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim() || status === "saved"}
            className="w-10 shrink-0 bg-primary text-on-primary rounded-md flex items-center justify-center disabled:opacity-50"
            aria-label="전송"
          >
            <Send size={16} />
          </button>
        </div>
      </section>

      {/* RIGHT: draft */}
      <aside className="flex flex-col bg-surface-container-lowest rounded-lg shadow-card p-4 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-bold text-sm uppercase tracking-[0.15em] text-on-surface">
            Draft
          </h3>
          <button
            type="button"
            onClick={del}
            disabled={commitBusy}
            className="text-on-surface-variant/70 hover:text-error"
            aria-label="세션 삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>
        {savedLink ? (
          <a
            href={savedLink}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-secondary-fixed"
          >
            <CheckCircle2 size={14} />
            저장됨 — 캐릭터 편집 열기
          </a>
        ) : null}
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          spellCheck={false}
          rows={24}
          placeholder="Caster 가 제안하면 여기에 JSON 이 채워집니다."
          disabled={status === "saved"}
          className="flex-1 min-h-[40vh] font-mono text-[11px] leading-relaxed bg-surface-container text-on-surface rounded-md p-3 disabled:opacity-60"
        />
        {error ? (
          <p className="text-xs text-error whitespace-pre-wrap">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={commit}
          disabled={commitBusy || status === "saved" || !draftText.trim()}
          className="bg-primary text-on-primary rounded-md py-2 text-sm font-bold disabled:opacity-50"
        >
          {status === "saved" ? "저장 완료" : commitBusy ? "저장 중..." : "커밋 (캐릭터 생성)"}
        </button>
      </aside>
    </div>
  );
}
