import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import { withGeminiFallback, MODELS } from "./client";
import type { MessageRole } from "@prisma/client";
import {
  buildLegacySystemInstruction,
  buildSystemInstruction,
  type ComposerContext,
  type LegacyPromptArgs,
} from "./prompt";

/**
 * 모델 이름 정규화 — **하위 버전 금지 + 가짜 ID 교정** 이 핵심.
 *
 * 정책 (docs/07-llm-config.md §0):
 *   - 채팅은 MODELS.chat (= gemini-3-flash-preview) 로 고정.
 *   - 이전에 "gemini-3.0-flash" 라는 **존재하지 않는 ID** 를 박아 둔 적이 있다.
 *     DB 에 남아 있는 그 문자열을 만나면 런타임에 MODELS.chat 으로 치환.
 *   - 2.x / 1.x 같은 하위 버전 문자열도 마찬가지로 강제 상향.
 *   - 상향(= 3-flash GA / 3.5 / 4.x 계열 혹은 그 외 3.x 프리뷰) 은 그대로 통과.
 *   - 비어 있거나 해석 불가면 MODELS.chat 으로 fallback.
 *
 * 이 가드가 있는 이유: 모델 ID 오기입이 DB 에 남으면 특정 캐릭터만 빈 응답을
 * 뱉는 사고가 반복되기 때문. 런타임 한 곳에서 교정해 장애를 차단한다.
 */
function normalizeModel(name: string | null | undefined): string {
  if (!name) return MODELS.chat;
  const trimmed = name.trim();

  // 과거 오기입: "gemini-3.0-flash" 는 Google 측에 실제로는 없는 ID 였다.
  if (/^gemini-3\.0-flash$/i.test(trimmed)) {
    console.warn(
      `[chat] legacy alias "${trimmed}" — that ID does not exist on Gemini. Upgrading to ${MODELS.chat}.`,
    );
    return MODELS.chat;
  }

  // 하위 버전 (1.x / 2.x) 은 무조건 업그레이드.
  if (/^gemini-[12]\./i.test(trimmed)) {
    console.warn(
      `[chat] legacy model "${trimmed}" detected — upgrading to ${MODELS.chat} (lower versions are forbidden)`,
    );
    return MODELS.chat;
  }

  // gemini-3-* (버전 구분자 없는 프리뷰 형식, 예: gemini-3-flash-preview) 통과.
  if (/^gemini-3-/i.test(trimmed)) return trimmed;

  // gemini-3.x 이상 (향후 GA / 3.5 / 3.9 등) 통과.
  if (/^gemini-([3-9]|[1-9]\d+)\./i.test(trimmed)) return trimmed;

  // 알 수 없는 포맷은 안전하게 fallback.
  console.warn(
    `[chat] unknown model "${trimmed}" — falling back to ${MODELS.chat}`,
  );
  return MODELS.chat;
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

  const modelName = normalizeModel(args.model);

  const resp = await withGeminiFallback((ai) =>
    ai.models.generateContentStream({
      model: modelName,
      contents,
      config: {
        systemInstruction: args.systemInstruction,
        temperature: args.temperature ?? 0.8,
        topP: args.topP ?? undefined,
        topK: args.topK ?? undefined,
        maxOutputTokens: args.maxOutputTokens ?? 1024,
        safetySettings: PERMISSIVE_SAFETY,
      },
    }),
  );

  for await (const chunk of resp) {
    const text = chunk.text;
    if (text) yield text;
  }
}
