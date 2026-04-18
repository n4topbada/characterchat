// Edge 런타임(미들웨어)에서 import 해도 안전한 NextAuth 설정 조각.
// Prisma / Node API 를 절대 건드리지 않는다. 여기서는 providers 를 선언만 하고
// authorize()/signIn() 같은 DB 콜백은 Node 런타임인 auth.ts 에서 합성한다.
//
// 참고: https://authjs.dev/guides/edge-compatibility

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    // 미들웨어에서 JWT 의 role 을 읽을 수 있도록, 동일한 session 어셈블러를 둔다.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub ?? session.user.id) as string;
        (session.user as { role: "user" | "admin" }).role =
          (token.role as "user" | "admin") ?? "user";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
