import { AuthChrome } from "@/components/source/auth-chrome";

export default function SecurityPage() {
  return (
    <AuthChrome title="Security">
      <p className="text-[14px] leading-relaxed text-[#101A15]/70">
        Supabase Auth identifies the human. SOURCE authorizes from organisation membership rows.
        Client-editable user metadata is never used for tenant, role, or admin decisions.
      </p>
    </AuthChrome>
  );
}
