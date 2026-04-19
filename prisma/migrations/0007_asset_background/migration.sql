-- 0007_asset_background
-- AssetKind enum 에 'background' 추가.
-- 배경 전용 에셋 (인물 없음) 을 별도 kind 로 분리해 픽커가 섞이지 않게 한다.
-- RoomBackdrop (ChatShell 뒤에 blur 깔리는 레이어) 의 소스.

ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'background';
