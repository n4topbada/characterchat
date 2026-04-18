-- CharacterChat pgvector migration
-- 0001_init 이 생성된 뒤에 수동으로 실행한다.
-- 실행 순서: prisma migrate dev --create-only → 본 파일 수정/추가 → prisma migrate dev

-- 1) 확장 활성화 (Neon/Vercel Postgres는 superuser 권한 필요 없음)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) 임베딩 컬럼 추가 (text-embedding-004 → 768 차원)
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768);

-- 3) HNSW 인덱스 — 코사인 유사도(작을수록 가까움; 연산자 <=>)
-- 참고: HNSW는 IVFFlat보다 precision 높고, 업데이트 비용은 조금 더.
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw"
  ON "KnowledgeChunk"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4) (선택) 검색 시간 조정. 세션/커넥션 단위로 SET ef_search 가능.
--    기본값 40 이 낮다면 앱 코드에서 `SET LOCAL hnsw.ef_search = 80;` 를 트랜잭션 내 실행.
