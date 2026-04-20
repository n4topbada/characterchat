/**
 * TypingIndicator — 모델 응답 대기 중 표식.
 *
 * 유저 요청: "캐스터 턴일때 ... 이 나오는데 이거 애니메이션 연출을 해서 좀 기다리는
 * 시간 덜 지루하게."
 *
 * 구성:
 *  - 3개 점이 스케일+페이드 로 물결치듯 커졌다 작아진다 (typing-wave).
 *  - 버블 내부 primary-tint 그라디언트가 좌→우로 흘러간다 (typing-shimmer).
 *  - compact 모드: 라벨 없이 버블만 (Caster MessageBlock 인라인용).
 */
type Props = {
  senderLabel?: string;
  /** Caster 인라인 "…" 위치에 끼워 넣을 때 사용. 라벨/헤더 없이 버블만 렌더. */
  compact?: boolean;
};

export function TypingIndicator({ senderLabel, compact = false }: Props) {
  const dots = (
    <>
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-typing-wave"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-typing-wave"
        style={{ animationDelay: "160ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-typing-wave"
        style={{ animationDelay: "320ms" }}
      />
    </>
  );

  const shimmer = (
    <span
      aria-hidden
      className="absolute inset-0 pointer-events-none animate-typing-shimmer"
      style={{
        background:
          "linear-gradient(90deg, transparent 0%, rgba(58, 95, 148, 0.14) 50%, transparent 100%)",
      }}
    />
  );

  if (compact) {
    // 캐스터 말풍선 내부에서 "…" 대신 바로 쓰는 버전.
    return (
      <span
        role="status"
        aria-label="응답 작성 중"
        className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-md px-2 py-1"
      >
        {shimmer}
        <span className="relative flex items-center gap-1.5">{dots}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-label="응답 작성 중"
      className="flex flex-col items-start max-w-[85%] animate-fade-in"
    >
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
      <div className="relative overflow-hidden bubble-receive bg-surface-container-high border-l-2 border-primary shadow-tinted-sm px-5 py-3.5">
        {shimmer}
        <div className="relative flex items-center gap-1.5">{dots}</div>
      </div>
    </div>
  );
}
