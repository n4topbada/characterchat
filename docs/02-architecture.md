# 02 · Architecture

모놀리식 Next.js 앱. 서버는 Route Handlers(App Router)로 API를 노출하고, 클라이언트는 React Server/Client Components 혼합.

## 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Next.js App (Vercel)                              │
│                                                                            │
│  Client (RSC+CSC)                Server (Route Handlers)                   │
│  ┌──────────────────┐           ┌───────────────────────────┐             │
│  │ (tabs)/find      │──GET────▶ │ /api/characters           │             │
│  │ (tabs)/history   │──GET────▶ │ /api/sessions/me          │             │
│  │ /chat/[sid]      │──SSE────▶ │ /api/sessions/:id/messages│──┐          │
│  │ /admin/**        │──CRUD───▶ │ /api/admin/**             │  │          │
│  │ /admin/caster    │──SSE────▶ │ /api/admin/caster/**      │──┤          │
│  │ /auth/signin     │──────────▶│ /api/auth/[...nextauth]   │  │          │
│  └──────────────────┘           └───────────────────────────┘  │          │
│                                          │                     │          │
│                     ┌────────────────────┼─────────────────────┼────┐     │
│                     ▼                    ▼                     ▼    ▼     │
│              ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│              │ Prisma Client│   │ @google/genai│   │ @vercel/blob    │   │
│              └──────┬───────┘   └──────┬───────┘   └────────┬────────┘   │
└─────────────────────┼──────────────────┼────────────────────┼────────────┘
                      ▼                  ▼                    ▼
              ┌───────────────┐    ┌─────────────┐     ┌─────────────┐
              │ Postgres      │    │ Gemini API  │     │ Blob Storage│
              │ + pgvector    │    │ (Google)    │     │ (portraits) │
              │ HNSW index    │    └─────────────┘     └─────────────┘
              └───────────────┘
```

## 요청 경로

### 1) 채팅 메시지 (핵심)
```
User types → ChatComposer (client)
  → POST /api/sessions/:id/messages (Route Handler, runtime=nodejs)
    → withAuth(userId) 가드
    → db.message.create({ role:'user', ... })
    → embed(content)  ─┐
    → pgvector top-k ──┤  (RAG)
    → buildPrompt(systemPrompt + addendum + RAG + style + history)
    → genai.generateContentStream(...)
    → stream chunks as SSE ───────────────► client renders token by token
    → on end: db.message.create({ role:'model', content: full })
             db.session.update({ lastMessageAt })
```

### 2) Caster 런
```
Admin opens /admin/caster → POST /api/admin/caster/runs → runId
  → POST /api/admin/caster/runs/:id/messages (SSE)
    → Gemini function-calling loop (M4)
      → tool_call: web_search / fetch_url / generate_portrait / research_knowledge / propose_character
      → draftJson 누적
    → 이벤트마다 CasterEvent 저장 & SSE 전송
  → Admin clicks Commit → POST /api/admin/caster/runs/:id/commit
    → 트랜잭션: Character + Config + Asset + KnowledgeDoc/Chunk upsert
```

## 디렉토리 경계 / 의존 규칙
```
src/app/(tabs)/**        ← 방문자 UI, 로그인 선택적
src/app/chat/**          ← 로그인 필수
src/app/admin/**         ← role=admin 필수
src/app/api/**           ← 서버 전용, Prisma 직접 사용 허용
src/lib/                 ← 공용 서버 유틸 (Prisma, auth, gemini, rag, assets)
src/components/          ← 순수 클라이언트 / RSC 표시, Prisma 직접 사용 금지
```

**규칙**
- `src/components/**` 에서 Prisma/Gemini 서버 SDK를 import 하지 않는다.
- `src/lib/gemini/**` 는 Route Handler 안에서만 호출 (브라우저 번들 유입 금지).
- `src/app/api/admin/**` 는 전부 `withAdmin` 래퍼로 시작.

## 스트리밍 (SSE)
- Route Handler는 `new Response(stream, { headers: { 'Content-Type':'text/event-stream' }})` 반환.
- 클라이언트는 `fetch` + `ReadableStream` reader 로 파싱(SSE 파싱 유틸은 `src/lib/sse.ts`).
- Edge runtime은 사용하지 않는다(@google/genai가 Node만 지원).

## 캐시 전략
- 캐릭터 리스트(`/api/characters`): `revalidate = 60` (ISR-유사) + mutating admin 작업 시 `revalidatePath`.
- 세션/메시지: no-cache.
- 이미지: Vercel Blob URL 자체가 CDN.

## 에러 핸들링
- API는 Zod 검증 실패 → 400, 인증 실패 → 401, 권한 실패 → 403, 없음 → 404, 도메인 충돌(이미 존재) → 409, 그 외 → 500.
- 클라이언트 측은 TanStack Query `onError` 에서 toast 표시. toast 메시지에도 이모지 금지.
