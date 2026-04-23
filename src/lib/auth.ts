import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

// dev-login 공급자 활성화 가드. NODE_ENV 만 보면, 프로덕션 배포 시 누군가가
// 실수로 `NODE_ENV=development` 를 남겨도 프로비저닝된다. Vercel 은 배포
// 환경마다 `VERCEL_ENV` 를 production/preview/development 로 세팅하므로,
// Vercel 에서 preview 또는 production 으로 올라간 경우엔 무조건 차단한다.
// 로컬 `npm run dev` 에서만 `VERCEL_ENV` 가 비어 있다.
const isDev =
  process.env.NODE_ENV === "development" &&
  process.env.VERCEL_ENV !== "production" &&
  process.env.VERCEL_ENV !== "preview";

export const DEV_LOGIN_ENABLED = isDev;

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    ...(isDev
      ? [
          Credentials({
            id: "dev-login",
            name: "DEV Admin",
            credentials: {},
            async authorize() {
              return {
                id: "dev-admin",
                email: "dev@characterchat.local",
                name: "Dev Admin",
              };
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    async signIn({ user, account }) {
      const id =
        account?.provider === "google"
          ? (account.providerAccountId as string)
          : (user.id as string);

      // AdminConfig 조회가 실패하면(DB 장애, 테이블 소실 등) 이전 코드는
      // exception 을 그대로 던져 가입/로그인 자체가 막혔다. 서비스 장애를
      // 최소화하려면 로그인은 허용하되 role 을 "user" 로 강등해야 한다.
      // dev-login 은 이 블록과 무관하게 언제나 admin.
      let adminEmails: string[] = [];
      try {
        const adminCfg = await prisma.adminConfig.findUnique({
          where: { id: "default" },
        });
        adminEmails = adminCfg?.adminEmails ?? [];
      } catch (e) {
        console.error(
          "[auth.signIn] AdminConfig lookup failed — falling back to empty admin list",
          e,
        );
      }
      const role: "user" | "admin" =
        account?.provider === "dev-login"
          ? "admin"
          : adminEmails.includes(user.email ?? "")
            ? "admin"
            : "user";

      await prisma.user.upsert({
        where: { id },
        update: {
          email: user.email!,
          name: user.name ?? null,
          image: user.image ?? null,
          role,
        },
        create: {
          id,
          email: user.email!,
          name: user.name ?? null,
          image: user.image ?? null,
          role,
        },
      });

      (user as { id: string }).id = id;
      (user as { role?: "user" | "admin" }).role = role;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as { id: string }).id;
        token.role = (user as { role: "user" | "admin" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = (token.role as "user" | "admin") ?? "user";
      }
      return session;
    },
  },
});
