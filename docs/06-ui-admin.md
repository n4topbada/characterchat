# 06 · Admin UI

`/admin/**` — `withAdmin` 가드. 데스크톱 우선. 좌측 사이드바 + 우측 컨텐츠 2컬럼.

## 전역 레이아웃
```
┌─ Sidebar ────────┬─ Content ────────────────┐
│ CharacterChat /admin │                       │
│                  │                           │
│ Characters       │                           │
│ Caster           │                           │
│ Settings         │                           │
│                  │                           │
│                  │                           │
│  {admin name}    │                           │
│  로그아웃         │                           │
└──────────────────┴───────────────────────────┘
```

## /admin — Character List

- 테이블: Portrait | Slug | Name | Model | isPublic | Updated | Actions.
- 우상단 버튼: [+ 새 캐릭터(수동)] / [Caster로 만들기].
- 각 행 클릭 → `/admin/characters/[id]`.
- 삭제는 행의 ⋮ → 확인 모달 → DELETE.

## /admin/characters/[id] — 편집 탭

탭 4개:

### 1) Assets
- 포트레이트 / 히어로 / 갤러리 각각 영역.
- 드래그 앤 드롭 업로드 + 파일 피커.
- 업로드 진행 바, 실패 시 행단위 retry.
- 각 asset 카드: 썸네일, 크기, kind, 삭제 버튼.
- 변경 시 바로 POST, 성공 후 리스트 refetch.

### 2) Prompt
- **System Prompt** — 필수, `<textarea>` 20행 높이.
- **Character Prompt Addendum** — 옵션, 15행.
- **Feature Prompt Addendum** — 옵션, 15행.
- **Greeting** — 필수, 5행, 500자 카운터.
- 우측 프리뷰 패널: 최종 시스템 인스트럭션(세 필드 + 내부 style 가이드) 합성 결과를 실시간으로 보여줌.
- 저장 버튼(오른쪽 고정) — 변경 없으면 disabled.

### 3) Config
- Model (select + 자유입력; 기본 `gemini-2.5-flash-lite`).
- Temperature (0–2 슬라이더 + 숫자).
- Top-P (0–1).
- Top-K (1–40, 정수).
- Max Output Tokens (128–8192).
- Accent Color (color picker).
- Status Panel Schema — key:value 에디터. 비우면 상태창 비활성.
- Safety Settings — Gemini 기본 4카테고리 드롭다운(BLOCK_NONE/BLOCK_LOW/BLOCK_MEDIUM/BLOCK_HIGH).

### 4) Knowledge
- 현재 KnowledgeDoc 목록(title, chunkCount, sourceUrls 펼침).
- 상단: [+ 주제로 리서치] 버튼 → 모달 `<textarea>` 에 주제들(줄 단위) → POST `/knowledge/research`.
  - 진행 중: 스켈레톤 + 로그(검색 쿼리 → URL → 요약 → 임베딩).
  - 완료: 목록에 새 Doc 추가.
- 각 Doc 확장 시 청크 미리보기(처음 3개). 청크 인라인 편집(content만) + 저장 시 `/knowledge/[docId]/reindex` 호출.

## /admin/caster — Caster Console (M4 완성)

2-패널 레이아웃:

```
┌──────────────────────────┬─────────────────────────────┐
│ Chat Console             │ Live Draft Character         │
│                          │                              │
│ (admin 메시지 →)         │  [Portrait]                 │
│ (caster 응답 ←)          │                             │
│ (tool_call 스트림 카드) │  Name:     _______          │
│                          │  Slug:     _______          │
│                          │  Tagline:  _______          │
│                          │  Accent:   [color]          │
│                          │  Model:    _______          │
│                          │  System Prompt: _______     │
│                          │  Greeting: _______          │
│                          │  Knowledge:                 │
│                          │   - topic1 (N chunks)       │
│                          │   - topic2 (N chunks)       │
│                          │                              │
│ [Composer]               │  [Commit] [Discard]         │
└──────────────────────────┴─────────────────────────────┘
```

### 좌측 Chat Console
- 하단 Composer.
- 메시지 스트림 영역.
- 각 tool_call은 접혀진 카드(이름 + 요약 args). 클릭 시 tool_result와 함께 펼쳐짐.
- 스트리밍 멈추기 버튼.

### 우측 Draft Card
- `propose_character` 이벤트마다 우측 필드 업데이트.
- 관리자가 인라인 편집 가능(검수 후 Commit).
- 포트레이트는 Caster가 `generate_portrait` 로 생성 → Blob URL을 미리 확보. Commit 시 Asset 테이블로 이관.
- [Commit]: `POST /api/admin/caster/runs/[id]/commit` 호출 → 성공 시 `/admin/characters/[newId]` 로 이동.
- [Discard]: `DELETE` → 런 삭제, Blob 포트레이트 파일도 정리.

### 스켈레톤 (현 단계 M1/M2)
- 우측은 수동 입력 폼(관리자가 직접 채움).
- 좌측 Chat은 Gemini 일반 generate 응답만 스트리밍(툴 없이).
- Commit은 우측 폼을 그대로 Character로 생성.
- 추후 M4에서 툴 활성화, UI는 그대로 유지.

## /admin/settings (M5)
- AdminConfig.adminEmails 편집.
- 모델 기본값 편집.
- LLM 토큰 사용량 요약.

## 공통 UX
- 모든 변경은 성공 토스트(좌하단, 3초, 텍스트만).
- 실패 토스트는 붉은 톤(`#b91c1c` text, `#fee2e2` 배경)이지만 이모지 X.
- 파괴적 동작은 반드시 모달 확인.
- 필드 라벨은 한국어.
