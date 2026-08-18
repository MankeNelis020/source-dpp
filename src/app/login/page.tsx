"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { writeSession } from "@/lib/session";
import { SourceWordmark } from "@/components/source/wordmark";
import { SourceButton, SourceLabel } from "@/components/source/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"email" | "password">("email");
  const [notice, setNotice] = useState<string | null>(null);
  const nextPath = searchParams.get("next");
  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/app";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <SourceWordmark size="lg" />
      <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
        Sign in to SOURCE
      </h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (stage === "email") {
            setStage("password");
            return;
          }
          writeSession({
            email,
            organisation: email.toLowerCase().includes("nordic") ? "Nordic Chairs Oy" : "Acme Manufacturing B.V.",
          });
          void fetch("/api/auth/login", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }).then(() => router.push(safeNext));
        }}
      >
        <div>
          <SourceLabel>Work email</SourceLabel>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B6E50]"
          />
        </div>
        {stage === "password" ? (
          <div>
            <SourceLabel>Password</SourceLabel>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B6E50]"
            />
          </div>
        ) : null}
        <SourceButton type="submit" className="w-full">
          {stage === "email" ? "Continue" : "Sign in"}
        </SourceButton>
      </form>
      <div className="mt-6 space-y-2">
        <SourceButton variant="ghost" className="w-full" onClick={() => setNotice("Microsoft sign-in is available on Scale.")}>
          Continue with Microsoft
        </SourceButton>
        <SourceButton variant="ghost" className="w-full" onClick={() => setNotice("Google sign-in is available on Scale.")}>
          Continue with Google
        </SourceButton>
        <button
          type="button"
          className="w-full py-2 text-center text-[12px] text-[#101A15]/55 hover:text-[#101A15]"
          onClick={() => setNotice("Company SSO appears for Scale and Enterprise.")}
        >
          Use company SSO
        </button>
      </div>
      {notice ? <p className="mt-4 text-center text-[12px] text-[#101A15]/60">{notice}</p> : null}
      <p className="mt-8 text-center text-[13px] text-[#101A15]/60">
        No account?{" "}
        <Link href="/signup" className="text-[#101A15] underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-5 py-24 text-[13px] text-[#101A15]/50">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
