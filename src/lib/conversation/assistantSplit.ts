import { extractStatus, splitDialogueBlocks } from "@/lib/narration";

export type AssistantMessagePart = {
  content: string;
  kind: "dialogue" | "narration";
};

const MAX_PARTS = 5;

function appendStatus(content: string, raw: string): string {
  const status = raw.match(/<status>[\s\S]*?<\/status>/);
  return status ? `${content.trim()}\n\n${status[0]}`.trim() : content.trim();
}

export function splitAssistantMessage(raw: string): AssistantMessagePart[] {
  const { body } = extractStatus(raw);
  const blocks = splitDialogueBlocks(body);
  if (blocks.length <= 1) {
    const content = appendStatus(body || raw, raw);
    return content ? [{ content, kind: "dialogue" }] : [];
  }

  const parts: AssistantMessagePart[] = [];
  for (const block of blocks) {
    const value =
      block.kind === "narration" ? `*${block.value.trim()}*` : block.value.trim();
    if (!value) continue;

    const last = parts[parts.length - 1];
    const shortDialogue =
      block.kind === "dialogue" && value.length <= 28 && !/[.!?。！？…]$/.test(value);
    if (
      last &&
      (parts.length >= MAX_PARTS || shortDialogue || (last.kind === block.kind && value.length < 80))
    ) {
      last.content = `${last.content}\n\n${value}`.trim();
    } else {
      parts.push({ content: value, kind: block.kind });
    }
  }

  if (!parts.length) return [];
  parts[parts.length - 1] = {
    ...parts[parts.length - 1],
    content: appendStatus(parts[parts.length - 1].content, raw),
  };
  return parts;
}
