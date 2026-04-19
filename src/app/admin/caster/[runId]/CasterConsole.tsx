"use client";

// Caster 콘솔 — 좌: 대화, 우: 캐릭터 시트 (+ JSON 에디터).
//
// 흐름:
//   1) 유저가 메시지를 보내면 SSE 로 서버와 연결.
//   2) 서버는 delta(텍스트), search(검색어), sources(링크), patch(드래프트), done 이벤트를 흘림.
//   3) 우측 시트가 patch 를 받을 때마다 갱신되며, 최근 변경된 필드는 짧게 강조.
//   4) 시트가 충분히 채워지면 "커밋" 으로 Character 를 생성.
//
// UI 는 모바일 세로/데스크톱 가로 모두 스크롤이 되게 구성했다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  CheckCircle2,
  Trash2,
  Search,
  ExternalLink,
  Code2,
  AlertCircle,
} from "lucide-react";
import {
  CharacterSheet,
  computeCompletion,
  type SheetDraft,
} from "./CharacterSheet";

export type CasterSource = {
  uri: string;
  title?: string;
  domain?: string;
};

export type CasterMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  searchQueries?: string[];
  sources?: CasterSource[];
  createdAt: string;
};

type Draft = SheetDraft;

type Props = {
  runId: string;
  initialStatus: string;
  initialMessages: CasterMessage[];
  initialDraft: Record<string, unknown> | null;
  savedCharacterId: string | null;
};

function sanitizeDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Draft;
}

type RequiredField = {
  key: string;
  label: string;
  get: (d: Draft) => unknown;
};

const REQUIRED: RequiredField[] = [
  { key: "name", label: "이름", get: (d) => d.name },
  { key: "slug", label: "슬러그", get: (d) => d.slug },
  { key: "tagline", label: "한 줄 소개", get: (d) => d.tagline },
  { key: "accentColor", label: "액센트 컬러", get: (d) => d.accentColor },
  { key: "greeting", label: "인사말", get: (d) => d.greeting },
  {
    key: "persona.displayName",
    label: "표시명",
    get: (d) => d.persona?.displayName,
  },
  {
    key: "persona.backstorySummary",
    label: "배경 요약",
    get: (d) => d.persona?.backstorySummary,
  },
];

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function diffKeys(prev: Draft | null, next: Draft | null): string[] {
  if (!next) return [];
  const out: string[] = [];
  const check = (k: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push(k);
  };
  check("name", prev?.name, next.name);
  check("slug", prev?.slug, next.slug);
  check("tagline", prev?.tagline, next.tagline);
  check("accentColor", prev?.accentColor, next.accentColor);
  check("greeting", prev?.greeting, next.greeting);
  const pp = prev?.persona ?? {};
  const np = next.persona ?? {};
  const keys = new Set([...Object.keys(pp), ...Object.keys(np)]);
  for (const k of keys) {
    check(
      `persona.${k}`,
      (pp as Record<string, unknown>)[k],
      (np as Record<string, unknown>)[k],
    );
  }
  return out;
}

export function CasterConsole({
  runId,
  initialStatus,
  initialMessages,
  initialDraft,
  savedCharacterId: initialSavedId,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CasterMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(
    sanitizeDraft(initialDraft),
  );
  const [updatedKeys, setUpdatedKeys] = useState<string[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const [commitBusy, setCommitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(sanitizeDraft(initialDraft) ?? {}, null, 2),
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // JSON 모드를 켤 때마다 현재 draft 로 동기화
  useEffect(() => {
    if (jsonMode) {
      setJsonText(JSON.stringify(draft ?? {}, null, 2));
    }
  }, [jsonMode, draft]);

  const applyPatch = useCallback((nextDraft: Draft) => {
    setDraft((prev) => {
      const keys = diffKeys(prev, nextDraft);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setUpdatedKeys(keys);
      highlightTimer.current = setTimeout(() => setUpdatedKeys([]), 2600);
      return nextDraft;
    });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setValidationIssues([]);

    const userMsg: CasterMessage = {
      id: "tmp-u-" + Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const modelId = "tmp-m-" + Date.now();
    const modelInit: CasterMessage = {
      id: modelId,
      role: "model",
      content: "",
      searchQueries: [],
      sources: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, modelInit]);
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
            } else if (event === "search") {
              const { queries } = JSON.parse(data) as { queries: string[] };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === modelId
                    ? {
                        ...m,
                        searchQueries: [
                          ...(m.searchQueries ?? []),
                          ...queries,
                        ],
                      }
                    : m,
                ),
              );
            } else if (event === "sources") {
              const { sources } = JSON.parse(data) as {
                sources: CasterSource[];
              };
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== modelId) return m;
                  const merged = [...(m.sources ?? [])];
                  for (const s of sources) {
                    if (!merged.some((x) => x.uri === s.uri)) merged.push(s);
                  }
                  return { ...m, sources: merged };
                }),
              );
            } else if (event === "patch") {
              const { draft: d } = JSON.parse(data) as { draft: Draft };
              applyPatch(d);
              setStatus("draft_ready");
            } else if (event === "error") {
              const { message } = JSON.parse(data) as { message: string };
              setError(message);
            }
          } catch {
            // ignore frame parse errors
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, runId, applyPatch]);

  // ---------- commit ----------

  const missing = useMemo(() => {
    if (!draft) return REQUIRED;
    return REQUIRED.filter((f) => !isFilled(f.get(draft)));
  }, [draft]);

  const commitPayload = useMemo(() => {
    if (!draft) return null;
    const p = draft.persona ?? {};
    return {
      slug: draft.slug ?? "",
      name: draft.name ?? "",
      tagline: draft.tagline ?? "",
      accentColor: draft.accentColor ?? "#3a5f94",
      greeting: draft.greeting ?? "",
      persona: {
        displayName: p.displayName ?? draft.name ?? "",
        aliases: p.aliases ?? [],
        pronouns: p.pronouns ?? null,
        ageText: p.ageText ?? null,
        gender: p.gender ?? null,
        species: p.species ?? null,
        role: p.role ?? null,
        backstorySummary: p.backstorySummary ?? "",
        worldContext: p.worldContext ?? null,
        coreBeliefs: p.coreBeliefs ?? [],
        coreMotivations: p.coreMotivations ?? [],
        fears: p.fears ?? [],
        redLines: p.redLines ?? [],
        speechRegister: p.speechRegister ?? null,
        speechEndings: p.speechEndings ?? [],
        speechRhythm: p.speechRhythm ?? null,
        speechQuirks: p.speechQuirks ?? [],
        languageNotes: p.languageNotes ?? null,
        appearanceKeys: p.appearanceKeys ?? [],
      },
    };
  }, [draft]);

  const commit = useCallback(async () => {
    setError(null);
    setValidationIssues([]);
    if (!commitPayload) {
      setError("드래프트가 비어 있습니다.");
      return;
    }
    if (missing.length > 0) {
      setValidationIssues(missing.map((m) => m.label));
      return;
    }
    setCommitBusy(true);
    try {
      const r = await fetch(`/api/admin/caster/runs/${runId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commitPayload),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { error?: string; issues?: { path: (string | number)[]; message: string }[] }
          | null;
        if (j?.issues?.length) {
          setValidationIssues(
            j.issues.map(
              (it) => `${it.path.join(".")}: ${it.message}`,
            ),
          );
        } else {
          setError(j?.error ?? `commit 실패 (${r.status})`);
        }
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
  }, [commitPayload, missing, runId, router]);

  const applyJsonEdit = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText) as Draft;
      applyPatch(parsed);
      setJsonMode(false);
      setError(null);
    } catch {
      setError("JSON 형식 오류");
    }
  }, [jsonText, applyPatch]);

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

  const pct = computeCompletion(draft);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 pb-32 pt-4 lg:grid-cols-[minmax(0,1fr),420px]">
      {/* LEFT: chat */}
      <section className="flex min-h-[60vh] flex-col rounded-lg bg-surface-container-lowest shadow-card">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <EmptyHint />
          ) : (
            messages.map((m) => <MessageBlock key={m.id} msg={m} />)
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 border-t border-outline/20 p-3">
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
            className="flex-1 resize-none rounded-md bg-surface-container px-3 py-2 text-sm text-on-surface outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim() || status === "saved"}
            className="flex w-10 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary disabled:opacity-50"
            aria-label="전송"
          >
            <Send size={16} />
          </button>
        </div>
      </section>

      {/* RIGHT: sheet + commit */}
      <aside className="flex flex-col gap-3 rounded-lg bg-surface-container-lowest p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="label-scholastic text-sm text-on-surface">
            Character Sheet
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setJsonMode((v) => !v)}
              className={[
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                jsonMode
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:bg-surface-container",
              ].join(" ")}
              aria-label="JSON 편집 토글"
            >
              <Code2 size={12} />
              JSON
            </button>
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
        </div>

        {savedLink ? (
          <a
            href={savedLink}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"
          >
            <CheckCircle2 size={14} />
            저장됨  캐릭터 편집 열기
          </a>
        ) : null}

        {jsonMode ? (
          <div className="flex flex-1 flex-col gap-2">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              rows={22}
              className="flex-1 min-h-[40vh] rounded-md bg-surface-container p-3 font-mono text-[11px] leading-relaxed text-on-surface"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setJsonText(JSON.stringify(draft ?? {}, null, 2));
                  setJsonMode(false);
                }}
                className="rounded-md border border-outline/30 px-3 py-1.5 text-xs"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyJsonEdit}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-on-primary"
              >
                적용
              </button>
            </div>
          </div>
        ) : (
          <CharacterSheet
            draft={draft}
            updatedKeys={updatedKeys}
            completionPct={pct}
          />
        )}

        {missing.length > 0 && !savedId ? (
          <div className="rounded-md border border-amber-300/50 bg-amber-50/50 p-2 text-[11px] text-amber-900">
            커밋 전 필요: {missing.map((m) => m.label).join(", ")}
          </div>
        ) : null}

        {validationIssues.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-rose-200 bg-rose-50/70 p-2 text-[11px] text-rose-800">
            {validationIssues.map((v, i) => (
              <li key={i} className="flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="whitespace-pre-wrap text-xs text-error">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={commit}
          disabled={
            commitBusy || status === "saved" || !draft || missing.length > 0
          }
          className="rounded-md bg-primary py-2 text-sm font-bold text-on-primary disabled:opacity-50"
        >
          {status === "saved"
            ? "저장 완료"
            : commitBusy
              ? "저장 중..."
              : "커밋 (캐릭터 생성)"}
        </button>
      </aside>
    </div>
  );
}

// ---------- 서브 컴포넌트 ----------

function EmptyHint() {
  return (
    <div className="rounded-md border border-dashed border-outline/30 p-4 text-sm text-on-surface-variant">
      <p className="mb-2 font-bold">Caster 에게 새 캐릭터의 컨셉을 설명하세요.</p>
      <ul className="space-y-1 text-xs">
        <li>
          &ldquo;조용한 사서, 20대 후반, 오래된 책으로 세상을 읽는 사람.&rdquo;
        </li>
        <li>
          &ldquo;미래도시 소방관. 쾌활한 성격. 항상 라디오를 듣고 다녀.&rdquo;
        </li>
        <li>
          &ldquo;셜록 홈즈 같은 추리 캐릭터, 현대 서울 배경.&rdquo;
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-on-surface-variant/80">
        Caster 가 한 번에 한 가지씩 물어가며 시트를 채웁니다. 필요하면 Google
        검색으로 사실을 확인해 반영합니다.
      </p>
    </div>
  );
}

function MessageBlock({ msg }: { msg: CasterMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "space-y-1.5"}>
      {!isUser && msg.searchQueries && msg.searchQueries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-1 text-[11px] text-on-surface-variant">
          <Search size={11} />
          <span className="font-bold uppercase tracking-wider">검색</span>
          {msg.searchQueries.map((q, i) => (
            <span
              key={i}
              className="rounded-sm bg-surface-container px-1.5 py-0.5"
            >
              {q}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={[
          "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
          isUser
            ? "ml-auto bg-primary-container text-on-primary-container"
            : "mr-auto bg-surface-container text-on-surface",
        ].join(" ")}
      >
        {msg.content || (!isUser ? "…" : "")}
      </div>
      {!isUser && msg.sources && msg.sources.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap gap-1 pl-1">
          {msg.sources.map((s, i) => (
            <a
              key={i}
              href={s.uri}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-sm border border-outline/30 bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant hover:bg-surface"
              title={s.title ?? s.uri}
            >
              <ExternalLink size={10} />
              <span className="max-w-[180px] truncate">
                {s.domain ?? s.title ?? s.uri}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
