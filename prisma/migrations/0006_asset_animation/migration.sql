-- 0006_asset_animation
-- Asset 에 animationUrl 추가. Veo 3.1 Lite 로 생성한 portrait 애니메이션
-- (animated webp, 540x810 Q75 12fps) 의 공개 URL 을 저장한다.
-- 기존 레코드는 NULL — 생성 파이프 돌리기 전에는 정지 이미지로 대체 렌더.

ALTER TABLE "Asset" ADD COLUMN "animationUrl" TEXT;
