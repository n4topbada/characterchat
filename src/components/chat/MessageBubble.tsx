import { useState } from "react";
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
  /** 서버가 보낸 분류된 에러 메시지 (예: "모델 서버가 잠시 혼잡해요 (503)...").
   *  failed === true 일 때만 의미가 있고, 없으면 정적 폴백 문구를 쓴다.
   *  사용자가 "정말 503 이 나온 거 맞아?" 처럼 원인을 궁금해할 때 답이 되도록
   *  실제 상태 코드가 들어간 문장을 그대로 노출한다. */
  errorText?: string;
};

/**
 * 메시지 내 인라인 이미지.
 *
 * 과거 문제:
 *   next/image 의 `/_next/image` 옵티마이저가 dev cold-start / 모바일 Safari
 *   등에서 간헐적으로 실패하면 브라우저가 "깨진 그림 아이콘(그림이모지)"
 *   상태를 캐시해 버려, 그 이후 정상 응답이 와도 해당 URL 엔 계속 broken-image
 *   아이콘만 고착되는 증상이 재현된다.
 *
 * 결정 (v2):
 *   인라인 메시지 이미지는 **옵티마이저를 아예 경유하지 않는다** — 업로드 파이프가
 *   sharp 로 이미 webp 로 적정 해상도로 변환해 저장하므로 `/_next/image` 로
 *   얻을 이득이 거의 없고, 반대로 실패 시 UX 손해(영구적 깨진 아이콘) 가 훨씬
 *   크다. raw `<img>` 로 직접 서빙하면 원격(Blob) / 로컬(public) / 모든 경로가
 *   동일하게 동작하고, 브라우저 기본 디코더만 타므로 고장 표면이 좁아진다.
 *
 * 추가 방어:
 *   - onError 시 src 를 비우고 중립 gradient 타일로 즉시 대체 — 작은 사각 깨진
 *     아이콘을 사용자에게 보여주지 않는다.
 *   - 항상 바닥에 gradient 가 깔려 있어 로드 전 빈 영역도 노출되지 않는다.
 */
function InlineMessageImage({
  url,
  width,
  height,
}: {
  url: string;
  width: number;
  height: number;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      className="relative mb-2 overflow-hidden rounded-md border border-outline-variant bg-surface-container-low"
      style={{ width: "min(320px, 75vw)" }}
    >
      {/* 로드 전/실패 시 깔리는 gradient fallback — "그림이모지" 대체용. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #3a5f94 0%, #a7c8ff 50%, #cee9d9 100%)",
        }}
      />
      {!errored ? (
        // 의도적으로 next/image 대신 raw <img>. 이유는 컴포넌트 docstring 참조.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="relative w-full h-auto block"
          onError={() => setErrored(true)}
        />
      ) : (
        // 비율 유지용 placeholder: width/height 비율대로 크기만 잡고 gradient 노출.
        <div
          aria-hidden
          style={{ aspectRatio: `${width} / ${height}` }}
          className="w-full"
        />
      )}
    </div>
  );
}

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
          <p className="text-[13px] leading-relaxed text-on-error-container whitespace-pre-wrap">
            {msg.errorText ??
              "응답을 받지 못했어요. 서버가 혼잡하거나 일시적으로 응답이 차단된 상황입니다."}
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
        <InlineMessageImage
          url={msg.image.url}
          width={msg.image.width}
          height={msg.image.height}
        />
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
