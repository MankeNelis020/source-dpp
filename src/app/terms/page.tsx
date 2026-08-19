import { AuthChrome } from "@/components/source/auth-chrome";
import Link from "next/link";

export default function TermsPage() {
  return (
    <AuthChrome title="Terms (draft — legal review required)">
      <p className="text-[14px] leading-relaxed text-[#101A15]/70">
        SOURCE v0.1 is a controlled invited pilot of a Missing Information Engine. A supplier request
        remains one resolution attempt. Use of the workspace is limited to the organisation you belong
        to.
      </p>
      <p className="mt-4 text-[14px] leading-relaxed text-[#101A15]/70">
        These pages and the supplier Data Disclosure Terms are draft product copy. They require legal
        review before SOURCE is offered as public self-serve software. Participating in this pilot
        records operational use of the environment, not a formally approved contract.
      </p>
      <p className="mt-4 text-[13px] text-[#101A15]/60">
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </p>
    </AuthChrome>
  );
}
