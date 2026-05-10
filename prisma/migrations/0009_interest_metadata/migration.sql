ALTER TYPE "KnowledgeSource" ADD VALUE IF NOT EXISTS 'news_feed';
ALTER TYPE "KnowledgeSource" ADD VALUE IF NOT EXISTS 'character_extraction';

CREATE TABLE IF NOT EXISTS "CharacterInterest" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "freshnessHours" INTEGER NOT NULL DEFAULT 24,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterInterest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeChunkMetadata" (
  "id" TEXT NOT NULL,
  "chunkId" TEXT NOT NULL,
  "weight" DOUBLE PRECISION,
  "importance" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION,
  "topic" TEXT,
  "tags" TEXT[],
  "sourceUrls" TEXT[],
  "sourceTitle" TEXT,
  "sourceName" TEXT,
  "sourcePublishedAt" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeChunkMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterInterest_characterId_query_key"
  ON "CharacterInterest"("characterId", "query");
CREATE INDEX IF NOT EXISTS "CharacterInterest_characterId_enabled_priority_idx"
  ON "CharacterInterest"("characterId", "enabled", "priority");

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeChunkMetadata_chunkId_key"
  ON "KnowledgeChunkMetadata"("chunkId");
CREATE INDEX IF NOT EXISTS "KnowledgeChunkMetadata_topic_idx"
  ON "KnowledgeChunkMetadata"("topic");
CREATE INDEX IF NOT EXISTS "KnowledgeChunkMetadata_sourcePublishedAt_idx"
  ON "KnowledgeChunkMetadata"("sourcePublishedAt");
CREATE INDEX IF NOT EXISTS "KnowledgeChunkMetadata_expiresAt_idx"
  ON "KnowledgeChunkMetadata"("expiresAt");

ALTER TABLE "CharacterInterest"
  ADD CONSTRAINT "CharacterInterest_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeChunkMetadata"
  ADD CONSTRAINT "KnowledgeChunkMetadata_chunkId_fkey"
  FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
