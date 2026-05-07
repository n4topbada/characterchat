// LLM 이 응답에 <img tags="..."/> 토큰을 끼워 넣으면,
// 서버가 이 모듈로 가장 적합한 Asset 을 골라 SSE 로 전송한다.
//
// 스코어링:
//   clothingTag 일치           +10
//   sceneTag 정확 일치          +5
//   sceneTag prefix("sex_*")    +12  ← "sex" 토큰이 있을 때만, naked 단계에서
//                                     스왑이 안 되던 버그(5 vs 10) 해결
//   expression 일치            +4
//   moodFit 교집합 한 건        +3
//   locationFit 교집합          +2
//   triggerTags 교집합          +2
//   NSFW 가드:
//     - nsfwEnabled=false 면 nsfwLevel>0 자산 제외
//     - "sex" 의도가 명시(토큰 또는 본문)되면 nsfwLevel=2/3 페널티는 면제
//       (LLM 이 사용자에게 동의 후 진입한 장면에 horny 누적 못 따라가서 그림이
//        도태되는 현상이 있었다)
//     - 의도 없을 땐 horny<40 이면 nsfwLevel=3 페널티(-8), horny<20 이면 lvl=2(-3)

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

  // scene → sceneTag 매칭. LLM 이 status.scene 을 내면 "sex"/"bath"/"sleep" 등이
  // sceneTag 매칭 경로로 곧바로 들어간다. 필드가 없어도 기존 동작엔 영향 없음.
  if (typeof s.scene === "string") {
    out.push(s.scene.toLowerCase());
  }

  return out;
}

// 프롬프트(LLM emit 어휘)와 DB 에셋 태깅 어휘 사이 불일치를 메운다.
// 예: LLM 은 "aroused" 로 내놓는데 moodFit 에는 "horny" 로 태깅돼 있어 +3 보너스 실패.
const SYNONYMS: Record<string, string[]> = {
  aroused: ["horny"],
  horny: ["aroused"],
  affectionate: ["loving"],
  loving: ["affectionate"],
  flustered: ["embarrassed"],
  embarrassed: ["flustered"],
  happy: ["cheerful", "joyful"],
  sad: ["upset"],
  tender: ["loving", "affectionate"],
  sleepy: ["tired"],
  surprised: ["startled"],
  // 카탈로그에 따라 sceneTag 가 "naked" / "nude" 로 갈리는데(scoreAsset 이
  // expanded.includes(sceneTag) 로만 매칭) 둘이 동의어로 잡히지 않으면 캐릭터
  // 별로 +5 보너스가 누락된다.
  naked: ["nude"],
  nude: ["naked"],
};

function expandTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    const low = t.toLowerCase();
    out.add(low);
    for (const syn of SYNONYMS[low] ?? []) out.add(syn);
  }
  return [...out];
}

export function scoreAsset(
  asset: PickableAsset,
  tokens: string[],
  ctx: PickContext,
): number {
  if (!ctx.nsfwEnabled && asset.nsfwLevel > 0) return -Infinity;

  const expanded = expandTokens(tokens);
  // "지금 sex 장면이다" 가 명시됐는가 — token bag 또는 본문 키워드(spotBodyTokens
  // 가 'sex' 를 추가) 로 들어온다. 이 깃발이 켜지면 horny 수치가 낮아도 NSFW
  // 페널티를 면제한다 (전환 직전 LLM 이 horny 30~40 으로 머무는 케이스 보호).
  const sexIntent = expanded.includes("sex");
  let score = 0;

  // 1) clothing — 의도 불일치 페널티는 약하게(-1). 장면 전환 중 underwear/partial 도
  //    자연스럽게 뽑히도록 여유를 둔다.
  const clothingTokens = expanded
    .map(normalizeClothing)
    .filter((x): x is string => !!x);
  if (clothingTokens.length && asset.clothingTag) {
    if (clothingTokens.includes(asset.clothingTag)) score += 10;
    else score -= 1;
  }

  // 2) sceneTag — exact 매칭(+5), "sex" 토큰의 sex_* prefix 매칭(+12).
  //    (asset sceneTag 는 sex_a/sex_b/sex_bg/sex_naked 로 세분화돼 있지만 토큰
  //    쪽은 "sex" 하나. naked 토큰 + naked sceneTag 가 +10 (clothing) + +5
  //    (scene) = 15 를 받는데, sex 토큰 + sex_* sceneTag 가 +5 만 받으면 같은
  //    clothing=naked sex 자산이 도태된다. +12 로 올려 명시적 sex 의도가
  //    naked 정지 컷보다 항상 우선되게 한다.)
  if (asset.sceneTag) {
    if (expanded.includes(asset.sceneTag)) score += 5;
    else if (sexIntent && asset.sceneTag.startsWith("sex")) score += 12;
  }

  // 3) expression
  if (asset.expression && expanded.includes(asset.expression)) score += 4;

  // 4) moodFit
  score += hasAny(asset.moodFit, expanded) * 3;

  // 5) locationFit
  score += hasAny(asset.locationFit, expanded) * 2;

  // 6) triggerTags (자유 키워드 오버랩)
  score += hasAny(asset.triggerTags, expanded) * 2;

  // 7) NSFW 가드
  //    명시적 sex 의도가 있고 자산 sceneTag 가 sex_* 라면 페널티 면제.
  //    그 외 케이스(naked 정지컷, underwear 컷 등) 는 기존대로.
  const horny = ctx.horny ?? 0;
  const exemptByIntent = sexIntent && asset.sceneTag?.startsWith("sex");
  if (!exemptByIntent) {
    if (asset.nsfwLevel === 3 && horny < 40) score -= 8;
    if (asset.nsfwLevel === 2 && horny < 20) score -= 3;
  }

  return score;
}

export function pickBestAsset(
  assets: PickableAsset[],
  tokens: string[],
  ctx: PickContext,
  opts?: { messageId?: string },
): PickableAsset | null {
  if (!tokens.length || !assets.length) return null;
  const scored = assets
    .map((a) => ({ a, s: scoreAsset(a, tokens, ctx) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((x, y) => y.s - x.s);
  if (!scored.length) return null;
  const top = scored[0].s;
  if (top <= 0) return null;
  const tied = scored.filter((x) => x.s === top);
  if (tied.length === 1) return tied[0].a;
  const seed = opts?.messageId ? hashString(opts.messageId) : 0;
  return tied[seed % tied.length].a;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// 본문(body)에서 흔한 한국어 동작·감정 표현을 탐지해 영어 태그로 번역.
// status.mood/outfit/location 만으로는 분산이 부족해서 같은 장면이 반복되는 현상을
// 보정한다. 단순 substring 매칭이라 오탐 가능하지만, 스코어에는 +2 가중치로만
// 쓰이므로 잘못 걸려도 대세엔 영향이 적다.
const BODY_KEYWORDS: Array<{ re: RegExp; tags: string[] }> = [
  { re: /안아|안았|껴안|끌어안|안기|안겨|품에/, tags: ["hug"] },
  { re: /쓰다듬|쓸어|머리를 만/, tags: ["caress", "head_pat"] },
  { re: /웃음|웃었|웃으|미소/, tags: ["smile", "happy"] },
  { re: /부끄|쑥스|수줍/, tags: ["shy", "blush"] },
  { re: /얼굴이 붉|뺨이 붉|뺨을 붉|얼굴을 붉/, tags: ["blush"] },
  { re: /요리|음식|부엌|주방/, tags: ["cook", "kitchen"] },
  { re: /샤워|목욕|씻어|씻는/, tags: ["bath", "bathroom"] },
  { re: /입맞|키스|입술/, tags: ["kiss"] },
  { re: /손(을|이)? 잡|깍지/, tags: ["hold_hand"] },
  { re: /침대|이불|잠들|자리에 들/, tags: ["bed", "bedroom"] },
  { re: /울음|눈물|흐느/, tags: ["cry", "sad"] },
  { re: /화났|짜증|분노|역정/, tags: ["angry"] },
  { re: /서러|속상|울컥/, tags: ["sad"] },
  { re: /놀라|깜짝/, tags: ["surprised"] },
  { re: /긴장|떨리/, tags: ["tense"] },
  { re: /나른|졸|하품/, tags: ["sleepy"] },
  { re: /집중|몰두/, tags: ["focused"] },
  { re: /장난|놀려/, tags: ["playful"] },
  { re: /다정|쓰다듬|어루만/, tags: ["tender", "affectionate"] },
  { re: /흥분|달아오|뜨거워|숨이 가/, tags: ["aroused"] },
  // 섹스 씬 매칭 — "sex" 토큰은 scoreAsset 에서 sceneTag 가 "sex_*" 로 시작하는
  // 모든 에셋에 +12 를 주고, NSFW 페널티(-8) 도 면제한다.
  // (이전엔 +5 / 페널티 그대로 라서 naked 정지컷에 도태되는 버그가 있었다.)
  { re: /관계|삽입|박아|박으|들어와|속으로|절정|흘러|신음|헐떡|교성|섹스|성관계|애무|핥|빨/, tags: ["sex", "moaning", "horny"] },
];

export function spotBodyTokens(body: string): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const { re, tags } of BODY_KEYWORDS) {
    if (re.test(body)) for (const t of tags) out.add(t);
  }
  return [...out];
}
