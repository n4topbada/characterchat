import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import { withGeminiFallback, GEMINI_MODELS, MODELS, isKnownModel } from "./client";
import type { MessageRole } from "@prisma/client";
import {
  buildLegacySystemInstruction,
  buildSystemInstruction,
  type ComposerContext,
  type LegacyPromptArgs,
} from "./prompt";

/**
 * 모델 이름 정규화 — 카탈로그 기반.
 *
 * 규칙 (docs/07-llm-config.md §0):
 *   - GEMINI_MODELS 카탈로그에 등록된 ID 는 그대로 통과
 *   - gemini-3-* / gemini-3.x-* 패턴은 통과 (미래 GA/프리뷰 수용)
 *   - 그 외 (1.x/2.x/해독 불가) 는 MODELS.chat 으로 교정
 *   - null/빈 문자열은 MODELS.chat
 *
 * DB 에 잘못된 모델 문자열이 남아 있더라도 이 한 곳에서 교정해 빈 응답 같은
 * 사고로 이어지지 않게 하는 단일 가드.
 */
function normalizeModel(name: string | null | undefined): string {
  if (!name) return MODELS.chat;
  const trimmed = name.trim();

  // 카탈로그 hit → 통과
  if (isKnownModel(trimmed)) return trimmed;

  // gemini-3 계열 패턴 (미래 GA/프리뷰 대비) → 통과
  if (/^gemini-3(-|\.)/i.test(trimmed)) return trimmed;

  // 그 외 (1.x/2.x/해독 불가) → 기본 채팅 모델로 교정
  console.warn(
    `[chat] unknown/legacy model "${trimmed}" — using ${MODELS.chat} instead`,
  );
  return MODELS.chat;
}

/**
 * 채팅 모델이 503 / Overloaded / Service Unavailable 계열로 재시도 소진 시
 * 한 번만 `chatFallback` 모델로 재호출. 사용자 요구:
 *   "3.0 flash 가 503 2회 fallback 되면 3.1 flash-lite 로 돌릴 것"
 *
 * withGeminiFallback 이 이미 키당 3회 × 키 N개 재시도를 끝내고 throw 한 뒤에만
 * 여기로 진입한다. 즉 **재시도로도 복구 안 되는** 과부하일 때만 강등.
 */
function isOverloadedError(e: unknown): boolean {
  const anyE = e as { status?: number; code?: number; message?: string };
  const status = anyE?.status ?? anyE?.code;
  if (status === 503 || status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  const msg = String(anyE?.message ?? e);
  return /503|overload|unavailable|exhausted|quota/i.test(msg);
}

export type ChatTurn = {
  role: Exclude<MessageRole, "system" | "tool">;
  content: string;
};

// 새 코드는 이 두 이름만 import 하면 된다.
export { buildSystemInstruction };
export type { ComposerContext };

/**
 * @deprecated PersonaCore 로 완전 이행되면 제거. 현재는 seed/샘플 캐릭터 렌더링 호환용.
 *   새 채팅 엔드포인트는 buildSystemInstruction(ctx: ComposerContext) 를 사용해야 한다.
 */
export function buildSystemInstructionLegacy(args: LegacyPromptArgs): string {
  return buildLegacySystemInstruction(args);
}

type StreamArgs = {
  model: string;
  systemInstruction: string;
  history: ChatTurn[];
  temperature?: number;
  topP?: number | null;
  topK?: number | null;
  maxOutputTokens?: number;
};

// 성인 롤플레이 플랫폼 — 4개 카테고리 모두 BLOCK_NONE. 그렇지 않으면 기본값
// BLOCK_MEDIUM_AND_ABOVE 가 성적·폭력적 연출에서 응답을 잘라 빈 스트림을 반환한다.
// 현실 인물 공격, 아동 등 '한계' 관련 내용은 persona redLines + [금지] 블록에서 차단한다.
const PERMISSIVE_SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export async function* streamChat(args: StreamArgs) {
  const contents = args.history.map((turn) => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const primary = normalizeModel(args.model);
  const fallback = GEMINI_MODELS.chatFallback;

  const buildConfig = () => ({
    systemInstruction: args.systemInstruction,
    temperature: args.temperature ?? 0.8,
    topP: args.topP ?? undefined,
    topK: args.topK ?? undefined,
    maxOutputTokens: args.maxOutputTokens ?? 1024,
    safetySettings: PERMISSIVE_SAFETY,
  });

  // 1) primary 로 시도 — withGeminiFallback 이 키당 3회 × 키 N개 재시도를 돌림.
  let resp;
  try {
    resp = await withGeminiFallback((ai) =>
      ai.models.generateContentStream({
        model: primary,
        contents,
        config: buildConfig(),
      }),
    );
  } catch (e) {
    // 2) 과부하(503/429/5xx) 로 재시도 소진 시 한 번만 chatFallback 으로 강등.
    if (!isOverloadedError(e) || primary === fallback) throw e;
    console.warn(
      `[chat] primary model ${primary} exhausted (overloaded) — falling back to ${fallback}`,
    );
    resp = await withGeminiFallback((ai) =>
      ai.models.generateContentStream({
        model: fallback,
        contents,
        config: buildConfig(),
      }),
    );
  }

  for await (const chunk of resp) {
    const text = chunk.text;
    if (text) yield text;
  }
}
