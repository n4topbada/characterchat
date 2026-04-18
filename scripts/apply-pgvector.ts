// scripts/apply-pgvector.ts
// 0002_pgvector/migration.sql 를 raw SQL 로 직접 실행. db push 로 스키마 동기화 후
// embedding vector(768) 컬럼 + HNSW 인덱스만 별도로 추가한다.

import { prisma } from "@/lib/db";

async function run() {
  console.log("[pgvector] CREATE EXTENSION vector ...");
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  console.log("[pgvector] ADD COLUMN embedding vector(768) ...");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(768)`,
  );

  console.log("[pgvector] CREATE INDEX HNSW ...");
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw"
       ON "KnowledgeChunk"
       USING hnsw ("embedding" vector_cosine_ops)
       WITH (m = 16, ef_construction = 64)`,
  );

  console.log("[pgvector] ✓ done");
}

run()
  .catch((e) => {
    console.error("[pgvector] FATAL", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
