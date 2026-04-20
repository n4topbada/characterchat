// src/lib/animate/stream.ts
//
// portrait 애니메이션 생성 Agent — 스트리밍 버전.
//
// generatePortraitAnimation() 의 오케스트레이션을 AsyncGenerator 로 풀어
// 각 단계를 SSE 이벤트로 흘릴 수 있게 한다. 스크립트(local cli)와 관리자
// API(POST /api/admin/assets/:id/animate) 가 둘 다 같은 파이프라인을 타도록
// 여기서 "단일 권위 경로" 를 유지한다.
//
// 입력(StreamAnimationInputs):
//   - assetId: 애니메이션을 붙일 portrait Asset id
//   - characterContext?: 모션 프롬프트 보강용 (없으면 character.tagline 로 자동 구성)
//   - customPrompt?:     프롬프트 통째 override
//   - force?:            animationUrl 이 이미 있어도 재생성
//
// 출력 이벤트 (AsyncGenerator):
//   - { type:"started",     assetId, prompt }         — Veo 프롬프트 확정
//   - { type:"download",    blobUrl }                 — 원본 portrait 다운로드 시작
//   - { type:"veo_start" }                            — Veo 작업 접수 (비동기 op 시작)
//   - { type:"veo_poll",    pollCount, elapsedSec }   — 10초 간격 폴링 하트비트
//   - { type:"veo_done",    mp4Bytes }                — mp4 다운로드 완료
//   - { type:"ffmpeg_start" }                         — 540x810 animated webp 변환 시작
//   - { type:"ffmpeg_done", webpBytes }               — 변환 완료
//   - { type:"upload",      path }                    — Blob 업로드 시작
//   - { type:"saved",       assetId, animationUrl, bytes, spec }
//   - { type:"reused",      assetId, animationUrl }   — force 미사용 + 이미 있음
//   - { type:"error",       message }                 — 실패
//
// 주의: mp4 → webp 변환은 ffmpeg 바이너리에 의존한다. Vercel 서버리스 런타임에는
//       ffmpeg 이 없으므로 이 파이프라인은 "로컬 dev" 또는 "ffmpeg 포함한 워커"
//       에서만 동작한다. 관리자 SSE 엔드포인트는 이 전제하에서 쓴다.

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { putAsset } from "@/lib/assets/blob";
import { mp4ToAnimatedWebp, ANIMATION_SPEC } from "./ffmpeg";

const VEO_MODEL = "veo-3.1-lite-generate-preview";
const POLL_INTERVAL_MS = 10_000;
// Veo 작업이 너무 오래 걸리면(~6분) 강제로 에러 처리. 보통 3~4분 내 끝남.
const MAX_POLL_COUNT = 36; // = 6분

/**
 * Veo 기본 모션 프롬프트.
 * 인물 정체성/구도/배경/의상/색감은 절대 건드리지 말고 idle loop 모션만.
 * customPrompt 가 들어오면 통째 대체.
 */
const BASE_MOTION_PROMPT = [
  "이미지에 어울리는 동적 요소를 idle, looping 모션으로 제작하라.",
  "(예시: 머리카락·옷자락의 미세한 휘날림, 눈 깜빡임, 호흡에 따른 어깨 움직임,",
  "배경의 바람·눈·비·반짝임 등.)",
  "카메라는 움직이지 말고, 이미지 내부 요소만 살아나는 루프 모션.",
  "등장 인물의 정체성·구도·배경 요소·의상·색감은 절대 변경하지 마라.",
].join("\n");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) not set");
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 300_000 },
  });
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

export type StreamAnimationInputs = {
  assetId: string;
  /** 모션 프롬프트 보강용. null/undefined 면 character.tagline 등으로 자동 구성. */
  characterContext?: string | null;
  /** 들어오면 BASE_MOTION_PROMPT + context 를 무시하고 이 값만 씀. */
  customPrompt?: string | null;
  /** 이미 animationUrl 이 있어도 다시 생성. */
  force?: boolean;
};

export type AnimationStreamEvent =
  | { type: "started"; assetId: string; prompt: string }
  | { type: "download"; blobUrl: string }
  | { type: "veo_start" }
  | { type: "veo_poll"; pollCount: number; elapsedSec: number }
  | { type: "veo_done"; mp4Bytes: number }
  | { type: "ffmpeg_start" }
  | { type: "ffmpeg_done"; webpBytes: number }
  | { type: "upload"; path: string }
  | {
      type: "saved";
      assetId: string;
      animationUrl: string;
      bytes: number;
      spec: typeof ANIMATION_SPEC;
    }
  | { type: "reused"; assetId: string; animationUrl: string }
  | { type: "error"; message: string };

/**
 * 단일 portrait Asset → Veo 3.1 Lite 모션 → 540x810 animated webp → Blob 업로드 → DB 업데이트.
 *
 * 구현 노트:
 * - Veo 는 `generateContentStream` 같은 streaming API 가 없고 operation-based 이기
 *   때문에 여기서 "streaming" 이란 토큰 스트림이 아니라 오케스트레이션 단계별
 *   이벤트 방출을 말한다. 10초 간격의 `veo_poll` 이 서버-클라이언트 간 하트비트 역할.
 * - 에러는 throw 대신 `{ type:"error" }` 이벤트로 yield 하고 generator 를 return.
 *   상위(`collectPortraitAnimation`) 는 Error 로 바꿔 throw 한다.
 * - polling 한계(MAX_POLL_COUNT)에 도달하면 `veo_timeout` 을 error 메시지로 올린다.
 */
export async function* streamPortraitAnimation(
  inputs: StreamAnimationInputs,
): AsyncGenerator<AnimationStreamEvent> {
  // 1) DB 조회
  let asset: Awaited<
    ReturnType<typeof prisma.asset.findUnique<{
      where: { id: string };
      include: { character: true };
    }>>
  >;
  try {
    asset = await prisma.asset.findUnique({
      where: { id: inputs.assetId },
      include: { character: true },
    });
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  if (!asset) {
    yield { type: "error", message: `asset_not_found:${inputs.assetId}` };
    return;
  }
  if (asset.kind !== "portrait") {
    yield { type: "error", message: `asset_not_portrait:${asset.kind}` };
    return;
  }

  // 이미 있으면 재사용 (force 가 아닌 이상)
  if (asset.animationUrl && !inputs.force) {
    yield {
      type: "reused",
      assetId: asset.id,
      animationUrl: asset.animationUrl,
    };
    return;
  }

  // 2) 프롬프트 조립
  const context =
    inputs.characterContext ?? buildContextFromCharacter(asset.character);
  const prompt = inputs.customPrompt
    ? inputs.customPrompt
    : [
        BASE_MOTION_PROMPT,
        context ? `\n[캐릭터 컨텍스트]\n${context}` : null,
      ]
        .filter(Boolean)
        .join("\n");

  yield { type: "started", assetId: asset.id, prompt };

  // 3) 원본 다운로드
  yield { type: "download", blobUrl: asset.blobUrl };
  let srcBuf: Buffer;
  let srcMime: string;
  try {
    const srcRes = await fetch(asset.blobUrl);
    if (!srcRes.ok) {
      yield {
        type: "error",
        message: `portrait_download_failed:${srcRes.status}`,
      };
      return;
    }
    srcBuf = Buffer.from(await srcRes.arrayBuffer());
    srcMime =
      srcRes.headers.get("content-type") || asset.mimeType || "image/png";
  } catch (e) {
    yield {
      type: "error",
      message: `portrait_download_error:${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  // 4) Veo 비디오 생성 요청 + 폴링
  yield { type: "veo_start" };
  let mp4: Buffer;
  try {
    const ai = getClient();
    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt,
      image: {
        imageBytes: srcBuf.toString("base64"),
        mimeType: srcMime,
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: "9:16",
        resolution: "720p",
        durationSeconds: 6,
      },
    });

    let pollCount = 0;
    while (!operation.done) {
      if (pollCount >= MAX_POLL_COUNT) {
        yield {
          type: "error",
          message: `veo_timeout:${MAX_POLL_COUNT * (POLL_INTERVAL_MS / 1000)}s`,
        };
        return;
      }
      await sleep(POLL_INTERVAL_MS);
      pollCount++;
      yield {
        type: "veo_poll",
        pollCount,
        elapsedSec: Math.round(pollCount * (POLL_INTERVAL_MS / 1000)),
      };
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const videos = operation.response?.generatedVideos ?? [];
    if (!videos.length) {
      yield { type: "error", message: "veo_no_result" };
      return;
    }
    const uri = videos[0]?.video?.uri;
    if (!uri) {
      yield { type: "error", message: "veo_no_uri" };
      return;
    }

    // Gemini API 는 URI 뒤에 key 를 붙여야 다운로드된다.
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    const sep = uri.includes("?") ? "&" : "?";
    const videoRes = await fetch(`${uri}${sep}key=${apiKey}`);
    if (!videoRes.ok) {
      yield {
        type: "error",
        message: `veo_download_failed:${videoRes.status}`,
      };
      return;
    }
    mp4 = Buffer.from(await videoRes.arrayBuffer());
    yield { type: "veo_done", mp4Bytes: mp4.length };
  } catch (e) {
    yield {
      type: "error",
      message: `veo_error:${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  // 5) ffmpeg → 540x810 Q75 12fps animated webp
  yield { type: "ffmpeg_start" };
  let webpBuf: Buffer;
  try {
    webpBuf = await mp4ToAnimatedWebp(mp4);
  } catch (e) {
    yield {
      type: "error",
      message: `ffmpeg_error:${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }
  yield { type: "ffmpeg_done", webpBytes: webpBuf.length };

  // 6) Blob 업로드
  const relPath = `portraits/ani/${asset.id}.webp`;
  yield { type: "upload", path: relPath };
  let storedUrl: string;
  try {
    const stored = await putAsset(relPath, webpBuf, "image/webp");
    storedUrl = stored.url;
  } catch (e) {
    yield {
      type: "error",
      message: `upload_error:${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  // 7) DB 업데이트 — Asset.animationUrl
  try {
    await prisma.asset.update({
      where: { id: asset.id },
      data: { animationUrl: storedUrl },
    });
  } catch (e) {
    yield {
      type: "error",
      message: `db_update_error:${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  yield {
    type: "saved",
    assetId: asset.id,
    animationUrl: storedUrl,
    bytes: webpBuf.length,
    spec: ANIMATION_SPEC,
  };
}

/**
 * 스트림을 끝까지 소비해 최종 결과만 돌려주는 편의 함수.
 * 스크립트(scripts/generate-portrait-animation.ts) 같이 진행 상황을 로그로만
 * 흘리고 싶을 때 `onStage` 콜백을 넘기면 기존 `generatePortraitAnimation` 와
 * 동일한 stage 라벨을 받을 수 있다.
 *
 * 에러 이벤트를 만나면 Error 로 throw 해 기존 try/catch 흐름과 호환.
 */
export type CollectAnimationResult = {
  assetId: string;
  animationUrl: string;
  bytes: number;
  spec: typeof ANIMATION_SPEC;
  reused?: boolean;
};

export async function collectPortraitAnimation(
  inputs: StreamAnimationInputs & {
    onStage?: (stage: string, detail?: string) => void;
  },
): Promise<CollectAnimationResult> {
  const log = inputs.onStage ?? (() => {});
  let result: CollectAnimationResult | null = null;

  for await (const ev of streamPortraitAnimation(inputs)) {
    switch (ev.type) {
      case "started":
        log("started", `prompt ${ev.prompt.length}ch`);
        break;
      case "download":
        log("download", ev.blobUrl);
        break;
      case "veo_start":
        log("veo_start");
        break;
      case "veo_poll":
        log("veo_poll", `${ev.elapsedSec}s`);
        break;
      case "veo_done":
        log("veo_done", `${Math.round(ev.mp4Bytes / 1024)}KB`);
        break;
      case "ffmpeg_start":
        log("ffmpeg_start");
        break;
      case "ffmpeg_done":
        log("ffmpeg_done", `${Math.round(ev.webpBytes / 1024)}KB`);
        break;
      case "upload":
        log("upload", ev.path);
        break;
      case "saved":
        log("done", ev.animationUrl);
        result = {
          assetId: ev.assetId,
          animationUrl: ev.animationUrl,
          bytes: ev.bytes,
          spec: ev.spec,
        };
        break;
      case "reused":
        log("reuse", ev.animationUrl);
        result = {
          assetId: ev.assetId,
          animationUrl: ev.animationUrl,
          bytes: 0,
          spec: ANIMATION_SPEC,
          reused: true,
        };
        break;
      case "error":
        throw new Error(ev.message);
    }
  }

  if (!result) throw new Error("no_animation_result");
  return result;
}
