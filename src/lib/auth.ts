import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

const isDev = process.env.NODE_ENV === "development";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
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
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = (token.role as "user" | "admin") ?? "user";
      }
      return session;
    },
  },
});
