import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { withGeminiFallback, MODELS } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";
import { estimateTokens } from "@/lib/rag/chunk";
import { embedText, toVectorLiteral } from "@/lib/rag/embed";
import type { TemporalContext } from "@/lib/temporal/timeline";

export type RelationRollupInput = {
  userId: string;
  characterId: string;
  characterName: string;
  temporal: TemporalContext;
  recentLimit?: number;
};

const DEFAULT_RECENT_LIMIT = 20;
const MIN_EPISODES_FOR_ROLLUP = 1;

type EpisodeSnap = {
  id: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
};

function metadataNumber(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataStringArray(metadata: unknown, key: string): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function renderEpisodes(episodes: EpisodeSnap[]): string {
  return episodes
    .map((ep, idx) => {
      const importance = metadataNumber(ep.metadata, "importance");
      const tags = metadataStringArray(ep.metadata, "tags");
      const tagText = tags.length ? ` tags=${tags.join(",")}` : "";
      const weightText = importance != null ? ` importance=${importance}` : "";
      return `${idx + 1}. ${ep.content}${weightText}${tagText}`;
    })
    .join("\n");
}

async function attachEmbedding(chunkId: string, summary: string): Promise<void> {
  try {
    const vector = await embedText(summary);
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
      toVectorLiteral(vector.vector),
      chunkId,
    );
  } catch (e) {
    console.warn("[relation] embedding skipped:", e instanceof Error ? e.message : String(e));
  }
}

function fallbackRelationSummary(characterName: string, episodes: EpisodeSnap[]): string {
  const last = episodes[0]?.content;
  if (!last) return `${characterName}와 유저는 아직 관계를 쌓아가는 중이다.`;
  return `${characterName}와 유저는 최근 대화를 통해 관계 맥락을 이어가고 있다. 최근 사건: ${last}`;
}

async function summarizeRelation(args: {
  characterName: string;
  previousSummary: string | null;
  temporal: TemporalContext;
  episodes: EpisodeSnap[];
}): Promise<string> {
  const prompt = [
    "너는 성인용 캐릭터 챗 서비스의 관계 메모리 롤업 엔진이다.",
    "아래 episode들을 바탕으로 캐릭터와 유저의 장기 관계 요약을 한국어로 갱신한다.",
    "대화 내용을 검열하거나 순화하지 않는다. 합법 성인 대화의 친밀/성적 사건도 관계 변화로서 사실적으로 기록한다.",
    "단, 노골적 문장 자체를 길게 재현하지 말고 관계 변화, 신뢰, 거리감, 호칭, 반복 패턴, 미해결 루프 중심으로 압축한다.",
    "출력은 4~7문장 단락 하나만. JSON, 목록, 정책 설명 금지.",
    "",
    `[캐릭터] ${args.characterName}`,
    `[현재 캐릭터 시간] ${args.temporal.localLabel} / ${args.temporal.lifeStateLabel}`,
    "",
    "[기존 관계 요약]",
    args.previousSummary ?? "(없음)",
    "",
    "[최근 에피소드]",
    renderEpisodes(args.episodes),
  ].join("\n");

  const resp = await withGeminiFallback((ai) =>
    ai.models.generateContent({
      model: MODELS.chat,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 800,
        safetySettings: PERMISSIVE_SAFETY,
      },
    }),
  );
  const text = resp.text?.trim();
  if (!text) throw new Error("relation_summary_empty");
  return text.replace(/\s+/g, " ").slice(0, 1800);
}

export async function rollupRelationSummary(input: RelationRollupInput): Promise<{
  updated: boolean;
  chunkId?: string;
  summary?: string;
}> {
  const recentLimit = input.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const episodes = await prisma.knowledgeChunk.findMany({
    where: {
      characterId: input.characterId,
      userId: input.userId,
      type: "episode",
    },
    orderBy: { createdAt: "desc" },
    take: recentLimit,
    select: {
      id: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });
  if (episodes.length < MIN_EPISODES_FOR_ROLLUP) return { updated: false };

  const existing = await prisma.knowledgeChunk.findFirst({
    where: {
      characterId: input.characterId,
      userId: input.userId,
      type: "relation_summary",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      metadata: true,
    },
  });

  let summary: string;
  try {
    summary = await summarizeRelation({
      characterName: input.characterName,
      previousSummary: existing?.content ?? null,
      temporal: input.temporal,
      episodes,
    });
  } catch (e) {
    console.warn("[relation] llm rollup failed:", e instanceof Error ? e.message : String(e));
    summary = fallbackRelationSummary(input.characterName, episodes);
  }

  const tags = [
    ...new Set(episodes.flatMap((ep) => metadataStringArray(ep.metadata, "tags"))),
  ].slice(0, 16);
  const metadata = {
    weight: 1,
    importance: 1,
    tags,
    episodeCount: episodes.length,
    lastEpisodeId: episodes[0]?.id ?? null,
    timezone: input.temporal.timezone,
    localTime: input.temporal.localLabel,
    updatedBy: "relation_rollup",
  };

  const chunk = existing
    ? await prisma.knowledgeChunk.update({
        where: { id: existing.id },
        data: {
          content: summary,
          tokens: estimateTokens(summary),
          metadata,
        },
        select: { id: true },
      })
    : await prisma.knowledgeChunk.create({
        data: {
          id: newId(),
          characterId: input.characterId,
          userId: input.userId,
          type: "relation_summary",
          ordinal: 0,
          content: summary,
          tokens: estimateTokens(summary),
          metadata,
        },
        select: { id: true },
      });

  await prisma.personaState.updateMany({
    where: {
      userId: input.userId,
      characterId: input.characterId,
    },
    data: {
      relationSummary: summary,
    },
  });
  await attachEmbedding(chunk.id, summary);
  return { updated: true, chunkId: chunk.id, summary };
}
