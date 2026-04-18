// Edge 런타임 미들웨어. NextAuth 본체를 import 하지 않고
// JWT 세션 쿠키의 "존재 여부" 만 보고 리다이렉트한다.
// 실제 토큰 검증과 role 체크는 각 page / API route 가 담당한다
// (requireAuth / requireAdmin, 서버 컴포넌트의 auth() 호출).
//
// 이렇게 해야 미들웨어 bundle 이 Prisma · NextAuth provider 등
// Node-only 의존을 끌어들이지 않는다.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/history", "/me", "/chat", "/admin"];

// NextAuth v5 가 굽는 JWT 세션 쿠키 이름. 프로덕션은 __Secure- prefix.
const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!needsAuth) return NextResponse.next();

  const hasSession = COOKIE_NAMES.some((n) => req.cookies.has(n));
  if (hasSession) return NextResponse.next();

  const url = new URL("/auth/signin", req.url);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|auth).*)"],
};
