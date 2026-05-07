/**
 * Blob 정상화 후 — `asset/_ani_stash/<assetId>.webp` 의 모든 파일을 Blob 에
 * 업로드하고 해당 Asset.animationUrl 을 갱신.
 *
 * generate-ani-from-local.ts 가 Blob 업로드 실패 시 webp 를 stash 폴더에
 * 떨어뜨려 두기 때문에, Vercel 에서 store 가 unblock 된 뒤 이 스크립트를
 * 한 번 돌리면 모든 ani 가 정상 등록된다.
 *
 *   npx tsx scripts/upload-stashed-ani.ts          # dry-run
 *   npx tsx scripts/upload-stashed-ani.ts --apply  # 실제 업로드 + DB 갱신
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";

loadEnv({ path: resolve(process.cwd(), ".env.prod"), override: true });

const APPLY = process.argv.includes("--apply");

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || /placeholder/i.test(token)) {
    console.error("BLOB_READ_WRITE_TOKEN 없음");
    process.exit(1);
  }
  const stashDir = resolve(process.cwd(), "asset", "_ani_stash");
  let files: string[];
  try {
    files = readdirSync(stashDir).filter((f) => /\.webp$/i.test(f));
  } catch {
    console.log("stash 디렉토리 없음 — 처리할 파일 없음.");
    return;
  }
  if (files.length === 0) {
    console.log("stash 비어 있음.");
    return;
  }

  const prisma = new PrismaClient();
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`stash 파일 ${files.length} 개:`);

  for (const f of files) {
    const assetId = f.replace(/\.webp$/i, "");
    const buf = readFileSync(resolve(stashDir, f));
    const sizeKb = (buf.length / 1024).toFixed(0);
    const a = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, characterId: true, kind: true },
    });
    if (!a) {
      console.warn(`  [SKIP] ${assetId} — DB 에 없음`);
      continue;
    }
    if (a.kind !== "portrait") {
      console.warn(`  [SKIP] ${assetId} — kind=${a.kind} (portrait 아님)`);
      continue;
    }
    const key = `portraits/ani/${assetId}.webp`;
    if (!APPLY) {
      console.log(`  [DRY] ${assetId}  ${sizeKb}KB  →  blob:${key}`);
      continue;
    }
    try {
      const res = await put(key, buf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: true,
        token,
      });
      await prisma.asset.update({
        where: { id: assetId },
        data: { animationUrl: res.url },
      });
      console.log(`  [OK ] ${assetId}  ${sizeKb}KB  →  ${res.url}`);
    } catch (e) {
      console.error(
        `  [ERR] ${assetId}  ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  await prisma.$disconnect();
  if (!APPLY) console.log("\n--apply 플래그로 실제 실행.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
