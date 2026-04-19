import Image from "next/image";
import { NarrationText } from "./NarrationSpan";
import { extractStatus, splitDialogueBlocks } from "@/lib/narration";

export type ChatMessage = {
  id: string;
  role: "user" | "model" | "system" | "tool";
  content: string;
  createdAt?: string | Date;
  image?: { url: string; width: number; height: number } | null;
};

function formatTimestamp(v?: string | Date): string {
  if (!v) return "";
  const d = new Date(v);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function MessageBubble({
  msg,
  senderLabel,
}: {
  msg: ChatMessage;
  senderLabel?: string;
}) {
  const isUser = msg.role === "user";
  const tagText = isUser ? "나" : (senderLabel ?? "");

  if (isUser) {
    return (
      <div className="flex flex-col items-end ml-auto max-w-[85%] animate-fade-in">
        <div className="flex items-center gap-3 mb-2 px-2">
          <span className="label-mono text-outline">
            {formatTimestamp(msg.createdAt)}
          </span>
          <span
            className="label-scholastic-xs text-on-primary bg-primary px-2 py-0.5"
            style={{ transform: "skewX(12deg)" }}
          >
            <span style={{ transform: "skewX(-12deg)", display: "inline-block" }}>
              {tagText}
            </span>
          </span>
        </div>
        <div className="relative bubble-send bg-primary text-on-primary px-5 py-3 shadow-tinted-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </p>
        </div>
      </div>
    );
  }

  const { body } = extractStatus(msg.content);

  return (
    <div className="flex flex-col items-start max-w-[85%] animate-fade-in">
      <div className="flex items-center gap-3 mb-2 px-2">
        <span
          className="label-scholastic-xs text-on-surface-variant bg-surface-container px-2 py-0.5"
          style={{ transform: "skewX(-15deg)" }}
        >
          <span style={{ transform: "skewX(15deg)", display: "inline-block" }}>
            {tagText}
          </span>
        </span>
        <span className="label-mono text-outline">
          {formatTimestamp(msg.createdAt)}
        </span>
      </div>
      {msg.image ? (
        <div
          className="relative mb-2 overflow-hidden rounded-md border border-outline-variant bg-surface-container-low"
          style={{ width: "min(320px, 75vw)" }}
        >
          <Image
            src={msg.image.url}
            alt=""
            width={msg.image.width}
            height={msg.image.height}
            sizes="(max-width: 430px) 75vw, 320px"
            className="w-full h-auto block"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 w-full">
        {splitDialogueBlocks(body).map((block, i) => {
          if (block.kind === "narration") {
            // *행동* — 이탤릭 회색, 버블 없음
            return (
              <p
                key={i}
                className="narration text-sm leading-relaxed whitespace-pre-wrap break-words px-2"
              >
                {block.value}
              </p>
            );
          }
          if (block.kind === "omniscient") {
            // 전지적 작가 시점 — 버블 없이 평문, 본문 색상은 유지하되 약간 톤다운.
            return (
              <p
                key={i}
                className="text-sm leading-relaxed whitespace-pre-wrap break-words px-2 text-on-surface-variant"
              >
                {block.value}
              </p>
            );
          }
          // dialogue — 말풍선
          return (
            <div
              key={i}
              className="relative bubble-receive bg-surface-container-high px-5 py-3 shadow-tinted-sm border-l-2 border-primary"
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-on-surface">
                <NarrationText value={block.value} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
