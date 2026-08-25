import type { EmailCategory } from "./port";
import type { EmailTemplateId } from "./transport";
import type { SupplierReferenceMode } from "@/domain/source/types";
import { introductionCopy } from "@/domain/source/reference-mode";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  templateId: EmailTemplateId;
  templateVersion: string;
  category: EmailCategory;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function itemsLine(itemCount: number) {
  return itemCount === 1 ? "1 item needs your input." : `${itemCount} items need your input.`;
}

function expiryLine(expiresAt: Date) {
  return `This link is valid until ${expiresAt.toISOString().slice(0, 10)}. It is scoped to this request.`;
}

function layout(args: {
  title: string;
  paragraphs: string[];
  ctaLabel: string;
  portalUrl: string;
  expiry: string;
  footer: string[];
}) {
  const htmlParagraphs = args.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const htmlFooter = args.footer.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:Georgia,serif;background:#FBFCFA;color:#101A15;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#FBFCFA;">
    <tr><td>
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0B6E50;">SOURCE</p>
      <h1 style="font-size:22px;font-weight:500;line-height:1.3;">${escapeHtml(args.title)}</h1>
      ${htmlParagraphs}
      <p style="margin:28px 0;">
        <a href="${escapeHtml(args.portalUrl)}" style="display:inline-block;background:#0B6E50;color:#FBFCFA;text-decoration:none;padding:12px 18px;">${escapeHtml(args.ctaLabel)}</a>
      </p>
      <p>${escapeHtml(args.expiry)}</p>
      ${htmlFooter}
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    args.title,
    "",
    ...args.paragraphs,
    "",
    `${args.ctaLabel}:`,
    args.portalUrl,
    "",
    args.expiry,
    "",
    ...args.footer,
  ].join("\n");
  return { html, text };
}

const WHY =
  "You received this because a manufacturer listed you as a supplier and asked SOURCE to collect missing product information.";
const IDENTITY = "SOURCE coordinates product-information requests. This is not a marketing message.";

export function renderSupplierRequestEmail(input: {
  organisationName: string;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
  supportHint?: string;
}): RenderedEmail {
  const items = itemsLine(input.itemCount);
  const rendered = layout({
    title: `${input.organisationName} needs product information`,
    paragraphs: [
      `${input.organisationName} is using SOURCE to complete product information.`,
      `We need your help with ${items.replace(" needs your input.", "").replace(" need your input.", "")}.`,
      "SOURCE helps collect and verify missing product information without exposing unrelated supply-chain data.",
      WHY,
    ],
    ctaLabel: "Provide information",
    portalUrl: input.portalUrl,
    expiry: expiryLine(input.expiresAt),
    footer: [IDENTITY, input.supportHint ?? "If this reached the wrong person, open the link and choose Wrong contact."],
  });
  return {
    subject: `${input.organisationName} needs product information`,
    ...rendered,
    templateId: "SUPPLIER_REQUEST",
    templateVersion: "v1",
    category: "SUPPLIER_REQUEST",
  };
}

export function renderSupplierReminderEmail(input: {
  organisationName: string;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
}): RenderedEmail {
  const items = itemsLine(input.itemCount);
  const rendered = layout({
    title: `Reminder from ${input.organisationName}`,
    paragraphs: [
      `${input.organisationName} is still waiting for product information through SOURCE.`,
      items,
      "Open the same secure link to answer, upload evidence, or tell us you are not the right contact.",
      WHY,
    ],
    ctaLabel: "Provide information",
    portalUrl: input.portalUrl,
    expiry: expiryLine(input.expiresAt),
    footer: [IDENTITY, "Please use the portal link rather than replying to this email."],
  });
  return {
    subject: `Reminder: product information requested by ${input.organisationName}`,
    ...rendered,
    templateId: "REMINDER",
    templateVersion: "v1",
    category: "SUPPLIER_REMINDER",
  };
}

export function renderAuthorisationRequestEmail(input: {
  organisationName: string;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
}): RenderedEmail {
  const rendered = layout({
    title: `${input.organisationName} needs permission to use existing information`,
    paragraphs: [
      "SOURCE already has supporting information for this item. We need your permission to use it for this purpose.",
      `This covers ${input.itemCount === 1 ? "1 item" : `${input.itemCount} items`}. You do not need to re-enter known values.`,
      WHY,
    ],
    ctaLabel: "Review and permit",
    portalUrl: input.portalUrl,
    expiry: expiryLine(input.expiresAt),
    footer: [IDENTITY, "Please use the portal link rather than replying to this email."],
  });
  return {
    subject: `${input.organisationName} needs permission to use existing information`,
    ...rendered,
    templateId: "AUTHORIZATION",
    templateVersion: "v1",
    category: "SUPPLIER_AUTHORIZATION",
  };
}

export function renderUpstreamForwardEmail(input: {
  organisationName?: string;
  currentOrganisationName?: string;
  hideCustomer: boolean;
  referenceMode?: SupplierReferenceMode;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
}): RenderedEmail {
  const mode = input.referenceMode ?? (input.hideCustomer ? "NO_REFERENCE" : "FULL_REFERENCE");
  const intro = introductionCopy({
    mode,
    currentOrganisationName: input.currentOrganisationName,
    requestingOrganisationName: input.organisationName,
  });
  const rendered = layout({
    title: intro.title,
    paragraphs: [...intro.paragraphs, itemsLine(input.itemCount)],
    ctaLabel: "Provide information",
    portalUrl: input.portalUrl,
    expiry: expiryLine(input.expiresAt),
    footer: [IDENTITY, "Please use the portal link rather than replying to this email."],
  });
  return {
    subject: intro.subject,
    ...rendered,
    templateId: "UPSTREAM",
    templateVersion: "v2",
    category: "SUPPLIER_UPSTREAM",
  };
}

export function renderEmailByTemplate(
  templateId: EmailTemplateId,
  input: {
    organisationName: string;
    itemCount: number;
    portalUrl: string;
    expiresAt: Date;
    hideCustomer?: boolean;
    referenceMode?: SupplierReferenceMode;
    currentOrganisationName?: string;
  }
): RenderedEmail {
  if (templateId === "REMINDER") return renderSupplierReminderEmail(input);
  if (templateId === "AUTHORIZATION") return renderAuthorisationRequestEmail(input);
  if (templateId === "UPSTREAM") {
    return renderUpstreamForwardEmail({
      organisationName: input.organisationName,
      currentOrganisationName: input.currentOrganisationName,
      hideCustomer: Boolean(input.hideCustomer),
      referenceMode: input.referenceMode,
      itemCount: input.itemCount,
      portalUrl: input.portalUrl,
      expiresAt: input.expiresAt,
    });
  }
  return renderSupplierRequestEmail(input);
}

/** @deprecated Use renderSupplierRequestEmail */
export function supplierRequestMessage(input: {
  organisationName: string;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
}) {
  return renderSupplierRequestEmail(input);
}
