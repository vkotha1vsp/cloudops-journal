import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cognitoEnabled, env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const session = await getServerSession(authOptions());
  if (session?.user?.id) redirect("/dashboard");
  const { error, callbackUrl } = await searchParams;
  const safeCallback = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]" />
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-lg text-white shadow">☁</div>
          <h1 className="text-xl font-semibold">CloudOps Journal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your private DevOps knowledge base</p>
        </div>
        {error ? (
          <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error === "AccessDenied" ? "This account is not allowed to sign in." : "Sign-in failed. Check your credentials."}
          </p>
        ) : null}
        <LoginForm cognito={cognitoEnabled()} dev={env().AUTH_DEV_LOGIN} callbackUrl={safeCallback} />
      </div>
    </div>
  );
}
