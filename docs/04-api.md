# 04 · API

모든 라우트는 `src/app/api/**/route.ts` 하위에 존재. 응답은 JSON 또는 SSE. 에러는 `{ error: string, code?: string }` 형태.

## 인증 레벨
- **public**: 비로그인 OK (읽기용 노출).
- **user**: 로그인 필수(`withAuth`).
- **admin**: `role=admin` (`withAdmin`).

## 표준 응답 코드
| code | 의미 |
|---|---|
| 200/201 | 성공 |
| 400 | Zod 검증 실패 |
| 401 | 로그인 필요 |
| 403 | 권한 부족 |
| 404 | 리소스 없음 |
| 409 | 중복(1세션 제약 등) |
| 422 | 비즈니스 규칙 위반 |
| 500 | 내부 에러 |

---

## Auth

### `GET/POST /api/auth/[...nextauth]` — public
NextAuth v5 핸들러. Google + dev-login.

### `GET /api/auth/dev-login` — public (dev only)
개발환경 전용. CSRF 토큰 받아 `signIn('dev-login')` 을 자동 수행하는 HTML 반환. `NODE_ENV !== 'development'` 이면 404.

---

## Public — Characters

### `GET /api/characters`
캐러셀용 리스트.

Response:
```ts
{
  characters: Array<{
    id: string;
    slug: string;
    name: string;
    tagline: string;
    accentColor: string;
    portraitUrl: string | null;
  }>;
}
```

Cache: `revalidate=60` + `revalidatePath('/api/characters')` on admin mutations.

### `GET /api/characters/[slug]`
랜딩 상세.

Response:
```ts
{
  id, slug, name, tagline, accentColor,
  portraitUrl, heroUrl,
  greeting: string,           // 세션 없이도 미리보기
  existingSessionId: string | null,  // 로그인 시만 값이 있음
}
```

---

## User — Sessions (로그인 필수)

### `GET /api/sessions/me`
현 유저의 세션들. `/history` 탭용.

Response:
```ts
{
  sessions: Array<{
    id: string;
    characterId: string;
    character: { name: string; portraitUrl: string | null; accentColor: string };
    lastMessageAt: string;  // ISO
    lastMessageSnippet: string | null;  // 50자
  }>;
}
```

### `POST /api/sessions`
Body: `{ characterId: string }`.
- 이미 존재하면 `409 { error:'session_exists', sessionId }` — 클라이언트는 해당 sessionId 로 이동.
- 없으면 `201 { session }` 생성 후 자동으로 `greeting` 메시지(role=system) 1개 삽입.

### `GET /api/sessions/[id]`
세션 메타 + 첫 페이지 메시지들.

### `DELETE /api/sessions/[id]`
세션 삭제 → Message cascade. 동일 (user, character)로 다시 `POST /api/sessions` 가능.

### `GET /api/sessions/[id]/messages?cursor=<createdAt-iso>&limit=30`
메시지 페이지네이션. cursor는 `createdAt DESC` 기준.

### `POST /api/sessions/[id]/messages` — **SSE**
Body: `{ content: string }` (빈 문자열 불가).

Stream events (각 줄은 `data: {json}\n\n`):
```
event: delta     — { text: "토큰 조각" }
event: done      — { messageId: "…", tokenCount: 123 }
event: error     — { error: "rate_limited" | "safety_blocked" | "internal" }
```

서버 측 순서:
1. 사용자 메시지 저장 (role=user).
2. RAG 검색(pgvector top-5).
3. Gemini stream 시작. 각 chunk → `event: delta`.
4. 스트림 종료 시 모델 메시지 저장(role=model), `lastMessageAt` 갱신. `event: done`.
5. 예외 발생 시 `event: error`.

### `POST /api/sessions/[id]/regenerate`
마지막 model 메시지를 삭제 후 다시 생성(SSE 동일).

---

## Admin — Characters

### `GET /api/admin/characters`
전체 목록(비공개 포함). 리스트 UI용.

### `POST /api/admin/characters`
Body:
```ts
{
  slug: string; name: string; tagline: string;
  accentColor: string;
  config: {
    model: string; systemPrompt: string; greeting: string;
    temperature?: number; topP?: number; topK?: number; maxOutputTokens?: number;
    characterPromptAddendum?: string;
    featurePromptAddendum?: string;
    statusPanelSchema?: Record<string, string>;
    safetyJson?: unknown;
  };
}
```
슬러그 중복 시 409.

### `GET/PATCH/DELETE /api/admin/characters/[id]`
일반 CRUD. PATCH는 partial.

### `GET/PUT /api/admin/characters/[id]/config`
CharacterConfig 단독 조작.

---

## Admin — Assets

### `POST /api/admin/characters/[id]/assets`
`multipart/form-data` — `file`, `kind=portrait|hero|gallery`.
- sharp 로 `webp`(portrait 1080×1440, hero 1920×1080, gallery 원본 비율 유지 최대 1920).
- Vercel Blob 업로드 → Asset row 생성.
- 응답: `{ asset: { id, blobUrl, width, height, kind } }`.

### `DELETE /api/admin/assets/[id]`
Blob 파일도 동기 삭제.

---

## Admin — Knowledge (LLM 리서치 기반 RAG)

### `GET /api/admin/characters/[id]/knowledge`
캐릭터의 KnowledgeDoc + 각 Doc의 청크 개수.

### `POST /api/admin/characters/[id]/knowledge/research`
Body: `{ topics: string[] }` (1~10개).
Flow: Gemini에게 `web_search` + `fetch_url` 루프(M3에서 활성화) → 주제별 요약 + 출처 URL → 청크 + 임베딩 → KnowledgeDoc/Chunk upsert.
응답: `{ docs: [{ id, title, chunkCount, sourceUrls }] }`.

### `DELETE /api/admin/knowledge/[docId]`
Doc + Chunk cascade.

### `POST /api/admin/knowledge/[docId]/reindex`
Chunk 재임베딩(모델 변경 시).

---

## Admin — Caster

### `POST /api/admin/caster/runs`
새 런 시작. `{ runId }` 반환.

### `POST /api/admin/caster/runs/[id]/messages` — **SSE**
Body: `{ content: string }`.
Stream events:
```
event: user_msg     — { content }
event: model_delta  — { text }
event: tool_call    — { name, args }      (M4부터)
event: tool_result  — { name, result }    (M4부터)
event: draft_ready  — { draftJson }       (propose_character 후)
event: done         — { runId, status }
event: error        — { error }
```

### `POST /api/admin/caster/runs/[id]/commit`
Body: `{ draftJson }` (관리자가 UI에서 편집한 최종 초안).
Flow: 트랜잭션 안에서 Character + Config + Asset(이미 Blob에 있는 URL 사용) + KnowledgeDoc/Chunk 생성.
응답: `{ characterId, slug }`.

### `DELETE /api/admin/caster/runs/[id]`
런 취소/삭제.

---

## Zod 스키마 위치
모든 요청 스키마는 `src/lib/zod/*.ts` 에 중앙화. 라우트 파일은 스키마를 import해 `parse()` 호출.
