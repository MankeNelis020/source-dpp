import { jsonError } from "../../../source/_lib";
import { getPersistence, getRuntimeEmailProvider, getSourceEnvironment } from "@/infrastructure/runtime";
import { requireCronSecret } from "@/server/source/cron-auth";
import { SourceError } from "@/server/source/types";
import { normalizeEmail, recipientAllowed } from "@/infrastructure/email/validate";
import { renderSupplierRequestEmail } from "@/infrastructure/email/templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    const env = getSourceEnvironment();
    if (env.runtime === "production") {
      throw new SourceError("FORBIDDEN", "Test email is not available in production.", 403);
    }
    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to = normalizeEmail(body.to);
    if (!to) throw new SourceError("VALIDATION", "A valid allow-listed recipient is required.", 400);
    const allow = env.emailAllowedRecipients ?? [];
    if (allow.length && !recipientAllowed(to, allow)) {
      throw new SourceError("FORBIDDEN", "Recipient is not allow-listed.", 403);
    }
    if (!allow.length && env.emailMode === "live") {
      throw new SourceError("FORBIDDEN", "Live test sends require SOURCE_EMAIL_ALLOWED_RECIPIENTS.", 403);
    }
    const rendered = renderSupplierRequestEmail({
      organisationName: "SOURCE test",
      itemCount: 1,
      portalUrl: `${env.appPublicUrl ?? "http://localhost:3000"}/s/test-not-a-grant`,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const result = await getRuntimeEmailProvider().send({
      semanticKey: `TEST:${to}:${Date.now()}`,
      to: [to],
      from: env.emailFrom ?? "SOURCE <requests@localhost>",
      replyTo: env.emailReplyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "SYSTEM_OPERATIONAL",
      tags: { category: "SYSTEM_OPERATIONAL" },
    });
    void getPersistence();
    return Response.json({
      provider: result.provider,
      acceptedAt: result.acceptedAt,
    });
  } catch (error) {
    return jsonError(error);
  }
}
