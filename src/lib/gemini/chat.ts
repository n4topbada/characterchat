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
 * DB 에 저장된 model 문자열이 실존하지 않는 경우(예: 이전 시드의
 * "gemini-3.0-flash") 업스트림이 NOT_FOUND 로 응답 에러를 내 채팅이 전혀 안
 * 된다. 문제를 자동 복구하기 위해 알려진 안전 prefix 에 속하지 않으면
 * MODELS.chat 으로 치환한다.
 *
 * - 허용 prefix: "gemini-2.5-", "gemini-2.0-", "gemini-1.5-",
 *   "gemini-3.1-flash-lite", "gemini-3.1-flash"
 *   (실험/프리뷰 preview 모델 포함)
 */
function normalizeModel(name: string | null | undefined): string {
  if (!name) return MODELS.chat;
  const trimmed = name.trim();
  const ok =
    /^gemini-2\.5-/.test(trimmed) ||
    /^gemini-2\.0-/.test(trimmed) ||
    /^gemini-1\.5-/.test(trimmed) ||
    /^gemini-3\.1-flash(-lite)?/.test(trimmed);
  if (ok) return trimmed;
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
