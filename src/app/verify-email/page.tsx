"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { resendAuthErrorMessage, verifyEmailErrorMessage } from "@/infrastructure/auth/supabase/pkce";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";
import { authEmailRedirectTo } from "@/lib/source/auth-origin";

function VerifyEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const error = searchParams.get("error");
  const [notice, setNotice] = useState<string | null>(verifyEmailErrorMessage(error));
  const [noticeIsError, setNoticeIsError] = useState(Boolean(verifyEmailErrorMessage(error)));
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    try {
      const config = await api<{ identityProvider: "supabase" | "test"; appPublicUrl?: string | null }>(
        "/api/auth/config"
      );
      if (config.identityProvider !== "supabase") {
        setNotice("If this email can be used, we sent another verification link.");
        setNoticeIsError(false);
        return;
      }
      if (!email) {
        setNotice("Enter the email you signed up with, then request a new verification link.");
        setNoticeIsError(true);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: authEmailRedirectTo(config.appPublicUrl, "/onboarding/organisation") },
      });
      if (resendError) {
        setNotice(resendAuthErrorMessage(resendError));
        setNoticeIsError(true);
        return;
      }
      setNotice("If this email can be used, we sent another verification link.");
      setNoticeIsError(false);
    } catch (err) {
      setNotice(resendAuthErrorMessage(err));
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome title="Check your inbox" description="We've sent a verification link to your email.">
      {notice ? (
        <p className={`mb-6 text-[13px] ${noticeIsError ? "text-[#B26B2C]" : "text-[#101A15]/70"}`}>{notice}</p>
      ) : null}
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
