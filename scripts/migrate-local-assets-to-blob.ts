/**
 * 로컬 경로(`/characters/...`, `/portraits/...`)로 저장된 Asset 행을 Vercel Blob 으로
 * 업로드하고 DB 의 blobUrl / animationUrl 을 원격 URL 로 갱신한다.
 *
 * 배경:
 *   dev 에선 BLOB_READ_WRITE_TOKEN=placeholder 라 `putAsset` 이 public/ 파일시스템에
 *   저장하고 DB blobUrl 엔 "/characters/mira/gallery/xxx.webp" 같은 로컬 경로가 박힌다.
 *   dev + prod 가 같은 Neon DB 를 쓰므로 prod 도 이 경로를 그대로 받아 SSE 로 내보내는데,
 *   Vercel 번들엔 그 webp 들이 git 제외(gitignore) 되어 있어 404 가 된다.
 *
 * 이 스크립트:
 *   1. .env.prod 로드 (BLOB_READ_WRITE_TOKEN 필요)
 *   2. blobUrl 이 "/" 로 시작하는 모든 Asset, animationUrl 이 "/" 로 시작하는 모든 Asset 을 대상
 *   3. public/<path> 에서 파일 읽어 Vercel Blob 에 put (원 경로 그대로 key 로 사용)
 *   4. 반환된 공개 URL 로 해당 컬럼 UPDATE
 *
 * 사용법:
 *   npx tsx scripts/migrate-local-assets-to-blob.ts         # dry-run, 변경 없음
 *   npx tsx scripts/migrate-local-assets-to-blob.ts --apply # 실제 업로드 + DB 갱신
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

function contentTypeFor(url: string): string {
  if (/\.webp$/i.test(url)) return "image/webp";
  if (/\.png$/i.test(url)) return "image/png";
  if (/\.jpe?g$/i.test(url)) return "image/jpeg";
  return "application/octet-stream";
}

async function uploadOne(
  assetId: string,
  column: "blobUrl" | "animationUrl",
  localUrl: string,
  token: string,
): Promise<string | null> {
  // "/characters/mira/gallery/x.webp" → public/characters/mira/gallery/x.webp
  const rel = localUrl.replace(/^\/+/, "");
  const localFile = resolve(process.cwd(), "public", rel);
  if (!existsSync(localFile)) {
    console.warn(
      `  [MISS] asset=${assetId} col=${column} local file not found: ${localFile}`,
    );
    return null;
  }
  const buf = readFileSync(localFile);
  const key = rel; // 원 경로 그대로 Blob key (예: "characters/mira/gallery/x.webp")
  const type = contentTypeFor(localUrl);
  if (!APPLY) {
    console.log(
      `  [DRY] ${column} asset=${assetId}  ${localUrl}  →  blob:${key} (${(buf.length / 1024).toFixed(0)}KB, ${type})`,
    );
    return null;
  }
  const res = await put(key, buf, {
    access: "public",
    contentType: type,
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  console.log(
    `  [OK ] ${column} asset=${assetId}  ${localUrl}  →  ${res.url}`,
  );
  return res.url;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || /placeholder/i.test(token)) {
    console.error(
      "BLOB_READ_WRITE_TOKEN 이 .env.prod 에서 로드되지 않았다. 중단.",
    );
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? "APPLY (업로드 + DB UPDATE)" : "DRY-RUN"}`);

  // blobUrl 이 로컬 경로
  const blobLocal = await prisma.asset.findMany({
    where: { blobUrl: { startsWith: "/" } },
    select: {
      id: true,
      characterId: true,
      kind: true,
      blobUrl: true,
      animationUrl: true,
    },
  });
  // animationUrl 이 로컬 경로 (blobLocal 과 별도로 포함될 수 있음)
  const aniLocal = await prisma.asset.findMany({
    where: { animationUrl: { startsWith: "/" } },
    select: { id: true, blobUrl: true, animationUrl: true },
  });
  console.log(
    `대상: blobUrl=${blobLocal.length}개 / animationUrl=${aniLocal.length}개`,
  );

  let blobOk = 0,
    blobMiss = 0;
  for (const a of blobLocal) {
    const newUrl = await uploadOne(a.id, "blobUrl", a.blobUrl, token);
    if (!APPLY) {
      blobOk++;
      continue;
    }
    if (newUrl) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { blobUrl: newUrl },
      });
      blobOk++;
    } else {
      blobMiss++;
    }
  }

  let aniOk = 0,
    aniMiss = 0;
  for (const a of aniLocal) {
    if (!a.animationUrl) continue;
    const newUrl = await uploadOne(a.id, "animationUrl", a.animationUrl, token);
    if (!APPLY) {
      aniOk++;
      continue;
    }
    if (newUrl) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { animationUrl: newUrl },
      });
      aniOk++;
    } else {
      aniMiss++;
    }
  }

  console.log(
    `\n요약: blobUrl ok=${blobOk} miss=${blobMiss} / animationUrl ok=${aniOk} miss=${aniMiss}`,
  );
  if (!APPLY) {
    console.log("\n실제 적용하려면 `--apply` 플래그로 다시 실행.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
