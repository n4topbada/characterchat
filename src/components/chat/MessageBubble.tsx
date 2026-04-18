import { NarrationText } from "./NarrationSpan";
import { extractStatus } from "@/lib/narration";

export type ChatMessage = {
  id: string;
  role: "user" | "model" | "system" | "tool";
  content: string;
  createdAt?: string | Date;
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
  const tagText = isUser ? "OPERATOR" : (senderLabel ?? "SCHOLAR");

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
      <div className="relative bubble-receive bg-surface-container-high px-5 py-3 shadow-tinted-sm border-l-2 border-primary">
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-on-surface">
          <NarrationText value={body} />
        </p>
      </div>
    </div>
  );
}
