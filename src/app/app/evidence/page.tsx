import Link from "next/link";
import { DEMO_EVIDENCE, DEMO_SUPPLIERS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceLabel, SourceTable, StatusPill } from "@/components/source/ui";

export default function EvidenceLibraryPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Evidence"
        description="Not a Dropbox clone. Evidence is found through claims: original document, SHA hash, issuer, permissions, audit history."
      />
      <SourceTable columns={["Document", "Supplier", "Issuer", "Valid until", "Status"]}>
        {DEMO_EVIDENCE.map((e) => {
          const supplier = DEMO_SUPPLIERS.find((s) => s.id === e.supplierId);
          return (
            <tr key={e.id} className="border-t border-ink/8 hover:bg-paper/80">
              <td className="px-4 py-3">
                <Link href={`/app/evidence/${e.id}`} className="font-[family-name:var(--font-plex)] text-[12px] hover:underline">
                  {e.filename}
                </Link>
              </td>
              <td className="px-4 py-3">{supplier?.name ?? e.supplierId}</td>
              <td className="px-4 py-3">{e.issuer}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{e.validUntil}</td>
              <td className="px-4 py-3">
                <StatusPill
                  tone={
                    e.verification === "verified"
                      ? "signal"
                      : e.verification === "expired"
                        ? "attention"
                        : "muted"
                  }
                >
                  {e.verification}
                </StatusPill>
              </td>
            </tr>
          );
        })}
      </SourceTable>
      <p className="mt-3">
        <SourceLabel>Originals are immutable. A new version is a new evidence object.</SourceLabel>
      </p>
    </div>
  );
}
