import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/history", "/me", "/chat", "/admin"];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!needsAuth) return NextResponse.next();
  if (req.auth?.user?.id) {
    // admin 전용 경로
    if (pathname.startsWith("/admin") && req.auth.user.role !== "admin") {
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
