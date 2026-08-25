import { PublicShell } from "@/components/source/public-shell";
import { PageView } from "@/components/source/page-view";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <PageView />
      {children}
    </PublicShell>
  );
}
