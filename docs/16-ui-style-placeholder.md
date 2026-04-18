# 16 · UI Style — 임시 팔레트

사용자가 최종 CSS를 별도로 제공할 예정. 그 전까지는 **보수적 중립 팔레트**로 레이아웃만 잡는다. 교체가 쉽도록 Tailwind 토큰(`tailwind.config.ts`) 을 단일 진실원으로 쓴다.

## 기본 토큰

| 역할 | Tailwind | Hex | 비고 |
|---|---|---|---|
| `bg.DEFAULT` | stone-50 | #fafaf9 | 페이지 배경 |
| `bg.subtle` | stone-100 | #f5f5f4 | 섹션 배경 |
| `surface.DEFAULT` | white | #ffffff | 카드/시트 |
| `surface.muted` | stone-100 | #f5f5f4 | 서브 카드 |
| `surface.border` | stone-200 | #e7e5e4 | 구분선 |
| `fg.DEFAULT` | slate-800 | #1e293b | 본문 텍스트 |
| `fg.muted` | slate-500 | #64748b | 보조 |
| `fg.subtle` | slate-400 | #94a3b8 | 내레이션 |
| `accent.DEFAULT` | amber-600 | #d97706 | 포인트 |
| `accent.fg` | white | #ffffff | 포인트 위 텍스트 |
| `bubble.user` | stone-200 | #e7e5e4 | 유저 버블 |
| `bubble.model` | white | #ffffff | 모델 버블 |
| `bubble.modelBorder` | stone-200 | #e7e5e4 | 모델 버블 보더 |

## 금지 목록
- **네온**: `cyan-400`, `lime-400`, `fuchsia-500`, `emerald-400`, 등 vibrant.
- **다크 네이비**: `slate-950`, `indigo-950`, `zinc-950`.
- **그라디언트 글로우**: `blur-3xl` + 진한 컬러 혼합.
- **이모지**: UI의 어디에도 불허.

카드 이미지 위의 흰 텍스트는 예외(캐러셀 카드·히어로 랜딩).

## 타이포
- 한국어 본문: `Noto Sans KR`, sans-serif fallback.
- 본문 크기: 15px, line-height 1.55.
- 채팅 버블: 15px.
- 타이틀: 20~24px.
- 코드 블록: `ui-monospace`, 13px.

## 라운드/섀도
- 카드 라운드: `rounded-xl` (12px).
- 버블 라운드: 18px (`rounded-bubble`, tailwind.config).
- 기본 섀도: 없음. 강조 시 `shadow-sm` 까지만.

## 모바일 반응형
- 기본 `max-w-md` (28rem) 중앙 정렬.
- 탭 바 높이: 56px.
- 채팅 Composer 하단 여백: `pb-[env(safe-area-inset-bottom)]`.

## 다크모드
- 지금은 비활성. 라이트만.
- 추후 `data-theme="dark"` 루트 속성으로 토큰 전환.

## 교체 절차 (사용자가 CSS 주면)
1. `tailwind.config.ts` 의 `theme.extend.colors` 전체 덮어쓰기.
2. `src/styles/globals.css` 의 기본값(.narration 등) 재정의.
3. 필요 시 `components.json` 의 `baseColor` 변경.
4. shadcn 버튼 등 기본 컴포넌트는 Tailwind 토큰을 사용하므로 자동 반영.

## 검증
- Lighthouse 대비 감사: 모든 본문 텍스트가 `#1e293b` 근처, 버튼이 `#d97706` 근처.
- 자동 체크: `grep -r "indigo-950\|slate-950\|cyan-400\|fuchsia-500" src/` → 0 건이어야 함.
