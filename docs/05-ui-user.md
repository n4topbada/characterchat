# 05 · User UI

모바일 퍼스트. 최대 너비 `max-w-md`(28rem) 중앙 정렬. 데스크톱에서는 좌우 여백 + 동일한 컬럼 레이아웃.

## 레이아웃

```
┌──────────────────────────────┐
│  (상단: 라우트별 헤더)         │
│                              │
│  (본문: 스크롤 영역)          │
│                              │
├──────────────────────────────┤
│  [feed][find][create][hist][me] │ ← 하단 탭 바 (항상 노출, /chat/** 에서는 숨김)
└──────────────────────────────┘
```

탭 구성은 [17-nav-and-tabs.md](17-nav-and-tabs.md) 참조.

## /find — 세로 캐러셀

### 인터랙션
- 세로 휠, 터치 스와이프 ↑↓, 키보드 ↑↓/PageUp/PageDown.
- `scroll-snap-type: y mandatory` + `scroll-snap-stop: always` 로 한 장씩 스냅.
- 중앙 카드: `scale(1)` + 밝음. 비포커스 카드: `scale(0.92) opacity-70`.

### 카드 스펙
- 비율 3:4, 너비 100% (최대 28rem).
- 레이어:
  1. 배경 이미지 (portrait; 없으면 `placeholder-portrait.svg` 회색 실루엣).
  2. 하단 그라디언트 스크림 (black 0% → transparent 60%).
  3. 이름(20px, bold), 태그라인(14px, regular), accentColor 4px 바.
- 탭/클릭 → `/characters/[slug]`.

### 빈 상태
- "아직 등장한 친구가 없습니다. 잠시 후 다시 확인해 주세요." (이모지 없음).

## /history — 카카오톡 스타일 목록

### Row
```
[avatar 48×48] 이름               12:34 오후
               마지막 메시지 한 줄…
```
- 정렬: `lastMessageAt DESC`.
- 탭 → `/chat/[sessionId]`.
- 길게누르기(또는 우측 스와이프) → "대화 삭제" 액션 시트.
  - 확인 모달: "‘{name}’과의 대화를 삭제하시겠어요? 다시 시작할 수 있지만 이전 내용은 복구되지 않습니다." → [취소][삭제].

### 빈 상태
- "아직 나눈 대화가 없습니다. 찾기 탭에서 새 친구를 골라보세요." [찾기로 이동] 버튼.

## /characters/[slug] — 랜딩

- 상단 히어로 이미지(비율 16:9, hero 없으면 portrait 크롭).
- 이름 + 태그라인.
- **대화 시작** 버튼 (기존 세션이 있으면 **대화 이어가기**).
- 클릭 → `POST /api/sessions` → (존재 시 409 응답의 sessionId 사용) → `/chat/[sessionId]` 로 이동.

## /chat/[sessionId]

### 헤더
```
← 뒤로     {avatar} {이름}     ⋮
                 └ accentColor 언더라인
```
- `⋮` 메뉴: "대화 기록 보기", "대화 삭제" (confirm → DELETE → `/history` 로 이동).

### 메시지 영역
- 상단 로드모어(위로 스크롤 시 이전 페이지).
- 유저 버블: 우측 정렬, 배경 `bubble.user`(`stone-200`), radius 18px, 꼬리는 첫 버블에만.
- 모델 버블: 좌측 정렬, 배경 `white` + border `stone-200`, avatar는 모델 연속 발화의 첫 버블에만.
- 시스템 버블(greeting 등): 중앙, 작은 둥근 pill, 배경 `stone-100`, 텍스트 `slate-500`.
- 타임스탬프: 클러스터 경계에서만 중앙 한 줄.

### 내레이션 렌더링
- 텍스트를 렌더링할 때 `*...*` 패턴을 `<span class="narration">...</span>` 으로 변환(이탤릭, `slate-400`, 버블 없음 느낌).
- 버블 안에 섞여 있을 때는 인라인 스팬으로, 단독 라인일 때는 `<p class="narration">` 블록으로.
- 이스케이프: 사용자가 `\*`로 입력한 경우 그대로 텍스트.
- 정확한 파싱은 `src/components/chat/NarrationSpan.tsx` 에서 단일 책임.

### 상태창 (옵션)
- `CharacterConfig.statusPanelSchema` 가 있을 때 활성.
- 모델 응답 중 마지막에 포함되는 `<status>{…json…}</status>` 블록을 파서(`src/lib/chat/statusParser.ts`)가 추출.
- 버블에는 해당 블록 제거.
- 채팅 화면 상단 아래(헤더 바로 밑)에 pill 리스트로 표시: `기분: 평온 · 위치: 도서관 · 관계: 친한 친구`.
- 상태창 없으면 pill 영역 자체를 렌더 안 함.

### Composer
- 상단: 현재 입력 토큰 수(옵션, 길 때만).
- 입력 TextArea(auto-grow, 최대 6줄) + 전송 버튼.
- Shift+Enter = 줄바꿈, Enter = 전송.
- 전송 중 로딩 표시: 모델 버블 위치에 3-dot 타이핑 인디케이터(framer-motion 애니메이션).
- 스트리밍 중 "중단" 버튼(AbortController로 SSE 취소, 저장은 지금까지 수신한 텍스트까지만).

### 에러 상태
- 네트워크 끊김 → composer 위 얇은 배너: "연결이 끊어졌습니다. 다시 시도." + 재시도 버튼.
- safety block → 시스템 pill: "해당 응답은 표시할 수 없어요. 다른 방식으로 말해보세요." (`slate-500`).

## /auth/signin

- 중앙 카드: "CharacterChat" 로고(텍스트) + Google 버튼.
- 개발환경에서만 아래 "DEV 로그인" 보조 버튼 노출(`process.env.NODE_ENV === 'development'`).

## /me — MyPage

- 유저 기본 정보(이름, 이메일).
- 언어 설정(placeholder, 현재는 한국어 고정).
- 다크모드 토글(placeholder, CSS 교체 이후 활성).
- 로그아웃 버튼.
- 관리자면 "관리자 페이지로 이동" 링크.

## /feed — 여분 슬롯

- 지금은 단순 placeholder: 중앙에 "곧 만날 수 있는 공간입니다."
- 추후 "공개 피드" / "추천" 등의 기능 예약.

## /create

- 관리자: 큰 버튼 "Caster로 새 친구 만들기" → `/admin/caster` 로 이동.
- 일반 유저: "관리자만 새 친구를 만들 수 있어요." 안내 + 홈(`/find`)으로 돌아가는 링크.

## 접근성 / 키보드
- 탭 이동은 Tab 키로 포커스 가능.
- 캐러셀 카드는 `role=button` + `aria-label`.
- 모달은 `aria-modal` + 포커스 트랩.

## 금지 사항
- **이모지 사용 금지** (UI 라벨, placeholder, 에러 메시지 포함).
- `indigo-950`/`slate-950` 다크 네이비 금지.
- `cyan-400`/`lime-400`/`fuchsia-500` 같은 네온 금지.
