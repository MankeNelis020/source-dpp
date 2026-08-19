import { AuthChrome } from "@/components/source/auth-chrome";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <AuthChrome title="Privacy (draft — legal review required)">
      <p className="text-[14px] leading-relaxed text-[#101A15]/70">
        SOURCE stores organisation membership, product data, evidence metadata and workspace state in
        the environment&apos;s own Postgres project. Authentication is handled by Supabase Auth.
        Original evidence files are stored privately and are not published by uploading them.
      </p>
      <p className="mt-4 text-[14px] leading-relaxed text-[#101A15]/70">
        Account deletion is not available in this milestone. Membership can be suspended without
        deleting audit history. This notice is draft product copy for a controlled invited pilot and
        requires legal review.
      </p>
      <p className="mt-4 text-[13px] text-[#101A15]/60">
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms
        </Link>
      </p>
    </AuthChrome>
  );
}
