// 배경(AssetKind.background) 전용 picker. 채팅방 backdrop 레이어 소스.
//
// 스코어링(간단):
//   locationFit 교집합 한 건     +5   — 주 판단 기준. "지금 어디 있는지"
//   moodFit 교집합 한 건         +3   — 분위기 보조
//   triggerTags 교집합 한 건     +2   — 자유 키워드(드물게 겹침)
//
// tokens 는 statusToTokens(status) + spotBodyTokens(body) 로 만든다.
// 아무 것도 매칭되지 않으면 null — 이 경우 호출자가 "유지" 하거나 기본값을 쓴다.
//
// 인물 갤러리 picker 와 달리:
//   - NSFW 가드 없음 (backgrounds 는 전부 nsfwLevel=0)
//   - clothingTag/sceneTag/expression 없음
//   - tie-break 은 sessionId(또는 messageId) 해시로 결정적으로 고름

import type { Asset } from "@prisma/client";

export type PickableBackground = Pick<
  Asset,
  | "id"
  | "blobUrl"
  | "width"
  | "height"
  | "moodFit"
  | "locationFit"
  | "triggerTags"
  | "description"
>;

function hasAny(haystack: string[], needles: string[]): number {
  const set = new Set(haystack.map((s) => s.toLowerCase()));
  let hits = 0;
  for (const n of needles) if (set.has(n.toLowerCase())) hits++;
  return hits;
}

export function scoreBackground(
  bg: PickableBackground,
  tokens: string[],
): number {
  if (!tokens.length) return 0;
  let score = 0;
  score += hasAny(bg.locationFit, tokens) * 5;
  score += hasAny(bg.moodFit, tokens) * 3;
  score += hasAny(bg.triggerTags, tokens) * 2;
  return score;
}

export function pickBestBackground(
  bgs: PickableBackground[],
  tokens: string[],
  opts?: { seed?: string },
): PickableBackground | null {
  if (!bgs.length || !tokens.length) return null;
  const scored = bgs
    .map((b) => ({ b, s: scoreBackground(b, tokens) }))
    .sort((x, y) => y.s - x.s);
  const top = scored[0].s;
  if (top <= 0) return null;
  const tied = scored.filter((x) => x.s === top);
  if (tied.length === 1) return tied[0].b;
  const seed = opts?.seed ? hashString(opts.seed) : 0;
  return tied[seed % tied.length].b;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
