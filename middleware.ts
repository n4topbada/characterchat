// Edge 런타임용 미들웨어. Prisma 등 Node-only 모듈을 import 하면 안 된다.
// auth.config (edge-safe) 로만 NextAuth 를 초기화한다.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = ["/history", "/me", "/chat", "/admin"];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!needsAuth) return NextResponse.next();
  if (req.auth?.user?.id) {
    // admin 전용 경로
    const role = (req.auth.user as { role?: "user" | "admin" }).role;
    if (pathname.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL("/find", req.url));
    }
    return NextResponse.next();
  }
  const url = new URL("/auth/signin", req.url);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|auth).*)"],
};
