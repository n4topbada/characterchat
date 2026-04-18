// 관리자용 지식 청크 관리 API.
// - GET  : 해당 캐릭터의 청크 목록 (knowledge/belief/style_anchor). episode 는 별도.
// - POST : 수동으로 텍스트를 올리면 → chunk split → embed → upsert.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";
import { splitToChunks, estimateTokens } from "@/lib/rag/chunk";
import { embedTexts, toVectorLiteral } from "@/lib/rag/embed";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostBody = z.object({
  title: z.string().trim().min(1).max(200),
  type: z
    .enum(["knowledge", "belief", "style_anchor"])
    .default("knowledge"),
  source: z
    .enum(["admin_edit", "admin_research", "caster"])
    .default("admin_edit"),
  rawText: z.string().trim().min(1).max(20000),
  sourceUrls: z.array(z.string().url()).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const [docs, chunks] = await Promise.all([
    prisma.knowledgeDoc.findMany({
      where: { characterId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        source: true,
        sourceUrls: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    }),
    prisma.knowledgeChunk.findMany({
      where: {
        characterId: id,
        type: { in: ["knowledge", "belief", "style_anchor"] },
      },
      orderBy: [{ type: "asc" }, { ordinal: "asc" }],
      select: {
        id: true,
        docId: true,
        type: true,
        ordinal: true,
        content: true,
        tokens: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ docs, chunks });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return errorJson("not_found", 404);

  const chunksText = splitToChunks(parsed.data.rawText);
  if (chunksText.length === 0) return errorJson("empty_text", 400);

  const vectors = await embedTexts(chunksText).catch((e) => {
    console.error("[knowledge POST] embed failed", e);
    return null;
  });

  const docId = newId();
  await prisma.knowledgeDoc.create({
    data: {
      id: docId,
      characterId: id,
      title: parsed.data.title,
      source: parsed.data.source,
      rawText: parsed.data.rawText,
      sourceUrls: parsed.data.sourceUrls ?? [],
    },
  });

  for (let i = 0; i < chunksText.length; i++) {
    const content = chunksText[i];
    const chunkId = newId();
    await prisma.knowledgeChunk.create({
      data: {
        id: chunkId,
        docId,
        characterId: id,
        type: parsed.data.type,
        ordinal: i,
        content,
        tokens: estimateTokens(content),
        metadata: parsed.data.sourceUrls?.length
          ? { sourceUrls: parsed.data.sourceUrls }
          : undefined,
      },
    });
    // embedding 컬럼은 raw SQL 로 업데이트
    if (vectors && vectors[i]) {
      const lit = toVectorLiteral(vectors[i].vector);
      await prisma.$executeRawUnsafe(
        `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
        lit,
        chunkId,
      );
    }
  }

  return NextResponse.json({
    docId,
    chunkCount: chunksText.length,
    embedded: Boolean(vectors),
  });
}
