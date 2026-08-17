import type { Metadata } from "next";
import { EvidenceLine, SourceButton, SourceLabel } from "@/components/source/ui";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  {
    n: "01",
    title: "Detect what is missing",
    body: "A dataset defines the required claims. SOURCE compares that with trusted data — not with fields that happen to be filled. Expired evidence is missing valid evidence.",
  },
  {
    n: "02",
    title: "Resolve identity, then route",
    body: "Names, VAT, LEI, GTIN, domains and graph context are scored. High confidence matches automatically. Medium goes to review. SOURCE will not auto-link evidence in doubt.",
  },
  {
    n: "03",
    title: "Reuse before you ask",
    body: "Existing reusable claims, authorization-only claims, public evidence and active requests are checked first. A new supplier mail is the expensive option.",
  },
  {
    n: "04",
    title: "Collect, escalate, travel upstream",
    body: "No response, bounce, wrong contact and I don't know are normal states. SOURCE reminds, tries another person, or follows the chain — with confidentiality preserved.",
  },
  {
    n: "05",
    title: "Prove, permit, return, maintain",
    body: "Evidence is scoped and conflict-checked. Permission is explicit. Ready claims return under output policy. Expiry and revocation start a new cycle. The engine ends at INFORMATION RESOLVED or a explained UNRESOLVED.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <SourceLabel>How it works</SourceLabel>
      <h1 className="mt-4 font-[family-name:var(--font-space)] text-[40px] font-medium leading-tight tracking-[-0.03em]">
        Detect. Resolve. Collect. Escalate. Prove. Permit. Return. Maintain.
      </h1>
      <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/70">
        SOURCE is the missing information engine. Manufacturers see what blocks a product. Suppliers
        can answer, forward, protect a relationship, or say they do not know. Identity, evidence,
        permission and audit stay underneath.
      </p>
      <ol className="mt-16 space-y-12">
        {STEPS.map((step) => (
          <li key={step.n}>
            <SourceLabel>{step.n}</SourceLabel>
            <h2 className="mt-2 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
              {step.title}
            </h2>
            <EvidenceLine className="mt-3" />
            <p className="mt-3 text-[13px] leading-relaxed text-[#101A15]/70">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-16 flex flex-wrap gap-3">
        <SourceButton href="/app">See the workspace</SourceButton>
        <SourceButton href="/signup" variant="ghost">
          Connect your catalogue
        </SourceButton>
      </div>
    </div>
  );
}
