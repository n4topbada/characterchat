"use client";

// Caster 콘솔 — 단일 컬럼 레이아웃.
//
// 구조 (위에서 아래):
//   1) 스크롤 가능한 대화 영역 — 진입 시 고정 인사말 + 실제 메시지
//   2) 접히는 "여태 채워진 정보" 드로어 — 드래프트 시트 + 커밋 버튼
//   3) 입력창
//
// 기능:
//   - <patch> / <choices> 는 라이브 표시에서 자동 숨김.
//   - 서버가 보낸 choices 가 있으면 해당 assistant 메시지 아래에 버튼 그리드로 표시.
//   - 검색 소스의 OG 이미지가 들어오면 썸네일 그리드로 표시, "이 느낌" 버튼으로 확정.

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
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RotateCw,
} from "lucide-react";
import {
  CharacterSheet,
  computeCompletion,
  type SheetDraft,
} from "./CharacterSheet";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

export type CasterSource = {
  uri: string;
  title?: string;
  domain?: string;
  /** 초안 전용 OG 이미지 URL — source_image SSE 이벤트로 덧붙는다. DB 에 저장 X. */
  image?: string;
};

type ImageRef = {
  uri: string;
  image: string;
  title?: string;
  domain?: string;
};

export type CasterMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  searchQueries?: string[];
  sources?: CasterSource[];
  /** Caster 가 제시한 2~4 버튼 옵션. 클릭하면 그 문자열이 바로 다음 유저 입력이 된다. */
  choices?: string[];
  /** 유저가 썸네일을 "이 느낌" 으로 확정했을 때 해당 메시지에 inline preview 로 깔린다. */
  previewImage?: string;
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

// ---------- 고정 인사말 ----------
// DB 에 저장하지 않고 항상 UI 가 보여 주는 "Caster 의 첫 인사".
const GREETING_TEXT =
  "안녕. 새 캐릭터를 같이 잡아보자. 어떤 방향부터 갈까?";
const GREETING_CHOICES: string[] = [
  "완전히 새로운 오리지널 캐릭터",
  "실존 인물/작품 기반",
  "장르·톤부터 정하자",
];

// ---------- 유틸 ----------

function sanitizeDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Draft;
}

/**
 * 라이브 표시 클린업 — 첫 <patch / <choices / 환각 툴태그부터 끝까지 숨긴다.
 * 스트리밍 중 덜 닫힌 블록이 보이는 걸 막는다. 저장은 서버에서 별도 strip.
 */
const LIVE_CUT_PATTERNS: RegExp[] = [
  /<patch\b/i,
  /<choices\b/i,
  /<image[\s_]?search\b/i,
  /<imagesearch\b/i,
  /<search(?:_query)?\b/i,
  /<tool(?:_call)?\b/i,
  /<function(?:_call)?\b/i,
  /<web_search\b/i,
];

function stripMarkup(text: string): string {
  let end = text.length;
  for (const re of LIVE_CUT_PATTERNS) {
    const m = text.search(re);
    if (m >= 0 && m < end) end = m;
  }
  return text.slice(0, end).replace(/\s+$/, "");
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

// ========== 본체 ==========

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(sanitizeDraft(initialDraft) ?? {}, null, 2),
  );
  // 포트레이트 Agent 상태 — 커밋 직후 auto-trigger. 드로어에 진행 뱃지로 노출.
  //   idle    : 아직 트리거 안 됨
  //   running : SSE 스트리밍 중
  //   saved   : 이미지 Asset 저장 완료
  //   error   : 실패 (message 표시, 수동 재시도 버튼 제공)
  const [portraitStatus, setPortraitStatus] = useState<
    "idle" | "running" | "saved" | "error"
  >("idle");
  const [portraitMessage, setPortraitMessage] = useState<string | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [portraitProgress, setPortraitProgress] = useState<number>(0);

  // 애니메이션 Agent 상태 — 포트레이트 saved 직후 체인 호출.
  //   idle    : 아직 트리거 안 됨
  //   running : Veo/ffmpeg 진행 중 (stage 로 단계 표시)
  //   saved   : animated webp 저장 완료
  //   error   : 실패
  const [animationStatus, setAnimationStatus] = useState<
    "idle" | "running" | "saved" | "error"
  >("idle");
  const [animationStage, setAnimationStage] = useState<string | null>(null);
  const [animationMessage, setAnimationMessage] = useState<string | null>(null);
  const [animationPreview, setAnimationPreview] = useState<string | null>(null);
  // "/saved 받은 assetId" — 사용자가 애니메이션 재시도할 때 쓴다.
  const [animationAssetId, setAnimationAssetId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 업스트림 혼잡/에러 시 "같은 입력을 다시 보내기" 를 할 수 있도록 마지막
  // dispatch 파라미터를 ref 로 보관. (state 로 두면 에러 배너가 매 streaming
  // 상태 변화마다 재렌더 되므로 ref 로 충분하다.)
  const lastDispatchRef = useRef<{
    text: string;
    imageRef?: ImageRef;
    previewImage?: string;
  } | null>(null);
  // draft.confirm === true 로 자동 커밋을 이미 시도했는지. 재진입/재렌더로 인한
  // 중복 POST 를 막는 idempotent 가드. 실패 시 롤백해서 다시 시도할 수 있게 한다.
  const autoCommitTriedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  /**
   * 실제 전송 로직. text 와 선택적 imageRef/previewImage 를 받는다.
   *
   * opts.retry=true 는 "에러 배너의 다시 보내기" 경로. 이 때는
   *   1) 유저 버블이 이미 화면에 남아 있으므로 **새로 추가하지 않는다**
   *      (안 그러면 같은 텍스트 버블이 두 개 생긴다)
   *   2) 실패했던 빈 모델 placeholder 가 혹시 남아 있으면 들어내고
   *      새 placeholder 하나만 붙인다
   *   3) 서버에도 retry 플래그를 넘겨서 이전 POST 때 이미 기록된
   *      user_msg 이벤트를 중복 insert 하지 않도록 한다
   */
  const dispatch = useCallback(
    async (
      text: string,
      opts?: { imageRef?: ImageRef; previewImage?: string; retry?: boolean },
    ) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);
      setValidationIssues([]);
      // 재전송 버튼이 꺼낼 수 있도록 최신 입력을 ref 에 박제.
      lastDispatchRef.current = {
        text: trimmed,
        imageRef: opts?.imageRef,
        previewImage: opts?.previewImage,
      };

      const modelId = "tmp-m-" + Date.now();
      const modelInit: CasterMessage = {
        id: modelId,
        role: "model",
        content: "",
        searchQueries: [],
        sources: [],
        choices: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => {
        if (opts?.retry) {
          // 유저 버블 재삽입 X. 끝에 혹시 남은 빈 모델 placeholder 들어내고
          // 새 placeholder 만 붙인다. 부분 응답이 찍혀 있으면(=content 있음)
          // 그건 보존 — 사용자에게 "아까 여기까지 오다 끊겼다" 흔적을 남김.
          const last = prev[prev.length - 1];
          const cleaned =
            last?.role === "model" && !last.content.trim()
              ? prev.slice(0, -1)
              : prev;
          return [...cleaned, modelInit];
        }
        const userMsg: CasterMessage = {
          id: "tmp-u-" + Date.now(),
          role: "user",
          content: trimmed,
          previewImage: opts?.previewImage,
          createdAt: new Date().toISOString(),
        };
        return [...prev, userMsg, modelInit];
      });
      setStreaming(true);

      try {
        const r = await fetch(`/api/admin/caster/runs/${runId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            imageRef: opts?.imageRef ?? null,
            retry: opts?.retry ?? false,
          }),
        });
        if (!r.ok || !r.body) {
          setError(`요청 실패 (${r.status})`);
          // HTTP 에러면 빈 모델 placeholder 를 남겨둬도 UI 쓰레기이므로 청소.
          setMessages((prev) => prev.filter((m) => m.id !== modelId));
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
              } else if (event === "source_image") {
                const { uri, image } = JSON.parse(data) as {
                  uri: string;
                  image: string;
                };
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== modelId || !m.sources) return m;
                    return {
                      ...m,
                      sources: m.sources.map((s) =>
                        s.uri === uri ? { ...s, image } : s,
                      ),
                    };
                  }),
                );
              } else if (event === "choices") {
                const { choices: cs } = JSON.parse(data) as {
                  choices: string[];
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === modelId ? { ...m, choices: cs } : m,
                  ),
                );
              } else if (event === "patch") {
                const { draft: d } = JSON.parse(data) as { draft: Draft };
                applyPatch(d);
                setStatus("draft_ready");
              } else if (event === "error") {
                const { message } = JSON.parse(data) as { message: string };
                setError(message);
                // 빈 응답 / 차단 등으로 assistant 본문이 0 바이트면 placeholder
                // 말풍선을 화면에서 제거한다 (DB 에도 저장 안 됨).
                setMessages((prev) =>
                  prev.filter(
                    (m) => !(m.id === modelId && !m.content.trim()),
                  ),
                );
              }
            } catch {
              // ignore frame parse errors
            }
          }
        }
      } catch (e) {
        // 네트워크 단절/AbortError 등 fetch 단계 예외. error 배너로 보여주고
        // 빈 placeholder 정리. (그러지 않으면 "다시 보내기" 클릭해도 빈
        // 모델 버블이 두 개 쌓인다.)
        setError(e instanceof Error ? e.message : String(e));
        setMessages((prev) => prev.filter((m) => m.id !== modelId));
      } finally {
        setStreaming(false);
      }
    },
    [streaming, runId, applyPatch],
  );

  const sendInput = useCallback(async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await dispatch(text);
  }, [input, dispatch]);

  const sendChoice = useCallback(
    async (choice: string) => {
      await dispatch(choice);
    },
    [dispatch],
  );

  const confirmImage = useCallback(
    async (src: CasterSource) => {
      if (!src.image) return;
      const label = src.title ?? src.domain ?? src.uri;
      const text = `이 이미지 느낌이 맞아 — "${label}"`;
      await dispatch(text, {
        imageRef: {
          uri: src.uri,
          image: src.image,
          title: src.title,
          domain: src.domain,
        },
        previewImage: src.image,
      });
    },
    [dispatch],
  );

  const rejectImages = useCallback(async () => {
    await dispatch("이 중엔 없어. 다른 방향/느낌으로 레퍼런스를 다시 찾아줘.");
  }, [dispatch]);

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
      referenceImage: draft.referenceImage
        ? {
            url: draft.referenceImage.url,
            sourceUri: draft.referenceImage.sourceUri ?? null,
            title: draft.referenceImage.title ?? null,
            domain: draft.referenceImage.domain ?? null,
          }
        : null,
    };
  }, [draft]);

  /**
   * 애니메이션 Agent 를 SSE 로 호출한다.
   * - 포트레이트가 저장되고 assetId 가 확보된 직후 체인 호출.
   * - Veo 폴링(수 분) 중에는 `stage`("veo_poll 40s") 로 하트비트.
   * - 최종 saved 이벤트에서 animationUrl 받아 프리뷰 표시.
   */
  const runAnimationAgent = useCallback(
    async (assetId: string, opts?: { force?: boolean }) => {
      setAnimationStatus("running");
      setAnimationStage("시작");
      setAnimationMessage(null);
      setAnimationAssetId(assetId);
      try {
        const r = await fetch(`/api/admin/assets/${assetId}/animate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({ force: !!opts?.force }),
        });
        if (!r.ok || !r.body) {
          setAnimationStatus("error");
          setAnimationMessage(`애니메이션 생성 실패 (${r.status})`);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let gotTerminal = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = dataLine.slice(5).trim();
            try {
              if (event === "started") {
                setAnimationStage("Veo 모션 설계");
              } else if (event === "download") {
                setAnimationStage("원본 이미지 준비");
              } else if (event === "veo_start") {
                setAnimationStage("Veo 비디오 생성 시작");
              } else if (event === "veo_poll") {
                const { elapsedSec } = JSON.parse(data) as {
                  elapsedSec: number;
                };
                setAnimationStage(`Veo 렌더 중 ${elapsedSec}s`);
              } else if (event === "veo_done") {
                setAnimationStage("mp4 수신");
              } else if (event === "ffmpeg_start") {
                setAnimationStage("540x810 webp 변환");
              } else if (event === "ffmpeg_done") {
                setAnimationStage("업로드 준비");
              } else if (event === "upload") {
                setAnimationStage("Blob 업로드");
              } else if (event === "saved") {
                const j = JSON.parse(data) as { animationUrl: string };
                setAnimationStatus("saved");
                setAnimationPreview(j.animationUrl);
                setAnimationStage(null);
                gotTerminal = true;
              } else if (event === "reused") {
                const j = JSON.parse(data) as { animationUrl: string };
                setAnimationStatus("saved");
                setAnimationPreview(j.animationUrl);
                setAnimationStage(null);
                gotTerminal = true;
              } else if (event === "error") {
                const { message } = JSON.parse(data) as { message: string };
                setAnimationStatus("error");
                setAnimationMessage(message);
                setAnimationStage(null);
                gotTerminal = true;
              }
            } catch {
              // ignore frame parse errors
            }
          }
        }
        if (!gotTerminal) {
          setAnimationStatus("error");
          setAnimationMessage("빈 응답");
          setAnimationStage(null);
        }
        router.refresh();
      } catch (e) {
        setAnimationStatus("error");
        setAnimationMessage(e instanceof Error ? e.message : String(e));
        setAnimationStage(null);
      }
    },
    [router],
  );

  /**
   * 포트레이트 Agent 를 SSE 로 호출한다.
   * - 커밋 직후 auto-trigger 되고, 드로어 상단에 진행 뱃지를 띄운다.
   * - 실패하면 error 상태 + "재시도" 버튼 (portraitStatus='error').
   * - 성공하면 blobUrl 로 프리뷰 썸네일을 띄우고 router.refresh() 로 다른 뷰 반영.
   * - saved 이벤트에서 assetId 를 받으면 즉시 runAnimationAgent 로 체인.
   */
  const runPortraitAgent = useCallback(
    async (characterId: string) => {
      setPortraitStatus("running");
      setPortraitMessage(null);
      setPortraitProgress(0);
      // 새 포트레이트 시도 시 애니메이션 상태 초기화 (이전 실패가 남아있지 않도록)
      setAnimationStatus("idle");
      setAnimationMessage(null);
      setAnimationPreview(null);
      setAnimationAssetId(null);
      setAnimationStage(null);
      try {
        const r = await fetch(
          `/api/admin/characters/${characterId}/portrait/generate`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "text/event-stream",
            },
            body: JSON.stringify({ runId }),
          },
        );
        if (!r.ok || !r.body) {
          setPortraitStatus("error");
          setPortraitMessage(`포트레이트 생성 실패 (${r.status})`);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let gotTerminal = false;
        let savedAssetId: string | null = null;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = dataLine.slice(5).trim();
            try {
              if (event === "progress") {
                const { chunks } = JSON.parse(data) as { chunks: number };
                setPortraitProgress(chunks);
              } else if (event === "saved") {
                const j = JSON.parse(data) as {
                  blobUrl: string;
                  assetId: string;
                };
                setPortraitStatus("saved");
                setPortraitPreview(j.blobUrl);
                savedAssetId = j.assetId ?? null;
                gotTerminal = true;
              } else if (event === "error") {
                const { message } = JSON.parse(data) as { message: string };
                setPortraitStatus("error");
                setPortraitMessage(message);
                gotTerminal = true;
              }
            } catch {
              // ignore frame parse errors
            }
          }
        }
        // 스트림이 끝났는데 saved/error 둘 다 못 받았으면 "이미지 못 받음" 취급.
        if (!gotTerminal) {
          setPortraitStatus("error");
          setPortraitMessage("빈 응답");
        }
        router.refresh();
        // 체인: 포트레이트 성공 → 애니메이션 Agent 자동 트리거.
        // 실패해도 commit/포트레이트 결과는 유지. 애니메이션은 별개 뱃지로 상태 표시.
        if (savedAssetId) {
          void runAnimationAgent(savedAssetId);
        }
      } catch (e) {
        setPortraitStatus("error");
        setPortraitMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [runId, router, runAnimationAgent],
  );

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
          | {
              error?: string;
              issues?: { path: (string | number)[]; message: string }[];
            }
          | null;
        if (j?.issues?.length) {
          setValidationIssues(
            j.issues.map((it) => `${it.path.join(".")}: ${it.message}`),
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
      // 커밋 성공 → 포트레이트 Agent 비동기 트리거. 실패해도 commit 은 성공 상태 유지.
      void runPortraitAgent(j.character.id);
    } finally {
      setCommitBusy(false);
    }
  }, [commitPayload, missing, runId, router, runPortraitAgent]);

  /**
   * Caster 가 <patch>{"confirm": true}</patch> 를 보냈을 때 호출되는 자동 커밋.
   * 동작 흐름:
   *   1) commit 엔드포인트 호출 (수동 버튼과 동일)
   *   2) 성공 시 /find?focus=<slug>&gen=1 로 이동
   *   3) 포트레이트 / 애니메이션 SSE 는 Find 페이지의 CharacterCard 가 이어받아
   *      "생성 중" 오버레이를 띄우고 완료 시 router.refresh() 한다.
   *
   * 수동 커밋 버튼과 달리 **이 페이지에 머무르지 않는다** — 유저는 곧바로 새
   * 캐릭터를 찾기 메뉴에서 보게 된다. 포트레이트 Agent 체인을 여기서 돌리지
   * 않는 이유: 라우터 이동으로 이 컴포넌트가 언마운트되면 fetch 가 중단된다.
   */
  const autoCommit = useCallback(async () => {
    if (autoCommitTriedRef.current) return;
    if (!commitPayload) return;
    if (missing.length > 0) return;
    if (status === "saved") return;
    autoCommitTriedRef.current = true;
    setCommitBusy(true);
    setError(null);
    setValidationIssues([]);
    try {
      const r = await fetch(`/api/admin/caster/runs/${runId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commitPayload),
      });
      if (!r.ok) {
        // 롤백 — 사용자가 수동으로 다시 누르거나 다음 confirm 턴에 재시도 가능.
        autoCommitTriedRef.current = false;
        const j = (await r.json().catch(() => null)) as
          | {
              error?: string;
              issues?: { path: (string | number)[]; message: string }[];
            }
          | null;
        if (j?.issues?.length) {
          setValidationIssues(
            j.issues.map((it) => `${it.path.join(".")}: ${it.message}`),
          );
        } else {
          setError(j?.error ?? `자동 커밋 실패 (${r.status})`);
        }
        return;
      }
      const j = (await r.json()) as {
        character: { id: string; slug: string; name: string };
      };
      setSavedId(j.character.id);
      setStatus("saved");
      // 포트레이트/애니메이션은 Find 페이지에서 SSE 로 이어 받는다.
      router.push(
        `/find?focus=${encodeURIComponent(j.character.slug)}&gen=1`,
      );
    } catch (e) {
      autoCommitTriedRef.current = false;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitBusy(false);
    }
  }, [commitPayload, missing.length, runId, router, status]);

  // confirm 패치 감지 → 자동 커밋.
  // draft?.confirm 이 true 가 되고 status 가 saved 가 아니며 필수 필드가 다 차
  // 있을 때만 발동. commit 실패 시 autoCommitTriedRef 가 롤백되므로 다음 patch
  // 이벤트 (예: 사용자가 추가 수정 후 모델이 다시 confirm 보냄) 에서 재시도 가능.
  useEffect(() => {
    if (!draft?.confirm) return;
    if (status === "saved") return;
    if (missing.length > 0) return;
    if (commitBusy) return;
    void autoCommit();
  }, [draft?.confirm, status, missing.length, commitBusy, autoCommit]);

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
    if (!confirm("이 초안을 삭제할까요?")) return;
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

  // 고정 인사말은 실제 유저 메시지가 오기 전까지 choices 를 포함해서 보여주고,
  // 이후에는 메시지로만 (choices 제거해서 중복 버튼을 피한다).
  const hasUserMessage = messages.some((m) => m.role === "user");

  // ---------- render ----------

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
      {/* === 1) 스크롤 대화 영역 === */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {/* 고정 인사말 */}
          <GreetingBlock
            text={GREETING_TEXT}
            choices={hasUserMessage ? [] : GREETING_CHOICES}
            disabled={streaming || status === "saved"}
            onChoose={sendChoice}
          />

          {/* 실제 메시지 */}
          {messages.map((m) => (
            <MessageBlock
              key={m.id}
              msg={m}
              onConfirmImage={confirmImage}
              onRejectImages={rejectImages}
              onChoose={sendChoice}
              disabled={streaming || status === "saved"}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* === 2) 드로어 + 입력 (하단 고정) === */}
      <div className="shrink-0 border-t border-outline/20 bg-surface-container-lowest">
        {/* 에러 배너 — 드로어 닫혀 있어도 항상 보임.
            업스트림 혼잡으로 실패했을 때는 마지막 입력을 보관해 뒀다가 "다시 보내기"
            버튼으로 같은 내용을 한 번의 클릭으로 재전송한다. */}
        {error ? (
          <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-800">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span className="flex-1 whitespace-pre-wrap">{error}</span>
            {lastDispatchRef.current && !streaming ? (
              <button
                type="button"
                onClick={() => {
                  const last = lastDispatchRef.current;
                  if (!last) return;
                  // retry=true: 유저 버블 재삽입 금지 + 서버 user_msg 중복 insert 방지.
                  void dispatch(last.text, {
                    imageRef: last.imageRef,
                    previewImage: last.previewImage,
                    retry: true,
                  });
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-300 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 hover:bg-white active:scale-95 transition-transform"
                aria-label="마지막 메시지 다시 보내기"
              >
                <RotateCw size={10} strokeWidth={2.5} />
                <span>다시 보내기</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 text-rose-700/70 hover:text-rose-900"
              aria-label="에러 닫기"
            >
              <X size={12} />
            </button>
          </div>
        ) : null}

        {/* 드로어 토글 바 */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex flex-1 items-center gap-2 rounded-md bg-surface-container px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-container-high"
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )}
            <span className="font-bold">
              여태 채워진 정보 {draft?.name ? `— ${draft.name}` : ""}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-container-lowest">
                <span
                  className="block h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="tabular-nums text-[11px] text-on-surface-variant">
                {pct}%
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={del}
            disabled={commitBusy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface-variant/60 hover:bg-surface-container hover:text-error active:brightness-90"
            aria-label="초안 삭제"
            title="초안 삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* 드로어 본문 */}
        {drawerOpen ? (
          <div className="max-h-[55vh] overflow-y-auto px-3 pb-3 pt-2">
            <div className="flex items-center justify-between pb-2">
              <h3 className="label-scholastic text-sm text-on-surface">
                Character Sheet
              </h3>
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
            </div>

            {savedLink ? (
              <a
                href={savedLink}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary"
              >
                <CheckCircle2 size={14} />
                저장됨 · 캐릭터 편집 열기
              </a>
            ) : null}

            {savedId && portraitStatus !== "idle" ? (
              <PortraitAgentBadge
                status={portraitStatus}
                message={portraitMessage}
                preview={portraitPreview}
                progress={portraitProgress}
                onRetry={() => void runPortraitAgent(savedId)}
              />
            ) : null}

            {animationStatus !== "idle" ? (
              <AnimationAgentBadge
                status={animationStatus}
                stage={animationStage}
                message={animationMessage}
                preview={animationPreview}
                onRetry={
                  animationAssetId
                    ? () =>
                        void runAnimationAgent(animationAssetId, {
                          force: true,
                        })
                    : undefined
                }
              />
            ) : null}

            {jsonMode ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                  rows={18}
                  className="min-h-[30vh] rounded-md bg-surface-container p-3 font-mono text-[11px] leading-relaxed text-on-surface"
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
              <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50/50 p-2 text-[11px] text-amber-900">
                커밋 전 필요: {missing.map((m) => m.label).join(", ")}
              </div>
            ) : null}

            {validationIssues.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-md border border-rose-200 bg-rose-50/70 p-2 text-[11px] text-rose-800">
                {validationIssues.map((v, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {error ? (
              <p className="mt-2 whitespace-pre-wrap text-xs text-error">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={commit}
              disabled={
                commitBusy ||
                status === "saved" ||
                !draft ||
                missing.length > 0
              }
              className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-bold text-on-primary disabled:opacity-50"
            >
              {status === "saved"
                ? "저장 완료"
                : commitBusy
                  ? "저장 중..."
                  : "커밋 (캐릭터 생성)"}
            </button>
          </div>
        ) : null}

        {/* === 3) 입력창 ===
           "내초안" 하단 스트립 제거. 사용자당 캐스터 세션은 1개만 존재하도록
           /admin/caster 진입점이 단일 active run 을 보장한다. */}
        <div className="flex gap-2 border-t border-outline/10 p-3">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void sendInput();
              }
            }}
            placeholder="메시지 (Cmd/Ctrl+Enter 로 전송)"
            disabled={streaming || status === "saved"}
            className="flex-1 resize-none rounded-md bg-surface-container px-3 py-2 text-sm text-on-surface outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={sendInput}
            disabled={streaming || !input.trim() || status === "saved"}
            className="flex w-10 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary disabled:opacity-50 active:brightness-90"
            aria-label="전송"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 서브 컴포넌트 ==========

function GreetingBlock({
  text,
  choices,
  disabled,
  onChoose,
}: {
  text: string;
  choices: string[];
  disabled: boolean;
  onChoose: (c: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface">
        {text}
      </div>
      {choices.length > 0 ? (
        <ChoiceButtons items={choices} disabled={disabled} onChoose={onChoose} />
      ) : null}
    </div>
  );
}

function MessageBlock({
  msg,
  onConfirmImage,
  onRejectImages,
  onChoose,
  disabled,
}: {
  msg: CasterMessage;
  onConfirmImage: (s: CasterSource) => void | Promise<void>;
  onRejectImages: () => void | Promise<void>;
  onChoose: (c: string) => void | Promise<void>;
  disabled: boolean;
}) {
  const isUser = msg.role === "user";
  const visibleText = isUser ? msg.content : stripMarkup(msg.content);
  const sourcesWithImages = msg.sources?.filter((s) => !!s.image) ?? [];
  const sourcesWithoutImages = msg.sources?.filter((s) => !s.image) ?? [];
  const choices = msg.choices ?? [];

  return (
    <div className={isUser ? "flex flex-col items-end gap-1.5" : "space-y-1.5"}>
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
            ? "bg-primary-container text-on-primary-container"
            : "mr-auto bg-surface-container text-on-surface",
        ].join(" ")}
      >
        {visibleText
          ? visibleText
          : !isUser
            ? (
                // 빈 model placeholder 는 타이핑 인디케이터로 대체.
                // 기존 "…" 문자열은 정적이라 "멈췄나?" 오해가 잦다.
                <TypingIndicator compact />
              )
            : ""}
      </div>

      {/* user bubble: 확정한 썸네일 인라인 프리뷰 */}
      {isUser && msg.previewImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={msg.previewImage}
          alt=""
          referrerPolicy="no-referrer"
          className="h-28 w-28 rounded-md object-cover ring-2 ring-primary/60"
        />
      ) : null}

      {/* assistant: 선택지 버튼 */}
      {!isUser && choices.length > 0 ? (
        <ChoiceButtons items={choices} disabled={disabled} onChoose={onChoose} />
      ) : null}

      {/* assistant: 이미지가 달린 썸네일 그리드 */}
      {!isUser && sourcesWithImages.length > 0 ? (
        <div className="space-y-1.5">
          <p className="pl-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            이 느낌이 맞아요?
          </p>
          <div className="grid max-w-[560px] grid-cols-3 gap-2 sm:grid-cols-4">
            {sourcesWithImages.map((s) => (
              <ThumbCard
                key={s.uri}
                source={s}
                disabled={disabled}
                onConfirm={() => onConfirmImage(s)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void onRejectImages()}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md border border-outline/30 px-2 py-1 text-[11px] text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            <X size={11} />이 중엔 없어 · 다른 느낌
          </button>
        </div>
      ) : null}

      {/* 이미지가 없는 나머지 링크 칩 */}
      {!isUser && sourcesWithoutImages.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap gap-1 pl-1">
          {sourcesWithoutImages.map((s, i) => (
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

function ChoiceButtons({
  items,
  disabled,
  onChoose,
}: {
  items: string[];
  disabled: boolean;
  onChoose: (c: string) => void | Promise<void>;
}) {
  return (
    <div className="flex max-w-[85%] flex-wrap gap-1.5">
      {items.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => void onChoose(c)}
          disabled={disabled}
          className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/**
 * 커밋 직후 비동기로 포트레이트를 그리는 Agent 상태 뱃지.
 * 드로어 상단에 렌더되어 "그리는 중 → 저장됨" 을 시각화한다.
 */
function PortraitAgentBadge({
  status,
  message,
  preview,
  progress,
  onRetry,
}: {
  status: "idle" | "running" | "saved" | "error";
  message: string | null;
  preview: string | null;
  progress: number;
  onRetry: () => void;
}) {
  if (status === "idle") return null;
  if (status === "running") {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-on-surface">
        <span
          aria-hidden
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
        />
        <span className="font-semibold">포트레이트 그리는 중</span>
        <span className="text-on-surface-variant">
          · 한국 웹툰 스타일{progress > 0 ? ` · chunk ${progress}` : ""}
        </span>
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-2.5 py-1.5 text-xs text-emerald-900">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-10 w-8 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <CheckCircle2 size={14} className="shrink-0" />
        )}
        <span className="font-semibold">포트레이트 저장됨</span>
      </div>
    );
  }
  // error
  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-rose-300/60 bg-rose-50/70 px-2.5 py-1.5 text-xs text-rose-900">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">포트레이트 생성 실패</p>
        {message ? (
          <p className="mt-0.5 text-[11px] opacity-80">{message}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 hover:bg-white active:scale-95 transition-transform"
      >
        <RotateCw size={10} strokeWidth={2.5} />
        재시도
      </button>
    </div>
  );
}

/**
 * 포트레이트 saved 직후 이어지는 Veo 3.1 Lite 애니메이션(animated webp) 생성 상태 뱃지.
 * - running: 현재 단계(stage) 문구를 노출 ("Veo 렌더 중 40s" 등).
 * - saved:   animationUrl 미리보기.
 * - error:   재시도 버튼 제공 (force=true 로 강제 재생성).
 */
function AnimationAgentBadge({
  status,
  stage,
  message,
  preview,
  onRetry,
}: {
  status: "idle" | "running" | "saved" | "error";
  stage: string | null;
  message: string | null;
  preview: string | null;
  onRetry?: () => void;
}) {
  if (status === "idle") return null;
  if (status === "running") {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-on-surface">
        <span
          aria-hidden
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
        />
        <span className="font-semibold">포트레이트 애니메이션 만드는 중</span>
        {stage ? (
          <span className="text-on-surface-variant">· {stage}</span>
        ) : null}
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-2.5 py-1.5 text-xs text-emerald-900">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-10 w-8 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <CheckCircle2 size={14} className="shrink-0" />
        )}
        <span className="font-semibold">애니메이션 저장됨</span>
      </div>
    );
  }
  // error
  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-rose-300/60 bg-rose-50/70 px-2.5 py-1.5 text-xs text-rose-900">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">애니메이션 생성 실패</p>
        {message ? (
          <p className="mt-0.5 text-[11px] opacity-80">{message}</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 hover:bg-white active:scale-95 transition-transform"
        >
          <RotateCw size={10} strokeWidth={2.5} />
          재시도
        </button>
      ) : null}
    </div>
  );
}

function ThumbCard({
  source,
  disabled,
  onConfirm,
}: {
  source: CasterSource;
  disabled: boolean;
  onConfirm: () => void;
}) {
  if (!source.image) return null;
  return (
    <div className="group relative overflow-hidden rounded-md border border-outline/30 bg-surface-container">
      <a
        href={source.uri}
        target="_blank"
        rel="noreferrer noopener"
        className="block"
        title={source.title ?? source.uri}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source.image}
          alt={source.title ?? ""}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-32 w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
        <div className="px-1.5 py-1 text-[10px] leading-tight">
          <p className="truncate font-semibold text-on-surface">
            {source.title ?? source.uri}
          </p>
          {source.domain ? (
            <p className="truncate text-on-surface-variant">{source.domain}</p>
          ) : null}
        </div>
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onConfirm();
        }}
        disabled={disabled}
        className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-primary/95 px-1.5 py-1 text-[10px] font-bold text-on-primary shadow-sm opacity-90 transition-opacity hover:opacity-100 disabled:opacity-40"
      >
        <Check size={11} />이 느낌
      </button>
    </div>
  );
}
