/**
 * 헤드리스 단위 테스트 — pickAsset 의 naked → sex 전환 회귀.
 *
 * 사고 시나리오: 캐릭터가 outfit=naked 으로 진입한 직후 LLM 이 본문에서 명시적
 * 성행위 묘사를 시작했다. 이때 sex_* sceneTag 자산이 picker 에서 도태되어
 * naked 정지컷이 계속 선택되던 버그가 있었다.
 *
 * 이 스크립트는 DB 도 Gemini 도 부르지 않고 pickAsset 모듈만 import 해
 * 합성 자산 세트로 점수를 계산한다. exit code 가 0 이면 회귀 없음.
 *
 *   npx tsx scripts/test-pick-naked-to-sex.ts
 */
import { pickBestAsset, scoreAsset } from "../src/lib/assets/pickAsset";

type TestAsset = {
  id: string;
  blobUrl: string;
  width: number;
  height: number;
  sceneTag: string | null;
  expression: string | null;
  composition: string | null;
  pose: string | null;
  clothingTag: string | null;
  moodFit: string[];
  locationFit: string[];
  nsfwLevel: number;
  description: string | null;
  triggerTags: string[];
  kind: "gallery" | "portrait" | "hero" | "background";
};

function asset(over: Partial<TestAsset>): TestAsset {
  return {
    id: over.id ?? "X",
    blobUrl: "",
    width: 832,
    height: 1216,
    sceneTag: null,
    expression: null,
    composition: null,
    pose: null,
    clothingTag: null,
    moodFit: [],
    locationFit: [],
    nsfwLevel: 0,
    description: null,
    triggerTags: [],
    kind: "gallery",
    ...over,
  };
}

let failures = 0;
function assertEq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
    failures++;
  }
}

// ── case 1 ─────────────────────────────────────────────────────────
// outfit=naked + body 키워드(=sex) 가 함께 들어오면 sex_* 자산이
// naked 정지컷보다 우선 선택돼야 한다.
console.log("\n[case 1] naked + 'sex' 본문 키워드 → sex_* 우선");
{
  const naked = asset({
    id: "naked_still",
    sceneTag: "naked",
    clothingTag: "naked",
    expression: "seductive",
    nsfwLevel: 2,
    moodFit: ["horny", "teasing"],
    locationFit: ["bedroom", "home"],
    triggerTags: ["naked", "aroused"],
  });
  const sexNaked = asset({
    id: "sex_naked",
    sceneTag: "sex_naked",
    clothingTag: "naked",
    expression: "seductive",
    nsfwLevel: 3,
    moodFit: ["horny", "teasing", "aroused"],
    locationFit: ["bedroom", "home"],
    triggerTags: ["sex", "naked", "bedroom"],
  });
  const tokens = ["naked", "horny", "bedroom", "sex"];
  const ctx = { nsfwEnabled: true, horny: 35, affection: 60 };
  const sNaked = scoreAsset(naked, tokens, ctx);
  const sSex = scoreAsset(sexNaked, tokens, ctx);
  console.log(`  naked score=${sNaked}  sex_naked score=${sSex}`);
  assertEq("sex_naked > naked", sSex > sNaked, true);
  const winner = pickBestAsset([naked, sexNaked], tokens, ctx);
  assertEq("picker chooses sex_naked", winner?.id, "sex_naked");
}

// ── case 2 ─────────────────────────────────────────────────────────
// horny 가 낮아도 sex 의도가 명시되면 NSFW 페널티 면제로 sex_* 가 살아남는다.
console.log("\n[case 2] horny=10 + sex 명시 → sex_* 페널티 면제");
{
  const naked = asset({
    id: "naked_still",
    sceneTag: "naked",
    clothingTag: "naked",
    nsfwLevel: 2,
    locationFit: ["bedroom"],
  });
  const sexNaked = asset({
    id: "sex_naked",
    sceneTag: "sex_naked",
    clothingTag: "naked",
    nsfwLevel: 3,
    locationFit: ["bedroom"],
  });
  const tokens = ["naked", "sex", "bedroom"];
  const ctx = { nsfwEnabled: true, horny: 10, affection: 30 };
  const winner = pickBestAsset([naked, sexNaked], tokens, ctx);
  assertEq("picker chooses sex_naked despite horny=10", winner?.id, "sex_naked");
}

// ── case 3 ─────────────────────────────────────────────────────────
// sex 의도가 없을 때 nsfwLevel=3 자산은 horny<40 이면 페널티 그대로 유지.
console.log("\n[case 3] horny=20, sex 의도 없음 → 페널티 유지");
{
  const naked = asset({
    id: "naked_still",
    sceneTag: "naked",
    clothingTag: "naked",
    nsfwLevel: 2,
    locationFit: ["bedroom"],
  });
  const sexNaked = asset({
    id: "sex_naked",
    sceneTag: "sex_naked",
    clothingTag: "naked",
    nsfwLevel: 3,
    locationFit: ["bedroom"],
  });
  // tokens 에 "sex" 없음 — outfit=naked 만
  const tokens = ["naked", "bedroom", "calm"];
  const ctx = { nsfwEnabled: true, horny: 20, affection: 30 };
  const sNaked = scoreAsset(naked, tokens, ctx);
  const sSex = scoreAsset(sexNaked, tokens, ctx);
  console.log(`  naked score=${sNaked}  sex_naked score=${sSex}`);
  assertEq("naked >= sex_naked (no intent)", sNaked >= sSex, true);
}

// ── case 4 ─────────────────────────────────────────────────────────
// nude / naked sceneTag 동의어 정상 매칭 — char0002 재업로드 회귀 방지.
console.log("\n[case 4] outfit=naked 토큰 → sceneTag=nude 자산 매칭");
{
  const nude = asset({
    id: "nude_still",
    sceneTag: "nude",
    clothingTag: "naked",
    nsfwLevel: 1,
  });
  const dressed = asset({
    id: "dressed",
    sceneTag: "home",
    clothingTag: "dressed",
    nsfwLevel: 0,
  });
  const tokens = ["naked", "home"];
  const ctx = { nsfwEnabled: true, horny: 20 };
  const winner = pickBestAsset([nude, dressed], tokens, ctx);
  assertEq("nude beats dressed when token=naked", winner?.id, "nude_still");
}

// ── case 5 ─────────────────────────────────────────────────────────
// nsfwEnabled=false 인 캐릭터(15금)는 sex_* 자산이 -Infinity 로 제외.
console.log("\n[case 5] nsfwEnabled=false → nsfw 자산 강제 배제");
{
  const sexNaked = asset({
    id: "sex_naked",
    sceneTag: "sex_naked",
    clothingTag: "naked",
    nsfwLevel: 3,
  });
  const home = asset({
    id: "home_dress",
    sceneTag: "home",
    clothingTag: "dressed",
    nsfwLevel: 0,
  });
  const tokens = ["sex", "naked"];
  const ctx = { nsfwEnabled: false, horny: 80 };
  const winner = pickBestAsset([sexNaked, home], tokens, ctx);
  // sex_naked 는 -Infinity, home 도 점수 ≤0 일 가능성 → null 또는 home
  assertEq(
    "winner is home or null (never sex_*)",
    winner?.id !== "sex_naked",
    true,
  );
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
