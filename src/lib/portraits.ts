// src/lib/portraits.ts
// 포트레이트 생성의 공용 경로. 스크립트(prisma 캐릭터 3명 초기생성)와
// 관리자 API(/api/admin/characters/:id/portrait/generate) 가 둘 다 쓴다.

import sharp from "sharp";
import { ulid } from "ulid";
import { prisma } from "@/lib/db";
import { MODELS, withGeminiFallback } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";
import { putAsset } from "@/lib/assets/blob";
import type { PersonaCore, Character } from "@prisma/client";

export type PortraitResult = {
  assetId: string;
  blobUrl: string;
  width: number;
  height: number;
};

/** PersonaCore + Character 로부터 포트레이트 프롬프트를 조립. */
export function buildPortraitPrompt(
  character: Pick<Character, "name" | "tagline" | "accentColor">,
  core: Pick<
    PersonaCore,
    "ageText" | "gender" | "species" | "role" | "appearanceKeys" | "backstorySummary"
  > | null,
): string {
  const parts: string[] = [];

  if (core) {
    const person = [core.ageText, core.gender, core.species].filter(Boolean).join(", ");
    if (person) parts.push(`Studio portrait of a ${person}.`);
    if (core.role) parts.push(`Occupation: ${core.role}.`);
    if (core.appearanceKeys.length) {
      parts.push(`Key features: ${core.appearanceKeys.join(", ")}.`);
    }
    if (core.backstorySummary) {
      parts.push(`Background context: ${core.backstorySummary.slice(0, 240)}.`);
    }
  } else {
    parts.push(`Studio portrait of a character named ${character.name}.`);
    parts.push(`Tagline: ${character.tagline}.`);
  }

  parts.push(
    `Accent color in lighting / wardrobe: ${character.accentColor}. Painterly semi-realism, cinematic framing, chest-up composition, head in upper third. 3:4 portrait aspect ratio. Subject fills frame vertically. Neutral warm background, no text or logos.`,
  );

  return parts.join(" ");
}

/** Gemini 이미지 모델로 단일 포트레이트를 생성 (3:4, 1K). */
export async function generatePortraitBytes(prompt: string): Promise<{
  data: Buffer;
  mimeType: string;
}> {
  return withGeminiFallback(async (ai) => {
    // 스트리밍이 아니라 단일 응답 경로. 이미지 생성은 이게 훨씬 안정적.
    const resp = await ai.models.generateContent({
      model: MODELS.image,
      config: {
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
        responseModalities: ["IMAGE"],
        // 성인 페르소나(노출/관능 묘사) 가 들어가면 기본 safety 가 0-byte 응답을
        // 만든다. 4개 카테고리 모두 BLOCK_NONE — 차단은 persona redLines 에서.
        safetySettings: PERMISSIVE_SAFETY,
      } as Record<string, unknown>,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const parts = resp.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        return {
          data: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType ?? "image/png",
        };
      }
    }
    throw new Error("response_without_image_data");
  });
}

/**
 * 바이트를 `public/portraits/{slug}.png` 로 저장하고
 * Asset(kind=portrait) 를 upsert, Character.portraitAssetId 갱신.
 */
export async function savePortraitForCharacter({
  characterId,
  slug,
  png,
  mimeType,
}: {
  characterId: string;
  slug: string;
  png: Buffer;
  mimeType: string;
}): Promise<PortraitResult> {
  // 항상 PNG 로 정규화하여 저장 — 카드/아이콘 양쪽에서 공용.
  const normalized = await sharp(png).png({ quality: 92 }).toBuffer();
  const meta = await sharp(normalized).metadata();
  const width = meta.width ?? 896;
  const height = meta.height ?? 1152;

  const stored = await putAsset(
    `portraits/${slug}.png`,
    normalized,
    "image/png",
  );
  const blobUrl = stored.url;

  const existing = await prisma.asset.findFirst({
    where: { characterId, kind: "portrait" },
    orderBy: { order: "asc" },
  });

  return prisma.$transaction(async (tx) => {
    const asset = existing
      ? await tx.asset.update({
          where: { id: existing.id },
          data: { blobUrl, mimeType, width, height },
        })
      : await tx.asset.create({
          data: {
            id: ulid(),
            characterId,
            kind: "portrait",
            blobUrl,
            mimeType,
            width,
            height,
            order: 0,
          },
        });

    await tx.character.update({
      where: { id: characterId },
      data: { portraitAssetId: asset.id },
    });

    return {
      assetId: asset.id,
      blobUrl,
      width,
      height,
    };
  });
}
