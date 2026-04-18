# 08 · RAG — LLM 리서치 기반

파일 업로드 파서는 **없다**. 모든 지식은 LLM이 웹을 검색·요약해서 만든 구조화 텍스트다.

## 전체 플로우

```
[Admin Knowledge Tab]
        │
        ▼
 주제 입력 (예: "고대 알렉산드리아 도서관의 일과와 관리")
        │
        ▼
 POST /api/admin/characters/:id/knowledge/research
        │
        ▼
┌──────────────────────────────────────────────┐
│ 서버: research 파이프 (src/lib/rag/research.ts) │
│                                                │
│  loop N 회 (최대 도구 호출 상한):             │
│   1. Gemini → web_search(topic)              │
│   2. 결과 상위 K 개 URL                       │
│   3. fetch_url(url) → readability 클린       │
│   4. Gemini → "이 자료를 주제에 맞게         │
│        구조화 요약 + 인용 출처 포함해 내놔"  │
│   5. 요약 텍스트 누적                        │
│                                                │
│  종료 후:                                      │
│   6. 텍스트 청크(400 tok, overlap 50)         │
│   7. 각 청크 embed(text-embedding-004)       │
│   8. KnowledgeDoc + KnowledgeChunk upsert    │
│   9. HNSW 인덱스는 자동                      │
└──────────────────────────────────────────────┘
        │
        ▼
 /admin Knowledge 탭에 Doc 목록 반영
```

## 청크 전략
- 청크 크기: ~400 토큰 (한국어 기준 600~800자).
- 오버랩: 50 토큰.
- 경계 우선순위: 문단 → 문장 → 임의.
- 청크 구현: `src/lib/rag/chunk.ts` — `chunkByTokens(text, { size:400, overlap:50 })`.
- 토큰 카운트는 Gemini 텍스트 카운트 API 또는 근사치(char/2.3)로.

## 임베딩
- 모델: `text-embedding-004` (Gemini, 768차원).
- 배치: 한 번에 최대 100개 청크 → `@google/genai` batch embed.
- 결과 float[768]을 `pgvector` 포맷 문자열 `'[0.012,0.034,…]'` 로 직접 삽입(raw SQL).

## 저장 스키마 복습
- `KnowledgeDoc`: 1 주제 요약 전체 텍스트(`rawText`) + `sourceUrls`.
- `KnowledgeChunk`: Doc을 쪼갠 조각 + `embedding vector(768)`.

## 인덱스
```sql
CREATE INDEX "KnowledgeChunk_embedding_hnsw"
  ON "KnowledgeChunk"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

런타임 옵션:
```sql
SET LOCAL hnsw.ef_search = 80;  -- precision 올리고 싶을 때
```

## 검색 (chat pipeline)

`src/lib/rag/retrieve.ts`:
```ts
export async function retrieveChunks(characterId: string, query: string, k = 5) {
  const vec = await embed(query); // float[768]
  const vecLit = `[${vec.join(",")}]`;
  const rows = await prisma.$queryRaw<Array<{ id: string; content: string; distance: number }>>`
    SELECT id, content, 1 - (embedding <=> ${vecLit}::vector) AS distance
    FROM "KnowledgeChunk"
    WHERE "characterId" = ${characterId}
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${k};
  `;
  return rows;
}
```

- `<=>` 는 pgvector 코사인 연산자. 작을수록 가깝다.
- `1 - distance` 를 "유사도"로 노출(UI에서 점수 표시 가능).

## 채팅 주입 형식

Chat pipeline(§`07-llm-config.md`)에서 `[Knowledge]` 블록으로 삽입:

```
[Knowledge]
- (chunk1.content)
- (chunk2.content)
- …
```

## MMR 재정렬 (옵션)
- 다양성을 위해 top-10 뽑은 뒤 MMR(λ=0.5)로 top-5 재선택.
- M3 시점은 단순 top-k, M5에서 MMR 확장.

## 재임베딩
- 모델 변경(예: 768→1024 차원 모델로 업그레이드) 시 마이그레이션 필요:
  1. `ALTER COLUMN embedding vector(1024)` + 인덱스 재생성.
  2. 모든 Chunk를 새 모델로 다시 embed.
- `POST /api/admin/knowledge/[docId]/reindex` 엔드포인트가 Doc 단위 재임베딩 수행.

## 범위/한계
- 업로드 파서 없음 — 관리자가 가진 텍스트 파일을 올려 바로 지식화 하려면 "주제 입력 대신 raw 텍스트 붙여넣기" 모드를 Knowledge 탭에 옵션으로 노출한다(`admin_edit` source).
- Caster가 `research_knowledge` 도구 호출 시 동일 파이프(`src/lib/rag/research.ts`)를 재사용한다 → 코드 중복 없음.
