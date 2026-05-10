ALTER TYPE "BotTaskType" ADD VALUE IF NOT EXISTS 'refresh_interest_news';
ALTER TYPE "BotTaskType" ADD VALUE IF NOT EXISTS 'rollup_episode';
ALTER TYPE "BotTaskType" ADD VALUE IF NOT EXISTS 'rollup_relation';

DO $$
BEGIN
  CREATE TYPE "AppEventLevel" AS ENUM ('debug', 'info', 'warn', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "BotTask"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BotTask_dedupeKey_key"
  ON "BotTask"("dedupeKey");
CREATE INDEX IF NOT EXISTS "BotTask_status_nextRetryAt_scheduledAt_idx"
  ON "BotTask"("status", "nextRetryAt", "scheduledAt");

CREATE TABLE IF NOT EXISTS "AppEventLog" (
  "id" TEXT NOT NULL,
  "level" "AppEventLevel" NOT NULL DEFAULT 'info',
  "event" TEXT NOT NULL,
  "message" TEXT,
  "userId" TEXT,
  "characterId" TEXT,
  "sessionId" TEXT,
  "taskId" TEXT,
  "model" TEXT,
  "status" TEXT,
  "latencyMs" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppEventLog_createdAt_idx"
  ON "AppEventLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AppEventLog_level_createdAt_idx"
  ON "AppEventLog"("level", "createdAt");
CREATE INDEX IF NOT EXISTS "AppEventLog_event_createdAt_idx"
  ON "AppEventLog"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AppEventLog_taskId_idx"
  ON "AppEventLog"("taskId");
CREATE INDEX IF NOT EXISTS "AppEventLog_sessionId_createdAt_idx"
  ON "AppEventLog"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppEventLog_characterId_createdAt_idx"
  ON "AppEventLog"("characterId", "createdAt");

ALTER TABLE "AppEventLog"
  ADD CONSTRAINT "AppEventLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppEventLog"
  ADD CONSTRAINT "AppEventLog_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppEventLog"
  ADD CONSTRAINT "AppEventLog_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppEventLog"
  ADD CONSTRAINT "AppEventLog_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "BotTask"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
