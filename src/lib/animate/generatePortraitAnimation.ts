// portrait 애니메이션 생성 오케스트레이터.
//
// Asset.id 또는 (characterId, kind=portrait) 로 원본을 찾아:
//   1) blobUrl 에서 원본 이미지 다운로드
//   2) Veo 3.1 Lite 로 6초 모션 비디오 생성 (9:16 720p)
//   3) ffmpeg 으로 540x810 Q75 12fps animated webp 로 변환
//   4) Vercel Blob 에 `portraits/ani/{assetId}.webp` 로 업로드
//   5) Asset.animationUrl 업데이트
//
// Vercel 런타임에는 ffmpeg 이 없으므로 이 함수는 "로컬 스크립트" 혹은
// "ffmpeg 을 포함한 별도 워커" 에서만 실행해야 한다. 프론트에서 직접 호출하지 말 것.

import { prisma } from "@/lib/db";
import { putAsset } from "@/lib/assets/blob";
import { generatePortraitVideo } from "./veo";
import { mp4ToAnimatedWebp, ANIMATION_SPEC } from "./ffmpeg";

export type AnimateOptions = {
  assetId: string;
  // 모델 프롬프트 보강용 — null 이면 DB 에서 character.tagline 등을 조회해 자동 구성.
  characterContext?: string | null;
  customPrompt?: string | null;
  // 이미 animationUrl 이 있어도 다시 생성할지. 기본 false.
  force?: boolean;
  // 진행 로그 훅.
  onStage?: (stage: string, detail?: string) => void;
};

export type AnimateResult = {
  assetId: string;
  animationUrl: string;
  bytes: number;
  spec: typeof ANIMATION_SPEC;
  reused?: boolean;
};

export async function generatePortraitAnimation(
  opts: AnimateOptions,
): Promise<AnimateResult> {
  const log = opts.onStage ?? (() => {});

  const asset = await prisma.asset.findUnique({
    where: { id: opts.assetId },
    include: { character: true },
  });
  if (!asset) throw new Error(`asset_not_found:${opts.assetId}`);
  if (asset.kind !== "portrait") {
    throw new Error(`asset_not_portrait:${asset.kind}`);
  }

  if (asset.animationUrl && !opts.force) {
    log("reuse", asset.animationUrl);
    return {
      assetId: asset.id,
      animationUrl: asset.animationUrl,
      bytes: 0,
      spec: ANIMATION_SPEC,
      reused: true,
    };
  }

  // 1) 원본 이미지 다운로드
  log("download", asset.blobUrl);
  const srcRes = await fetch(asset.blobUrl);
  if (!srcRes.ok) {
    throw new Error(`portrait_download_failed:${srcRes.status}`);
  }
  const srcBuf = Buffer.from(await srcRes.arrayBuffer());
  const srcMime = srcRes.headers.get("content-type") || asset.mimeType || "image/png";

  // 2) Veo 비디오 생성
  const context = opts.characterContext ?? buildContextFromCharacter(asset.character);
  log("veo_start");
  const { mp4, prompt } = await generatePortraitVideo({
    imageBase64: srcBuf.toString("base64"),
    mimeType: srcMime,
    characterContext: context,
    customPrompt: opts.customPrompt ?? null,
    onPoll: (sec) => log("veo_poll", `${sec}s`),
  });
  log("veo_done", `${Math.round(mp4.length / 1024)}KB / prompt ${prompt.length}ch`);

  // 3) animated webp 변환
  log("ffmpeg_start");
  const webpBuf = await mp4ToAnimatedWebp(mp4);
  log("ffmpeg_done", `${Math.round(webpBuf.length / 1024)}KB`);

  // 4) Vercel Blob 업로드
  const relPath = `portraits/ani/${asset.id}.webp`;
  log("upload", relPath);
  const stored = await putAsset(relPath, webpBuf, "image/webp");

  // 5) DB 업데이트
  await prisma.asset.update({
    where: { id: asset.id },
    data: { animationUrl: stored.url },
  });

  log("done", stored.url);

  return {
    assetId: asset.id,
    animationUrl: stored.url,
    bytes: webpBuf.length,
    spec: ANIMATION_SPEC,
  };
}

function buildContextFromCharacter(character: {
  name: string;
  tagline: string;
  accentColor?: string | null;
} | null): string | null {
  if (!character) return null;
  const lines: string[] = [];
  if (character.name) lines.push(`이름: ${character.name}`);
  if (character.tagline) lines.push(`설명: ${character.tagline}`);
  return lines.join("\n") || null;
}

/**
 * 여러 asset 을 순차 실행. fire-and-forget 백그라운드 러너용.
 * 실패한 항목은 result.failed 에 모아서 리턴.
 */
export async function generatePortraitAnimationsSequential(
  assetIds: string[],
  opts?: Omit<AnimateOptions, "assetId">,
): Promise<{
  succeeded: AnimateResult[];
  failed: Array<{ assetId: string; error: string }>;
}> {
  const succeeded: AnimateResult[] = [];
  const failed: Array<{ assetId: string; error: string }> = [];
  for (const assetId of assetIds) {
    try {
      const r = await generatePortraitAnimation({ ...opts, assetId });
      succeeded.push(r);
    } catch (e) {
      failed.push({
        assetId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { succeeded, failed };
}
