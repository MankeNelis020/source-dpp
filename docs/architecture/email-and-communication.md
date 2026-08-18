# Email and supplier communication

Resend is an infrastructure provider. It is not the Missing Information Engine.

```text
InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness → READY | UNRESOLVED
```

A supplier request remains one attempt. Grouped communication still creates one conversation per supplier, not one claim per SKU.

```text
SOURCE domain / application
↓
Transactional outbox (committed with the command)
↓
EmailProvider port
↓
ResendEmailAdapter or TestEmailProvider
↓
Resend
```

Never `engine.ts → resend.emails.send()`. Never React → Resend.

---

## CURRENT (PR C)

| Piece | Owner |
|---|---|
| `EmailProvider` | Infrastructure port |
| `TestEmailProvider` / `MemoryEmailPort` | Local / CI |
| `ResendEmailAdapter` | Preview live / production |
| `outbox_events` | What to send, retry, dead-letter |
| `outbound_messages` | Transport state for one semantic send |
| `email_provider_events` | Webhook idempotency |
| Portal grant | Hashed token; raw token only in the recipient email |

The outbox is the source of truth for *whether SOURCE intended to send*. Transport state is separate from `SupplierRequest` lifecycle (`SENT` vs `QUEUED` / `PROVIDER_ACCEPTED` / `DELIVERED` / `BOUNCED`).

Provider acceptance is not delivery. Delivery is not a supplier response. Bounce is not `NO_RESPONSE`.

---

## Send path

```text
Manufacturer executes resolution
→ domain changes + processed command + audit + portal grant + outbox + outbound_messages QUEUED
→ COMMIT
→ worker claims FOR UPDATE SKIP LOCKED
→ EmailProvider.send (after commit)
→ provider message id stored, transport PROVIDER_ACCEPTED
→ webhook: DELIVERED / BOUNCED / COMPLAINED
```

The user request does not wait for Resend. UI: request queued.

Semantic keys remain primary idempotency (`SRC-123:REQUEST_INITIAL:v1`, `REMINDER:DAY3:v1`, `MANUAL_RESEND:n:v1`). The Resend idempotency key is defense in depth.

Duplicate worker delivery of the same semantic event must not produce a second supplier email.

---

## Transport states

`QUEUED → SUBMITTING → PROVIDER_ACCEPTED → DELIVERED`

Terminal failures: `BOUNCED`, `COMPLAINED`, `FAILED` (retryable worker error), outbox `DEAD_LETTER`.

Out-of-order webhooks never regress `DELIVERED` to `PROVIDER_ACCEPTED`.

---

## Bounce vs no-response

| Event | Meaning |
|---|---|
| `BOUNCED` | Transport / contact problem. Alternate contact or Needs You. |
| `NO_RESPONSE` | Message was deliverable; supplier has not answered. |
| Provider timeout / 429 / 5xx | Outbox retry. Not a human task until dead-letter. |
| `COMPLAINED` | Stop automated follow-ups to that recipient. Needs You. |

---

## Templates

Central renderer: `src/infrastructure/email/templates.ts`.

| Template | Version | When |
|---|---|---|
| `SUPPLIER_REQUEST` | v1 | Initial grouped request |
| `REMINDER` | v1 | Escalation DAY3 / DAY7 / … |
| `AUTHORIZATION` | v1 | Permission only; do not re-ask known values |
| `UPSTREAM` | v1 | Ask-my-supplier; honors confidential / hide-customer |

HTML is escaped. Plain text is mandatory. Portal URL uses `NEXT_PUBLIC_SOURCE_APP_URL` (never the request `Host` header). Emails do not include catalogues, other suppliers, internal case ids, or confidential upstream identities.

Reply-To may be a monitored support mailbox. SOURCE does not parse inbound email in PR C. The CTA is the portal.

From: SOURCE-controlled address, e.g. `{{customerName}} via SOURCE <requests@…>`. Do not spoof the customer domain.

---

## Metrics

`emails.queued`, `emails.provider_accepted`, `emails.delivered`, `emails.bounced`, `emails.complained`, `emails.failed`, `outbox.retry`, `outbox.dead_letter`.

No recipient addresses in labels.

**Unique supplier contact:** one grouped request to a supplier is one conversation. Transport retries and dead-letter retries are not new unique contacts. Response rate is computed from SOURCE events, not email opens.

Categories: `SUPPLIER_REQUEST`, `SUPPLIER_REMINDER`, `SUPPLIER_AUTHORIZATION`, `SUPPLIER_UPSTREAM`. Auth / invitation mail stays on Supabase Auth.

---

## Worker

`POST /api/internal/outbox/process` protected by `CRON_SECRET`. Vercel Cron every 5 minutes only wakes the worker. Postgres remains truth.

`POST /api/webhooks/resend` verifies Svix signatures. No SOURCE login.

`POST /api/internal/outbox/retry` retries a dead letter after the issue is corrected (same semantic key; audited).

---

## Preview safety

Preview defaults to `SOURCE_EMAIL_MODE=test` (`TestEmailProvider`). Live preview sending requires Resend config **and** `SOURCE_EMAIL_ALLOWED_RECIPIENTS`. Production is always live Resend and never silently rewrites recipients to a sandbox.

Portal links in preview email must use the preview app URL.
