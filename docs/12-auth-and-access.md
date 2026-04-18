# 12 · Auth & Access

StoryGatcha의 NextAuth v5 beta 구조를 1:1 포팅. Firestore만 Prisma/Postgres로 교체.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `src/lib/auth.ts` | NextAuth 설정 (Google + dev Credentials), `auth`/`handlers`/`signIn`/`signOut` export |
| `src/app/api/auth/[...nextauth]/route.ts` | `handlers` 그대로 export (GET, POST) |
| `src/app/api/auth/dev-login/route.ts` | NODE_ENV=development 한정 자동 로그인 |
| `src/app/auth/signin/page.tsx` | Google 버튼 + (dev) DEV 로그인 버튼 |
| `src/lib/api-utils.ts` | `withAuth`, `withAdmin` 서버 가드 |
| `src/types/next-auth.d.ts` | Session 타입 확장(`user.id`, `user.role`) |
| `middleware.ts` | `/admin/**` + `/chat/**` 비로그인 리다이렉트 |

## src/lib/auth.ts (요약)

```ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

const DEV_USER = { id: "dev-admin", email: "dev@characterchat.local", name: "Dev Admin" };

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    ...(process.env.NODE_ENV === "development"
      ? [Credentials({ id: "dev-login", name: "Dev Login", credentials: {}, authorize: () => DEV_USER })]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    async signIn({ user, account }) {
      const id = account?.provider === "google" ? account.providerAccountId! : user.id!;
      const cfg = await prisma.adminConfig.findUnique({ where: { id: "default" } });
      const isDev = account?.provider === "dev-login";
      const role = isDev || (cfg?.adminEmails ?? []).includes(user.email!) ? "admin" : "user";

      await prisma.user.upsert({
        where: { id },
        update: { email: user.email!, name: user.name ?? null, image: user.image ?? null, role },
        create: { id, email: user.email!, name: user.name ?? null, image: user.image ?? null, role },
      });

      (user as any).id = id;
      (user as any).role = role;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as any).id;
        (token as any).role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub!;
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

## src/lib/api-utils.ts

```ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type ApiRole = "user" | "admin";

export async function requireUser() {
  const s = await auth();
  if (!s?.user) throw NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return { userId: (s.user as any).id as string, role: (s.user as any).role as ApiRole };
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") throw NextResponse.json({ error: "forbidden" }, { status: 403 });
  return u;
}

export async function withAuth<T>(fn: (u: { userId: string; role: ApiRole }) => Promise<T>) {
  try { return await fn(await requireUser()); }
  catch (e) { if (e instanceof NextResponse) return e; throw e; }
}

export async function withAdmin<T>(fn: (u: { userId: string }) => Promise<T>) {
  try { return await fn(await requireAdmin()); }
  catch (e) { if (e instanceof NextResponse) return e; throw e; }
}
```

## src/app/api/auth/dev-login/route.ts

```ts
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("not found", { status: 404 });
  }
  // CSRF 토큰을 받아 dev-login 콜백에 자동 POST 하는 HTML 반환.
  const html = `<!doctype html><html><body>
    <form id="f" method="POST" action="/api/auth/callback/dev-login"></form>
    <script>
      fetch('/api/auth/csrf').then(r => r.json()).then(({ csrfToken }) => {
        const f = document.getElementById('f');
        const i = document.createElement('input');
        i.name='csrfToken'; i.value=csrfToken; f.appendChild(i);
        const j = document.createElement('input');
        j.name='callbackUrl'; j.value='/find'; f.appendChild(j);
        f.submit();
      });
    </script>
  </body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
```

## middleware.ts

```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PROTECTED_PATHS = ["/chat", "/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const protectedRoute = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!protectedRoute) return NextResponse.next();

  if (!req.auth) {
    const url = new URL("/auth/signin", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && (req.auth.user as any)?.role !== "admin") {
    return NextResponse.redirect(new URL("/find", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = { matcher: ["/chat/:path*", "/admin/:path*"] };
```

## types/next-auth.d.ts

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "user" | "admin";
  }
}
```

## 관리자 이메일 관리
- `.env.ADMIN_EMAILS` — seed 스크립트가 초기값으로 `AdminConfig.adminEmails` 에 주입.
- 운영 중 수정은 `/admin/settings`(M5). 현 단계는 SQL 로 직접 갱신.

## DEV admin
- `npm run dev` → `http://localhost:3000/auth/signin` → 하단 "DEV 로그인" 버튼 또는 `/api/auth/dev-login` 직접 방문.
- 자동으로 `dev-admin` 유저로 로그인 + `role=admin`.
- 프로덕션 빌드에서는 provider 자체가 등록되지 않고, `/api/auth/dev-login` 이 404.

## 환경변수
```
AUTH_SECRET=            # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
DATABASE_URL=
ADMIN_EMAILS=me@example.com,coadmin@foo.com
GOOGLE_GENAI_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

## 테스트 시나리오
1. `.env.ADMIN_EMAILS=me@example.com` → seed → Google 로그인(`me@example.com`) → `/admin` 접근 성공.
2. 다른 Google 계정 로그인 → `/admin` → `/find` 로 리다이렉트.
3. dev 모드 → DEV 로그인 버튼 → `dev-admin` 으로 `/admin` 접근.
4. 로그아웃 → `/chat/**` 접근 → `/auth/signin?callbackUrl=/chat/…` 으로 리다이렉트.
