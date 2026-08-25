import type { SupplierReferenceMode, UpstreamContactMode } from "./types";

export const DEFAULT_SUPPLIER_REFERENCE_MODE: SupplierReferenceMode = "NO_REFERENCE";

export const SUPPLIER_REFERENCE_MODES = [
  {
    id: "NO_REFERENCE" as const,
    label: "Do not name my organisation or the requesting customer",
    help: "SOURCE introduces the request without naming either organisation. This is the least-permissive default.",
  },
  {
    id: "CURRENT_ORGANISATION" as const,
    label: "Name my organisation only",
    help: "SOURCE may say the request comes from your organisation. It will not name the requesting customer.",
  },
  {
    id: "FULL_REFERENCE" as const,
    label: "Name my organisation and the requesting customer",
    help: "SOURCE may name both organisations when introducing this request.",
  },
] as const;

export function referenceModeFromUpstream(mode: UpstreamContactMode | undefined): SupplierReferenceMode {
  if (mode === "on_behalf") return "FULL_REFERENCE";
  if (mode === "without_customer") return "CURRENT_ORGANISATION";
  return "NO_REFERENCE";
}

export function upstreamModeFromReference(mode: SupplierReferenceMode): UpstreamContactMode {
  if (mode === "FULL_REFERENCE") return "on_behalf";
  if (mode === "CURRENT_ORGANISATION") return "without_customer";
  return "confidential";
}

export function resolveSupplierReferenceMode(input: {
  referenceMode?: SupplierReferenceMode;
  mode?: UpstreamContactMode;
}): SupplierReferenceMode {
  return input.referenceMode ?? referenceModeFromUpstream(input.mode);
}

export function introductionCopy(input: {
  mode: SupplierReferenceMode;
  currentOrganisationName?: string;
  requestingOrganisationName?: string;
}): { subject: string; title: string; paragraphs: string[] } {
  const current = input.currentOrganisationName?.trim();
  const requester = input.requestingOrganisationName?.trim();
  if (input.mode === "FULL_REFERENCE" && current && requester) {
    return {
      subject: `${requester} needs product information`,
      title: "Product information is needed further upstream",
      paragraphs: [
        `${current} asked SOURCE to request this from you on behalf of ${requester}.`,
        "This is a new attempt on the same requirement. SOURCE does not expose unrelated customers, catalogues, or supply-chain relationships in this message.",
      ],
    };
  }
  if (input.mode === "CURRENT_ORGANISATION" && current) {
    return {
      subject: `${current} needs product information`,
      title: "Product information is needed further upstream",
      paragraphs: [
        `${current} asked SOURCE to request this from you.`,
        "This is a new attempt on the same requirement. SOURCE does not name the requesting customer in this introduction.",
      ],
    };
  }
  return {
    subject: "Product information requested through SOURCE",
    title: "Product information is needed further upstream",
    paragraphs: [
      "A product-information request was forwarded to you through SOURCE.",
      "Your customer asked SOURCE to request this from you. This is a new attempt on the same requirement.",
    ],
  };
}

export function introductionContainsIdentity(
  copy: { subject: string; title: string; paragraphs: string[] },
  name: string
) {
  const blob = `${copy.subject}\n${copy.title}\n${copy.paragraphs.join("\n")}`;
  return name.trim() !== "" && blob.includes(name.trim());
}
