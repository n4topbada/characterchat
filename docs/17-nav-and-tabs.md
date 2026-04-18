# 17 · Navigation & Bottom Tabs

모바일 퍼스트 하단 탭 5개. KakaoTalk 스타일.

## 탭 정의

| 순서 | Slug | 라벨(ko) | 경로 | 아이콘(lucide-react) | 접근 |
|---|---|---|---|---|---|
| 1 | feed | 피드 | `/feed` | `Sparkles` | public (placeholder) |
| 2 | find | 찾기 | `/find` | `Compass` | public |
| 3 | create | 만들기 | `/create` | `PlusCircle` | public 라우트, 내용은 admin-only |
| 4 | history | 대화 | `/history` | `MessageCircle` | user 필요(리다이렉트) |
| 5 | me | 나 | `/me` | `User` | user 필요 |

`create` 를 가운데에 두어 KakaoTalk 의 "추가" 느낌을 살린다. 아이콘 강조는 CSS 제공 후 최종 결정. MVP 는 균등 크기.

## 파일 구조

```
src/app/
├─ (tabs)/
│  ├─ layout.tsx          # 하단 탭 바 포함
│  ├─ feed/page.tsx
│  ├─ find/page.tsx
│  ├─ create/page.tsx
│  ├─ history/page.tsx
│  └─ me/page.tsx
├─ page.tsx               # "/" → "/find" redirect
└─ chat/[sessionId]/page.tsx   # 탭 바 숨김
```

## BottomTabBar.tsx (요약)

```tsx
// src/components/nav/BottomTabBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Sparkles, PlusCircle, MessageCircle, User } from "lucide-react";

const TABS = [
  { slug: "feed",    href: "/feed",    label: "피드",   Icon: Sparkles },
  { slug: "find",    href: "/find",    label: "찾기",   Icon: Compass },
  { slug: "create",  href: "/create",  label: "만들기", Icon: PlusCircle },
  { slug: "history", href: "/history", label: "대화",   Icon: MessageCircle },
  { slug: "me",      href: "/me",      label: "나",     Icon: User },
] as const;

export function BottomTabBar() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 h-14 border-t border-surface-border bg-white z-40 flex">
      {TABS.map(({ slug, href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={slug} href={href} className="flex-1 flex flex-col items-center justify-center gap-0.5"
                aria-current={active ? "page" : undefined}>
            <Icon size={22} className={active ? "text-fg" : "text-fg-muted"} strokeWidth={1.75} />
            <span className={`text-[11px] ${active ? "text-fg" : "text-fg-muted"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

## 탭 바 숨김 규칙

- `/chat/[sessionId]` — 숨김 (chat은 `(tabs)` 그룹 밖 경로).
- `/auth/**` — 숨김.
- `/admin/**` — 숨김 (별도 사이드바 레이아웃).

## 비활성 동작

- `create` 탭을 일반 유저가 눌러도 접근은 된다. 페이지 내에서 "관리자만 새 친구를 만들 수 있어요" 안내.
- `history`/`me` 는 비로그인 시 middleware 가 `/auth/signin?callbackUrl=<원래>` 로 리다이렉트.

## 접근성

- `role="navigation"`, `aria-label="하단 탭"`.
- 각 링크 `aria-current="page"` 현재 탭 표시.
- Tab / Shift+Tab 로 순차 포커스.

## 라우트 리다이렉트

- `src/app/page.tsx`:
  ```ts
  import { redirect } from "next/navigation";
  export default function Root() { redirect("/find"); }
  ```

## 장래 확장

- 탭 순서 재배치는 `TABS` 배열만 수정.
- 5번째 `feed` 는 향후 공개 추천 피드 / 이벤트로 확장 예정. 지금은 placeholder.
- admin 전용 탭 추가 시 `requireAdmin` 플래그를 배열에 넣고 렌더 필터링.
