import { MODELS, withGeminiFallback } from "@/lib/gemini/client";

export type EmbedResult = { vector: number[]; dim: number };

/**
 * 단일 텍스트 임베딩. text-embedding-004 는 768차원.
 * 폴백 키 구조 자동 사용.
 */
export async function embedText(text: string): Promise<EmbedResult> {
  return withGeminiFallback(async (ai) => {
    const resp = await ai.models.embedContent({
      model: MODELS.embed,
      contents: [{ role: "user", parts: [{ text }] }],
    });
    const values =
      resp.embeddings?.[0]?.values ??
      (resp as unknown as { embedding?: { values?: number[] } })?.embedding
        ?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error("embedding_response_malformed");
    }
    return { vector: values, dim: values.length };
  });
}

/**
 * 배치 임베딩. 현 SDK 가 한 번에 여러 text 를 받아도 결과가 배치가 아닌 경우가 있어
 * Promise.all 로 안전하게 병렬화한다. 호출자가 동시성을 조절해야 할 정도로
 * 많은 입력일 경우만 chunking 고려.
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult[]> {
  return Promise.all(texts.map((t) => embedText(t)));
}

/** pgvector literal 로 직렬화 — raw SQL 파라미터에 쓴다. */
export function toVectorLiteral(vec: number[]): string {
  return "[" + vec.map((v) => (Number.isFinite(v) ? v : 0)).join(",") + "]";
}
