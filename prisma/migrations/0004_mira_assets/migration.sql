-- 0004_mira_assets
-- Character.nsfwEnabled + Asset 의 태그 컬럼 확장.
-- 기존 캐릭터(aria/yura/jun) 에 대해서는 전부 NULL/empty/false 로 기본값 채워짐.

ALTER TABLE "Character" ADD COLUMN "nsfwEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "Asset" ADD COLUMN "sceneTag"    TEXT;
ALTER TABLE "Asset" ADD COLUMN "expression"  TEXT;
ALTER TABLE "Asset" ADD COLUMN "composition" TEXT;
ALTER TABLE "Asset" ADD COLUMN "pose"        TEXT;
ALTER TABLE "Asset" ADD COLUMN "clothingTag" TEXT;
ALTER TABLE "Asset" ADD COLUMN "moodFit"     TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Asset" ADD COLUMN "locationFit" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Asset" ADD COLUMN "nsfwLevel"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN "description" TEXT;
ALTER TABLE "Asset" ADD COLUMN "triggerTags" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX "Asset_characterId_sceneTag_idx"   ON "Asset"("characterId", "sceneTag");
CREATE INDEX "Asset_characterId_nsfwLevel_idx"  ON "Asset"("characterId", "nsfwLevel");
