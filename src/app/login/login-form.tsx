"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ cognito, dev, callbackUrl }: { cognito: boolean; dev: boolean; callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {cognito ? (
        <Button className="w-full" size="lg" disabled={busy} onClick={() => { setBusy(true); void signIn("cognito", { callbackUrl }); }}>
          Sign in with Amazon Cognito
        </Button>
      ) : null}
      {dev ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            void signIn("dev", { email: f.get("email"), password: f.get("password"), callbackUrl });
          }}
        >
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Local development login. Disabled automatically when Cognito is configured.
          </p>
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
          <Input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
          <Button type="submit" className="w-full" disabled={busy}>
            Sign in
          </Button>
        </form>
      ) : null}
    </div>
  );
}
