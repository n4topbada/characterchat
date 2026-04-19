export function TypingIndicator({
  senderLabel,
}: {
  senderLabel?: string;
}) {
  return (
    <div className="flex flex-col items-start max-w-[85%] animate-fade-in">
      <div className="flex items-center gap-3 mb-2 px-2">
        <span
          className="label-scholastic-xs text-on-surface-variant bg-surface-container px-2 py-0.5"
          style={{ transform: "skewX(-15deg)" }}
        >
          <span style={{ transform: "skewX(15deg)", display: "inline-block" }}>
            {senderLabel ?? ""}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-5 py-3 bubble-receive bg-surface-container-high border-l-2 border-primary shadow-tinted-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.2s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.1s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" />
      </div>
    </div>
  );
}
