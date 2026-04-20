import Image from "next/image";
import { RotateCw } from "lucide-react";
import { NarrationText } from "./NarrationSpan";
import { extractStatus, splitDialogueBlocks } from "@/lib/narration";

export type ChatMessage = {
  id: string;
  role: "user" | "model" | "system" | "tool";
  content: string;
  createdAt?: string | Date;
  image?: { url: string; width: number; height: number } | null;
  /** 모델 응답이 에러/혼잡/빈응답으로 실패했을 때 true.
   *  UI: 에러 버블 + "다시보내기" 아이콘 노출. onRetry 를 통해 같은 유저
   *  메시지를 재전송한다. */
  failed?: boolean;
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
  onRetry,
}: {
  msg: ChatMessage;
  senderLabel?: string;
  /** msg.failed === true 일 때, 이 모델 메시지 바로 앞의 유저 메시지를 재전송한다.
   *  ChatShell 이 closure 로 lastUserText 를 잡아 제공한다. */
  onRetry?: () => void;
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

  // 모델 응답이 실패한 경우: 에러 버블 + 재전송 버튼.
  // 서버가 혼잡/블록으로 response 를 못 보냈을 때 사용자가 "멈췄구나" 로 오해하지
  // 않도록 명시적인 UI + 한 번의 클릭으로 복구.
  if (msg.failed) {
    return (
      <div className="flex flex-col items-start max-w-[85%] animate-fade-in">
        <div className="flex items-center gap-3 mb-2 px-2">
          <span
            className="label-scholastic-xs text-on-surface-variant bg-surface-container px-2 py-0.5"
            style={{ transform: "skewX(-15deg)" }}
          >
            <span
              style={{ transform: "skewX(15deg)", display: "inline-block" }}
            >
              {tagText}
            </span>
          </span>
          <span className="label-mono text-error">FAILED</span>
        </div>
        <div className="relative bubble-receive bg-error-container/40 border-l-2 border-error px-4 py-3 shadow-tinted-sm">
          <p className="text-[13px] leading-relaxed text-on-error-container">
            응답을 받지 못했어요. 서버가 혼잡하거나 일시적으로 응답이 차단된 상황입니다.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-error/30 bg-error-container/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-on-error-container hover:bg-error-container active:scale-95 transition-transform"
              aria-label="마지막 메시지 다시 보내기"
            >
              <RotateCw size={12} strokeWidth={2.5} />
              <span>다시 보내기</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

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
            // 내레이션(지문) 은 대사와 시각적으로 완전히 구분되는 "지문 버블":
            //  - 꽉 찬 대사 버블과 달리 대시 파선 아웃라인 + 투명-유사 배경
            //  - 사각 대칭 모서리 (대사 버블은 좌상단이 잘린 bubble-receive)
            //  - 살짝 들여쓰기 해서 발화 라인에 붙지 않게
            //  - 좌측 2px 대시 바로 "지문" 시그널
            return (
              <div
                key={i}
                className="relative ml-3 max-w-[90%] border border-dashed border-outline-variant/60 bg-surface-container-lowest/50 rounded-md px-4 py-2"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-2 bottom-2 w-[2px] bg-outline-variant/70"
                />
                <p className="narration text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                  {block.value}
                </p>
              </div>
            );
          }
          // dialogue — 말풍선. 문단 내부의 *행동* 조각은 NarrationText 가
          // 이탤릭 span 으로 분리 렌더.
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
