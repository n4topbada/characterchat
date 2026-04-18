import { prisma } from "@/lib/db";
import { embedText, toVectorLiteral } from "./embed";
import type { ChunkSnap } from "@/lib/gemini/prompt";

export type RetrieveArgs = {
  query: string;
  characterId: string;
  userId?: string;
};

type ChunkRow = {
  id: string;
  content: string;
  metadata: unknown;
  created_at: Date;
  type: string;
  distance: number;
};

/**
 * 채팅 파이프라인이 쓰는 단일 진입점.
 * - knowledge/belief 5개 (글로벌)
 * - style_anchor 3개 (최신, 벡터 미사용)
 * - episode 3개 (user-scoped, 벡터 검색)
 * - relation_summary 1개 (user-scoped, 최신)
 *
 * knowledge 가 비어 있으면 프롬프트에 해당 블록이 빠진다 — composer 가 null 허용.
 */
export async function retrieveForPrompt({
  query,
  characterId,
  userId,
}: RetrieveArgs): Promise<{
  knowledge: ChunkSnap[];
  styleAnchors: ChunkSnap[];
  episodes: ChunkSnap[];
  relationSummary: ChunkSnap | null;
}> {
  // 쿼리 임베딩
  const queryVec = await embedText(query).catch((e) => {
    console.warn("[retrieve] embed failed, returning no vector results:", e);
    return null;
  });
  const qLit = queryVec ? toVectorLiteral(queryVec.vector) : null;

  const knowledgeRows: ChunkRow[] = qLit
    ? await prisma.$queryRawUnsafe(
        `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
                (embedding <=> $1::vector) AS distance
         FROM "KnowledgeChunk"
         WHERE "characterId" = $2
           AND type IN ('knowledge','belief')
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 5`,
        qLit,
        characterId,
      )
    : [];

  // 임베딩이 비어 있으면 ordinal 로 폴백
  let knowledgeFinal: ChunkRow[] = knowledgeRows;
  if (knowledgeFinal.length === 0) {
    knowledgeFinal = (await prisma.$queryRawUnsafe(
      `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
              0::float AS distance
       FROM "KnowledgeChunk"
       WHERE "characterId" = $1 AND type IN ('knowledge','belief')
       ORDER BY ordinal ASC
       LIMIT 5`,
      characterId,
    )) as ChunkRow[];
  }

  const styleRows = (await prisma.$queryRawUnsafe(
    `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
            0::float AS distance
     FROM "KnowledgeChunk"
     WHERE "characterId" = $1 AND type = 'style_anchor'
     ORDER BY "createdAt" DESC
     LIMIT 3`,
    characterId,
  )) as ChunkRow[];

  let episodeRows: ChunkRow[] = [];
  let relationRows: ChunkRow[] = [];
  if (userId) {
    episodeRows = qLit
      ? ((await prisma.$queryRawUnsafe(
          `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
                  (embedding <=> $1::vector) AS distance
           FROM "KnowledgeChunk"
           WHERE "characterId" = $2 AND "userId" = $3 AND type = 'episode'
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector ASC
           LIMIT 3`,
          qLit,
          characterId,
          userId,
        )) as ChunkRow[])
      : ((await prisma.$queryRawUnsafe(
          `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
                  0::float AS distance
           FROM "KnowledgeChunk"
           WHERE "characterId" = $1 AND "userId" = $2 AND type = 'episode'
           ORDER BY "createdAt" DESC
           LIMIT 3`,
          characterId,
          userId,
        )) as ChunkRow[]);

    relationRows = (await prisma.$queryRawUnsafe(
      `SELECT id, content, metadata, "createdAt" AS created_at, type::text AS type,
              0::float AS distance
       FROM "KnowledgeChunk"
       WHERE "characterId" = $1 AND "userId" = $2 AND type = 'relation_summary'
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      characterId,
      userId,
    )) as ChunkRow[];
  }

  const toSnap = (r: ChunkRow): ChunkSnap => ({
    content: r.content,
    metadata: (r.metadata ?? null) as ChunkSnap["metadata"],
    createdAt: r.created_at,
  });

  return {
    knowledge: knowledgeFinal.map(toSnap),
    styleAnchors: styleRows.map(toSnap),
    episodes: episodeRows.map(toSnap),
    relationSummary: relationRows.length ? toSnap(relationRows[0]) : null,
  };
}
