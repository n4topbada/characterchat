// Node 런타임 전용 NextAuth 엔트리. API 라우트 / 서버 컴포넌트에서 사용.
// Prisma 를 쓰는 signIn 콜백은 여기에만 둔다 — Edge 용은 auth.config.ts.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

const isDev = process.env.NODE_ENV === "development";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
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
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      const id =
        account?.provider === "google"
          ? (account.providerAccountId as string)
          : (user.id as string);

      const adminCfg = await prisma.adminConfig.findUnique({
        where: { id: "default" },
      });
      const role: "user" | "admin" =
        account?.provider === "dev-login"
          ? "admin"
          : (adminCfg?.adminEmails ?? []).includes(user.email ?? "")
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
  },
});
