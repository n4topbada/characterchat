/**
 * Mira 애니 포트레이트를 Blob 에 올리고 animationUrl 갱신.
 *
 * 이전 버전은 asset ID 를 하드코딩했는데 portrait asset 이 재생성되면서 ID 가
 * 바뀌어 업데이트가 실패했다. 지금은 슬러그 → 현재 portrait asset 을 동적으로
 * 조회해서 그 ID 로 덮어쓴다.
 *
 * 로컬 파일: public/portraits/ani/<oldId>.webp — .gitignore 로 repo 에 없음.
 *   파일명은 과거 Blob 업로드 경로를 유지하기 위해 관리 디렉토리 상수로.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

const prisma = new PrismaClient();

const SLUG = process.argv[2] ?? "mira";

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || /placeholder/i.test(token)) {
    console.error("BLOB_READ_WRITE_TOKEN 이 .env.prod 에서 로드되지 않음");
    process.exit(1);
  }

  const character = await prisma.character.findUnique({
    where: { slug: SLUG },
    include: {
      assets: { where: { kind: "portrait" }, orderBy: { order: "asc" }, take: 1 },
    },
  });
  if (!character) {
    console.error(`character not found: slug=${SLUG}`);
    process.exit(1);
  }
  const portrait = character.assets[0];
  if (!portrait) {
    console.error(`portrait asset not found for ${SLUG}`);
    process.exit(1);
  }

  // ani 파일 후보: public/portraits/ani/ 아래 webp 파일들 중 첫 번째.
  const aniDir = resolve(process.cwd(), "public/portraits/ani");
  if (!existsSync(aniDir)) {
    console.error(`ani dir missing: ${aniDir}`);
    process.exit(1);
  }
  const files = readdirSync(aniDir).filter((f) => /\.webp$/i.test(f));
  if (files.length === 0) {
    console.error(`no .webp in ${aniDir}`);
    process.exit(1);
  }
  // slug 이름이 들어간 파일 우선, 없으면 첫 번째.
  const picked =
    files.find((f) => f.toLowerCase().includes(SLUG)) ?? files[0];
  const localPath = resolve(aniDir, picked);
  const buf = readFileSync(localPath);
  console.log(
    `local: ${picked} (${(buf.length / 1024).toFixed(0)}KB)  →  asset ${portrait.id}`,
  );

  // Blob 경로는 현재 asset ID 기준으로 재계산. 기존 파일명과 달라도 상관 없다.
  const key = `portraits/ani/${portrait.id}.webp`;
  const res = await put(key, buf, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  console.log(`uploaded: ${res.url}`);

  await prisma.asset.update({
    where: { id: portrait.id },
    data: { animationUrl: res.url },
  });
  console.log(`Asset.animationUrl 갱신 완료 (${portrait.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
