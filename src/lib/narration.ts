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

// 모델 응답을 문단 단위로 쪼개, 각 문단이 나레이션인지 직접 발화인지 분류한다.
// - 문단이 통째로 *...*(연속된 narration span) 만으로 이루어져 있으면 "narration"
// - 그 외(일부라도 일반 텍스트가 섞인) 는 "dialogue"
// 나레이션 문단의 value 는 별표를 떼고 이어붙인 순수 문장으로 돌려준다.
export type DialogueBlock =
  | { kind: "narration"; value: string }
  | { kind: "dialogue"; value: string };

export function splitDialogueBlocks(input: string): DialogueBlock[] {
  const paragraphs = input
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map<DialogueBlock>((p) => {
    const segs = splitNarration(p).filter((s) => s.value.trim().length > 0);
    const allNarration =
      segs.length > 0 && segs.every((s) => s.kind === "narration");
    if (allNarration) {
      return {
        kind: "narration",
        value: segs.map((s) => s.value).join(" ").trim(),
      };
    }
    return { kind: "dialogue", value: p };
  });
}
