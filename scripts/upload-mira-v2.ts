// Mira v2 업로더 — 382장(구판 82 + 신판 300) 전체를 DB 에 밀어 넣는다.
//
// 업로드 경로 규칙(Blob):
//   구판 그대로:   characters/mira/portrait.webp            (kind=portrait; char01_casual002.png)
//                  characters/mira/gallery/<stem>.webp      (kind=gallery)
//   신판 인물:     characters/mira/gallery/<stem>.webp      (kind=gallery)
//   신판 배경:     characters/mira/backgrounds/<stem>.webp  (kind=background)
//
// 구판 Blob URL 은 path 고정(addRandomSuffix=false, allowOverwrite=true) 이라
// 재업로드해도 동일 URL 로 덮여 쓰인다. Asset row 는 deleteMany + create 이므로
// row id 는 바뀌지만 Message.imageAssetId FK 는 onDelete:SetNull 이라 안전.
//
// 이미지 파이프:
//   portrait  → 768×1024 cover, WebP Q88
//   gallery   → 원본 비율 유지, 장변 1280, WebP Q85
//   background→ 원본 비율 유지, 장변 1280, WebP Q82 (backdrop 은 blur 로 깔려서 품질
//              살짝 낮아도 체감 안 됨; 용량 줄여 LCP 완화)

import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { ulid } from "ulid";
import { putAsset } from "../src/lib/assets/blob";

const SRC_DIR = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "char01",
);
const CATALOG = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "mira-catalog-v2.json",
);

type CatalogEntry = {
  filename: string;
  kind: "portrait" | "gallery" | "background";
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

const PORTRAIT_FILE = "char01_casual002.png";

const prisma = new PrismaClient();

type ProcessedImage = { body: Buffer; width: number; height: number };

async function processPortrait(fileBytes: Buffer): Promise<ProcessedImage> {
  const target = { w: 768, h: 1024 };
  const body = await sharp(fileBytes)
    .resize(target.w, target.h, { fit: "cover", position: "attention" })
    .webp({ quality: 88 })
    .toBuffer();
  return { body, width: target.w, height: target.h };
}

async function processGeneric(
  fileBytes: Buffer,
  quality: number,
): Promise<ProcessedImage> {
  const meta = await sharp(fileBytes).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;
  const maxLong = 1280;
  const long = Math.max(srcW, srcH);
  if (long <= maxLong) {
    const body = await sharp(fileBytes).webp({ quality }).toBuffer();
    return { body, width: srcW, height: srcH };
  }
  const scale = maxLong / long;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const body = await sharp(fileBytes).resize(w, h).webp({ quality }).toBuffer();
  return { body, width: w, height: h };
}

async function main() {
  const catalog: CatalogEntry[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".png"));
  const byName = new Map(catalog.map((c) => [c.filename, c]));

  if (catalog.length !== files.length) {
    throw new Error(
      `catalog(${catalog.length}) !== files(${files.length}) — regenerate v2 catalog first`,
    );
  }

  // 1) Character 존재 확인
  const character = await prisma.character.findUnique({
    where: { slug: "mira" },
    select: { id: true },
  });
  if (!character) {
    throw new Error(
      "Character 'mira' not found. Run upload-mira.ts first to bootstrap Character + PersonaCore.",
    );
  }
  const characterId = character.id;
  console.log(`[v2] target character mira (${characterId})`);

  // 2) 기존 Asset 전부 삭제 (멱등 재업로드)
  const before = await prisma.asset.count({ where: { characterId } });
  if (before > 0) {
    await prisma.character.update({
      where: { id: characterId },
      data: { portraitAssetId: null, heroAssetId: null },
    });
    await prisma.asset.deleteMany({ where: { characterId } });
    console.log(`[v2] removed ${before} existing assets`);
  }

  // 3) 업로드 루프
  let portraitAssetId: string | null = null;
  let idx = 0;

  // 정렬 순서: portrait → gallery → background
  //   gallery 내에서는 구판(char01_) 먼저, 신판(char0001_) 뒤. order 필드는 이 순서.
  const sorted = [...catalog].sort((a, b) => {
    const rank = (c: CatalogEntry) =>
      c.filename === PORTRAIT_FILE ? 0 : c.kind === "background" ? 2 : 1;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    // 같은 rank 내에서 filename 오름차순 (char01_ < char0001_)
    return a.filename.localeCompare(b.filename);
  });

  for (const entry of sorted) {
    idx++;
    const f = entry.filename;
    const isPortrait = f === PORTRAIT_FILE;
    const isBg = entry.kind === "background";
    const kind = isPortrait ? "portrait" : isBg ? "background" : "gallery";

    const orig = readFileSync(join(SRC_DIR, f));
    const processed = isPortrait
      ? await processPortrait(orig)
      : isBg
      ? await processGeneric(orig, 82)
      : await processGeneric(orig, 85);

    const stem = basename(f, ".png");
    const relPath = isPortrait
      ? "characters/mira/portrait.webp"
      : isBg
      ? `characters/mira/backgrounds/${stem}.webp`
      : `characters/mira/gallery/${stem}.webp`;

    const stored = await putAsset(relPath, processed.body, "image/webp");
    const assetId = ulid();

    // background 행에는 clothingTag/expression/pose 가 null — Prisma schema 에선
    // nullable 이므로 그대로 넘겨도 된다.
    await prisma.asset.create({
      data: {
        id: assetId,
        characterId,
        kind,
        blobUrl: stored.url,
        mimeType: "image/webp",
        width: processed.width,
        height: processed.height,
        order: isPortrait ? 0 : idx,
        sceneTag: entry.sceneTag,
        expression: entry.expression,
        composition: entry.composition,
        pose: entry.pose,
        clothingTag: entry.clothingTag,
        moodFit: entry.moodFit,
        locationFit: entry.locationFit,
        nsfwLevel: entry.nsfwLevel,
        description: entry.description,
        triggerTags: entry.triggerTags,
      },
    });

    if (isPortrait) portraitAssetId = assetId;
    console.log(
      `  [${idx}/${sorted.length}] ${kind === "portrait" ? "★" : kind === "background" ? "▣" : " "} ${relPath} (${processed.width}×${processed.height}, nsfw=${entry.nsfwLevel})`,
    );
  }

  if (portraitAssetId) {
    await prisma.character.update({
      where: { id: characterId },
      data: { portraitAssetId, heroAssetId: portraitAssetId },
    });
    console.log(`[v2] portraitAssetId=${portraitAssetId}`);
  } else {
    console.warn(`[v2] no portrait set — ${PORTRAIT_FILE} missing?`);
  }

  const counts = await prisma.asset.groupBy({
    by: ["kind"],
    where: { characterId },
    _count: true,
  });
  console.log(`\nDone. Asset counts:`);
  for (const c of counts) console.log(`  ${c.kind}: ${c._count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
