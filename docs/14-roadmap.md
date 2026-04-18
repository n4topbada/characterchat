# 14 · Roadmap

## 마일스톤

### M0 — 스캐폴딩
**범위**
- `create-next-app` 초기화.
- Tailwind v4 + shadcn 초기 컴포넌트 스캐폴드(`Button`, `Dialog`, `Input`, `Textarea`).
- Prisma 초기화 + 스키마 적용 + pgvector 마이그레이션.
- NextAuth v5 구조(Google + dev-login) + middleware.
- seed 스크립트: AdminConfig + 샘플 캐릭터 2명.

**DoD**
- [ ] `npm run dev` → `/auth/signin` 접근.
- [ ] Google 로그인 성공 → `/find` 이동.
- [ ] DEV 로그인 성공 → role=admin 확인(콘솔 로그).
- [ ] `/admin` 비관리자 접근 시 `/find` 로 리다이렉트.

### M1 — Chat MVP
**범위**
- 하단 5탭 바, 각 탭 라우트 + placeholder 페이지.
- `/find` 세로 캐러셀(실데이터 2명).
- `/characters/[slug]` 랜딩 → 세션 생성/이어가기.
- `/chat/[sessionId]` — SSE 스트리밍, 버블, 내레이션 파싱.
- `/history` — 카카오톡 스타일 리스트.
- 세션 삭제 UX.
- 상태창·RAG·이미지 업로드 없음.

**DoD**
- [ ] 로그인 후 캐러셀에서 카드 선택 → 채팅 시작 → 스트리밍 수신.
- [ ] `*행동*` 이 이탤릭 회색으로 렌더.
- [ ] `/history` 에 세션 1개 표시, 행 탭 → 동일 세션 복귀.
- [ ] 삭제 확인 후 `/find` 에서 같은 카드 다시 선택 → 새 세션 성공.
- [ ] Lighthouse 모바일 성능 ≥ 80.

### M2 — Admin + Assets
**범위**
- `/admin` 캐릭터 목록/검색.
- 편집 탭(Assets / Prompt / Config). Knowledge 탭 스켈레톤(빈 상태).
- Asset 업로드 + sharp + Blob.
- Accent Color 채팅 UI에 반영.
- Caster 콘솔 UI 스켈레톤(툴 없이 단순 대화).

**DoD**
- [ ] 관리자가 새 캐릭터(수동) 생성 → 포트레이트 업로드 → `/find` 에 즉시 노출.
- [ ] 프롬프트 수정 후 저장 → 채팅에 반영 확인.
- [ ] Caster에서 일반 대화 가능(툴 없음) + 수동 Draft 폼 → Commit → 새 캐릭터 생성.

### M3 — RAG
**범위**
- pgvector 런타임 사용.
- `src/lib/rag/research.ts` — web_search + fetch_url + summarize(Brave Search API 권장).
- Knowledge 탭 — 주제 리서치 → Doc/Chunk 생성.
- 채팅 파이프에 RAG 주입.

**DoD**
- [ ] "고대 알렉산드리아 도서관" 주제 리서치 → 5~10 청크 생성.
- [ ] 해당 캐릭터에게 관련 질문 → 응답이 지식 반영.
- [ ] Knowledge 탭에서 청크 수동 편집 → reindex → 검색 결과 변경 확인.

### M4 — Caster (Full)
**범위**
- 툴 핸들러 구현: web_search, fetch_url, generate_portrait, research_knowledge, propose_character.
- Caster 콘솔 2-패널 UI 완성(Live Draft Card).
- Commit 트랜잭션 확정.
- 런 상한·가드레일.

**DoD**
- [ ] "퇴근 후 포장마차 주인 만들어줘" → Caster가 research → propose_character → 관리자 Commit → `/find` 에 노출.
- [ ] 포트레이트 자동 생성 + Blob 저장.
- [ ] 런 취소/삭제 시 Blob 정리.

### M5 — Polish
**범위**
- 상태창(statusPanelSchema) 렌더링.
- 롤링 요약(`Session.summary`) 자동화.
- Regenerate UX.
- `/admin/settings` — AdminConfig 편집, 토큰 사용량 요약.
- Framer Motion 캐러셀 애니메이션, 타이핑 인디케이터 고도화.
- Rate limit(Upstash Redis) 또는 간단한 DB-based.
- i18n 스캐폴드(ko default).
- 관측: Logtail 또는 Axiom.

**DoD**
- [ ] 상태창 pill 렌더(schema 있는 캐릭터).
- [ ] 30턴 이상 대화해도 토큰 상한 초과 없음(요약 작동).
- [ ] 1분 20회 메시지 초과 시 429 응답.

## 오픈 이슈 / 결정 대기

- **공개 유저가 캐릭터 생성?** — 현재 no. 필요 시 M6에서 Creator Studio 추가.
- **다중 세션** — 제품 컨셉상 no. 필요 시 `Session.branch` 추가로 확장 가능.
- **음성 입출력** — 미정.
- **모바일 앱 (React Native / PWA)** — M5 이후 PWA 먼저.
- **컨텐츠 모더레이션** — safetySettings 수동 튜닝 + Gemini 기본 safety. 추후 auto-flag 큐.

## 의존성 / 리스크
- **Gemini 모델 ID 변경**: 주기적 확인 필요.
- **pgvector 연산자/인덱스 변경**: 최신 버전만 `<=>` 사용 — Neon/Vercel Postgres 최신 extension.
- **Blob 비용**: 이미지 너무 많이 쌓이면 비용. Asset 삭제 UX 반드시.

## 릴리즈 정책
- `main` 브랜치 = 프로덕션.
- 기능 브랜치 `feat/*` → PR → 리뷰 → merge → 자동 배포.
- 마이그레이션 파일은 PR 설명에 변경 내용 정리.
