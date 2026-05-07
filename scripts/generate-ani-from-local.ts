/**
 * 로컬 소스 PNG 로부터 Veo 3.1 Lite 애니메이션 생성 → Blob 업로드 → DB 갱신.
 *
 * 왜 별도 스크립트:
 *   `scripts/generate-portrait-ani.ts` 는 `Asset.blobUrl` 공개 URL 을 fetch 해
 *   Veo 입력으로 쓴다. 그런데 Vercel Blob public 접근이 일시적으로 막히면
 *   ("Your store is blocked") 그 경로가 통째로 실패한다. 로컬 원본 PNG 가
 *   `asset/charNNNN/<filename>.png` 에 있으면 그걸 읽어 같은 결과를 만든다.
 *
 * 사용:
 *   npx tsx scripts/generate-ani-from-local.ts \
 *     --slug do-yu-han --src char0002 --file char0002_home_aroused_sfw_0072.png
 *
 * 동작:
 *   1. .env.prod 로드 (BLOB_READ_WRITE_TOKEN 필요)
 *   2. 슬러그로 Character 조회 + portraitAssetId 의 Asset 행 조회
 *   3. 로컬 원본 PNG 를 sharp 768x1024 cover-crop webp 로 (Veo 입력 정렬)
 *   4. Veo 호출 → mp4 → ffmpeg 540x810 Q75 12fps animated webp
 *   5. Blob 업로드(`portraits/ani/<assetId>.webp`) + Asset.animationUrl 갱신
 *
 * 주의: ffmpeg 바이너리가 PATH 에 있어야 한다 (Windows 의 경우 Chocolatey 또는
 *       포터블 빌드). 메인 generate-portrait-ani 와 동일 의존성.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { config as loadEnv } from "dotenv";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { mp4ToAnimatedWebp, ANIMATION_SPEC } from "../src/lib/animate/ffmpeg";

loadEnv({ path: resolve(process.cwd(), ".env.prod"), override: true });

const VEO_MODEL = "veo-3.1-lite-generate-preview";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_COUNT = 36;

const BASE_MOTION_PROMPT = [
  "이미지에 어울리는 동적 요소를 idle, looping 모션으로 제작하라.",
  "(예시: 머리카락·옷자락의 미세한 휘날림, 눈 깜빡임, 호흡에 따른 어깨 움직임,",
  " 미세한 입꼬리/눈매 움직임, 시선의 짧은 좌우)",
  "구도/카메라 컷 전환 금지. 인물 정체성·외형·옷·배경·색감은 유지.",
  "성적 동작/강한 감정 동작 금지. 안전하고 부드러운 idle.",
].join("\n");

function arg(name: string, fallback?: string): string | undefined {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith(`${key}=`));
  if (eq) return eq.slice(key.length + 1);
  return fallback;
}

async function processSource(bytes: Buffer): Promise<{ data: Buffer; mime: string }> {
  // Veo 입력은 portrait 와 동일 spec 으로 정렬 — 768x1024 cover-crop webp.
  const out = await sharp(bytes)
    .resize(768, 1024, { fit: "cover", position: "attention" })
    .webp({ quality: 88 })
    .toBuffer();
  return { data: out, mime: "image/webp" };
}

async function main() {
  const slug = arg("slug");
  const src = arg("src");
  const file = arg("file");
  if (!slug || !src || !file) {
    console.error("사용법: --slug <slug> --src <asset-dir> --file <portrait-filename>");
    process.exit(1);
  }
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!apiKey) {
    console.error("GOOGLE_GENAI_API_KEY 없음");
    process.exit(1);
  }
  if (!blobToken || /placeholder/i.test(blobToken)) {
    console.error("BLOB_READ_WRITE_TOKEN 없음");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const character = await prisma.character.findUnique({
      where: { slug },
      select: { id: true, name: true, portraitAssetId: true },
    });
    if (!character?.portraitAssetId) {
      console.error(`/${slug} portrait 없음`);
      process.exit(1);
    }
    const asset = await prisma.asset.findUnique({
      where: { id: character.portraitAssetId },
      select: { id: true, animationUrl: true, kind: true },
    });
    if (!asset || asset.kind !== "portrait") {
      console.error(`portrait asset 비정상`);
      process.exit(1);
    }

    const localPath = resolve(process.cwd(), "asset", src, file);
    if (!existsSync(localPath)) {
      console.error(`로컬 원본 없음: ${localPath}`);
      process.exit(1);
    }
    console.log(`[${character.name}] asset ${asset.id} ← ${file}`);

    // 1) 원본 처리
    const raw = readFileSync(localPath);
    const { data: srcBuf, mime: srcMime } = await processSource(raw);
    console.log(`  source webp: ${(srcBuf.length / 1024).toFixed(0)}KB ${srcMime}`);

    // 2) Veo 호출
    const ai = new GoogleGenAI({ apiKey });
    console.log(`  Veo 호출…`);
    const startedAt = Date.now();
    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: BASE_MOTION_PROMPT,
      image: { imageBytes: srcBuf.toString("base64"), mimeType: srcMime },
      config: {
        numberOfVideos: 1,
        aspectRatio: "9:16",
        resolution: "720p",
        durationSeconds: 6,
      },
    });

    let pollCount = 0;
    while (!operation.done) {
      if (pollCount >= MAX_POLL_COUNT) throw new Error("veo_timeout");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      operation = await ai.operations.getVideosOperation({ operation });
      pollCount++;
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      process.stdout.write(`  poll ${pollCount}  +${elapsed}s ...\r`);
    }
    console.log("");
    const generated = (operation.response as { generatedVideos?: { video?: { uri?: string } }[] } | undefined)
      ?.generatedVideos?.[0]?.video?.uri;
    if (!generated) throw new Error("veo_no_result");
    const dlUrl = `${generated}${generated.includes("?") ? "&" : "?"}key=${apiKey}`;
    const mp4Resp = await fetch(dlUrl);
    if (!mp4Resp.ok) throw new Error(`mp4_download_failed:${mp4Resp.status}`);
    const mp4 = Buffer.from(await mp4Resp.arrayBuffer());
    console.log(`  mp4: ${(mp4.length / 1024).toFixed(0)}KB`);

    // 3) ffmpeg → animated webp
    console.log(`  ffmpeg → animated webp (${ANIMATION_SPEC.width}x${ANIMATION_SPEC.height} q${ANIMATION_SPEC.quality} ${ANIMATION_SPEC.fps}fps)…`);
    const aniWebp = await mp4ToAnimatedWebp(mp4);
    console.log(`  ani webp: ${(aniWebp.length / 1024).toFixed(0)}KB`);

    // 4) 로컬 보관 — Blob 이 막혀 있어도 결과를 잃지 않게.
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const stashDir = resolve(process.cwd(), "asset", "_ani_stash");
    mkdirSync(stashDir, { recursive: true });
    const stashPath = join(stashDir, `${asset.id}.webp`);
    writeFileSync(stashPath, aniWebp);
    console.log(`  로컬 stash: ${stashPath}`);

    // 5) Blob 업로드
    const blobKey = `portraits/ani/${asset.id}.webp`;
    let uploadedUrl: string | null = null;
    try {
      const result = await put(blobKey, aniWebp, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: blobToken,
      });
      uploadedUrl = result.url;
      console.log(`  uploaded: ${result.url}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  ⚠ Blob 업로드 실패: ${msg}`);
      console.warn(`    로컬 stash 는 남아 있다(${stashPath}). Blob 정상화 후`);
      console.warn(`    scripts/upload-stashed-ani.ts 로 일괄 재업로드.`);
    }

    // 6) DB 갱신 (업로드 성공 시에만)
    if (uploadedUrl) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { animationUrl: uploadedUrl },
      });
      console.log(`  Asset.animationUrl 갱신 완료.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
