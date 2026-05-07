// Caster 전용 스트림 래퍼.
// 일반 채팅(streamChat)과 달리 Caster 는
//   1) Google 검색 그라운딩을 켜서 실존 인물/작품을 사실 기반으로 참조하고
//   2) 텍스트 델타와 그라운딩 메타데이터(검색 쿼리, 소스 링크)를 각각 이벤트로 흘려준다.
//
// 안전 설정은 일반 채팅(streamChat)과 동일하게 4개 카테고리 모두 BLOCK_NONE.
// Gemini 기본값(BLOCK_MEDIUM_AND_ABOVE)은 "외형/복장/분위기" 같은 크리에이티브
// 턴에서 빈 응답을 유발한다. Caster 는 관리자 전용 설계 도구이므로 차단은
// persona redLines + [금지] 블록에서 한다.

import { withGeminiFallback } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";

/**
 * 채팅 모델이 503 / Overloaded / 5xx 로 재시도 소진 시 한 번만 fallback 모델로 강등.
 * streamChat 의 isOverloadedError 와 동일 규칙 — Caster 도 같은 정책을 쓴다.
 *
 * Caster 가 쓰는 기본 모델(gemini-3-flash-preview)은 프리뷰라 자주 503 를 뱉는다.
 * withGeminiFallback 의 키당 3회 × 키 N개 재시도를 전부 소진한 뒤에만 여기로
 * 들어오므로, "진짜 복구 안 되는 과부하" 상황에서만 강등된다.
 */
function isOverloadedError(e: unknown): boolean {
  const anyE = e as { status?: number; code?: number; message?: string };
  const status = anyE?.status ?? anyE?.code;
  if (status === 503 || status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  const msg = String(anyE?.message ?? e);
  return /503|overload|unavailable|exhausted|quota/i.test(msg);
}

// 멀티모달 대응 — 턴은 parts 배열로 구성된다 (텍스트 + 인라인 이미지).
export type CasterContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type CasterHistoryTurn = {
  role: "user" | "model";
  parts: CasterContentPart[];
};

export type CasterSource = {
  uri: string;
  title?: string;
  domain?: string;
};

export type CasterStreamEvent =
  | { type: "text"; text: string }
  | { type: "search_queries"; queries: string[] }
  | { type: "sources"; sources: CasterSource[] }
  | {
      type: "finish";
      reason?: string;
      blocked?: boolean;
      safetyCategories?: string[];
    };

type Args = {
  model: string;
  /**
   * primary 가 503/과부하로 재시도 소진 시 한 번만 강등할 fallback 모델.
   * 생략 시 강등 없이 primary 의 에러를 그대로 throw — 기존 동작과 동일.
   * 프리뷰 모델(gemini-3-flash-preview)의 잦은 503 을 위해 보통
   * `GEMINI_MODELS.chatFallback` (gemini-3.1-flash-lite-preview) 을 넘긴다.
   */
  modelFallback?: string;
  systemInstruction: string;
  history: CasterHistoryTurn[];
  /** 기본 true. 실존 참조가 필요 없으면 false 로 꺼서 일반 대화로. */
  enableSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
};

type GroundingChunkLike = {
  web?: { uri?: string; title?: string; domain?: string };
};

type GroundingMetaLike = {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunkLike[];
};

type SafetyRatingLike = {
  category?: string;
  probability?: string;
  blocked?: boolean;
};

type CandidateLike = {
  groundingMetadata?: GroundingMetaLike;
  finishReason?: string;
  safetyRatings?: SafetyRatingLike[];
};

type PromptFeedbackLike = {
  blockReason?: string;
  safetyRatings?: SafetyRatingLike[];
};

type StreamChunkLike = {
  text?: string;
  candidates?: CandidateLike[];
  promptFeedback?: PromptFeedbackLike;
};

export async function* streamCaster(
  args: Args,
): AsyncGenerator<CasterStreamEvent> {
  console.log(
    `[caster] streamCaster start: primary=${args.model} fallback=${args.modelFallback ?? "(none)"}`,
  );
  const contents = args.history.map((turn) => ({
    role: turn.role === "model" ? "model" : "user",
    parts: turn.parts,
  }));

  const tools =
    args.enableSearch === false ? undefined : [{ googleSearch: {} }];

  const buildConfig = () => ({
    systemInstruction: args.systemInstruction,
    temperature: args.temperature ?? 1.5,
    maxOutputTokens: args.maxOutputTokens ?? 2048,
    safetySettings: PERMISSIVE_SAFETY,
    ...(tools ? { tools } : {}),
  });

  // 1) primary 로 시도 — withGeminiFallback 이 키당 N회 × 키 M개 재시도.
  //    Caster 는 preview 모델(3-flash-preview)이 자주 503 이고 즉시 fallback 모델로
  //    강등하는 게 합리적이므로 perKeyRetries=1 로 축소 (키당 2회). 그래야 양쪽
  //    모델 모두 503 인 브로드 장애 때도 ~20~30초 안에 에러 배너가 뜬다.
  //    (기본값 2 를 쓰면 키당 3회 × 2키 × 2모델 = 최대 12회 + backoff 로 3분 가까이 걸림)
  const FAST_FAIL = { perKeyRetries: 1 };
  let resp;
  try {
    resp = await withGeminiFallback(
      (ai) =>
        ai.models.generateContentStream({
          model: args.model,
          contents,
          config: buildConfig(),
        }),
      FAST_FAIL,
    );
  } catch (e) {
    // 2) 과부하(503/429/5xx) 로 재시도 소진 시 한 번만 modelFallback 으로 강등.
    //    streamChat 과 동일 패턴. fallback 없으면 그냥 throw (기존 동작).
    if (
      !args.modelFallback ||
      args.modelFallback === args.model ||
      !isOverloadedError(e)
    ) {
      throw e;
    }
    console.warn(
      `[caster] primary model ${args.model} exhausted (overloaded) — falling back to ${args.modelFallback}`,
    );
    resp = await withGeminiFallback(
      (ai) =>
        ai.models.generateContentStream({
          model: args.modelFallback!,
          contents,
          config: buildConfig(),
        }),
      FAST_FAIL,
    );
  }

  // 같은 쿼리/URL 을 중복 emit 하지 않도록 누적
  const seenQueries = new Set<string>();
  const seenUris = new Set<string>();

  let lastFinishReason: string | undefined;
  let lastSafety: SafetyRatingLike[] | undefined;
  let promptBlockReason: string | undefined;

  for await (const raw of resp) {
    const chunk = raw as unknown as StreamChunkLike;

    const text = chunk.text;
    if (text) yield { type: "text", text };

    const cand = chunk.candidates?.[0];
    if (cand?.finishReason) lastFinishReason = cand.finishReason;
    if (cand?.safetyRatings?.length) lastSafety = cand.safetyRatings;
    if (chunk.promptFeedback?.blockReason)
      promptBlockReason = chunk.promptFeedback.blockReason;

    const meta = cand?.groundingMetadata;
    if (!meta) continue;

    if (meta.webSearchQueries?.length) {
      const fresh = meta.webSearchQueries.filter((q) => {
        if (!q || seenQueries.has(q)) return false;
        seenQueries.add(q);
        return true;
      });
      if (fresh.length) yield { type: "search_queries", queries: fresh };
    }

    if (meta.groundingChunks?.length) {
      const sources: CasterSource[] = [];
      for (const c of meta.groundingChunks) {
        const uri = c.web?.uri;
        if (!uri || seenUris.has(uri)) continue;
        seenUris.add(uri);
        sources.push({
          uri,
          title: c.web?.title,
          domain: c.web?.domain,
        });
      }
      if (sources.length) yield { type: "sources", sources };
    }
  }

  // 종료 시 finishReason / 프롬프트 차단 / 안전 등급을 모아 한 번 emit.
  // SAFETY, BLOCKLIST, RECITATION 같은 이유로 텍스트가 0 바이트로 끝날 수 있다.
  const blocked =
    promptBlockReason !== undefined ||
    (lastFinishReason !== undefined &&
      !["STOP", "MAX_TOKENS", "FINISH_REASON_UNSPECIFIED"].includes(
        lastFinishReason,
      ));
  const safetyCategories = (lastSafety ?? [])
    .filter((r) => r.blocked || r.probability === "HIGH")
    .map((r) => r.category ?? "?");

  yield {
    type: "finish",
    reason: promptBlockReason ?? lastFinishReason,
    blocked,
    safetyCategories: safetyCategories.length ? safetyCategories : undefined,
  };
}
