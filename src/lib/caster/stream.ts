// Caster 전용 스트림 래퍼.
// 일반 채팅(streamChat)과 달리 Caster 는
//   1) Google 검색 그라운딩을 켜서 실존 인물/작품을 사실 기반으로 참조하고
//   2) 텍스트 델타와 그라운딩 메타데이터(검색 쿼리, 소스 링크)를 각각 이벤트로 흘려준다.
//
// 안전 설정은 일반 채팅과 달리 Gemini 기본값을 사용한다. Caster 는
// 관리자 전용 설계 도구라 크리에이티브 필터는 과하지 않아도 된다.

import { withGeminiFallback } from "@/lib/gemini/client";

// 멀티모달 대응 — 턴은 parts 배열로 구성된다 (텍스트 + 인라인 이미지).
export type CasterContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type CasterHistoryTurn = {
  role: "user" | "model";
  parts: CasterContentPart[];
};

export type CasterSource = {
  uri: string;
  title?: string;
  domain?: string;
};

export type CasterStreamEvent =
  | { type: "text"; text: string }
  | { type: "search_queries"; queries: string[] }
  | { type: "sources"; sources: CasterSource[] };

type Args = {
  model: string;
  systemInstruction: string;
  history: CasterHistoryTurn[];
  /** 기본 true. 실존 참조가 필요 없으면 false 로 꺼서 일반 대화로. */
  enableSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
};

type GroundingChunkLike = {
  web?: { uri?: string; title?: string; domain?: string };
};

type GroundingMetaLike = {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunkLike[];
};

type CandidateLike = {
  groundingMetadata?: GroundingMetaLike;
};

type StreamChunkLike = {
  text?: string;
  candidates?: CandidateLike[];
};

export async function* streamCaster(
  args: Args,
): AsyncGenerator<CasterStreamEvent> {
  const contents = args.history.map((turn) => ({
    role: turn.role === "model" ? "model" : "user",
    parts: turn.parts,
  }));

  const tools =
    args.enableSearch === false ? undefined : [{ googleSearch: {} }];

  const resp = await withGeminiFallback((ai) =>
    ai.models.generateContentStream({
      model: args.model,
      contents,
      config: {
        systemInstruction: args.systemInstruction,
        temperature: args.temperature ?? 0.7,
        maxOutputTokens: args.maxOutputTokens ?? 2048,
        ...(tools ? { tools } : {}),
      },
    }),
  );

  // 같은 쿼리/URL 을 중복 emit 하지 않도록 누적
  const seenQueries = new Set<string>();
  const seenUris = new Set<string>();

  for await (const raw of resp) {
    const chunk = raw as unknown as StreamChunkLike;

    const text = chunk.text;
    if (text) yield { type: "text", text };

    const meta = chunk.candidates?.[0]?.groundingMetadata;
    if (!meta) continue;

    if (meta.webSearchQueries?.length) {
      const fresh = meta.webSearchQueries.filter((q) => {
        if (!q || seenQueries.has(q)) return false;
        seenQueries.add(q);
        return true;
      });
      if (fresh.length) yield { type: "search_queries", queries: fresh };
    }

    if (meta.groundingChunks?.length) {
      const sources: CasterSource[] = [];
      for (const c of meta.groundingChunks) {
        const uri = c.web?.uri;
        if (!uri || seenUris.has(uri)) continue;
        seenUris.add(uri);
        sources.push({
          uri,
          title: c.web?.title,
          domain: c.web?.domain,
        });
      }
      if (sources.length) yield { type: "sources", sources };
    }
  }
}
