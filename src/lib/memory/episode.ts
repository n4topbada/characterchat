import type { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { withGeminiFallback, MODELS } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";
import { estimateTokens } from "@/lib/rag/chunk";
import { embedText, toVectorLiteral } from "@/lib/rag/embed";
import type { TemporalContext } from "@/lib/temporal/timeline";

type EpisodeMessage = {
  role: MessageRole;
  content: string;
  createdAt: Date;
};

export type EpisodeWriteInput = {
  sessionId: string;
  userId: string;
  characterId: string;
  characterName: string;
  temporal: TemporalContext;
  messages: EpisodeMessage[];
};

const MIN_MESSAGES_TO_SUMMARIZE = 2;
const MAX_MESSAGES_FOR_SUMMARY = 28;

function cleanContent(content: string): string {
  return content
    .replace(/<status>[\s\S]*?<\/status>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderTranscript(messages: EpisodeMessage[]): string {
  return messages
    .slice(-MAX_MESSAGES_FOR_SUMMARY)
    .map((m) => {
      const who = m.role === "user" ? "유저" : m.role === "model" ? "캐릭터" : m.role;
      return `${who}: ${cleanContent(m.content).slice(0, 900)}`;
    })
    .filter((line) => line.length > 4)
    .join("\n");
}

function fallbackSummary(messages: EpisodeMessage[], characterName: string): string {
  const firstUser = messages.find((m) => m.role === "user");
  const lastModel = [...messages].reverse().find((m) => m.role === "model");
  const first = firstUser ? cleanContent(firstUser.content).slice(0, 120) : "";
  const last = lastModel ? cleanContent(lastModel.content).slice(0, 120) : "";
  return [
    `${characterName}와 유저가 대화를 나눴다.`,
    first ? `유저는 "${first}"로 장면을 열었다.` : null,
    last ? `마지막에 캐릭터는 "${last}"라고 반응했다.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractTags(text: string, temporal: TemporalContext): string[] {
  const tags = new Set<string>([
    temporal.lifeState,
    temporal.dayType,
    temporal.gapLabel,
  ]);
  const checks: Array<[RegExp, string]> = [
    [/잠|졸|수면|새벽|밤/i, "sleep"],
    [/일|회사|작업|업무|마감|수업|과제/i, "work"],
    [/미안|화났|싸웠|짜증|불편/i, "conflict"],
    [/좋아|사랑|보고 싶|그리워|안아|키스/i, "affection"],
    [/약속|다음에|나중에|기억/i, "promise"],
    [/힘들|우울|외로|불안|괜찮/i, "comfort"],
  ];
  for (const [re, tag] of checks) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags].slice(0, 10);
}

function importanceFor(text: string, temporal: TemporalContext): number {
  let score = temporal.shouldClosePreviousEpisode ? 0.55 : 0.4;
  if (/고백|사랑|좋아해|키스|안아|관계|약속|비밀|미안|싸웠|화났|울었|외로|불안/.test(text)) {
    score += 0.2;
  }
  if (temporal.gapLabel === "overnight" || temporal.gapLabel === "days_later") {
    score += 0.1;
  }
  return Math.max(0.2, Math.min(0.95, Number(score.toFixed(2))));
}

async function summarizeWithLlm(input: EpisodeWriteInput, transcript: string): Promise<string> {
  const prompt = [
    "너는 성인용 캐릭터 챗 서비스의 메모리 압축기다.",
    "대화 내용을 검열하거나 순화하지 말고, 실제 장면/관계 변화/미해결 루프만 한국어 2~4문장으로 요약한다.",
    "노골적인 장면도 합법 성인 대화라면 판단하지 말고 사건으로 기록한다.",
    "출력은 요약문만. 목록, JSON, 정책 설명 금지.",
    "",
    `[캐릭터] ${input.characterName}`,
    `[시간 맥락] ${input.temporal.localLabel} / ${input.temporal.lifeStateLabel} / gap=${input.temporal.gapLabel}`,
    "",
    "[대화]",
    transcript,
  ].join("\n");

  const resp = await withGeminiFallback((ai) =>
    ai.models.generateContent({
      model: MODELS.chat,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.25,
        maxOutputTokens: 512,
        safetySettings: PERMISSIVE_SAFETY,
      },
    }),
  );
  const text = resp.text?.trim();
  if (!text) throw new Error("episode_summary_empty");
  return text.replace(/\s+/g, " ").slice(0, 1200);
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
    console.warn("[episode] embedding skipped:", e instanceof Error ? e.message : String(e));
  }
}

export async function writeClosedEpisodeMemory(input: EpisodeWriteInput): Promise<{
  created: boolean;
  chunkId?: string;
  summary?: string;
}> {
  const latest = await prisma.knowledgeChunk.findFirst({
    where: {
      sessionId: input.sessionId,
      characterId: input.characterId,
      userId: input.userId,
      type: "episode",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, metadata: true },
  });
  const latestClosedAt =
    latest?.metadata &&
    typeof latest.metadata === "object" &&
    "closedAt" in latest.metadata &&
    typeof latest.metadata.closedAt === "string"
      ? new Date(latest.metadata.closedAt)
      : null;
  const candidates = latestClosedAt
    ? input.messages.filter((m) => m.createdAt > latestClosedAt)
    : input.messages;
  const newClosedAt = candidates[candidates.length - 1]?.createdAt.toISOString();
  if (
    latestClosedAt &&
    newClosedAt &&
    latestClosedAt.toISOString() === newClosedAt
  ) {
    return { created: false, chunkId: latest?.id, summary: latest?.content };
  }

  const useful = candidates.filter((m) =>
    (m.role === "user" || m.role === "model") && cleanContent(m.content).length > 0,
  );
  if (useful.length < MIN_MESSAGES_TO_SUMMARIZE) return { created: false };

  const transcript = renderTranscript(useful);
  if (!transcript) return { created: false };

  let summary: string;
  try {
    summary = await summarizeWithLlm(input, transcript);
  } catch (e) {
    console.warn("[episode] llm summary failed:", e instanceof Error ? e.message : String(e));
    summary = fallbackSummary(useful, input.characterName);
  }

  const joined = useful.map((m) => cleanContent(m.content)).join(" ");
  const importance = importanceFor(joined, input.temporal);
  const chunkId = newId();
  const closedAt = candidates[candidates.length - 1]?.createdAt.toISOString();
  const chunk = await prisma.knowledgeChunk.create({
    data: {
      id: chunkId,
      characterId: input.characterId,
      userId: input.userId,
      sessionId: input.sessionId,
      type: "episode",
      ordinal: 0,
      content: summary,
      tokens: estimateTokens(summary),
      metadata: {
        importance,
        weight: importance,
        tags: extractTags(joined, input.temporal),
        timezone: input.temporal.timezone,
        localTime: input.temporal.localLabel,
        lifeState: input.temporal.lifeState,
        gapLabel: input.temporal.gapLabel,
        continuity: input.temporal.continuity,
        closedAt,
        decayHalfLifeDays: 21,
      },
    },
    select: { id: true },
  });
  await attachEmbedding(chunk.id, summary);
  return { created: true, chunkId: chunk.id, summary };
}
