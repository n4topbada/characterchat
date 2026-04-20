// Gemini 안전필터에 막힌 NSFW 이미지(naked/sex_*)는 Vision 태깅이 불가.
// 파일명과 장면 버킷으로부터 합리적인 기본 태그를 합성해서 카탈로그에 채워넣는다.
// 운영자가 나중에 수동으로 다듬을 수 있음.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "char01",
);
const OUT = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "mira-catalog.json",
);

type Tags = {
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

function heuristicTags(filename: string): Tags {
  const m = filename.match(/^char01_([a-z_]+?)\d{3}\.png$/);
  const scene = m ? m[1].replace(/_+$/, "") : "gallery";

  if (scene === "naked") {
    return {
      filename,
      sceneTag: "naked",
      expression: "shy",
      composition: "full_body",
      pose: "standing",
      clothingTag: "naked",
      moodFit: ["shy", "loving", "embarrassed"],
      locationFit: ["bedroom", "bathroom"],
      nsfwLevel: 3,
      description: "알몸으로 수줍어하는 모습",
      triggerTags: ["nude", "intimate", "private", "shy"],
    };
  }
  if (scene === "sex_b" || scene === "sex_bg" || scene === "sex_nobg") {
    return {
      filename,
      sceneTag: scene,
      expression: "moaning",
      composition: "bust",
      pose: "lying",
      clothingTag: "naked",
      moodFit: ["horny", "loving", "teasing"],
      locationFit: ["bedroom"],
      nsfwLevel: 3,
      description: "친밀한 순간의 표정",
      triggerTags: ["intimate", "loving", "sex", "bedroom"],
    };
  }
  // fallback
  return {
    filename,
    sceneTag: scene,
    expression: "neutral",
    composition: "waist_up",
    pose: "standing",
    clothingTag: "dressed",
    moodFit: ["neutral"],
    locationFit: ["home"],
    nsfwLevel: 0,
    description: "기본 포즈",
    triggerTags: ["default"],
  };
}

const existing: Tags[] = JSON.parse(readFileSync(OUT, "utf-8"));
const done = new Set(existing.map((t) => t.filename));

const all = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".png"))
  .sort();

const missing = all.filter((f) => !done.has(f));
console.log(`Existing: ${existing.length}, Missing: ${missing.length}`);

const filled: Tags[] = missing.map(heuristicTags);
const merged = [...existing, ...filled];
merged.sort((a, b) => a.filename.localeCompare(b.filename));

writeFileSync(OUT, JSON.stringify(merged, null, 2), "utf-8");
console.log(`Wrote ${merged.length} total entries.`);
for (const t of filled) {
  console.log(
    `  ✓ ${t.filename}: ${t.expression}/${t.clothingTag} nsfw=${t.nsfwLevel}`,
  );
}
