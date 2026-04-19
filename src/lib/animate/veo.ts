// Gemini Veo 3.1 Lite 로 portrait 이미지 → 6초 모션 비디오 생성.
// Fictory 의 scripts/generate-cover-video.ts 에서 가져온 파이프라인을 런타임 라이브러리로 재구성했다.
//
// 호출 흐름:
//   1) portrait URL → fetch → base64
//   2) ai.models.generateVideos({ model: VEO_MODEL, prompt, image })
//   3) operations.getVideosOperation 폴링 (done 될 때까지)
//   4) video.uri → fetch (API 키 붙여서) → mp4 Buffer
//
// 출력은 mp4 Buffer. webp 변환은 ffmpeg.ts 가 담당.

import { GoogleGenAI } from "@google/genai";

const VEO_MODEL = "veo-3.1-lite-generate-preview";
const POLL_INTERVAL_MS = 10_000;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) not set");
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 300_000 },
  });
}

const BASE_MOTION_PROMPT = [
  "이미지에 어울리는 동적 요소를 idle, looping 모션으로 제작하라.",
  "(예시: 머리카락·옷자락의 미세한 휘날림, 눈 깜빡임, 호흡에 따른 어깨 움직임,",
  "배경의 바람·눈·비·반짝임 등.)",
  "카메라는 움직이지 말고, 이미지 내부 요소만 살아나는 루프 모션.",
  "등장 인물의 정체성·구도·배경 요소·의상·색감은 절대 변경하지 마라.",
].join("\n");

export type VeoGenerateInput = {
  imageBase64: string;
  mimeType: string;
  // 캐릭터별 보강 컨텍스트. 없으면 BASE_MOTION_PROMPT 만 사용.
  characterContext?: string | null;
  customPrompt?: string | null;
  // 폴링 중 로그를 받고 싶으면 전달.
  onPoll?: (elapsedSec: number) => void;
};

export type VeoGenerateOutput = {
  mp4: Buffer;
  prompt: string;
};

export async function generatePortraitVideo(
  input: VeoGenerateInput,
): Promise<VeoGenerateOutput> {
  const ai = getClient();

  const prompt = input.customPrompt
    ? input.customPrompt
    : [
        BASE_MOTION_PROMPT,
        input.characterContext
          ? `\n[캐릭터 컨텍스트]\n${input.characterContext}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

  // 1) Veo 비디오 생성 요청 — portrait (9:16) 기준
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt,
    image: {
      imageBytes: input.imageBase64,
      mimeType: input.mimeType,
    },
    config: {
      numberOfVideos: 1,
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 6,
    },
  });

  // 2) done 폴링
  let pollCount = 0;
  while (!operation.done) {
    pollCount++;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (input.onPoll) input.onPoll(pollCount * (POLL_INTERVAL_MS / 1000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videos = operation.response?.generatedVideos ?? [];
  if (!videos.length) throw new Error("veo_no_result");

  const uri = videos[0]?.video?.uri;
  if (!uri) throw new Error("veo_no_uri");

  // 3) 다운로드 — Gemini API 는 URI 뒤에 key 를 붙여야 다운로드된다.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  const sep = uri.includes("?") ? "&" : "?";
  const res = await fetch(`${uri}${sep}key=${apiKey}`);
  if (!res.ok) throw new Error(`veo_download_failed:${res.status}`);
  const mp4 = Buffer.from(await res.arrayBuffer());
  return { mp4, prompt };
}
