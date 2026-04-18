# 11 · Assets

캐릭터 이미지(포트레이트·히어로·갤러리)는 Vercel Blob에 저장하고, DB에는 `Asset` row에 URL과 메타데이터를 보관한다.

## Blob 경로 규칙

```
characters/{characterId}/portrait-{ulid}.webp
characters/{characterId}/hero-{ulid}.webp
characters/{characterId}/gallery-{ulid}.webp
```

- 파일명 내 `{ulid}` 로 중복 방지 + 기록성 유지.
- 동일 Asset 교체 시 덮어쓰기 대신 "새 파일 + 기존 Asset row 삭제 + Blob 삭제" 패턴(히스토리 감사 단순화).

## sharp 파이프라인

`src/lib/assets/image.ts` (의사):
```ts
export async function processPortrait(buffer: Buffer) {
  return sharp(buffer)
    .rotate()                  // EXIF 반영
    .resize(1080, 1440, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}
export async function processHero(buffer: Buffer) {
  return sharp(buffer).rotate().resize(1920, 1080, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
}
export async function processGallery(buffer: Buffer) {
  return sharp(buffer).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
```

- 원본이 webp/avif 여도 일관성 위해 webp로 재-인코딩.
- 얼굴/주의 위치로 crop (`position: 'attention'`).

## 업로드 플로우

`POST /api/admin/characters/[id]/assets` (multipart):
1. `withAdmin` 가드.
2. `formData().get('file')` → Buffer.
3. `kind` 에 맞는 processXxx 실행.
4. `put(path, buffer, { access:'public', token: BLOB_READ_WRITE_TOKEN })` — `@vercel/blob`.
5. Asset row 생성, 필요 시 `Character.portraitAssetId` / `heroAssetId` 갱신.
6. 응답: Asset 전체 row.

```ts
import { put } from "@vercel/blob";
const { url } = await put(path, processed, { access: "public", contentType: "image/webp" });
```

## 삭제
`DELETE /api/admin/assets/[id]`:
1. Asset row 조회 → `blobUrl` 에서 path 추출(또는 pathname 직접 보관 권장; 확장 시 `Asset.pathname` 컬럼 추가).
2. `del(url)` — Blob 제거.
3. DB row 제거.
4. 캐릭터의 `portraitAssetId` 가 해당 id 였다면 null 로.

## 카드 스펙 (캐러셀)

- 카드 크기: `w-full aspect-[3/4] max-w-md`.
- 이미지: `object-cover`, 3:4 crop.
- 포트레이트 없음: `/public/brand/placeholder-portrait.svg` (회색 실루엣, 이모지 없음).
- 스크림: 하단 60%에 `bg-gradient-to-t from-black/70 via-black/30 to-transparent`.
- 텍스트 색: 흰색 (`text-white`). 카드 안에서만 예외적으로 흰 텍스트 허용.

## 히어로 (랜딩)

- `/characters/[slug]` 상단. 없으면 portrait crop 을 보여줌.
- `w-full aspect-[16/9] max-w-md`.

## 이미지 최적화
- Next/Image 사용 → `remotePatterns` 에 Blob 도메인 허용(next.config.ts).
- `priority` 는 `/find` 의 중앙 카드만.
- `sizes="(max-width: 768px) 100vw, 768px"`.

## 용량 상한
- 단일 업로드 ≤ 10MB (multipart 서버 측 검증).
- 캐릭터당 갤러리 10장 제한.
- 시그니처: Vercel Blob 이 자동 CDN 캐시.

## 향후
- Asset `variants[]` — 다양한 크기를 함께 저장(400/800/1600) 해서 반응형 srcset.
- Caster 이미지 생성 시 자동 업스케일(`sharp + superresolution`)은 오버엔지니어링이므로 보류.
