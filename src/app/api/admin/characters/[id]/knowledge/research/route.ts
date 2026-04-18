// 관리자용 RAG 연구 엔드포인트.
// Gemini Google Search grounding 으로 토픽을 조사 → 요약 문단 + 출처 URL 반환.
// 결과는 곧바로 POST /knowledge 로 이어서 올리도록 클라이언트가 연결.
//
// 현 단계는 단일 토픽 요약까지만. 멀티 토픽/깊이 확장은 Caster 쪽으로 미룬다.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { MODELS, withGeminiFallback } from "@/lib/gemini/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  topic: z.string().trim().min(2).max(200),
  locale: z.string().optional(),
});

type GroundingChunk = { web?: { uri?: string; title?: string } };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const character = await prisma.character.findUnique({
    where: { id },
    select: { name: true, tagline: true },
  });
  if (!character) return errorJson("not_found", 404);

  const topic = parsed.data.topic;
  const locale = parsed.data.locale ?? "ko-KR";

  const prompt = [
    `캐릭터 "${character.name}" (${character.tagline}) 의 배경으로 쓸 지식을 조사한다.`,
    `주제: ${topic}`,
    ``,
    `다음 규칙을 지켜 한국어로 답한다:`,
    `- 추측이나 창작을 섞지 말고, 검색으로 확보한 사실만 쓴다.`,
    `- 200~500자 사이의 압축 요약으로 한 문단 씩, 총 1~3문단.`,
    `- 캐릭터성/말투가 아닌 "객관적 설명"을 쓴다.`,
    `- 숫자, 고유명사, 연도는 가능하면 포함.`,
    `- 마지막 줄에 "출처:" 를 쓰지 않는다. 출처 URL 은 시스템이 groundingMetadata 에서 따로 뽑는다.`,
    ``,
    `Locale: ${locale}`,
  ].join("\n");

  const text = await withGeminiFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: MODELS.chat,
      contents: prompt,
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} } as unknown as never],
      },
    });
    const textOut = resp.text ?? "";
    const metaChunks =
      (
        resp as unknown as {
          candidates?: Array<{
            groundingMetadata?: { groundingChunks?: GroundingChunk[] };
          }>;
        }
      ).candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const urls: string[] = [];
    for (const c of metaChunks) {
      if (c.web?.uri) urls.push(c.web.uri);
    }
    return { text: textOut, sourceUrls: Array.from(new Set(urls)) };
  });

  return NextResponse.json({
    topic,
    summary: text.text,
    sourceUrls: text.sourceUrls,
  });
}
