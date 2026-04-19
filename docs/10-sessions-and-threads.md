# 10 · Sessions & Threads

## 불변식
- **1 (user, character) = 1 Session** — `@@unique([userId, characterId])` 로 DB 강제.
- 삭제 전에는 같은 쌍으로 새 세션을 만들 수 없다(`POST /api/sessions` → 409).
- 메시지 히스토리는 세션에 종속 — 세션 삭제 시 메시지 전부 cascade.

## 생성
`POST /api/sessions { characterId }`:
```ts
const uniq = { userId_characterId: { userId, characterId } };
const existing = await db.session.findUnique({ where: uniq });
if (existing) return 409({ sessionId: existing.id });

const session = await db.session.create({ data: { id: ulid(), userId, characterId }});
// greeting 자동 삽입
await db.message.create({
  data: { id: ulid(), sessionId: session.id, role: 'system', content: character.config.greeting },
});
return 201({ session });
```

## 삭제
`DELETE /api/sessions/:id` — `ownedBy(userId)` 확인 후 삭제. Message는 onDelete cascade.

## 컨텍스트 윈도 전략

```
┌── summary (선택, session.summary 에 저장) ──┐
│  "[요약] 이전 5개 턴 요약"                   │
└─────────────────────────────────────────────┘
┌── RAG chunks (top-5) ──────────────────────┐
│  [Knowledge]  ...                          │
└─────────────────────────────────────────────┘
┌── recent messages (최대 20 턴) ────────────┐
│  user: … / model: … / user: … / model: …   │
└─────────────────────────────────────────────┘
┌── 새 user 메시지 ───────────────────────────┐
└─────────────────────────────────────────────┘
```

- 최근 20 턴 = 약 8~12k 토큰 대역(한국어 평균).
- 총 토큰이 `model.maxInputTokens * 0.8` 초과 시 롤링 요약 트리거.

## 롤링 요약 (M5)
- 트리거: 한 세션 누적 토큰 > 임계값.
- 방법: 오래된 N개 메시지를 `MODELS.chat` (= `gemini-3.0-flash`) 으로 압축 → `Session.summary` 에 누적 병합. 요약도 하위 모델로 내려가지 않는다 ([07-llm-config §0](07-llm-config.md#0-모델-고정-정책-️-do-not-touch)).
- 요약된 메시지는 archive 플래그(`Message.archivedAt`)로 숨기고 프롬프트에서 제외(스키마에 추가 필요).
- MVP 는 단순 "최근 20턴 컷오프"만. 롱 세션 실험 후 도입.

## Regenerate
`POST /api/sessions/:id/regenerate`:
1. 마지막 `role='model'` 메시지를 soft delete(또는 hard delete).
2. 마지막 user 메시지로 다시 stream 호출.
3. 결과를 새 Message로 insert.

UI: 메시지 길게누르기 → 메뉴 [다시 생성]. M5.

## 상태창 데이터 영속화
- 모델이 `<status>{…}</status>` 블록을 응답에 포함.
- 서버는 스트림 종료 후 blob에서 status 부분을 `Message.statusJson` 컬럼에 저장(스키마 확장 M5).
- 클라이언트는 현 세션의 가장 최근 status 를 헤더 아래 pill에 렌더.

## 권한 체크
- `GET /api/sessions/:id/messages` — 소유자 user 만 (또는 admin).
- `DELETE /api/sessions/:id` — 소유자 user 만.
- 관리자도 타인 세션을 조회할 수 없다(프라이버시). `/admin/sessions` 같은 조회 페이지는 만들지 않음.

## 삭제 후 재생성 UX
1. `/history` 에서 행 길게누르기 → "대화 삭제" → confirm.
2. 성공 토스트: "대화를 삭제했어요. 찾기 탭에서 다시 시작할 수 있습니다."
3. 유저가 `/find` → 동일 카드 탭 → `/characters/[slug]` → [대화 시작] → 새 세션 생성.

## 엣지 케이스
- 동시에 두 브라우저에서 `POST /api/sessions` 호출 → Prisma P2002 → 409 → 두 번째 클라이언트는 첫 번째가 만든 세션 id 를 응답에서 받아 그리로 이동.
- 세션 생성 후 greeting 삽입 실패 → 세션은 유지(greeting 은 선택적으로 재삽입 엔드포인트 제공 M5).
- `CharacterConfig` 의 `greeting` 이 null/empty → `system` 메시지 스킵.
