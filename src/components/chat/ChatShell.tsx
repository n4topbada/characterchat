"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search, SlidersHorizontal } from "lucide-react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Composer } from "./Composer";
import { StatusPanel } from "./StatusPanel";
import { extractStatus } from "@/lib/narration";

type Props = {
  sessionId: string;
  character: {
    name: string;
    portraitUrl: string | null;
    tagline: string;
  };
  initialMessages: ChatMessage[];
};

export function ChatShell({ sessionId, character, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: "tmp-u-" + Date.now(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const modelId = "tmp-m-" + Date.now();
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: modelId,
          role: "model",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreaming(true);

      try {
        const r = await fetch(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!r.ok || !r.body) {
          setStreaming(false);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = dataLine.slice(5).trim();
            if (event === "delta") {
              try {
                const { text: t } = JSON.parse(data) as { text: string };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === modelId ? { ...m, content: m.content + t } : m
                  )
                );
              } catch {
                // ignore
              }
            } else if (event === "done") {
              // stream complete
            } else if (event === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === modelId
                    ? { ...m, content: "(RESPONSE_ERROR)" }
                    : m
                )
              );
            }
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [sessionId]
  );

  const senderCode = character.name
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase() || "SCHOLAR";

  const latestStatus = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "model") continue;
      const { status } = extractStatus(m.content);
      if (status) return status;
    }
    return null;
  }, [messages]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col relative">
      {/* Background patterns */}
      <div className="fixed inset-0 pointer-events-none diagonal-bg opacity-60 z-0" />
      <div className="fixed inset-0 pointer-events-none dot-pattern opacity-30 z-0" />

      {/* Top nav — glass */}
      <header className="fixed top-0 inset-x-0 z-30 glass">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={"/history" as "/history"}
              aria-label="Back"
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors active:scale-95 rounded-md"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </Link>
            <div
              className="relative w-10 h-10 overflow-hidden bg-primary-container rounded-md border-2 border-primary-container shrink-0"
            >
              {character.portraitUrl ? (
                <Image
                  src={character.portraitUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  aria-hidden
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, #3a5f94, #cee9d9)",
                  }}
                />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-headline font-black tracking-[0.2em] text-on-surface uppercase text-xs truncate">
                {character.name}
              </h1>
              <p className="label-mono text-primary flex items-center gap-1 text-[9px]">
                <span className="w-1.5 h-1.5 bg-secondary-fixed rounded-full inline-block animate-pulse-dot" />
                DIALOGUE_ACTIVE
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Search"
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant/60 hover:bg-surface-container-low transition-colors rounded-md"
            >
              <Search size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Settings"
              className="w-10 h-10 flex items-center justify-center text-primary hover:bg-surface-container-low transition-colors rounded-md"
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* Chat log */}
      <main className="flex-1 pt-24 pb-40 px-4 max-w-2xl mx-auto w-full flex flex-col gap-10 relative z-10">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} senderLabel={senderCode} />
        ))}

        {streaming &&
          messages[messages.length - 1]?.role === "model" &&
          !messages[messages.length - 1]?.content && <TypingIndicator />}

        <div ref={bottomRef} />
      </main>

      {latestStatus ? <StatusPanel status={latestStatus} /> : null}

      <Composer
        onSend={send}
        disabled={streaming}
        placeholder={`COMMAND_${senderCode}`}
      />
    </div>
  );
}
