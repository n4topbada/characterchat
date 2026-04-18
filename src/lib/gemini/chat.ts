import { withGeminiFallback } from "./client";
import type { MessageRole } from "@prisma/client";
import {
  buildLegacySystemInstruction,
  buildSystemInstruction,
  type ComposerContext,
  type LegacyPromptArgs,
} from "./prompt";

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

export async function* streamChat(args: StreamArgs) {
  const contents = args.history.map((turn) => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const resp = await withGeminiFallback((ai) =>
    ai.models.generateContentStream({
      model: args.model,
      contents,
      config: {
        systemInstruction: args.systemInstruction,
        temperature: args.temperature ?? 0.8,
        topP: args.topP ?? undefined,
        topK: args.topK ?? undefined,
        maxOutputTokens: args.maxOutputTokens ?? 1024,
      },
    }),
  );

  for await (const chunk of resp) {
    const text = chunk.text;
    if (text) yield text;
  }
}
