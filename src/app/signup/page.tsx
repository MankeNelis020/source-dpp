"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { signupAuthErrorMessage } from "@/infrastructure/auth/supabase/pkce";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome, AuthField } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";
import { authEmailRedirectTo } from "@/lib/source/auth-origin";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const config = await api<{ identityProvider: "supabase" | "test"; appPublicUrl?: string | null }>(
        "/api/auth/config"
      );
      if (config.identityProvider === "supabase") {
        const supabase = createBrowserSupabaseClient();
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authEmailRedirectTo(config.appPublicUrl, "/onboarding/organisation") },
        });
        if (signUpError) {
          setError(signupAuthErrorMessage(signUpError));
          return;
        }
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/onboarding/organisation");
      router.refresh();
    } catch (err) {
      setError(signupAuthErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome
      title="Create your SOURCE workspace"
      description="Start with the product data you already have. We'll find what's missing."
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Work email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
        <AuthField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
        />
        {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
        <SourceButton type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </SourceButton>
      </form>
      <p className="mt-4 text-[12px] leading-relaxed text-[#101A15]/55">
        SOURCE v0.1 is a controlled invited pilot. Workspace terms and the supplier Data Disclosure
        Terms are draft product copy and require legal review. Creating an account records operational
        use of this environment, not a formally approved contract.
      </p>
      <p className="mt-3 text-center text-[13px] text-[#101A15]/60">
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </p>
      <p className="mt-8 text-center text-[13px] text-[#101A15]/60">
        Already have an account?{" "}
        <Link href="/login" className="text-[#101A15] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthChrome>
  );
}
