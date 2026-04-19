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

// 모델 응답을 문단 단위로 쪼개, 세 가지 종류로 분류한다.
//   - "narration"  : 문단이 통째로 *...*(asterisk narration) 로 이루어진 행동 묘사
//   - "dialogue"   : 따옴표로 감싼 직접 발화가 포함된 문단 (말풍선 렌더링)
//   - "omniscient" : 따옴표도 별표도 없는 평문 — 전지적 작가 시점 서술
//
// 따옴표 판정: "...", '...', 「...」, ‘...’, “...” (전각 한국어/일본어 스타일 포함).
// action narration (*...*) 이 섞여 있고 따옴표도 있으면 "dialogue" 우선.
// 따옴표 없이 *...* 섞여 있으면 "narration" (기존 규칙 유지).
export type DialogueBlock =
  | { kind: "narration"; value: string }
  | { kind: "dialogue"; value: string }
  | { kind: "omniscient"; value: string };

const QUOTE_RE = /["“”„『』「」《》'‘’]/;

export function splitDialogueBlocks(input: string): DialogueBlock[] {
  const paragraphs = input
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map<DialogueBlock>((p) => {
    const segs = splitNarration(p).filter((s) => s.value.trim().length > 0);
    const allNarration =
      segs.length > 0 && segs.every((s) => s.kind === "narration");
    const hasQuote = QUOTE_RE.test(p);

    if (hasQuote) {
      // 따옴표 있는 문단은 항상 대사 취급. 내부의 *행동* 은 bubble 안에서 이탤릭으로.
      return { kind: "dialogue", value: p };
    }
    if (allNarration) {
      // 전부 *...* 만으로 구성된 행동 묘사
      return {
        kind: "narration",
        value: segs.map((s) => s.value).join(" ").trim(),
      };
    }
    const hasAnyNarration = segs.some((s) => s.kind === "narration");
    if (hasAnyNarration) {
      // *...* 가 일부 섞여 있으나 따옴표는 없음 — 혼합 서술로 보고 narration 취급.
      return { kind: "narration", value: p };
    }
    // 따옴표도 *별표* 도 없는 평문 — 전지적 작가 시점 서술.
    return { kind: "omniscient", value: p };
  });
}
