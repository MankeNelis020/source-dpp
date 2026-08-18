# Email operations

This is how SOURCE sends supplier mail. DNS values must come from the Resend dashboard. Do not invent SPF/DKIM/DMARC records here.

Hosted smoke test (real inbox) is blocked until Niel places Resend credentials and a verified sending domain. CI never sends live email (`TestEmailProvider`).

---

## Provider

Pilot sending domain: one SOURCE-controlled domain or subdomain (conceptual: `requests@mail.source…`). Customers do not configure DNS for the first pilot.

From: `{{customerName}} via SOURCE <verified-from>`. Do not spoof customer domains.

Reply-To: optional monitored support mailbox (`SOURCE_EMAIL_REPLY_TO`). Inbound parsing is an application foundation only (`/api/webhooks/inbound`). Receiving DNS/MX is **not** activated in this milestone. Direct suppliers to the portal CTA until Niel enables Resend Receiving.

---

## DNS (human setup)

After creating the Resend domain, copy **Resend's** records:

- SPF
- DKIM
- DMARC

Deliverability is not complete until the domain shows verified in Resend. Do not claim otherwise.

Webhook URL (production):

```text
https://<production-app>/api/webhooks/resend
```

Preview webhooks only for deliberate preview tests, using the preview URL — never an arbitrary `Host` header.

---

## Vercel Preview

```text
SOURCE_EMAIL_MODE=test
SOURCE_EMAIL_PROVIDER=test
NEXT_PUBLIC_SOURCE_APP_URL=<this preview URL>
CRON_SECRET=<preview secret>
```

Optional deliberate live preview (allow-listed only):

```text
SOURCE_EMAIL_MODE=live
SOURCE_EMAIL_PROVIDER=resend
RESEND_API_KEY=<preview Resend key>
RESEND_WEBHOOK_SECRET=<preview webhook secret>
SOURCE_EMAIL_FROM=<verified preview/from address>
SOURCE_EMAIL_ALLOWED_RECIPIENTS=<your test inbox>
```

Preview must not contact real supplier addresses unless live mode **and** allow-list are set. Missing allow-list in live preview fails closed at boot.

---

## Vercel Production

```text
SOURCE_EMAIL_MODE=live
SOURCE_EMAIL_PROVIDER=resend
RESEND_API_KEY=<production>
RESEND_WEBHOOK_SECRET=<production>
SOURCE_EMAIL_FROM=<verified production sender>
SOURCE_EMAIL_REPLY_TO=<optional support mailbox>
CRON_SECRET=<production>
NEXT_PUBLIC_SOURCE_APP_URL=<production app URL>
SOURCE_OUTBOX_BATCH_SIZE=20
SOURCE_OUTBOX_MAX_ATTEMPTS=5
```

Do not reuse preview secrets. Production must not silently rewrite recipients.

---

## Worker

Vercel Cron `*/5 * * * *` → `GET/POST /api/internal/outbox/process` with `Authorization: Bearer ${CRON_SECRET}`.

Hourly `0 * * * *` → `/api/internal/engine/tick` for reminder / no-response ticks. Same secret.

Safe to call repeatedly. Response: `{ claimed, succeeded, failed, deadLetter }` — no payloads, no tokens, no addresses.

---

## Health

Public `GET /api/health` may include `email: "configured" | "unconfigured" | "test"`. It does not send a test message and does not expose keys.

Internal `GET /api/internal/health` (cron secret) adds outbox backlog.

---

## Test send (non-production)

`POST /api/internal/email/test` with cron secret, body `{ "to": "allow-listed@…" }`. Refused in production. Not a public arbitrary-email endpoint.

On `EmailProviderError`, the HTTP response stays generic (`{"error":"ERROR","message":"Request failed."}`). SOURCE logs one JSON line to server logs (`event: "email.test.failed"`) with allow-listed fields only: provider, errorType, sanitized message, retryable, permanent, sourceEnv, emailMode, emailProvider, fromDomain, and Resend `statusCode` / `providerErrorName` when present.

Never logged: API keys, full recipient, full From address, request body, portal URLs/tokens, cron/bypass/webhook secrets. This diagnostic is operational and safe to retain. It does not change Resend send or retry classification.

---

## Needs Niel (do not paste secret values into chat)

1. Resend account / project
2. Verified sending domain
3. API key (preview vs production separate)
4. Webhook endpoint + signing secret
5. From address
6. DNS records from Resend (SPF, DKIM, DMARC)
7. Vercel env as above
9. After that: hosted smoke test (`npm run smoke:preview`) then a browser pass: real import → Let SOURCE handle the gaps → real Resend → open `/s/{token}` → upload evidence → Results
10. Resend Receiving / inbound MX — not required for the outbound portal loop
