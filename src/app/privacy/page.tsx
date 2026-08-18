import { AuthChrome } from "@/components/source/auth-chrome";

export default function PrivacyPage() {
  return (
    <AuthChrome title="Privacy">
      <p className="text-[14px] leading-relaxed text-[#101A15]/70">
        SOURCE stores organisation membership and workspace data in the environment&apos;s own
        Postgres project. Authentication is handled by Supabase Auth. Account deletion is not
        available in this milestone; membership can be suspended without deleting audit history.
      </p>
    </AuthChrome>
  );
}
