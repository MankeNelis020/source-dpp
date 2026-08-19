"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome, AuthField, AuthFooterLink } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";
import { authEmailRedirectTo } from "@/lib/source/auth-origin";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ email }) });
      const config = await api<{ identityProvider: "supabase" | "test"; appPublicUrl?: string | null }>(
        "/api/auth/config"
      );
      if (config.identityProvider === "supabase") {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authEmailRedirectTo(config.appPublicUrl, "/reset-password"),
        });
      }
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome
      title="Reset your password"
      description={
        sent
          ? "If an account exists for that email, we sent reset instructions."
          : "Enter your work email and we'll send a reset link."
      }
    >
      {sent ? (
        <SourceButton href="/login" className="w-full">
          Back to sign in
        </SourceButton>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <AuthField label="Work email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
          <SourceButton type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </SourceButton>
        </form>
      )}
      <AuthFooterLink href="/login">Back to sign in</AuthFooterLink>
    </AuthChrome>
  );
}
