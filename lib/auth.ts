import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
    };
  }

  interface User {
    id: string;
    name: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        name: { label: "Name", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const name = String(credentials?.name ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!name || !password) return null;

        const db = getDb();
        const player = await db.query.players.findFirst({
          where: eq(players.name, name),
        });
        if (!player) return null;
        const ok = await compare(password, player.passwordHash);
        if (!ok) return null;
        return { id: String(player.id), name: player.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "");
        session.user.name = String(token.name ?? "");
      }
      return session;
    },
  },
});
