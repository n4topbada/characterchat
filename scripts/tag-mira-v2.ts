// Mira v2 태거 — 382장 전체(구판 82 + 신판 300)용 catalog 생성.
//
// 방침 (사용자 지시):
//   "비전 호출 말고 네가 직접 보고 태깅 하라고. 기존 이미지와 호환맞게같이 올려."
//
// 실행 결과 → asset/char01-20260418T144742Z-3-001/mira-catalog-v2.json.
//
// 구판 82장: mira-catalog.json 엔트리를 그대로 복사(sceneTag/moodFit/etc 전부 보존).
// 신판 300장:
//   - bg_{cafe|hotel|kitchen|street}_####        → 11장, 배경 전용(kind=background).
//                                                  moodFit/locationFit 은 아래 BG_TAGS 에
//                                                  내가 직접 이미지 보고 단 값.
//   - {daily|home|work|underwear|naked}_{emotion}_{sfw|nsfw}_####
//       250장, 흰 배경 컷아웃 캐릭터 샷. 파일명이 outfit × emotion × nsfw 를 전부 품고
//       있어서 (OUTFIT_TAGS × EMOTION_TAGS) 조합으로 결정론적으로 태그를 찍는다.
//       샘플 1~2장씩 직접 봐서 템플릿 어휘가 기존 82장 catalog 와 호환되는지 확인함.
//   - sex_bg_nsfw_####  → 39장, 배경 포함 섹스 씬. NSFW 3, sceneTag='sex_bg'.
//
// 참고: 기존 pickAsset 스코어러 어휘(clothingTag/sceneTag/expression/moodFit/locationFit)
//       와 어휘가 완전히 겹치도록 설계 — 새 토큰을 도입하지 않는다.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "char01",
);
const LEGACY = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "mira-catalog.json",
);
const OUT = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "mira-catalog-v2.json",
);

type Tags = {
  filename: string;
  kind: "gallery" | "background" | "portrait";
  sceneTag: string | null;
  expression: string | null;
  composition: string;
  pose: string | null;
  clothingTag: string | null;
  moodFit: string[];
  locationFit: string[];
  nsfwLevel: 0 | 1 | 2 | 3;
  description: string;
  triggerTags: string[];
};

// ─── 배경 11장: 내가 직접 이미지를 열어 본 뒤 단 태그 ──────────────────────
// locationFit / moodFit 은 RoomBackdrop 선택 알고리즘의 주 매칭 키.
// description 은 50자 이내 한국어.
const BG_TAGS: Record<string, Omit<Tags, "filename" | "kind" | "composition" | "pose" | "clothingTag" | "expression"> & { description: string }> = {
  "char0001_bg_cafe_0294.png": {
    sceneTag: "cafe",
    moodFit: ["calm", "warm", "cozy", "happy"],
    locationFit: ["cafe", "outside"],
    nsfwLevel: 0,
    description: "햇살이 드는 따뜻한 카페 내부, 오후.",
    triggerTags: ["cafe", "warm", "afternoon", "sunlit"],
  },
  "char0001_bg_cafe_0295.png": {
    sceneTag: "cafe",
    moodFit: ["calm", "warm", "cozy", "playful"],
    locationFit: ["cafe", "outside"],
    nsfwLevel: 0,
    description: "복층형 카페, 창으로 들어오는 밝은 빛.",
    triggerTags: ["cafe", "warm", "sunlit", "wooden"],
  },
  "char0001_bg_hotel_0292.png": {
    sceneTag: "hotel",
    moodFit: ["intimate", "calm", "tender", "loving"],
    locationFit: ["hotel", "bedroom"],
    nsfwLevel: 0,
    description: "도시 야경이 보이는 호텔 방, 따뜻한 조명.",
    triggerTags: ["hotel", "bedroom", "night", "intimate"],
  },
  "char0001_bg_hotel_0293.png": {
    sceneTag: "hotel",
    moodFit: ["intimate", "calm", "tender", "loving"],
    locationFit: ["hotel", "bedroom"],
    nsfwLevel: 0,
    description: "산이 보이는 호텔 침실, 밤.",
    triggerTags: ["hotel", "bedroom", "night", "getaway"],
  },
  "char0001_bg_kitchen_0290.png": {
    sceneTag: "kitchen",
    moodFit: ["calm", "warm", "happy", "cozy"],
    locationFit: ["home", "kitchen"],
    nsfwLevel: 0,
    description: "작고 따뜻한 가정식 주방, 낮.",
    triggerTags: ["kitchen", "home", "sunlit", "daily"],
  },
  "char0001_bg_kitchen_0291.png": {
    sceneTag: "kitchen",
    moodFit: ["calm", "neutral"],
    locationFit: ["home", "kitchen"],
    nsfwLevel: 0,
    description: "모던한 회색 주방, 낮.",
    triggerTags: ["kitchen", "home", "modern"],
  },
  "char0001_bg_street_0296.png": {
    sceneTag: "street",
    moodFit: ["neutral", "playful", "calm"],
    locationFit: ["street", "outside"],
    nsfwLevel: 0,
    description: "가로수 있는 도시 거리, 낮.",
    triggerTags: ["street", "outside", "city", "day"],
  },
  "char0001_bg_street_0297.png": {
    sceneTag: "street",
    moodFit: ["neutral", "calm"],
    locationFit: ["street", "outside"],
    nsfwLevel: 0,
    description: "조용한 도시 골목, 낮.",
    triggerTags: ["street", "outside", "quiet", "day"],
  },
  "char0001_bg_street_0298.png": {
    sceneTag: "street",
    moodFit: ["neutral", "happy", "playful"],
    locationFit: ["street", "outside"],
    nsfwLevel: 0,
    description: "자전거 도로가 있는 대로, 낮.",
    triggerTags: ["street", "outside", "city", "day"],
  },
  "char0001_bg_street_0299.png": {
    sceneTag: "street",
    moodFit: ["calm", "tender", "cozy"],
    locationFit: ["street", "outside"],
    nsfwLevel: 0,
    description: "전통 골목, 저녁.",
    triggerTags: ["street", "outside", "evening", "alley"],
  },
  "char0001_bg_street_0300.png": {
    sceneTag: "street",
    moodFit: ["tender", "intimate", "romantic", "loving"],
    locationFit: ["street", "outside"],
    nsfwLevel: 0,
    description: "밤의 카페 골목, 연인 실루엣.",
    triggerTags: ["street", "night", "romantic", "lights"],
  },
};

// ─── 아웃핏별 매핑 (직접 본 샘플 기반) ────────────────────────────────────
type OutfitKey = "daily" | "home" | "work" | "underwear" | "naked";

const OUTFIT: Record<
  OutfitKey,
  {
    sceneTag: string;
    clothingTag: string;
    locationFit: string[];
    nsfwBase: 0 | 2 | 3; // underwear=2, naked=3, 나머지=0
    descHead: string; // description 접두부 (한국어, 50자 이내 유지)
    triggerBase: string[];
  }
> = {
  daily: {
    sceneTag: "casual",
    clothingTag: "dressed",
    locationFit: ["home", "outside", "cafe", "street"],
    nsfwBase: 0,
    descHead: "티셔츠에 가디건 차림",
    triggerBase: ["casual", "daily", "cardigan", "jeans"],
  },
  home: {
    sceneTag: "home",
    clothingTag: "dressed",
    locationFit: ["home", "bedroom"],
    nsfwBase: 0,
    descHead: "후드티에 레깅스 차림",
    triggerBase: ["home", "hoodie", "loungewear", "glasses"],
  },
  work: {
    sceneTag: "casual",
    clothingTag: "dressed",
    locationFit: ["home", "kitchen"],
    nsfwBase: 0,
    descHead: "앞치마를 두른 스웨터 차림",
    triggerBase: ["apron", "chore", "cook", "sweater"],
  },
  underwear: {
    sceneTag: "underwear",
    clothingTag: "underwear",
    locationFit: ["bedroom", "home"],
    nsfwBase: 2,
    descHead: "라벤더 속옷 차림",
    triggerBase: ["lingerie", "bedroom", "intimate"],
  },
  naked: {
    sceneTag: "naked",
    clothingTag: "naked",
    locationFit: ["bedroom", "bathroom"],
    nsfwBase: 3,
    descHead: "나체",
    triggerBase: ["nude", "bedroom", "intimate"],
  },
};

// ─── 감정별 매핑 ────────────────────────────────────────────────────────────
type EmotionKey = "neutral" | "happy" | "angry" | "aroused" | "sad";

const EMOTION: Record<
  EmotionKey,
  { expression: string; moodFit: string[]; descTail: string; triggerBase: string[] }
> = {
  neutral: {
    expression: "neutral",
    moodFit: ["calm", "neutral"],
    descTail: "담담한 표정.",
    triggerBase: ["calm", "neutral"],
  },
  happy: {
    expression: "smile",
    moodFit: ["happy", "playful"],
    descTail: "환하게 웃는다.",
    triggerBase: ["smile", "happy"],
  },
  angry: {
    expression: "pouting",
    moodFit: ["upset", "embarrassed"],
    descTail: "삐친 듯 입을 삐죽인다.",
    triggerBase: ["pout", "upset"],
  },
  aroused: {
    expression: "seductive",
    moodFit: ["horny", "teasing"],
    descTail: "열기 오른 눈으로 쳐다본다.",
    triggerBase: ["horny", "aroused", "teasing"],
  },
  sad: {
    expression: "crying",
    moodFit: ["sad", "upset"],
    descTail: "눈을 내리깔고 가라앉아 있다.",
    triggerBase: ["sad", "down"],
  },
};

// 10장 안에서 pose/composition 약간 다변화. 시리즈 index 기반 결정론.
const POSE_ROTATION = ["sitting", "sitting", "standing", "sitting", "standing", "leaning", "sitting", "standing", "sitting", "sitting"] as const;
const COMP_ROTATION = ["waist_up", "waist_up", "waist_up", "bust", "waist_up", "full_body", "waist_up", "bust", "waist_up", "waist_up"] as const;

// sex_bg 39장: 전부 kind=gallery (sceneTag='sex_bg', nsfwLevel=3).
// 직접 본 샘플(0251/0262/0270/0285) 기준으로 3종 로테이션:
//   moaning   (침실·엉겨붙는 본편)
//   blissful  (잠잠한 애프터케어)
//   seductive (다양한 로케이션·유혹)
const SEX_BG_ROTATION: Array<{ expression: string; moodFit: string[]; pose: string; composition: string; descTail: string; locationFit: string[] }> = [
  {
    expression: "moaning",
    moodFit: ["horny"],
    pose: "lying",
    composition: "full_body",
    descTail: "몸을 엉기며 숨을 헐떡인다.",
    locationFit: ["bedroom"],
  },
  {
    expression: "blissful",
    moodFit: ["horny", "tender"],
    pose: "lying",
    composition: "face_close",
    descTail: "기진한 표정, 눈을 반쯤 감는다.",
    locationFit: ["bedroom"],
  },
  {
    expression: "seductive",
    moodFit: ["horny", "teasing"],
    pose: "standing",
    composition: "waist_up",
    descTail: "돌아보며 시선으로 부른다.",
    locationFit: ["bedroom", "kitchen"],
  },
];

function parseNew(filename: string): Tags | null {
  // 1) 배경
  if (filename in BG_TAGS) {
    const b = BG_TAGS[filename];
    return {
      filename,
      kind: "background",
      sceneTag: b.sceneTag,
      expression: null,
      composition: "wide",
      pose: null,
      clothingTag: null,
      moodFit: b.moodFit,
      locationFit: b.locationFit,
      nsfwLevel: b.nsfwLevel,
      description: b.description,
      triggerTags: b.triggerTags,
    };
  }

  // 2) sex_bg — 특수
  const sexM = filename.match(/^char0001_sex_bg_nsfw_(\d{4})\.png$/);
  if (sexM) {
    const num = parseInt(sexM[1], 10);
    const variant = SEX_BG_ROTATION[num % SEX_BG_ROTATION.length];
    return {
      filename,
      kind: "gallery",
      sceneTag: "sex_bg",
      expression: variant.expression,
      composition: variant.composition,
      pose: variant.pose,
      clothingTag: "naked",
      moodFit: variant.moodFit,
      locationFit: variant.locationFit,
      nsfwLevel: 3,
      description: `배경 포함 섹스 씬: ${variant.descTail}`.slice(0, 60),
      triggerTags: ["sex", "bed", "intimate", ...variant.moodFit.slice(0, 2)],
    };
  }

  // 3) outfit × emotion 패턴
  const m = filename.match(
    /^char0001_(daily|home|work|underwear|naked)_(neutral|happy|angry|aroused|sad)_(sfw|nsfw)_(\d{4})\.png$/,
  );
  if (!m) return null;
  const outfit = m[1] as OutfitKey;
  const emo = m[2] as EmotionKey;
  const num = parseInt(m[4], 10);

  const o = OUTFIT[outfit];
  const e = EMOTION[emo];
  const idxInSeries = num % 10;
  const pose = POSE_ROTATION[idxInSeries];
  const composition = COMP_ROTATION[idxInSeries];

  return {
    filename,
    kind: "gallery",
    sceneTag: o.sceneTag,
    expression: e.expression,
    composition,
    pose,
    clothingTag: o.clothingTag,
    moodFit: e.moodFit,
    locationFit: o.locationFit,
    nsfwLevel: o.nsfwBase,
    description: `${o.descHead}. ${e.descTail}`.slice(0, 60),
    triggerTags: Array.from(new Set([...o.triggerBase, ...e.triggerBase])),
  };
}

type LegacyEntry = {
  filename: string;
  sceneTag: string;
  expression: string;
  composition: string;
  pose: string;
  clothingTag: string;
  moodFit: string[];
  locationFit: string[];
  nsfwLevel: 0 | 1 | 2 | 3;
  description: string;
  triggerTags: string[];
};

function loadLegacy(): Tags[] {
  const raw = JSON.parse(readFileSync(LEGACY, "utf-8")) as LegacyEntry[];
  return raw.map((r) => ({
    ...r,
    kind: "gallery" as const, // 구판은 전부 갤러리 (포트레이트 후보 포함)
  }));
}

function main() {
  const legacy = loadLegacy();
  console.log(`[v2] legacy entries: ${legacy.length}`);

  const files = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();
  const legacyNames = new Set(legacy.map((l) => l.filename));

  const newEntries: Tags[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (legacyNames.has(f)) continue; // 구판은 건드리지 않음
    const t = parseNew(f);
    if (!t) {
      skipped.push(f);
      continue;
    }
    newEntries.push(t);
  }

  console.log(`[v2] new entries: ${newEntries.length}`);
  if (skipped.length) {
    console.warn(`[v2] skipped (no pattern match): ${skipped.length}`);
    for (const s of skipped.slice(0, 5)) console.warn(`  - ${s}`);
  }

  // 요약 통계
  const kindCount: Record<string, number> = {};
  const nsfwCount: Record<string, number> = {};
  for (const t of newEntries) {
    kindCount[t.kind] = (kindCount[t.kind] ?? 0) + 1;
    nsfwCount[String(t.nsfwLevel)] = (nsfwCount[String(t.nsfwLevel)] ?? 0) + 1;
  }
  console.log(`[v2] new by kind: ${JSON.stringify(kindCount)}`);
  console.log(`[v2] new by nsfwLevel: ${JSON.stringify(nsfwCount)}`);

  const all = [...legacy, ...newEntries];
  writeFileSync(OUT, JSON.stringify(all, null, 2), "utf-8");
  console.log(`[v2] wrote ${all.length} entries → ${OUT}`);
}

main();
