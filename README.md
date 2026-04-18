# CharacterChat

1:1 AI 캐릭터 채팅. Next.js 16 + Prisma + pgvector + Gemini.
레퍼런스: Crack(wrtn) · Character.ai · KakaoTalk.

> **상태**: 스캐폴딩 + 설계 문서 완료. M0 구현은 `docs/14-roadmap.md` 참조.

## 핵심 결정

- **1 유저 × 1 캐릭터 = 1 세션** (DB `@@unique([userId, characterId])`). 삭제해야 재시작.
- **하단 5탭**: `피드 / 찾기 / 만들기 / 대화 / 나` (KakaoTalk 스타일, `lucide-react` 라인 아이콘).
- **탐색 UI**: `/find` 세로(상하) 캐러셀. CSS `scroll-snap-type: y mandatory`.
- **인증**: NextAuth v5 beta. Google + (개발 전용) Credentials provider. StoryGatcha 패턴 포팅.
- **RAG**: LLM 웹검색 요약만. 파일 업로드 파서 없음.
- **UI**: 임시 중립 팔레트(`stone-50` 배경, `slate-800` 텍스트, `amber-600` 액센트). **네온·다크네이비·이모지 금지**. 최종 CSS는 추후 교체.

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수
cp .env.example .env
# AUTH_SECRET=$(openssl rand -base64 32)
# AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
# DATABASE_URL (Neon)
# GOOGLE_GENAI_API_KEY
# BLOB_READ_WRITE_TOKEN
# ADMIN_EMAILS=me@example.com

# 3. DB 마이그레이션 + pgvector + 샘플 시드
npx prisma migrate dev --name init
npx prisma migrate dev            # 0002_pgvector
npm run db:seed

# 4. 개발 서버
npm run dev                       # http://localhost:3000
```

로컬 admin 테스트: `/auth/signin` 하단 **DEV 로그인** 버튼 (NODE_ENV=development 한정).

## 프로젝트 구조

```
characterchat/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/0001_init · 0002_pgvector
│  └─ seed.ts                 # AdminConfig + 샘플 캐릭터 2명
├─ docs/                      # 00 ~ 17 설계 문서 18종
├─ src/
│  ├─ app/(tabs)/             # 하단 탭 라우트 그룹
│  ├─ app/chat/[sessionId]/   # 탭 바 숨김
│  ├─ app/admin/              # 관리자 콘솔
│  ├─ app/api/                # REST + SSE
│  ├─ components/             # nav/carousel/chat/history/admin
│  ├─ lib/                    # auth · db · gemini · rag · sse
│  └─ styles/globals.css
├─ tailwind.config.ts         # 임시 팔레트 토큰
└─ next.config.ts             # serverExternalPackages:['@google/genai','sharp']
```

## 문서 인덱스

| # | 파일 | 내용 |
|---|---|---|
| 00 | [overview](docs/00-overview.md) | 제품 비전, Non-goals, 레퍼런스 비교 |
| 01 | [tech-stack](docs/01-tech-stack.md) | 스택 + 버전 pin |
| 02 | [architecture](docs/02-architecture.md) | 시스템 다이어그램, 요청 흐름 |
| 03 | [data-model](docs/03-data-model.md) | Prisma 스키마 + pgvector 마이그레이션 |
| 04 | [api](docs/04-api.md) | 모든 라우트 Method/Auth/Zod/에러 |
| 05 | [ui-user](docs/05-ui-user.md) | 탭 · 캐러셀 · 채팅 · 히스토리 · 삭제 UX |
| 06 | [ui-admin](docs/06-ui-admin.md) | /admin 리스트 + 편집 탭 + Caster 콘솔 |
| 07 | [llm-config](docs/07-llm-config.md) | CharacterConfig 필드 · Crack 3-prompt |
| 08 | [rag](docs/08-rag.md) | 리서치 → 청크 → 임베딩 → HNSW |
| 09 | [caster-agent](docs/09-caster-agent.md) | 툴 카탈로그, 루프, 커밋 (M4 full) |
| 10 | [sessions-and-threads](docs/10-sessions-and-threads.md) | 세션 불변식, 요약, regenerate |
| 11 | [assets](docs/11-assets.md) | Blob 경로, sharp, 카드 스펙 |
| 12 | [auth-and-access](docs/12-auth-and-access.md) | NextAuth v5 + dev-login |
| 13 | [deployment](docs/13-deployment.md) | Vercel + Neon, env 카탈로그 |
| 14 | [roadmap](docs/14-roadmap.md) | M0–M5 + DoD |
| 15 | [glossary](docs/15-glossary.md) | 용어 정의 |
| 16 | [ui-style-placeholder](docs/16-ui-style-placeholder.md) | 임시 팔레트 · 금지 컬러 · 교체 절차 |
| 17 | [nav-and-tabs](docs/17-nav-and-tabs.md) | 하단 탭 구현 |

## 스크립트

```
npm run dev          # Next.js dev server
npm run build        # prisma generate && next build
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy (프로덕션)
npm run db:studio    # Prisma Studio
npm run db:seed      # AdminConfig + 샘플 캐릭터
```

## 기여

- `docs/14-roadmap.md` 마일스톤 단위로 작업. 각 M 의 DoD 충족 시 다음 M.
- UI 변경 시 `docs/16-ui-style-placeholder.md` 금지 목록 준수.
- 프롬프트/툴 변경 시 해당 docs 동시 갱신.
