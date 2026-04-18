/**
 * 텍스트 청크 분할기. 문장/단락 경계를 우선하고, 길이가 넘치면 강제 분할.
 * 토큰 기준이 아니라 문자 길이 기준 (한국어는 대략 1.5~2자 ≒ 1토큰).
 */

export type ChunkOptions = {
  targetChars?: number;  // 기본 800자 ≒ 약 400 토큰
  maxChars?: number;     // 하드 리밋
  overlapChars?: number; // 겹침
};

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 800,
  maxChars: 1200,
  overlapChars: 100,
};

/** 대상 문자열을 여러 청크로 나눈다. 문단→문장 경계 우선. */
export function splitToChunks(
  text: string,
  opts: ChunkOptions = {},
): string[] {
  const cfg = { ...DEFAULTS, ...opts };
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= cfg.maxChars) return [normalized];

  // 1단계: 문단 분할 (\n\n 또는 \n 이상의 빈 줄).
  const paragraphs = normalized.split(/\n{2,}/).filter((p) => p.trim());

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) chunks.push(trimmed);
    buf = "";
  };

  for (const para of paragraphs) {
    // 문단 하나가 maxChars 초과면 문장 단위로 더 쪼갠다.
    if (para.length > cfg.maxChars) {
      if (buf) flush();
      const sentences = para.split(/(?<=[.!?。！？])\s+|(?<=[다요])\s+/);
      for (const s of sentences) {
        if ((buf + s).length > cfg.targetChars && buf) flush();
        if (s.length > cfg.maxChars) {
          // 문장 하나가 너무 길면 강제 슬라이스
          for (let i = 0; i < s.length; i += cfg.targetChars) {
            chunks.push(s.slice(i, i + cfg.targetChars));
          }
        } else {
          buf += (buf ? " " : "") + s;
        }
      }
      continue;
    }
    if ((buf + "\n\n" + para).length > cfg.targetChars && buf) flush();
    buf += (buf ? "\n\n" : "") + para;
  }
  flush();

  // overlap 적용 (뒤 청크 앞머리에 이전 청크 끝부분 접두).
  if (cfg.overlapChars > 0 && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const tail = prev.slice(Math.max(0, prev.length - cfg.overlapChars));
      chunks[i] = (tail + " … " + chunks[i]).trim();
    }
  }

  return chunks;
}

/** 대략적인 토큰 수 추정. 한국어 1자 ≒ 0.5 토큰, 영문 단어 ≒ 1.3 토큰. */
export function estimateTokens(text: string): number {
  const korean = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  const other = text.length - korean;
  return Math.ceil(korean * 0.5 + other * 0.4);
}
