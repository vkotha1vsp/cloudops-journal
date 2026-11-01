import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function handler(req: Request, ctx: { params: Promise<{ nextauth: string[] }> }) {
  return NextAuth(req as never, ctx as never, authOptions());
}

export { handler as GET, handler as POST };
