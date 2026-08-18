"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/infrastructure/auth/supabase/browser";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome, AuthField } from "@/components/source/auth-chrome";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("That reset link is no longer valid. Request a new one.");
        return;
      }
      router.push("/login");
    } catch {
      setError("That reset link is no longer valid. Request a new one.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthChrome title="Choose a new password" description="Use a password you don't reuse elsewhere.">
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
        />
        {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
        <SourceButton type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Update password"}
        </SourceButton>
      </form>
    </AuthChrome>
  );
}
