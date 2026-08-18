"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = decodeURIComponent(params.token ?? "");
  const [status, setStatus] = useState<"working" | "ok" | "auth" | "error">("working");
  const [message, setMessage] = useState("Accepting invitation…");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const session = await api<{ authenticated: boolean; nextPath?: string }>("/api/session");
        if (!session.authenticated) {
          router.replace(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
          return;
        }
        await api("/api/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        setStatus("ok");
        setMessage("You're in. Opening the workspace.");
        router.replace("/app");
      } catch (error) {
        if (cancelled) return;
        const err = error as Error & { status?: number };
        if (err.status === 401) {
          setStatus("auth");
          router.replace(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
          return;
        }
        setStatus("error");
        setMessage(err.message || "This invitation is no longer valid.");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <AuthChrome title="Join your team" description={message}>
      {status === "error" ? (
        <SourceButton href="/login" className="w-full">
          Sign in
        </SourceButton>
      ) : null}
    </AuthChrome>
  );
}
