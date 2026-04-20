// src/lib/portraits-stream.ts
//
// 캐릭터 포트레이트 생성 Agent — 스트리밍 버전.
//
// 이전 portraits.ts 의 generatePortraitBytes() 는 generateContent (단일 응답).
// 이 모듈은 generateContentStream() 을 써서 SSE 로 진행 상황을 흘려줄 수 있다.
//
// 입력:
//   - character: 이름/태그라인/액센트 컬러
//   - persona:   외형 키워드, 역할, 배경, 말투 등 (PersonaCore)
//   - conversationSummary: Caster 대화에서 오간 합의사항 요약 (옵션)
//   - referenceImage:     관리자가 "이 느낌" 으로 확정한 레퍼런스 이미지 bytes (옵션)
//
// 출력 (AsyncGenerator):
//   - { type: "started", prompt }           — 프롬프트 확정
//   - { type: "progress", chunks }          — 스트림 chunk 수신 카운트
//   - { type: "image", data, mimeType }     — 최종 이미지 바이트
//   - { type: "done" }                      — 정상 종료
//   - { type: "error", message }            — 실패
//
// 스타일 스펙 (고정):
//   한국 웹툰 스타일 - 외각선 매우 가늘게, 셀채색, 약간 과장된 만화적 표정 허용.
//   3:4 세로 초상, 단일 피사체, 배경은 단색/약한 보케, 로고/텍스트 없음.

import { ThinkingLevel } from "@google/genai";
import { GEMINI_MODELS, withGeminiFallback } from "@/lib/gemini/client";
import type { PersonaCore, Character } from "@prisma/client";

/** Caster 대화에서 뽑을 수 있는 외형 관련 인용 목록 상한. */
const CONV_SUMMARY_MAX_CHARS = 800;

/** 한국 웹툰 스타일 스펙 — 프롬프트 주입 시 변형 없이 그대로 써야 한다. */
const KOREAN_WEBTOON_SPEC = [
  "한국 웹툰 스타일로 단일 캐릭터의 포트레이트를 그린다.",
  "",
  "필수 스타일 원칙:",
  "- 외각선은 매우 가늘고 깔끔하게 긋는다.",
  "- 채색은 셀채색(cel-shaded): 평면 톤 2~3단계, 부드러운 그라데이션은 최소화.",
  "- 표정은 약간 과장된 만화적 표현을 허용한다 (감정이 분명히 드러남).",
  "- 사실적 포토 리얼, 페인터리 디지털 페인팅, 반실사 스타일은 금지.",
  "- 3:4 세로 초상. 가슴 위~얼굴 위쪽 3분의 1 구도.",
  "- 배경은 단색 톤 또는 아주 약한 보케. 로고/텍스트 금지.",
  "- 피사체가 프레임을 세로로 꽉 채운다.",
  "- 인물은 단 한 명. 카메라/프레임/말풍선/효과선 등의 만화 연출 요소는 넣지 않는다.",
].join("\n");

function buildSystemInstruction(): string {
  return [
    "You are a Korean-webtoon portrait illustrator.",
    "Always output exactly one 3:4 portrait image of the described character,",
    "strictly following the style spec below. Never output text.",
    "",
    KOREAN_WEBTOON_SPEC,
  ].join("\n");
}

export type PortraitCharacterInput = Pick<
  Character,
  "name" | "tagline" | "accentColor" | "slug"
>;

export type PortraitPersonaInput = Pick<
  PersonaCore,
  | "ageText"
  | "gender"
  | "species"
  | "role"
  | "appearanceKeys"
  | "backstorySummary"
  | "speechRegister"
> | null;

export type PortraitReferenceImage = {
  /** 원본 바이트 */
  data: Buffer;
  /** image/png | image/jpeg | image/webp 등 */
  mimeType: string;
  /** 디버그용 출처 정보 (SSE 초기 이벤트에 같이 보내면 UI 가 "OO 이미지 참고 중" 표시). */
  sourceUri?: string | null;
  title?: string | null;
  domain?: string | null;
};

export type StreamPortraitInputs = {
  character: PortraitCharacterInput;
  persona?: PortraitPersonaInput;
  /**
   * Caster 대화에서 합의된 외형/성격 디테일 요약.
   * 전체 쓰레드를 그대로 넘기면 토큰이 폭주하므로 상위에서 한 단락으로 축약해 넘긴다.
   */
  conversationSummary?: string | null;
  referenceImage?: PortraitReferenceImage | null;
  /**
   * 호출자가 프롬프트를 완전히 제어하고 싶을 때의 override. 넘기면 character/persona
   * 기반 자동 조립은 건너뛰고 이 문자열을 user prompt 로 쓴다. (시스템 스타일 스펙은 그대로 유지.)
   */
  overridePrompt?: string | null;
};

/**
 * character + persona + conversation + 레퍼런스 → 유저 프롬프트 한 덩어리.
 * "ref image: <URL>" 같은 appearanceKeys 의 레퍼런스 앵커는 bytes 로 따로
 * 넘기므로 프롬프트에서는 제거해 중복 주입을 피한다.
 */
function buildUserPrompt(inputs: StreamPortraitInputs): string {
  if (inputs.overridePrompt && inputs.overridePrompt.trim().length > 0) {
    return inputs.overridePrompt.trim();
  }

  const { character, persona, conversationSummary } = inputs;
  const lines: string[] = [];

  lines.push(`캐릭터 이름: ${character.name}`);
  lines.push(`한 줄 소개: ${character.tagline}`);
  lines.push(
    `액센트 컬러(의상/조명 포인트로 자연스럽게 녹이기): ${character.accentColor}`,
  );

  if (persona) {
    const bio = [persona.ageText, persona.gender, persona.species]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join(", ");
    if (bio) lines.push(`신상: ${bio}`);
    if (persona.role) lines.push(`역할/직업: ${persona.role}`);

    if (Array.isArray(persona.appearanceKeys) && persona.appearanceKeys.length > 0) {
      const keys = persona.appearanceKeys.filter(
        (k) => typeof k === "string" && !/^ref image:/i.test(k),
      );
      if (keys.length) {
        lines.push(`외형 키워드: ${keys.join(" · ")}`);
      }
    }

    if (persona.speechRegister) {
      lines.push(`분위기/톤(눈빛·표정 참고): ${persona.speechRegister}`);
    }

    if (persona.backstorySummary && persona.backstorySummary.trim().length > 0) {
      lines.push(`배경 요약: ${persona.backstorySummary.slice(0, 320)}`);
    }
  }

  if (
    conversationSummary &&
    conversationSummary.trim().length > 0
  ) {
    lines.push("");
    lines.push("Caster 대화에서 합의된 디테일:");
    lines.push(conversationSummary.slice(0, CONV_SUMMARY_MAX_CHARS));
  }

  if (inputs.referenceImage) {
    lines.push("");
    lines.push(
      "참고로 첨부된 레퍼런스 이미지가 있다. 그 이미지의 인물(또는 사물)의 전반적 인상 · 분위기 · 색감을 기준으로 하되, 반드시 한국 웹툰 스타일로 다시 그린다. 사진을 그대로 복사하지 말 것.",
    );
  }

  lines.push("");
  lines.push(
    "위 정보를 반영해 단 하나의 3:4 세로 초상을 출력하라. 한국 웹툰 스타일 - 외각선 매우 가늘게, 셀채색, 약간 과장된 만화적 표정 허용. 이미지 외에는 아무 것도 출력하지 않는다.",
  );

  return lines.join("\n");
}

export type PortraitStreamEvent =
  | { type: "started"; prompt: string; hasReferenceImage: boolean }
  | { type: "progress"; chunks: number }
  | { type: "image"; data: Buffer; mimeType: string }
  | { type: "done" }
  | { type: "error"; message: string };

type RawPart = {
  inlineData?: { mimeType?: string; data?: string };
};

type RawChunk = {
  candidates?: { content?: { parts?: RawPart[] } }[];
};

/**
 * Gemini 이미지 모델로 포트레이트를 스트리밍 생성한다.
 *
 * 내부 구현 노트:
 * - `generateContentStream` 은 이미지 응답의 경우 대체로 "한 chunk 에 통 바이트" 로
 *   내려오지만, 프리뷰 모델 특성상 여러 chunk 로 쪼개 내려오는 케이스도 가정하고
 *   buffers[] 에 누적한다.
 * - SSE 로 `progress` 이벤트를 뿌리는 목적은 "서버가 살아 있다" 는 하트비트. 실제
 *   바이트 진행 퍼센트로 쓰기엔 정보가 부족하다.
 * - 빈 응답(0 바이트) 이면 `error` 이벤트로 끝낸다. 일반적으로 safety 블록으로
 *   인한 0-byte 응답이 프리뷰 모델에서 간혹 관측된다.
 */
export async function* streamPortrait(
  inputs: StreamPortraitInputs,
): AsyncGenerator<PortraitStreamEvent> {
  const userPrompt = buildUserPrompt(inputs);
  const systemInstruction = buildSystemInstruction();

  const userParts: unknown[] = [{ text: userPrompt }];
  if (inputs.referenceImage) {
    userParts.push({
      inlineData: {
        mimeType: inputs.referenceImage.mimeType,
        data: inputs.referenceImage.data.toString("base64"),
      },
    });
  }

  yield {
    type: "started",
    prompt: userPrompt,
    hasReferenceImage: !!inputs.referenceImage,
  };

  let resp: AsyncIterable<unknown>;
  try {
    resp = await withGeminiFallback(
      (ai) =>
        ai.models.generateContentStream({
          model: GEMINI_MODELS.image,
          contents: [{ role: "user", parts: userParts as never }],
          // thinkingLevel/imageConfig/responseModalities 는 SDK 타입이 아직
          // 일부 키를 narrow 하게 타이핑하지 않으므로 unknown-cast 로 넘긴다.
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            imageConfig: {
              aspectRatio: "3:4",
              imageSize: "1K",
              personGeneration: "",
            },
            responseModalities: ["IMAGE"],
          } as Record<string, unknown>,
        }),
      { perKeyRetries: 1 },
    );
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  const buffers: Buffer[] = [];
  let mimeType = "image/png";
  let chunkCount = 0;

  try {
    for await (const raw of resp) {
      chunkCount += 1;
      const chunk = raw as RawChunk;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        const inline = p.inlineData;
        if (inline?.data) {
          buffers.push(Buffer.from(inline.data, "base64"));
          if (inline.mimeType) mimeType = inline.mimeType;
        }
      }
      yield { type: "progress", chunks: chunkCount };
    }
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  if (buffers.length === 0) {
    yield { type: "error", message: "no_image_data" };
    return;
  }

  const data = Buffer.concat(buffers);
  yield { type: "image", data, mimeType };
  yield { type: "done" };
}

/**
 * 스트림을 전부 소비해 Buffer 하나로 돌려주는 편의 함수.
 *
 * 이전 generatePortraitBytes 를 호출하던 백엔드/스크립트가 stream 이 필요 없으면
 * 이걸 쓰면 된다 (Ani 시드 스크립트 등).
 *
 * 에러 이벤트를 만나면 Error 로 throw 해 기존 try/catch 흐름과 호환.
 */
export async function collectPortrait(
  inputs: StreamPortraitInputs,
): Promise<{ data: Buffer; mimeType: string; prompt: string }> {
  let image: { data: Buffer; mimeType: string } | null = null;
  let prompt = "";
  for await (const ev of streamPortrait(inputs)) {
    if (ev.type === "started") prompt = ev.prompt;
    if (ev.type === "image") image = { data: ev.data, mimeType: ev.mimeType };
    if (ev.type === "error") throw new Error(ev.message);
  }
  if (!image) throw new Error("no_image_data");
  return { ...image, prompt };
}
