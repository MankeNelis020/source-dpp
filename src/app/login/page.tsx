"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome, AuthField } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";
import { safeNextPath } from "@/lib/source/safe-next";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState<"supabase" | "test">("test");
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    void api<{ identityProvider: "supabase" | "test" }>("/api/auth/config")
      .then((data) => setProvider(data.identityProvider))
      .catch(() => setProvider("test"));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (provider === "supabase") {
        const supabase = createBrowserSupabaseClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError("We couldn't sign you in. Check your email and password.");
          return;
        }
      } else {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      const session = await api<{ nextPath?: string; emailVerified?: boolean; authenticated: boolean }>(
        "/api/session"
      );
      if (!session.authenticated) {
        router.push("/login");
        return;
      }
      router.push(safeNextPath(nextPath !== "/app" ? nextPath : session.nextPath));
      router.refresh();
    } catch {
      setError("We couldn't sign you in. Check your email and password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome title="Welcome back">
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Work email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
        />
        {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
        <SourceButton type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </SourceButton>
      </form>
      <div className="mt-6 space-y-2 text-center text-[13px]">
        <Link href="/forgot-password" className="block text-[#101A15]/60 underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="block text-[#101A15] underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </AuthChrome>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-5 py-24 text-[13px] text-[#101A15]/50">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
