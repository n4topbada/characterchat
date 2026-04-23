/**
 * 특정 캐릭터의 포트레이트를 갤러리 안의 다른 자산으로 교체한다.
 * upload-character.ts 재실행 없이 기존 Asset 하나만 "promote" 한다.
 *
 * 동작:
 *   1. 현재 portraitAssetId / heroAssetId 를 null 로 내리고,
 *      이전 portrait Asset 이 있었다면 kind=gallery 로 강등.
 *   2. 지정한 target Asset 을 다운로드 → characters/{slug}/portrait.webp 로
 *      overwrite 업로드 → kind=portrait 로 승격 + blobUrl 갱신.
 *   3. Character.portraitAssetId / heroAssetId 를 target.id 로 세팅.
 *
 * 타깃 지정 — `--query` 로 (scene:expression:order) 또는 `--assetId`:
 *   npx tsx scripts/set-portrait.ts --slug seo-ah-jin \
 *     --query casual:angry:1
 *   # casual(=daily scene) / angry 표정 / order=1 인 asset 을 포트레이트로
 *
 *   npx tsx scripts/set-portrait.ts --slug seo-ah-jin \
 *     --assetId 01KPY94ARW4HE3A6761RDBB6DS
 */
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith(`${key}=`));
  return eq ? eq.slice(key.length + 1) : undefined;
}

const SLUG = arg("slug");
const QUERY = arg("query"); // scene:expression:order
const ASSET_ID = arg("assetId");
const APPLY = process.argv.includes("--apply");

if (!SLUG || (!QUERY && !ASSET_ID)) {
  console.error(
    "사용법: --slug <slug> ( --query <sceneTag:expression:order> | --assetId <id> ) [--apply]",
  );
  process.exit(1);
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || /placeholder/i.test(token)) {
    console.error("BLOB_READ_WRITE_TOKEN not set");
    process.exit(1);
  }

  const character = await prisma.character.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true, portraitAssetId: true },
  });
  if (!character) {
    console.error(`character not found: /${SLUG}`);
    process.exit(1);
  }

  let target;
  if (ASSET_ID) {
    target = await prisma.asset.findUnique({ where: { id: ASSET_ID } });
  } else {
    const [sceneTag, expression, orderStr] = QUERY!.split(":");
    const order = parseInt(orderStr, 10);
    target = await prisma.asset.findFirst({
      where: {
        characterId: character.id,
        sceneTag,
        expression,
        order,
      },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!target) {
    console.error(`target asset not found for query=${QUERY ?? ASSET_ID}`);
    process.exit(1);
  }
  console.log(
    `Target: asset ${target.id}  (scene=${target.sceneTag}, expr=${target.expression}, order=${target.order})`,
  );
  console.log(`Current portraitAssetId: ${character.portraitAssetId}`);
  console.log(`Current target.kind: ${target.kind}, blobUrl: ${target.blobUrl}`);

  if (!APPLY) {
    console.log("\n--apply 로 실제 수행.");
    return;
  }

  // 1) 원본 다운로드
  const srcRes = await fetch(target.blobUrl);
  if (!srcRes.ok) {
    console.error(`download failed: ${srcRes.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await srcRes.arrayBuffer());
  console.log(`downloaded: ${Math.round(buf.length / 1024)}KB`);

  // 2) portrait.webp 로 overwrite 업로드 (docs/11-assets.md §4)
  const relPath = `characters/${SLUG}/portrait.webp`;
  const stored = await put(relPath, buf, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  console.log(`uploaded portrait.webp: ${stored.url}`);

  // 3) DB 업데이트 — 기존 portrait 을 gallery 로 강등, target 을 portrait 으로 승격
  await prisma.$transaction(async (tx) => {
    if (
      character.portraitAssetId &&
      character.portraitAssetId !== target!.id
    ) {
      await tx.asset.updateMany({
        where: {
          id: character.portraitAssetId,
          kind: "portrait",
        },
        data: { kind: "gallery" },
      });
    }
    await tx.asset.update({
      where: { id: target!.id },
      data: {
        kind: "portrait",
        blobUrl: stored.url,
        order: 0, // portrait 은 order 0 관례
      },
    });
    await tx.character.update({
      where: { id: character.id },
      data: {
        portraitAssetId: target!.id,
        heroAssetId: target!.id,
      },
    });
  });

  console.log(
    `\n✓ /${SLUG} portrait = ${target.id} (scene=${target.sceneTag}, expr=${target.expression})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
