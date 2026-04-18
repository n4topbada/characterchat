# 13 · Deployment

Vercel + Neon 조합을 기본으로 한다.

## Neon Postgres 셋업

1. Neon 대시보드 → 새 프로젝트 생성.
2. Database → Extensions → **vector** 활성화(Neon UI에서 원클릭).
3. 브랜치 `main` 의 connection string 복사 → `DATABASE_URL`.

```
DATABASE_URL=postgresql://<user>:<pass>@<host>.neon.tech/characterchat?sslmode=require
```

## Google OAuth 앱

1. [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 Client ID 생성.
2. Authorized redirect URIs:
   - `https://<your-domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
3. `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 획득.

## Vercel Blob

1. Vercel 프로젝트 → Storage → Create Blob Store.
2. `BLOB_READ_WRITE_TOKEN` 자동 생성 확인.

## 환경변수 카탈로그

| 키 | 로컬 | Vercel | 비고 |
|---|---|---|---|
| AUTH_SECRET | O | O | openssl rand -base64 32 |
| AUTH_GOOGLE_ID | O | O | Google console |
| AUTH_GOOGLE_SECRET | O | O | Google console |
| DATABASE_URL | O | O | Neon |
| GOOGLE_GENAI_API_KEY | O | O | aistudio.google.com |
| BLOB_READ_WRITE_TOKEN | O | O | Vercel Blob |
| ADMIN_EMAILS | O(seed) | O(seed) | 쉼표 구분 |
| NODE_ENV | auto | auto | dev-login 제어 |

## 마이그레이션 순서 (최초 배포)

로컬:
```bash
npm install
cp .env.example .env
# .env 채우기
npx prisma migrate dev --name init      # 0001_init 생성
npx prisma migrate dev                   # 0002_pgvector 적용
npm run db:seed
npm run dev
```

Vercel:
1. 프로젝트 import.
2. 환경변수 주입(위 카탈로그).
3. Build Command: `next build` (package.json 의 scripts.build 가 `prisma generate && next build`).
4. Install Command: 기본 npm (postinstall 이 prisma generate 실행).
5. 첫 배포 전에 수동으로 Neon에 마이그레이션 적용:
   ```bash
   DATABASE_URL=<prod> npx prisma migrate deploy
   DATABASE_URL=<prod> npm run db:seed
   ```
6. 이후 마이그레이션은 CI에서 `prisma migrate deploy`를 배포 전 훅으로.

## 런타임 설정
- Next.js Route Handler runtime 기본 `nodejs`. Edge 금지(`@google/genai`).
- `serverExternalPackages: ['@google/genai', 'sharp']` 필수.
- Vercel Functions 타임아웃: 기본 10초 → SSE 스트리밍은 `maxDuration = 60` 으로 상향 (Pro 플랜). 필요 시 라우트 파일 상단에 `export const maxDuration = 60`.

## 도메인 / HTTPS
- Vercel 자동 HTTPS.
- `NEXTAUTH_URL` 은 Vercel 환경변수로 `https://<domain>` 지정하면 안전(production 만).

## 관측
- Vercel Logs — 기본.
- M5: Logtail / Axiom 연동. Gemini 토큰 사용량을 `usage.metadata` 기반으로 커스텀 로그.

## 롤백
- Prisma migration 은 단방향(forward-only). 스키마 변경 시 `prisma migrate reset`은 **개발 DB에서만**.
- 데이터 파괴적 변경(drop column 등)은 마이그레이션을 2단계로 쪼갠다(neue column 추가 → 코드 전환 → old column 드롭).

## 비용 예측 (rough)
- Neon free: 0.5GB 저장 + 적당한 쿼리 — 초기 개발 충분.
- Vercel Hobby: 서버리스 함수 100GB-Hrs / 블롭 1GB 무료 — MVP 용.
- Gemini API: flash-lite 가격 기준 세션당 수 원. 사용량 모니터링 필요.
- Brave Search API(Caster): 월 2000 쿼리 무료 티어.
