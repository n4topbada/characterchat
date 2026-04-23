/**
 * asset/ 하위 파일명 정규화(canonicalize).
 *
 * 문제: 원본 파일명에 오타가 섞여 있어 자동 분류가 어렵다.
 *   char0002_gym_emarrassed_sfw_*.png     (emarrassed: r/ra 누락)
 *   char0002_home_embrrassed_sfw_*.png    (embrrassed: b/r 중복)
 *   → 모두 "embarrassed" 로 통일.
 *
 * 방침:
 *   - 에셋 원본 디렉토리(asset/char0002/, asset/char0003/) 에서 rename 수행
 *   - ordinal 은 건드리지 않아 파일 개수/정렬 순서 유지
 *   - dry-run 기본, `--apply` 플래그에서만 실제 rename
 *
 * 사용:
 *   npx tsx scripts/asset-canonicalize.ts
 *   npx tsx scripts/asset-canonicalize.ts --apply
 */
import { readdirSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = resolve(process.cwd(), "asset");

// 알려진 오타 → 정규 스펠링 매핑. 발견되면 추가.
const TYPO_FIX: Array<[RegExp, string]> = [
  [/_emarrassed_/g, "_embarrassed_"], // char0002_gym_emarrassed_*
  [/_embrrassed_/g, "_embarrassed_"], // char0002_home_embrrassed_*
];

type RenamePlan = { from: string; to: string; dir: string };

function planFor(dir: string): RenamePlan[] {
  if (!existsSync(dir)) return [];
  const plans: RenamePlan[] = [];
  for (const f of readdirSync(dir)) {
    let next = f;
    for (const [re, rep] of TYPO_FIX) next = next.replace(re, rep);
    if (next !== f) plans.push({ from: f, to: next, dir });
  }
  return plans;
}

function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const dirs = ["char0002", "char0003", "char01"]
    .map((d) => join(ROOT, d))
    .filter(existsSync);

  let total = 0;
  for (const d of dirs) {
    const plan = planFor(d);
    if (plan.length === 0) {
      console.log(`${d}: no typos`);
      continue;
    }
    console.log(`${d}: ${plan.length} rename(s)`);
    for (const p of plan) {
      console.log(`  ${p.from}  →  ${p.to}`);
      if (APPLY) renameSync(join(p.dir, p.from), join(p.dir, p.to));
    }
    total += plan.length;
  }
  console.log(`\nTotal: ${total}`);
  if (!APPLY) console.log("--apply 플래그로 실제 수행.");
}

main();
