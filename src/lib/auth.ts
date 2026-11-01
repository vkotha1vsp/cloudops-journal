import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import CredentialsProvider from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { cognitoEnabled, env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { upsertUserOnSignIn } from "@/server/users";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return env().ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

let options: NextAuthOptions | undefined;

export function authOptions(): NextAuthOptions {
  if (options) return options;
  const e = env();

  const providers: NextAuthOptions["providers"] = [];
  if (cognitoEnabled()) {
    providers.push(
      CognitoProvider({
        clientId: e.COGNITO_CLIENT_ID,
        clientSecret: e.COGNITO_CLIENT_SECRET,
        issuer: e.COGNITO_ISSUER,
        checks: ["pkce", "state", "nonce"],
      }),
    );
  }
  if (e.AUTH_DEV_LOGIN) {
    providers.push(
      CredentialsProvider({
        id: "dev",
        name: "Local development login",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = credentials?.email?.trim().toLowerCase();
          const password = credentials?.password ?? "";
          if (!email || !isEmailAllowed(email)) return null;
          if (!safeEqual(password, e.AUTH_DEV_PASSWORD)) return null;
          return { id: `dev:${email}`, email, name: email.split("@")[0] };
        },
      }),
    );
  }

  options = {
    secret: e.NEXTAUTH_SECRET,
    providers,
    session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      async signIn({ user }) {
        return isEmailAllowed(user.email);
      },
      async jwt({ token, user, account }) {
        if (user && account) {
          const sub = account.provider === "cognito" ? account.providerAccountId : null;
          const dbUser = await upsertUserOnSignIn({
            email: user.email!,
            name: user.name ?? null,
            cognitoSub: sub,
          });
          token.uid = dbUser.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.uid && session.user) {
          session.user = { id: token.uid, email: session.user.email ?? "", name: session.user.name };
        }
        return session;
      },
    },
  };
  return options;
}

export type CurrentUser = { id: string; email: string; name?: string | null };

/** For server components: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions());
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

/** For route handlers: throws 401 instead of redirecting. */
export async function requireApiUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions());
  if (!session?.user?.id) throw new HttpError(401, "Not authenticated");
  return session.user;
}
