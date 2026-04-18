-- CharacterChat — Persona (Phase A+B+C) migration
-- 0002_pgvector 이후. 새 enum / 새 모델 / KnowledgeChunk 확장을 모두 추가한다.
--
-- 본 파일은 prisma migrate dev --create-only 로 생성된 diff 를 기반으로
-- 필요한 raw SQL 을 덧붙인 "손으로 조율된" 마이그레이션이다. 실행 순서:
--   1) schema.prisma 를 갱신
--   2) DATABASE_URL 이 올바른지 확인
--   3) npx prisma migrate deploy  (혹은 --create-only 후 이 파일 수동 반영)

-- =============================================================================
-- 1) 새 ENUM
-- =============================================================================

CREATE TYPE "ChunkType" AS ENUM (
  'knowledge',
  'style_anchor',
  'episode',
  'belief',
  'relation_summary',
  'external_info'
);

CREATE TYPE "RelationshipStage" AS ENUM (
  'stranger',
  'acquaintance',
  'friend',
  'close',
  'intimate'
);

-- KnowledgeSource 에 runtime_extraction 값 추가 (Phase B: 대화 중 LLM 이 추출한 정보)
ALTER TYPE "KnowledgeSource" ADD VALUE IF NOT EXISTS 'runtime_extraction';

-- =============================================================================
-- 2) CharacterConfig — 자유서술 프롬프트 필드 제거
--    (PersonaCore + 런타임 composer 가 대체)
-- =============================================================================

ALTER TABLE "CharacterConfig"
  DROP COLUMN IF EXISTS "systemPrompt",
  DROP COLUMN IF EXISTS "characterPromptAddendum",
  DROP COLUMN IF EXISTS "featurePromptAddendum";

-- =============================================================================
-- 3) PersonaCore — 캐릭터 불변 페르소나
-- =============================================================================

CREATE TABLE "PersonaCore" (
  "id"                TEXT PRIMARY KEY,
  "characterId"       TEXT NOT NULL UNIQUE,
  "displayName"       TEXT NOT NULL,
  "aliases"           TEXT[] NOT NULL DEFAULT '{}',
  "pronouns"          TEXT,
  "ageText"           TEXT,
  "gender"            TEXT,
  "species"           TEXT,
  "role"              TEXT,
  "backstorySummary"  TEXT NOT NULL,
  "worldContext"      TEXT,
  "coreBeliefs"       TEXT[] NOT NULL DEFAULT '{}',
  "coreMotivations"   TEXT[] NOT NULL DEFAULT '{}',
  "fears"             TEXT[] NOT NULL DEFAULT '{}',
  "redLines"          TEXT[] NOT NULL DEFAULT '{}',
  "speechRegister"    TEXT,
  "speechEndings"     TEXT[] NOT NULL DEFAULT '{}',
  "speechRhythm"      TEXT,
  "speechQuirks"      TEXT[] NOT NULL DEFAULT '{}',
  "languageNotes"     TEXT,
  "appearanceKeys"    TEXT[] NOT NULL DEFAULT '{}',
  "defaultAffection"  INTEGER NOT NULL DEFAULT 0,
  "defaultTrust"      INTEGER NOT NULL DEFAULT 0,
  "defaultStage"      "RelationshipStage" NOT NULL DEFAULT 'stranger',
  "defaultMood"       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "defaultEnergy"     DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "defaultStress"     DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "defaultStability"  DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "trustSensitivity"     DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "sentimentSensitivity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "stressSensitivity"    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "moodSensitivity"      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "emotionalProcessingSpeed" INTEGER NOT NULL DEFAULT 2,
  "emotionalVolatility"      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "behaviorPatterns"  JSONB,
  "version"           INTEGER NOT NULL DEFAULT 1,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaCore_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- =============================================================================
-- 4) PersonaState — (user, character) 의 동적 상태
-- =============================================================================

CREATE TABLE "PersonaState" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL,
  "characterId"      TEXT NOT NULL,
  "affection"        INTEGER NOT NULL DEFAULT 0,
  "trust"            INTEGER NOT NULL DEFAULT 0,
  "tension"          INTEGER NOT NULL DEFAULT 0,
  "familiarity"      INTEGER NOT NULL DEFAULT 0,
  "stage"            "RelationshipStage" NOT NULL DEFAULT 'stranger',
  "surfaceMood"      TEXT,
  "innerMood"        TEXT,
  "pendingEmotions"  JSONB,
  "statusPayload"    JSONB,
  "relationSummary"  TEXT,
  "lastSnapshotAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaState_user_character_unique" UNIQUE ("userId", "characterId"),
  CONSTRAINT "PersonaState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonaState_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PersonaState_characterId_idx" ON "PersonaState"("characterId");

-- =============================================================================
-- 5) EventTypeTemplate — 캐릭터별 이벤트 카탈로그
-- =============================================================================

CREATE TABLE "EventTypeTemplate" (
  "id"           TEXT PRIMARY KEY,
  "characterId"  TEXT NOT NULL,
  "key"          TEXT NOT NULL,
  "label"        TEXT NOT NULL,
  "description"  TEXT NOT NULL,
  "triggers"     JSONB,
  "stateDelta"   JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTypeTemplate_character_key_unique" UNIQUE ("characterId", "key"),
  CONSTRAINT "EventTypeTemplate_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EventTypeTemplate_characterId_idx" ON "EventTypeTemplate"("characterId");

-- =============================================================================
-- 6) KnowledgeChunk 확장 — type / userId / sessionId / metadata / updatedAt / docId-nullable
-- =============================================================================

-- docId nullable 로 변경 (episode / relation_summary 는 KnowledgeDoc 없이 독립 생성)
ALTER TABLE "KnowledgeChunk"
  ALTER COLUMN "docId" DROP NOT NULL;

-- 새 컬럼
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "type"       "ChunkType" NOT NULL DEFAULT 'knowledge',
  ADD COLUMN IF NOT EXISTS "userId"     TEXT,
  ADD COLUMN IF NOT EXISTS "sessionId"  TEXT,
  ADD COLUMN IF NOT EXISTS "metadata"   JSONB,
  ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ordinal 의 default 추가 (schema.prisma 와 정합)
ALTER TABLE "KnowledgeChunk"
  ALTER COLUMN "ordinal" SET DEFAULT 0;

-- 인덱스 — type / (characterId,userId,type) / sessionId
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_characterId_type_idx"
  ON "KnowledgeChunk" ("characterId", "type");

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_char_user_type_idx"
  ON "KnowledgeChunk" ("characterId", "userId", "type");

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_sessionId_idx"
  ON "KnowledgeChunk" ("sessionId");

-- 부분 FK 는 정책상 캐스케이드로 유지. userId / sessionId 는 느슨한 참조(애플리케이션 레벨에서 관리)
-- 필요 시 아래 FK 를 활성화:
-- ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_userId_fkey"
--   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
-- ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sessionId_fkey"
--   FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE;

-- =============================================================================
-- 7) CasterRun — coverage 필드 추가 (Caster v2 의 커버리지 추적)
-- =============================================================================

ALTER TABLE "CasterRun"
  ADD COLUMN IF NOT EXISTS "coverage" JSONB;

-- =============================================================================
-- 8) 검증
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChunkType') THEN
    RAISE EXCEPTION 'ChunkType enum was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'PersonaCore') THEN
    RAISE EXCEPTION 'PersonaCore table was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'PersonaState') THEN
    RAISE EXCEPTION 'PersonaState table was not created';
  END IF;
END $$;
