# 15 · Glossary

한국어 UX와 영어 코드 용어를 고정한다.

| 용어 | 의미 |
|---|---|
| **Character** | 채팅 대상 AI 페르소나. DB `Character` row + `CharacterConfig` 1:1. |
| **Character Config** | 모델·프롬프트·파라미터 묶음. 캐릭터당 1개. |
| **Session** | 한 (user, character) 쌍의 대화. 1:1 유일. 삭제 시 메시지 cascade. |
| **Thread** | 본 프로젝트에선 Session과 사실상 동의어. 메시지 시퀀스. |
| **Message** | 대화 한 턴. role = user/model/system/tool. |
| **Greeting** | 세션 시작 시 자동 삽입되는 system 메시지. `CharacterConfig.greeting`. |
| **Narration** | `*별표*` 로 감싼 행동 묘사. UI에서 이탤릭 회색으로 렌더. |
| **상태창 / Status Panel** | 기분·위치·관계 등 캐릭터 상태. 모델 응답 말미 `<status>{...}</status>` 로 출력. |
| **Asset** | 캐릭터의 이미지 파일(Blob URL 포함). kind = portrait/hero/gallery. |
| **KnowledgeDoc** | 한 주제에 대한 리서치 결과 텍스트. |
| **KnowledgeChunk** | Doc을 쪼갠 조각 + `embedding vector(768)`. |
| **RAG** | Retrieval-Augmented Generation. 본 프로젝트는 LLM 리서치 → 벡터 검색. |
| **Caster** | 캐릭터 디자인 전담 에이전트. 페르소나 없음. 관리자 전용. |
| **Caster Run** | Caster의 한 작업 세션(시작~Commit/Discard). |
| **Draft Character** | Caster가 `propose_character` 로 제안한 미커밋 초안. |
| **Admin** | role=admin 유저. 캐릭터 생성·수정 권한. |
| **Dev Admin** | NODE_ENV=development 전용 Credentials provider 로 로그인한 admin. |
| **Visitor** | 비로그인 방문자. `/find`, `/characters/[slug]` 읽기 가능. 채팅은 불가. |
| **AdminConfig** | 1행 테이블. `adminEmails` 배열로 admin 식별. |
| **Accent Color** | 캐릭터 고유 색상 hex. UI 유저 버블 등에 적용. |
| **SSE** | Server-Sent Events. 채팅·Caster 스트리밍 방식. |
| **pgvector** | Postgres 확장. vector(N) 컬럼 + HNSW/IVFFlat 인덱스. |
| **HNSW** | Hierarchical Navigable Small World. 근사 최근접 인덱스. |
| **Readability** | URL 본문 추출 알고리즘(Caster `fetch_url`). |
