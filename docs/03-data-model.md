# 03 · Data Model

실제 스키마: [`prisma/schema.prisma`](../prisma/schema.prisma). pgvector 컬럼은 [`prisma/migrations/0002_pgvector/migration.sql`](../prisma/migrations/0002_pgvector/migration.sql) 에서 raw SQL로 추가.

## ER 다이어그램 (개요)

```
 User ────┬─< Session >──── Character ──┬─< Asset
          │                             ├─< KnowledgeDoc ──< KnowledgeChunk (embedding vector(768),
          │                             │                                   type: knowledge|style_anchor|episode|…)
          │                             ├── CharacterConfig (1:1, 모델/온도/greeting)
          │                             └── PersonaCore     (1:1, 불변 코어: 정보·말투·한계·행동패턴)
          ├─< PersonaState ────────────── Character          (Phase B, user×character 쌍, 가변: 기분·관계)
          └─< CasterRun ──< CasterEvent

 AdminConfig  (single row: id='default')
 EventTypeTemplate (Phase B, 시스템 공통 이벤트 사전)
```

> **설계 철학**  
> Character = **불변 코어**(`PersonaCore` + `KnowledgeChunk`) + **가변 상태**(`PersonaState`, Phase B).  
> LLM은 번역기이며, 지식/상태의 원천은 DB다. 자세한 4축 매핑은 [18-chatbot-persona-data.md](18-chatbot-persona-data.md).

## 불변식 (invariants)

1. `Session.@@unique([userId, characterId])` — **DB 레벨 강제**. 중복 시 Prisma가 P2002 에러.
2. `CharacterConfig.characterId @unique` — 1:1 보장.
3. `PersonaCore.characterId @id` — 1:1 보장 (모든 캐릭터는 반드시 PersonaCore 1개를 가진다).
4. `PersonaState.@@unique([userId, characterId])` (Phase B) — 한 사용자와 한 캐릭터의 관계 상태는 1개.
5. `KnowledgeChunk.embedding`은 정확히 768차원. 임베딩 생성 전에 insert 금지.
6. `KnowledgeChunk.userId` 는 `type ∈ {episode, belief, relation_summary}`일 때만 NOT NULL. `type ∈ {knowledge, style_anchor}`는 반드시 NULL (전역 공유).
7. `AdminConfig` 테이블은 언제나 1행(`id='default'`)만 존재. 다른 id는 seed 스크립트에서도 만들지 않는다.
8. `Character` 삭제 시 연관 Session/Message/Asset/Knowledge/PersonaCore/PersonaState 모두 cascade. `User` 삭제 시 Session/CasterRun/PersonaState도 cascade.

## 모델 세부

### User
- `id`: Google `providerAccountId`(sub) 또는 `dev-admin`(개발 credentials).
- `role`: `user` | `admin`. signIn 콜백이 `AdminConfig.adminEmails` 조회 후 결정.
- email 중복 불가.

### AdminConfig
- 단일 행 `{ id:'default', adminEmails:[…] }`.
- seed 스크립트가 `.env.ADMIN_EMAILS`(쉼표 구분) 로 upsert.
- 변경은 `/admin/settings`(미구현, M5)에서.

### Character
- `slug`: URL-safe. `/characters/[slug]` 라우트 키.
- `accentColor`: `#RRGGBB`. 채팅 UI의 유저 버블 또는 헤더 악센트. CSS 교체 후에도 유지.
- `portraitAssetId` / `heroAssetId`: Asset 테이블의 id 문자열(FK 없음 — nullable 편의).

### CharacterConfig
- `model`: Gemini 모델 ID 문자열(예: `gemini-3.1-flash-lite-preview`). 관리자가 자유 입력.
- `systemPrompt`: 페르소나 자체는 `PersonaCore`에서 합성하므로, **스타일 지시·출력 포맷 등 그 외 연출 규칙**만 담는다. 비워도 무방.
- `characterPromptAddendum` / `featurePromptAddendum`: **deprecated**. 기존 호환을 위해 유지하되 신규 캐릭터는 비어 있다.
- `greeting`: 세션 시작 직후 자동 모델 메시지(최대 500자 권장).
- `statusPanelSchema`: `{ mood:'string', location:'string', relationship:'string' }` 처럼 자유 JSON. null이면 상태창 비활성.
- `safetyJson`: Gemini `SafetySetting[]` 원형 JSON.
- 범위는 [07-llm-config.md](07-llm-config.md).

### PersonaCore (신설)
캐릭터의 **불변 코어** 1:1 테이블. 정보·말투·한계·행동패턴·감수성·기본 상태값을 담는다.
- `disposition`, `selfPerception`, `bio`, `speechPattern`: 자연어 서술.
- `hardLimits String[]`: 절대 하지 않는 행동 리스트.
- `behaviorPatterns Json`: `{ "joy": {physical, speech_change, contradiction?}, ... }` 감정별 패턴.
- 감수성 계수 4개(`trust/sentiment/stress/mood`), 감정 처리(`emotionalProcessingSpeed`, `emotionalVolatility`), 기본 상태 4개(`defaultMood/Energy/Stress/Stability`).
- Chat pipeline이 매 턴 LAYER 0 Force-Active로 주입.
- 상세 스펙: [18-chatbot-persona-data.md §4-1](18-chatbot-persona-data.md).

### PersonaState (Phase B 예약)
`@@unique([userId, characterId])` 가변 상태. 내부 감정(mood/energy/stress/stability/…), 감정 현재(`emotionCurrent`/`surfaceState`/`emotionPending`/`emotionDelayRemaining`), 사용자와의 관계 수치(`trust/sentiment/familiarity/…`). 사용자가 캐릭터를 처음 열 때 `PersonaCore.default*`로 자동 시드.

### Asset
- `kind`: `portrait` | `hero` | `gallery`.
- `blobUrl`: Vercel Blob 영구 URL.
- `order`: 갤러리 정렬.

### KnowledgeDoc / KnowledgeChunk
- Doc은 연구 1건(주제 1개) = Chunks N개. (`style_anchor` 등 doc 없이 단독 청크도 가능 → `docId` nullable)
- `source`: `caster`(Caster 에이전트 생성) / `admin_research`(관리자가 /knowledge/research 호출) / `admin_edit`(관리자가 직접 작성).
- Chunk의 `embedding vector(768)`은 Prisma 모델에 선언되지 않는다. Prisma `Unsupported` 생성자 대신, 해당 컬럼은 **오직 raw SQL로만** 읽고 쓴다.
- `characterId`를 Chunk에도 비정규화 저장해 `WHERE characterId = ?` 로 바로 좁힌다.

#### `KnowledgeChunk.type` (enum `ChunkType`)
| type | 스코프 | 감쇠 | Phase | 의미 |
|---|---|---|---|---|
| `knowledge` | 캐릭터 전역 | 없음 | A | 페르소나 고유 지식 (정보 + 지식 축) |
| `style_anchor` | 캐릭터 전역 | 없음 | A | 말투 few-shot. `emotionTag`로 감정별 구분 |
| `episode` | user×character | 있음 | B | 사건·대화 기억. `importance`/`currentStrength`/`decayRate` |
| `belief` | user×character | 있음(느림) | B | 특정 대상에 대한 인식·해석 |
| `relation_summary` | user×character | 없음 | B | 관계 전체 요약본 (LLM 배치) |
| `external_info` | 캐릭터 전역 | 있음(빠름) | C | 뉴스 에이전트 공급 |

메타 필드:
- `tags String[]`: 검색 보조.
- `anchor Boolean`: true면 감쇠 면제(결정적 사건).
- `isSecret Boolean`: true면 발화 점수 무관하게 조건 구조체에서 제외(`shareableWith`에 명시된 사용자만).
- `triggerKeywords String[]`: knowledge용 발화 점수 계산.
- `urgency "high"|"medium"|"low"`: knowledge용.
- `emotionTag String`: style_anchor 분류.
- `forceActive Boolean`: style_anchor를 LAYER 0에 강제 주입할지.
- `importance`/`currentStrength`/`decayRate`: episode 감쇠용(Phase B).
- `affectDelta Json`: episode가 관계 수치에 준 영향 기록.

### Session
- 생성: `POST /api/sessions { characterId }` — 이미 존재하면 409.
- 삭제: `DELETE /api/sessions/:id` → 모든 Message cascade.
- `summary`: 컨텍스트 윈도 관리용 롤링 요약(M5).

### Message
- `role`: `user` / `model` / `system` / `tool`.
- 일반 채팅은 user↔model만 사용. `system`은 greeting 같은 자동 시작 메시지, `tool`은 향후 툴 콜 결과.
- `(sessionId, createdAt)` 인덱스로 최근 N개 빠르게 조회.

### CasterRun / CasterEvent
- Run 1건에 Event N개(`user_msg`, `model_msg`, `tool_call`, `tool_result`, `coverage_state`).
- `draftJson`: Caster 도구(`update_core_field`, `add_knowledge_chunk` 등)가 증분 업데이트한 누적 구조체.
- `coverage Int` (0~100): 숨은 완성도. 서버가 매 턴 재계산하고 `event: coverage_state` SSE로 UI에 상태 문자열만 전달(숫자 비노출). 100 도달 시 `event: coverage_ready`.
- Commit 시점에 Character + CharacterConfig + PersonaCore + Asset + KnowledgeDoc + KnowledgeChunk(type=knowledge|style_anchor)를 단일 트랜잭션으로 생성.
- 상세: [09-caster-agent.md](09-caster-agent.md).

## 마이그레이션 운영 순서

```bash
# 최초
npx prisma migrate dev --name init         # 0001_init 생성
# pgvector 파일은 이미 repo 에 있음 → 한 번 더 실행
npx prisma migrate dev                     # 0002_pgvector 적용
npm run db:seed                            # AdminConfig + 샘플 캐릭터
```

## 향후 확장 (Phase 로드맵)

### Phase A (M1.5) — 지금 합의 대상
- `PersonaCore` 추가.
- `KnowledgeChunk.type` enum + 메타 필드 추가 (`knowledge`, `style_anchor` 활성).
- Caster 도구 세트 v2 + coverage 서버 계산.
- Chat pipeline에 "조건 구조체 합성" 도입.

### Phase B (M3)
- `PersonaState` (user×character 가변 상태).
- `KnowledgeChunk.type`: `episode`, `belief`, `relation_summary` 활성.
- `EventTypeTemplate` (시스템 공통 이벤트 사전) + 룰 엔진.
- 감정 지연 (`surface_state`), `affectDelta` 적용.

### Phase C (M5)
- `external_info` + 뉴스 에이전트 + `PersonaCore.interests`.
- 기억 감쇠 배치 (`current_strength = importance × e^(-decay_rate × days)`).
- 관계 요약본 자동 생성 (LLM 배치).
- Cascading query (LAYER 2).

### 기타
- `Character.tags String[]` (카테고리 필터링).
- `Session.visibility` — "북마크"/"숨김".
- `Message.versionOf` — regenerate 버전 트리.
