/**
 * 여러 캐릭터의 포트레이트에 대해 Veo 3.1 Lite 로 애니메이션을 생성한 뒤
 * `Asset.animationUrl` 에 등록한다. 한 캐릭터당 3~4분 소요(Veo 폴링).
 *
 *   npx tsx scripts/generate-portrait-ani.ts ryu-ha-jin seo-ah-jin
 *
 * 기존 animationUrl 이 있어도 재생성하려면 `--force` 플래그.
 *
 * 파이프라인 단일화: src/lib/animate/stream.ts 의 collectPortraitAnimation()
 * 을 그대로 호출 → Veo 모델, ffmpeg 540x810 Q75 12fps, Blob key
 * `portraits/ani/{assetId}.webp` 가 모두 자동.
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  const slugs = process.argv
    .slice(2)
    .filter((a) => a && !a.startsWith("--"));
  if (slugs.length === 0) {
    console.error("사용법: scripts/generate-portrait-ani.ts <slug> [slug...] [--force]");
    process.exit(1);
  }

  // 동적 import — src/lib/animate/stream.ts 가 @/ alias 를 쓰므로 tsx 런타임
  // 경로 설정이 잡힌 뒤 로드해야 한다.
  const { collectPortraitAnimation } = await import(
    "../src/lib/animate/stream"
  );

  for (const slug of slugs) {
    console.log(`\n=== /${slug} ===`);
    const character = await prisma.character.findUnique({
      where: { slug },
      select: { id: true, name: true, portraitAssetId: true, tagline: true },
    });
    if (!character) {
      console.error(`  character not found`);
      continue;
    }
    if (!character.portraitAssetId) {
      console.error(`  portraitAssetId 없음 — 먼저 포트레이트를 설정하라`);
      continue;
    }
    const asset = await prisma.asset.findUnique({
      where: { id: character.portraitAssetId },
      select: { id: true, kind: true, animationUrl: true },
    });
    if (!asset) {
      console.error(`  portrait asset not found`);
      continue;
    }
    if (asset.kind !== "portrait") {
      console.error(`  asset.kind = ${asset.kind} (expected 'portrait')`);
      continue;
    }
    if (asset.animationUrl && !force) {
      console.log(`  이미 animationUrl 존재: ${asset.animationUrl}`);
      console.log(`  --force 로 재생성`);
      continue;
    }

    console.log(
      `  asset ${asset.id} — Veo 호출 시작 (3~4분 소요 예상). 10초마다 하트비트.`,
    );
    try {
      const result = await collectPortraitAnimation({
        assetId: asset.id,
        force,
        onStage: (stage, detail) => {
          const t = new Date().toISOString().slice(11, 19);
          console.log(`  [${t}] ${stage}${detail ? ` · ${detail}` : ""}`);
        },
      });
      console.log(
        `  ✓ ${result.reused ? "reused" : "new"}  ${Math.round(
          result.bytes / 1024,
        )}KB  ${result.animationUrl}`,
      );
    } catch (e) {
      console.error(`  ✗ failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
