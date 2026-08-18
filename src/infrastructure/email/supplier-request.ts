export function supplierRequestMessage(input: {
  organisationName: string;
  itemCount: number;
  portalUrl: string;
  expiresAt: Date;
}) {
  const items =
    input.itemCount === 1 ? "1 item needs your input." : `${input.itemCount} items need your input.`;
  const expiry = input.expiresAt.toISOString().slice(0, 10);
  const subject = `${input.organisationName} needs product information`;
  const text = [
    `${input.organisationName} is requesting product information through SOURCE.`,
    "",
    "SOURCE is the Missing Information Engine. It asks suppliers only for information that could not be resolved from existing, permitted evidence.",
    "",
    `You received this because you are listed as a supplier for a product in their catalogue.`,
    items,
    "",
    "Provide information:",
    input.portalUrl,
    "",
    `This link expires on ${expiry}. It is scoped to this request. Do not forward it unless you intend that person to answer.`,
    "",
    "If this reached the wrong person, open the link and choose Wrong contact.",
  ].join("\n");
  const html = `<p>${escapeHtml(input.organisationName)} is requesting product information through SOURCE.</p>
<p>SOURCE is the Missing Information Engine. It asks suppliers only for information that could not be resolved from existing, permitted evidence.</p>
<p>You received this because you are listed as a supplier for a product in their catalogue. ${escapeHtml(items)}</p>
<p><a href="${escapeHtml(input.portalUrl)}">Provide information</a></p>
<p>This link expires on ${escapeHtml(expiry)}. It is scoped to this request.</p>
<p>If this reached the wrong person, open the link and choose Wrong contact.</p>`;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
