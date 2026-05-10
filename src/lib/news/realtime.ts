import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { newId } from "@/lib/ids";
import { estimateTokens } from "@/lib/rag/chunk";
import { embedText, toVectorLiteral } from "@/lib/rag/embed";
import { GEMINI_MODELS, withGeminiFallback } from "@/lib/gemini/client";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";

export type NewsTrigger = {
  shouldSearch: boolean;
  query: string;
  reason: string;
  urgency: "normal" | "high";
};

const NEWS_HINTS =
  /(기사|뉴스|속보|방금|지금 막|떴|봤어|봤냐|알아|사귄|연애|공연|컴백|발표|사건|전쟁|사고|논란|트렌드|실시간|오늘|어제|지난주)/i;

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function detectNewsTrigger(args: {
  message: string;
  characterName: string;
  interests: Array<{ label: string; query: string }>;
}): NewsTrigger {
  const msg = compact(args.message);
  const urgent = /(속보|전쟁|사고|사망|테러|방금|지금 막|긴급)/i.test(msg);
  const matchedInterest = args.interests.find((i) => {
    const label = i.label.trim();
    const query = i.query.trim();
    return (
      (label.length >= 2 && msg.toLowerCase().includes(label.toLowerCase())) ||
      (query.length >= 2 && msg.toLowerCase().includes(query.toLowerCase()))
    );
  });

  if (matchedInterest && NEWS_HINTS.test(msg)) {
    return {
      shouldSearch: true,
      query: `${matchedInterest.query} ${msg}`.slice(0, 240),
      reason: "interest_news_mention",
      urgency: urgent ? "high" : "normal",
    };
  }

  if (NEWS_HINTS.test(msg) && /[A-Za-z가-힣0-9]{2,}/.test(msg)) {
    return {
      shouldSearch: true,
      query: msg.slice(0, 240),
      reason: "explicit_news_mention",
      urgency: urgent ? "high" : "normal",
    };
  }

  return {
    shouldSearch: false,
    query: "",
    reason: "none",
    urgency: "normal",
  };
}

function extractUrlsFromGrounding(meta: unknown): string[] {
  const urls = new Set<string>();
  const root = meta as {
    groundingChunks?: Array<{ web?: { uri?: string } }>;
    groundingSupports?: Array<{ groundingChunkIndices?: number[] }>;
  } | null;
  for (const chunk of root?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (uri) urls.add(uri);
  }
  return [...urls].slice(0, 8);
}

export async function searchRealtimeNews(args: {
  query: string;
  characterName: string;
  nowLabel: string;
}): Promise<{ summary: string; sourceUrls: string[]; raw: unknown }> {
  const prompt = [
    "너는 캐릭터 챗용 실시간 뉴스 리서처다.",
    "Google Search grounding을 사용해 사용자의 화제에 대한 최신 사실만 요약한다.",
    "루머/확인 안 된 내용은 확인 안 됐다고 명시한다.",
    "캐릭터가 대화에서 자연스럽게 쓸 수 있도록 4~7개 bullet로 한국어 요약한다.",
    "날짜와 시간 맥락을 가능한 한 구체적으로 포함한다.",
    "",
    `현재 시각: ${args.nowLabel}`,
    `캐릭터: ${args.characterName}`,
    `검색 질의: ${args.query}`,
  ].join("\n");

  const result = await withGeminiFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODELS.pro,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        safetySettings: PERMISSIVE_SAFETY,
        tools: [{ googleSearch: {} }],
      } as never,
    });
    return {
      text: resp.text ?? "",
      raw: resp.candidates?.[0]?.groundingMetadata ?? null,
    };
  });

  return {
    summary: result.text.trim(),
    sourceUrls: extractUrlsFromGrounding(result.raw),
    raw: result.raw,
  };
}

export async function saveRealtimeNewsChunk(args: {
  characterId: string;
  userId?: string | null;
  sessionId?: string | null;
  topic: string;
  summary: string;
  sourceUrls: string[];
  raw?: unknown;
  ttlHours?: number;
}) {
  const chunkId = newId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (args.ttlHours ?? 48) * 60 * 60 * 1000);
  const metadata = {
    weight: 0.95,
    importance: 0.85,
    confidence: args.sourceUrls.length ? 0.8 : 0.55,
    tags: ["realtime_news", args.topic],
    sourceUrls: args.sourceUrls,
    fetchedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    topic: args.topic,
  };

  await prisma.knowledgeChunk.create({
    data: {
      id: chunkId,
      characterId: args.characterId,
      userId: args.userId ?? null,
      sessionId: args.sessionId ?? null,
      type: "external_info",
      ordinal: 0,
      content: args.summary,
      tokens: estimateTokens(args.summary),
      metadata,
      meta: {
        create: {
          id: newId(),
          weight: 0.95,
          importance: 0.85,
          confidence: metadata.confidence,
          topic: args.topic,
          tags: metadata.tags,
          sourceUrls: args.sourceUrls,
          fetchedAt: now,
          expiresAt,
          raw: args.raw == null ? Prisma.JsonNull : (args.raw as Prisma.InputJsonValue),
        },
      },
    },
  });

  const vec = await embedText(args.summary).catch(() => null);
  if (vec) {
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
      toVectorLiteral(vec.vector),
      chunkId,
    );
  }

  return chunkId;
}

export async function draftProactiveNewsLine(args: {
  characterName: string;
  speechHint?: string | null;
  summary: string;
  nowLabel: string;
}): Promise<string> {
  const prompt = [
    "캐릭터가 먼저 보내는 아주 짧은 채팅 메시지를 작성한다.",
    "뉴스 요약을 보고, 캐릭터가 자기 관심사에 반응하듯 자연스럽게 말한다.",
    "1~3문장만. 출처 목록이나 설명문 금지. 과장/확정되지 않은 루머 단정 금지.",
    "캐릭터 말투 힌트가 있으면 반영한다.",
    "",
    `캐릭터: ${args.characterName}`,
    `말투 힌트: ${args.speechHint ?? "(없음)"}`,
    `현재 시각: ${args.nowLabel}`,
    "뉴스 요약:",
    args.summary,
  ].join("\n");

  const text = await withGeminiFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODELS.chatFallback,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.75,
        maxOutputTokens: 512,
        safetySettings: PERMISSIVE_SAFETY,
      },
    });
    return resp.text ?? "";
  });
  return text.replace(/\s+/g, " ").trim().slice(0, 600);
}
