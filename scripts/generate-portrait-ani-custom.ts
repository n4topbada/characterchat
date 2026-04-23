/**
 * Veo safety 필터가 기본 모션 프롬프트에서도 거부하는 특정 포트레이트용
 * 보조 스크립트. `customPrompt` 로 "극히 미세한 idle" 만 요청한다.
 *
 *   npx tsx scripts/generate-portrait-ani-custom.ts ryu-ha-jin
 *
 * 기본 prompt 와의 차이:
 *   - "aroused / 유혹" 류의 뉘앙스 단어가 아예 없음
 *   - 눈 깜빡임 + 호흡 + 머리카락 미세 흔들림 셋으로 제한
 *   - "성적/강한 감정 추가 금지" 명시
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });
const prisma = new PrismaClient();

const SAFE_PROMPT = [
  "이 이미지의 인물에 아주 미세한 idle 모션만 추가하라.",
  "- 가벼운 눈 깜빡임 (2~3회).",
  "- 호흡에 따른 어깨의 느린 상하 움직임.",
  "- 머리카락 끝의 자연스런 미세한 흔들림.",
  "카메라는 완전히 고정. 인물의 자세·표정·의상·배경은 그대로 유지하라.",
  "성적 암시나 강한 감정 표현은 절대 추가하지 말 것.",
].join("\n");

async function main() {
  const slugs = process.argv.slice(2).filter((a) => a && !a.startsWith("--"));
  if (slugs.length === 0) {
    console.error("사용법: scripts/generate-portrait-ani-custom.ts <slug> [slug...]");
    process.exit(1);
  }
  const { collectPortraitAnimation } = await import("../src/lib/animate/stream");

  for (const slug of slugs) {
    console.log(`\n=== /${slug} ===`);
    const c = await prisma.character.findUnique({
      where: { slug },
      select: { portraitAssetId: true },
    });
    if (!c?.portraitAssetId) {
      console.error("  portrait 없음");
      continue;
    }
    try {
      const result = await collectPortraitAnimation({
        assetId: c.portraitAssetId,
        customPrompt: SAFE_PROMPT,
        force: true,
        onStage: (stage, detail) => {
          const t = new Date().toISOString().slice(11, 19);
          console.log(`  [${t}] ${stage}${detail ? ` · ${detail}` : ""}`);
        },
      });
      console.log(
        `  ✓ ${Math.round(result.bytes / 1024)}KB  ${result.animationUrl}`,
      );
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
