import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel } from "@/components/source/ui";

export default function ExportsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Exports"
        description="A customer must be able to leave SOURCE. Open formats. That is not only ethical — it is the positioning: SOURCE earns trust by not building a data prison."
      />
      <ul className="space-y-2 text-[13px]">
        {["Products", "Actors", "Claims", "Evidence metadata", "Permissions", "Audit history"].map(
          (item) => (
            <li key={item} className="border-b border-[#101A15]/8 py-3">
              {item}
            </li>
          )
        )}
      </ul>
      <SourceButton className="mt-8">Export JSON + CSV</SourceButton>
      <p className="mt-4">
        <SourceLabel>Usage 421 / 500 active supplier relationships</SourceLabel>
      </p>
    </div>
  );
}
