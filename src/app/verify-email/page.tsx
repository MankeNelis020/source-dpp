"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";

function VerifyEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const error = searchParams.get("error");
  const [notice, setNotice] = useState<string | null>(
    error === "expired" ? "That verification link has expired or already been used." : null
  );
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    try {
      const config = await api<{ identityProvider: "supabase" | "test" }>("/api/auth/config");
      if (config.identityProvider === "supabase" && email) {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding/organisation` },
        });
      }
      setNotice("If this email can be used, we sent another verification link.");
    } catch {
      setNotice("If this email can be used, we sent another verification link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome title="Check your inbox" description="We've sent a verification link to your email.">
      {notice ? <p className="mb-6 text-[13px] text-[#101A15]/70">{notice}</p> : null}
      <div className="space-y-3">
        <SourceButton className="w-full" onClick={() => void resend()} disabled={pending}>
          {pending ? "Sending…" : "Resend email"}
        </SourceButton>
        <SourceButton href="/signup" variant="ghost" className="w-full">
          Use a different email
        </SourceButton>
      </div>
      <p className="mt-8 text-center text-[13px] text-[#101A15]/60">
        Already verified?{" "}
        <Link href="/login" className="text-[#101A15] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthChrome>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="px-5 py-24 text-[13px] text-[#101A15]/50">Loading…</div>}>
      <VerifyEmail />
    </Suspense>
  );
}
