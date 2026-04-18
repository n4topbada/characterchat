// *text* 패턴을 내레이션 조각으로 분해한다.
// 행동 묘사는 이탤릭 회색으로, 나머지는 일반 텍스트로 렌더.
export type NarrationSegment = {
  kind: "narration" | "text";
  value: string;
};

const PATTERN = /\*([^*\n]+?)\*/g;

export function splitNarration(input: string): NarrationSegment[] {
  const out: NarrationSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(input)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", value: input.slice(last, m.index) });
    }
    out.push({ kind: "narration", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    out.push({ kind: "text", value: input.slice(last) });
  }
  return out;
}

// 상태창 블록 <status>{...}</status> 분리
export function extractStatus(input: string): {
  body: string;
  status: unknown | null;
} {
  const m = input.match(/<status>([\s\S]*?)<\/status>/);
  if (!m) return { body: input, status: null };
  const body = input.replace(m[0], "").trim();
  try {
    return { body, status: JSON.parse(m[1]) };
  } catch {
    return { body, status: null };
  }
}
