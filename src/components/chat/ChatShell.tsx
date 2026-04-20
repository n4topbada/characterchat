"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Composer } from "./Composer";
import { StatusPanel } from "./StatusPanel";
import { RoomBackdrop } from "./RoomBackdrop";
import { SettingsMenuButton } from "./SettingsMenuButton";
import { extractStatus } from "@/lib/narration";
import { shouldBypassImageOptimizer } from "@/lib/assets/imageHint";

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

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string, opts?: { retry?: boolean }) => {
      lastUserTextRef.current = text;
      const now = Date.now();
      const modelId = "tmp-m-" + now;

      // 재전송 모드: 기존 실패한 마지막 model 메시지를 같은 ID 로 리셋해서
      // "실패 → 재시도 중" 가 자연스럽게 이어지도록 한다. 유저 메시지는
      // 추가하지 않음 (이미 위에 그대로 남아있음).
      // messagesRef 를 써서 stale closure 를 회피.
      const lastModelId = opts?.retry
        ? ([...messagesRef.current].reverse().find((m) => m.role === "model")?.id ?? modelId)
        : modelId;
      if (opts?.retry) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === lastModelId
              ? { ...m, content: "", failed: false }
              : m,
          ),
        );
      } else {
        // 일반 전송: user + 빈 model placeholder 를 append.
        const userMsg: ChatMessage = {
          id: "tmp-u-" + now,
          role: "user",
          content: text,
          createdAt: new Date().toISOString(),
        };
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
      }
      setStreaming(true);

      // 실패 시 표시할 모델 메시지 ID. retry 면 기존 lastModelId 를, 아니면 새 modelId.
      const targetModelId = lastModelId;

      const markFailed = (errorText?: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetModelId
              ? { ...m, content: "(RESPONSE_ERROR)", failed: true, errorText }
              : m,
          ),
        );
      };

      try {
        const r = await fetch(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!r.ok || !r.body) {
          // SSE 가 시작되기도 전에 HTTP 자체가 깨진 케이스 (auth, 세션 없음, 500 등).
          // 정확한 상태코드를 보여줘야 "왜 실패했는지" 가 드러난다.
          markFailed(`요청이 실패했어요 (HTTP ${r.status}).`);
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
                    m.id === targetModelId ? { ...m, content: m.content + t } : m
                  )
                );
              } catch {
                // ignore
              }
            } else if (event === "image") {
              try {
                const {
                  url,
                  width,
                  height,
                } = JSON.parse(data) as {
                  id: string;
                  url: string;
                  width: number;
                  height: number;
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === targetModelId
                      ? {
                          ...m,
                          content: stripImageTagsClient(m.content),
                          image: { url, width, height },
                        }
                      : m
                  )
                );
              } catch {
                // ignore
              }
            } else if (event === "background_picked") {
              // 서버가 현재 status(location+mood) 기준으로 고른 배경 URL.
              // RoomBackdrop 이 자체적으로 중복 URL 을 걸러내므로 setter 만 호출.
              try {
                const { url } = JSON.parse(data) as { url: string };
                if (url) setBackgroundUrl(url);
              } catch {
                // ignore
              }
            } else if (event === "done") {
              // stream complete — clean any lingering <img tags/> tokens in the
              // accumulated buffer (서버 저장본은 이미 stripped, 클라 중간 버퍼는 남을 수 있음).
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetModelId
                    ? { ...m, content: stripImageTagsClient(m.content) }
                    : m
                )
              );
            } else if (event === "retry") {
              // 서버가 빈 응답/블록 감지 후 재시도 — 지금까지의 delta 버퍼를 리셋.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetModelId ? { ...m, content: "" } : m
                )
              );
            } else if (event === "error") {
              // 서버가 error 이벤트로 종료 — failed 플래그를 세워서 에러 버블 +
              // 재전송 버튼이 뜨도록. 서버가 보낸 실제 메시지 (예: "모델 서버가
              // 잠시 혼잡해요 (503)...") 를 errorText 로 저장해 MessageBubble 이
              // 그걸 그대로 보여주도록 한다. 이전엔 "(RESPONSE_ERROR)" 만 남아서
              // 사용자는 실제 에러 원인이 무엇인지 알 수 없었다.
              let errorText: string | undefined;
              try {
                const parsed = JSON.parse(data) as { message?: string };
                errorText = parsed.message;
              } catch {
                // message 가 없거나 파싱 실패 — 폴백 문구로.
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetModelId
                    ? {
                        ...m,
                        content: "(RESPONSE_ERROR)",
                        failed: true,
                        errorText,
                      }
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
                <Image
                  src={character.portraitUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="relative w-full h-full object-cover"
                  unoptimized={shouldBypassImageOptimizer(character.portraitUrl)}
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
