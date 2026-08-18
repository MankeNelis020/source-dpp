import { redirect } from "next/navigation";

export default function LegacyOnboardingPage() {
  redirect("/onboarding/organisation");
}
