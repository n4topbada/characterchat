"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Composer } from "./Composer";
import { StatusPanel } from "./StatusPanel";
import { RoomBackdrop } from "./RoomBackdrop";
import { SettingsMenuButton } from "./SettingsMenuButton";
import { extractStatus } from "@/lib/narration";

const IMG_TAG_RE_CLIENT = /<img\s+[^>]*tags\s*=\s*"[^"]+"[^>]*\/?>/gi;
function stripImageTagsClient(s: string): string {
  return s.replace(IMG_TAG_RE_CLIENT, "").replace(/[ \t]{2,}/g, " ").trim();
}

type Props = {
  sessionId: string;
  character: {
    name: string;
    portraitUrl: string | null;
    tagline: string;
  };
  initialMessages: ChatMessage[];
  initialBackgroundUrl?: string | null;
};

export function ChatShell({
  sessionId,
  character,
  initialMessages,
  initialBackgroundUrl = null,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    initialBackgroundUrl,
  );
  // 실패한 모델 메시지가 재전송을 요구할 때 참조하기 위한 "마지막으로 사용자가 보낸
  // 원본 텍스트". 모델 응답 에러 후 사용자가 retry 버튼을 누르면 이 값을 그대로
  // send() 에 다시 넣는다. ref 라 setState 리렌더 없이 쓴다.
  const lastUserTextRef = useRef<string>("");
  // send() 는 useCallback([sessionId]) 로 메모이즈되어 있어 messages 를 직접 참조하면
  // stale closure. retry 모드에서 "마지막 model 메시지 ID" 를 찾아야 하므로, messages
  // 최신 스냅샷을 ref 로 유지해 send() 안에서 꺼낸다.
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const burstRef = useRef<{
    texts: string[];
    timer: ReturnType<typeof setTimeout> | null;
  }>({ texts: [], timer: null });

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;

    const applyEvent = (event: string, data: string) => {
      if (event === "message_start") {
        try {
          const msg = JSON.parse(data) as {
            id: string;
            role: "model";
            createdAt?: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                role: "model",
                content: "",
                createdAt: msg.createdAt ?? new Date().toISOString(),
              },
            ];
          });
        } catch {
          // ignore
        }
      } else if (event === "message_delta") {
        try {
          const { id: msgId, text } = JSON.parse(data) as {
            id: string;
            text: string;
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, content: m.content + text } : m,
            ),
          );
        } catch {
          // ignore
        }
      } else if (event === "message_done") {
        try {
          const { id: msgId } = JSON.parse(data) as { id: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: stripImageTagsClient(m.content) }
                : m,
            ),
          );
        } catch {
          // ignore
        }
      }
    };

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const r = await fetch(`/api/sessions/${sessionId}/events`, {
            method: "GET",
            signal: controller.signal,
          });
          if (!r.ok || !r.body) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
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
              applyEvent(evLine.slice(6).trim(), dataLine.slice(5).trim());
            }
          }
        } catch {
          if (stopped) break;
        }
        if (!stopped) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, [sessionId]);

  const send = useCallback(
    async (text: string, opts?: { retry?: boolean }) => {
      lastUserTextRef.current = text;
      const now = Date.now();

      const flushBurst = async (texts: string[]) => {
        const combinedText = texts.join("\n");
        lastUserTextRef.current = combinedText;
        setStreaming(true);
        let currentModelId: string | null = null;

        const ensureFailedMessage = (errorText?: string) => {
          const failedId = currentModelId ?? "tmp-m-failed-" + Date.now();
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === failedId);
            if (exists) {
              return prev.map((m) =>
                m.id === failedId
                  ? { ...m, content: "(RESPONSE_ERROR)", failed: true, errorText }
                  : m,
              );
            }
            return [
              ...prev,
              {
                id: failedId,
                role: "model",
                content: "(RESPONSE_ERROR)",
                createdAt: new Date().toISOString(),
                failed: true,
                errorText,
              },
            ];
          });
        };

        try {
          const r = await fetch(`/api/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: combinedText }),
          });
          if (!r.ok || !r.body) {
            ensureFailedMessage(`요청이 실패했어요 (HTTP ${r.status}).`);
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

              if (event === "message_start") {
                try {
                  const msg = JSON.parse(data) as {
                    id: string;
                    role: "model";
                    createdAt?: string;
                  };
                  currentModelId = msg.id;
                  setMessages((prev) => {
                    if (prev.some((m) => m.id === msg.id)) return prev;
                    return [
                      ...prev,
                      {
                        id: msg.id,
                        role: "model",
                        content: "",
                        createdAt: msg.createdAt ?? new Date().toISOString(),
                      },
                    ];
                  });
                } catch {
                  // ignore
                }
              } else if (event === "message_delta") {
                try {
                  const { id: msgId, text: t } = JSON.parse(data) as {
                    id: string;
                    text: string;
                  };
                  currentModelId = msgId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId ? { ...m, content: m.content + t } : m,
                    ),
                  );
                } catch {
                  // ignore
                }
              } else if (event === "delta") {
                // Back-compat for older route streams.
                try {
                  const { text: t } = JSON.parse(data) as { text: string };
                  const fallbackModelId: string = currentModelId ?? "tmp-m-" + now;
                  currentModelId = fallbackModelId;
                  setMessages((prev) => {
                    const exists = prev.some((m) => m.id === fallbackModelId);
                    const next = exists
                      ? prev
                      : [
                          ...prev,
                          {
                            id: fallbackModelId,
                            role: "model" as const,
                            content: "",
                            createdAt: new Date().toISOString(),
                          },
                        ];
                    return next.map((m) =>
                      m.id === fallbackModelId ? { ...m, content: m.content + t } : m,
                    );
                  });
                } catch {
                  // ignore
                }
              } else if (event === "image") {
                try {
                  const {
                    id: imageMessageId,
                    url,
                    width,
                    height,
                  } = JSON.parse(data) as {
                    id?: string;
                    url: string;
                    width: number;
                    height: number;
                  };
                  const targetId = imageMessageId ?? currentModelId;
                  if (!targetId) continue;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === targetId
                        ? {
                            ...m,
                            content: stripImageTagsClient(m.content),
                            image: { url, width, height },
                          }
                        : m,
                    ),
                  );
                } catch {
                  // ignore
                }
              } else if (event === "background_picked") {
                try {
                  const { url } = JSON.parse(data) as { url: string };
                  if (url) setBackgroundUrl(url);
                } catch {
                  // ignore
                }
              } else if (event === "message_done" || event === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "model"
                      ? { ...m, content: stripImageTagsClient(m.content) }
                      : m,
                  ),
                );
              } else if (event === "retry") {
                if (currentModelId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentModelId ? { ...m, content: "" } : m,
                    ),
                  );
                }
              } else if (event === "error") {
                let errorText: string | undefined;
                try {
                  const parsed = JSON.parse(data) as { message?: string };
                  errorText = parsed.message;
                } catch {
                  // ignore
                }
                ensureFailedMessage(errorText);
              }
            }
          }
        } finally {
          setStreaming(false);
        }
      };

      if (!opts?.retry) {
        const userMsg: ChatMessage = {
          id: "tmp-u-" + now,
          role: "user",
          content: text,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);

        burstRef.current.texts.push(text);
        if (burstRef.current.timer) clearTimeout(burstRef.current.timer);
        const waitMs =
          text.trim().length < 24 || !/[.!?。！？]$/.test(text.trim())
            ? 1500
            : 650;
        burstRef.current.timer = setTimeout(() => {
          const texts = [...burstRef.current.texts];
          burstRef.current.texts = [];
          burstRef.current.timer = null;
          void flushBurst(texts);
        }, waitMs);
        return;
      }

      const lastModelId =
        [...messagesRef.current].reverse().find((m) => m.role === "model")?.id ??
        null;
      if (lastModelId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === lastModelId ? { ...m, content: "", failed: false } : m,
          ),
        );
      }
      await flushBurst([text]);
    },
    [sessionId]
  );

  // 캐릭터 한글 이름을 그대로 발화자 라벨로. 영문일 때도 uppercase 변환을 하지 않아
  // 원래 이름을 있는 그대로 보이게 한다. 과거엔 non-ascii 를 다 지우고 "SCHOLAR" 로
  // fallback 시켰는데, 한글 이름이 지워져 뜬금없는 기술 코드네임이 유저에게 노출됐다.
  const senderCode = character.name.trim().slice(0, 16) || "BOT";

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
    <div className="flex-1 min-h-0 bg-surface flex flex-col relative overflow-hidden">
      {/* Mood-matched backdrop (아래→위 DOM 순서로 가장 먼저, diagonal/dot 패턴 뒤) */}
      <RoomBackdrop url={backgroundUrl} />
      {/* Background patterns — scoped to chat frame */}
      <div className="absolute inset-0 pointer-events-none diagonal-bg opacity-60 z-0" />
      <div className="absolute inset-0 pointer-events-none dot-pattern opacity-30 z-0" />

      {/* Top nav — flex child, not fixed */}
      <header className="shrink-0 z-30 glass border-b border-outline-variant/20">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Link
              href={"/history" as "/history"}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors active:scale-95 rounded-md shrink-0"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </Link>
            <div className="relative w-9 h-9 overflow-hidden bg-primary-container rounded-md border-2 border-primary-container shrink-0">
              {/* gradient always-on — broken-image 이미지모지 고착 방지 */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #3a5f94, #cee9d9)",
                }}
              />
              {character.portraitUrl ? (
                // next/image 옵티마이저 실패가 모바일에서 broken-image 로 고착되는
                // 증상을 피하기 위해 채팅 헤더의 작은 포트레이트는 raw <img> 로 직송.
                // 36x36 에 불과해 옵티마이저 이득이 없음.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.portraitUrl}
                  alt=""
                  width={36}
                  height={36}
                  decoding="async"
                  className="relative w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-headline font-black tracking-[0.15em] text-on-surface uppercase text-xs truncate">
                {character.name}
              </h1>
              <p className="flex items-center gap-1 text-[9px] text-primary">
                <span className="w-1.5 h-1.5 bg-secondary-fixed rounded-full inline-block animate-pulse-dot" />
                <span className="label-mono">ONLINE</span>
              </p>
            </div>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button
              type="button"
              aria-label="Search"
              className="w-9 h-9 flex items-center justify-center text-on-surface-variant/60 hover:bg-surface-container-low transition-colors rounded-md"
            >
              <Search size={16} strokeWidth={2} />
            </button>
            <SettingsMenuButton
              sessionId={sessionId}
              characterName={character.name}
            />
          </div>
        </div>
      </header>

      {/* Chat log — internal scroll */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-5 flex flex-col gap-8 relative z-10">
        {messages.map((m) =>
          // 스트리밍 중 비어 있는 model placeholder 는 TypingIndicator 가 대체 렌더.
          // 이걸 그리면 빈 헤더가 하나 보이고 아래 TypingIndicator 가 또 붙어서
          // 메시지가 2개처럼 보이는 문제가 생긴다.
          m.role === "model" && m.content.trim().length === 0 ? null : (
            <MessageBubble
              key={m.id}
              msg={m}
              senderLabel={character.name || senderCode}
              onRetry={
                m.failed
                  ? () => {
                      // 마지막으로 사용자가 보낸 원문 텍스트를 그대로 재전송.
                      // retry 플래그를 켜서 새 버블을 만들지 않고 기존 실패 버블을 복구.
                      void send(lastUserTextRef.current, { retry: true });
                    }
                  : undefined
              }
            />
          )
        )}

        {streaming &&
          messages[messages.length - 1]?.role === "model" &&
          !messages[messages.length - 1]?.content && (
            <TypingIndicator senderLabel={character.name || senderCode} />
          )}

        <div ref={bottomRef} />
      </main>

      {latestStatus ? <StatusPanel status={latestStatus} /> : null}

      <Composer
        onSend={send}
        disabled={streaming}
        placeholder="메시지를 입력하세요"
      />
    </div>
  );
}
