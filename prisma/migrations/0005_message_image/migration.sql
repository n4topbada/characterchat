-- 0005_message_image
-- Message 에 optional imageAssetId 를 붙여서 모델 응답에 선택된 Asset 을
-- 참조한다. Asset 이 삭제되면 SET NULL (메시지는 남는다).

ALTER TABLE "Message" ADD COLUMN "imageAssetId" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_imageAssetId_fkey"
  FOREIGN KEY ("imageAssetId") REFERENCES "Asset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_imageAssetId_idx" ON "Message"("imageAssetId");
