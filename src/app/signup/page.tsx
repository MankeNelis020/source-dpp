"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { writeSession } from "@/lib/session";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

type Step = 1 | 2 | 3 | 4;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("Netherlands");
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const guessedLegal = companyName.trim()
    ? companyName.toLowerCase().includes("b.v")
      ? companyName
      : `${companyName} B.V.`
    : "Acme Manufacturing B.V.";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <SourceWordmark size="lg" />
      <SourceLabel className="mt-10">Step {step} of 4</SourceLabel>
      <h1 className="mt-3 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
        {step === 1 && "Work email"}
        {step === 2 && "Verify email"}
        {step === 3 && "Your organisation"}
        {step === 4 && "Confirm legal entity"}
      </h1>

      {step === 1 ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <Field label="Work email" type="email" value={email} onChange={setEmail} required />
          <Field label="Password" type="password" value={password} onChange={setPassword} required />
          <p className="text-[12px] text-[#101A15]/50">Minimum 8 characters.</p>
          <SourceButton type="submit" className="w-full">
            Continue
          </SourceButton>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="mt-8">
          <p className="text-[14.5px] leading-relaxed text-[#101A15]/70">
            We sent a verification to <span className="text-[#101A15]">{email}</span>. For this
            discovery build, continue without leaving the page.
          </p>
          <SourceButton className="mt-6 w-full" onClick={() => setStep(3)}>
            I verified my email
          </SourceButton>
        </div>
      ) : null}

      {step === 3 ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(4);
          }}
        >
          <Field label="Company name" value={companyName} onChange={setCompanyName} required />
          <Field label="Your name" value={name} onChange={setName} />
          <Field label="Country" value={country} onChange={setCountry} />
          <Field label="Company website" value={website} onChange={setWebsite} />
          <SourceButton type="submit" className="w-full">
            Continue
          </SourceButton>
        </form>
      ) : null}

      {step === 4 ? (
        <div className="mt-8">
          <p className="text-[13px] text-[#101A15]/60">
            SOURCE tries to recognise the legal entity. This is the first meeting with identity
            resolution.
          </p>
          <div className="mt-6 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <SourceLabel>We found</SourceLabel>
            <div className="mt-2 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
              {guessedLegal}
            </div>
            <EvidenceLine />
            <p className="mt-3 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/65">
              KVK · to be confirmed
              <br />
              VAT · to be confirmed
              <br />
              {country}
              {website ? (
                <>
                  <br />
                  {website}
                </>
              ) : null}
            </p>
            <div className="mt-4">
              <StatusPill tone="signal">Identity candidate</StatusPill>
            </div>
          </div>
          <SourceButton
            className="mt-6 w-full"
            onClick={() => {
              setPending(true);
              writeSession({
                email,
                name,
                organisation: companyName || guessedLegal,
              });
              router.push("/onboarding");
            }}
          >
            {pending ? "Creating…" : "Confirm"}
          </SourceButton>
          <button
            type="button"
            className="mt-3 w-full text-center text-[13px] text-[#101A15]/55"
            onClick={() => setStep(3)}
          >
            This isn&apos;t us
          </button>
        </div>
      ) : null}

      <p className="mt-8 text-center text-[13px] text-[#101A15]/60">
        Already have an account?{" "}
        <Link href="/login" className="text-[#101A15] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <SourceLabel>{label}</SourceLabel>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={type === "password" ? 8 : undefined}
        className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B6E50]"
      />
    </label>
  );
}
