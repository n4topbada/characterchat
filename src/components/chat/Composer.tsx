"use client";
import { Plus, Terminal } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

export function Composer({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    await onSend(text);
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 px-4 pb-6 pt-2"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="glass-strong ghost-border rounded-xl shadow-tinted p-2">
          <div className="flex items-end gap-2">
            {/* Attach */}
            <button
              type="button"
              className="h-12 w-12 shrink-0 bg-surface-container-high hover:bg-secondary-container text-secondary transition-colors active:scale-95 rounded-md flex items-center justify-center group"
              aria-label="Attach"
            >
              <Plus
                size={20}
                strokeWidth={2}
                className="group-hover:rotate-12 transition-transform"
              />
            </button>

            {/* Input with accent bar */}
            <div className="flex-1 relative">
              <div
                className={[
                  "absolute left-0 top-0 bottom-0 w-[2px] transition-colors",
                  focused ? "bg-primary" : "bg-primary/30",
                ].join(" ")}
              />
              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                placeholder={placeholder ?? "COMMAND_INPUT_PROMPT"}
                className="w-full resize-none bg-surface-container-low border-none focus:ring-0 focus:outline-none text-sm py-3 pl-4 pr-3 placeholder:text-outline/60 placeholder:label-mono placeholder:text-[11px] max-h-40 text-on-surface leading-relaxed"
                disabled={disabled}
              />
            </div>

            {/* Parallelogram send button */}
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !value.trim()}
              aria-label="Send"
              className="relative group h-12 px-6 flex items-center justify-center overflow-hidden shrink-0 disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              <div
                className="absolute inset-0 btn-cta-gradient group-hover:brightness-110 transition-all"
                style={{ transform: "skewX(-12deg)" }}
              />
              <div className="relative flex items-center gap-2 text-on-primary font-headline font-bold uppercase tracking-[0.2em] text-xs">
                <span>SEND</span>
                <Terminal size={14} strokeWidth={2.5} />
              </div>
            </button>
          </div>

          {/* Tactical metadata row */}
          <div className="flex justify-between items-center mt-2 px-2">
            <div className="flex gap-4">
              <span className="label-mono text-outline text-[9px]">
                SECURE_CHANNEL:TLS_1.3
              </span>
              <span className="label-mono text-outline text-[9px] hidden sm:inline">
                MODEL:GEMINI_3.0
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-secondary-fixed rounded-full animate-pulse-dot" />
              <span className="label-mono text-secondary text-[9px] font-bold">
                SCHOLAR_ONLINE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
