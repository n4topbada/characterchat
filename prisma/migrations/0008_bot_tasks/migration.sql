-- Conversation orchestration tasks for burst replies, lookup continuations,
-- and proactive character messages.

DO $$ BEGIN
  CREATE TYPE "BotTaskType" AS ENUM (
    'respond_to_burst',
    'continue_after_lookup',
    'proactive_news',
    'proactive_memory',
    'proactive_life_event'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BotTaskStatus" AS ENUM (
    'pending',
    'running',
    'completed',
    'cancelled',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "BotTask" (
  "id"          TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "type"        "BotTaskType" NOT NULL,
  "status"      "BotTaskStatus" NOT NULL DEFAULT 'pending',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "payload"     JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt"   TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error"       TEXT,

  CONSTRAINT "BotTask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BotTask"
  ADD CONSTRAINT "BotTask_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotTask"
  ADD CONSTRAINT "BotTask_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotTask"
  ADD CONSTRAINT "BotTask_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "BotTask_sessionId_status_scheduledAt_idx"
  ON "BotTask"("sessionId", "status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "BotTask_characterId_scheduledAt_idx"
  ON "BotTask"("characterId", "scheduledAt");

CREATE INDEX IF NOT EXISTS "BotTask_userId_status_scheduledAt_idx"
  ON "BotTask"("userId", "status", "scheduledAt");
