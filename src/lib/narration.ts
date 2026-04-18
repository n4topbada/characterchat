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

// 상태창 블록 <status>{...}</status> 분리 + 방어적 sanitize.
// 스트림이 잘려 </status> 없이 끝나거나, 모델이 <img .../>, 혹은 순수 JSON 블록을
// 본문에 흘려도 사용자에게 구조체가 노출되지 않도록 제거한다.
export function extractStatus(input: string): {
  body: string;
  status: unknown | null;
} {
  let status: unknown | null = null;
  let body = input;

  const closed = body.match(/<status>([\s\S]*?)<\/status>/);
  if (closed) {
    body = body.replace(closed[0], "");
    try {
      status = JSON.parse(closed[1]);
    } catch {
      status = null;
    }
  }

  body = sanitizeModelBody(body);
  return { body: body.trim(), status };
}

// 본문에서 사용자에게 보여서는 안 되는 구조체/오류 문자열을 제거한다.
// - 닫히지 않은 <status> 이후 꼬리
// - 닫히지 않은 <img ... 꼬리
// - 닫힌 <img ... /> 블록 (chat route 에서 stripImageTags 로 이미 벗기지만 중복 방어)
// - 본문 중 독립된 JSON 오브젝트/배열 블록(모델이 status 스키마를 그대로 뱉는 케이스)
// - 백틱 코드펜스
// - [ERROR], [BLOCKED] 같은 대괄호 시스템 토큰
export function sanitizeModelBody(input: string): string {
  let s = input;

  const orphanStatus = s.indexOf("<status");
  if (orphanStatus >= 0) s = s.slice(0, orphanStatus);

  s = s.replace(/<img\b[^>]*\/?>/gi, "");
  const orphanImg = s.indexOf("<img");
  if (orphanImg >= 0) s = s.slice(0, orphanImg);

  s = s.replace(/```[a-zA-Z]*\s*[\s\S]*?```/g, "");
  s = s.replace(/```/g, "");

  s = s.replace(/^\s*[\[{][\s\S]*?[\]}]\s*$/gm, "");

  s = s.replace(/\[(?:ERROR|BLOCKED|RETRY|SYSTEM|DEBUG)[^\]]*\]/gi, "");

  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
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
