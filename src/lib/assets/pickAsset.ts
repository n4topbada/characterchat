// LLM 이 응답에 <img tags="..."/> 토큰을 끼워 넣으면,
// 서버가 이 모듈로 가장 적합한 Asset 을 골라 SSE 로 전송한다.
//
// 스코어링:
//   clothingTag 일치      +10
//   sceneTag 일치         +5
//   expression 일치       +4
//   moodFit 교집합 한 건   +3
//   locationFit 교집합     +2
//   triggerTags 교집합     +2
//   NSFW 가드: 캐릭터 nsfwEnabled=false 이면 nsfwLevel>0 는 제외.
//              horny 상태값이 낮으면 nsfwLevel=3 페널티(-8), nsfwLevel=2 페널티(-3)

import type { Asset } from "@prisma/client";

export type PickableAsset = Pick<
  Asset,
  | "id"
  | "blobUrl"
  | "width"
  | "height"
  | "sceneTag"
  | "expression"
  | "composition"
  | "pose"
  | "clothingTag"
  | "moodFit"
  | "locationFit"
  | "nsfwLevel"
  | "description"
  | "triggerTags"
  | "kind"
>;

export type PickContext = {
  nsfwEnabled: boolean;
  horny?: number | null;
  affection?: number | null;
};

const IMG_TAG_RE = /<img\s+[^>]*tags\s*=\s*"([^"]+)"[^>]*\/?>/gi;

export function extractImageTriggers(text: string): string[][] {
  const triggers: string[][] = [];
  let m: RegExpExecArray | null;
  while ((m = IMG_TAG_RE.exec(text)) !== null) {
    const tokens = m[1]
      .split(/[\s,]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.length) triggers.push(tokens);
  }
  return triggers;
}

export function stripImageTags(text: string): string {
  return text.replace(IMG_TAG_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

const CLOTHING_WORDS = new Set([
  "dressed",
  "naked",
  "nude",
  "underwear",
  "lingerie",
  "towel",
  "partial",
  "swimwear",
]);

function hasAny(haystack: string[], needles: string[]): number {
  const set = new Set(haystack.map((s) => s.toLowerCase()));
  let hits = 0;
  for (const n of needles) if (set.has(n.toLowerCase())) hits++;
  return hits;
}

function normalizeClothing(token: string): string | null {
  const t = token.toLowerCase();
  if (t === "nude") return "naked";
  if (t === "lingerie") return "underwear";
  if (CLOTHING_WORDS.has(t)) return t;
  return null;
}

// PersonaState.statusPayload (또는 <status>{...}</status> 에서 파싱한 값) 을
// pickBestAsset 에 넘길 토큰 배열로 변환한다.
//
// 입력 예: { mood:"shy", outfit:"pajamas", location:"bedroom", horny:40, affection:60 }
// 출력 예: ["shy", "dressed", "bedroom"]
export function statusToTokens(status: unknown): string[] {
  if (!status || typeof status !== "object") return [];
  const s = status as Record<string, unknown>;
  const out: string[] = [];

  // outfit → clothingTag 어휘로 정규화
  if (typeof s.outfit === "string") {
    const raw = s.outfit.toLowerCase();
    const map: Record<string, string> = {
      casual: "dressed",
      home: "dressed",
      dressed: "dressed",
      pajamas: "dressed",
      pajama: "dressed",
      sleepwear: "dressed",
      underwear: "underwear",
      lingerie: "underwear",
      towel: "towel",
      naked: "naked",
      nude: "naked",
      partial: "partial",
      swimwear: "swimwear",
    };
    const v = map[raw] ?? (CLOTHING_WORDS.has(raw) ? raw : null);
    if (v) out.push(v);
    else out.push(raw); // 원본도 triggerTags 매칭에 쓰일 수 있으니 보존
  }

  // location → locationFit 어휘
  if (typeof s.location === "string") {
    out.push(s.location.toLowerCase());
  }

  // mood → moodFit / expression 어휘
  if (typeof s.mood === "string") {
    out.push(s.mood.toLowerCase());
  }

  return out;
}

export function scoreAsset(
  asset: PickableAsset,
  tokens: string[],
  ctx: PickContext,
): number {
  if (!ctx.nsfwEnabled && asset.nsfwLevel > 0) return -Infinity;

  let score = 0;

  // 1) clothing
  const clothingTokens = tokens
    .map(normalizeClothing)
    .filter((x): x is string => !!x);
  if (clothingTokens.length && asset.clothingTag) {
    if (clothingTokens.includes(asset.clothingTag)) score += 10;
    else score -= 4; // 의도 불일치
  }

  // 2) sceneTag — 트리거 안의 일반 키워드와 sceneTag 비교
  if (asset.sceneTag) {
    if (tokens.includes(asset.sceneTag)) score += 5;
  }

  // 3) expression
  if (asset.expression && tokens.includes(asset.expression)) score += 4;

  // 4) moodFit
  score += hasAny(asset.moodFit, tokens) * 3;

  // 5) locationFit
  score += hasAny(asset.locationFit, tokens) * 2;

  // 6) triggerTags (자유 키워드 오버랩)
  score += hasAny(asset.triggerTags, tokens) * 2;

  // 7) NSFW 가드
  const horny = ctx.horny ?? 0;
  if (asset.nsfwLevel === 3 && horny < 40) score -= 8;
  if (asset.nsfwLevel === 2 && horny < 20) score -= 3;

  return score;
}

export function pickBestAsset(
  assets: PickableAsset[],
  tokens: string[],
  ctx: PickContext,
): PickableAsset | null {
  if (!tokens.length || !assets.length) return null;
  let best: PickableAsset | null = null;
  let bestScore = -Infinity;
  for (const a of assets) {
    const s = scoreAsset(a, tokens, ctx);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  if (!best || bestScore <= 0) return null;
  return best;
}
