# Supplier loop

The Missing Information Engine is unchanged:

```text
InformationRequirement → ResolutionCase → ResolutionAttempt(s) → READY | UNRESOLVED
```

A supplier request is one attempt. Provider acceptance is not delivery. Bounce is not `NO_RESPONSE`.

## Browser path (pilot)

```text
Sign in (Supabase Auth)
→ create / select organisation
→ upload CSV (products, optional suppliers / BOM / materials)
→ original bytes stored privately
→ SOURCE parses, normalizes, generates requirements
→ existing evidence / reuse may close gaps without mail
→ manufacturer chooses “Let SOURCE handle the gaps”
→ portal grant (hashed token) + transactional outbox
→ worker sends via EmailProvider (Resend in hosted live)
→ supplier opens /s/{token} without a SOURCE account
→ answer and/or evidence
→ requirement recomputed
→ Results page shows avoided vs required contact
```

The manufacturer should not need Terminal, SQL, Vercel, or internal APIs for this path.

## Security

- Organisation scope comes from the server-derived principal, never from a browser-supplied org id.
- Portal grants are opaque, hashed at rest, expiring, revocable, and scoped to case/request ids.
- Cross-tenant portal access fails closed.
- Duplicate worker runs do not send a second mail for the same semantic key.
- Duplicate portal submits are idempotent.

## Scheduling

| Cron | Path |
|---|---|
| every 5 minutes | `/api/internal/outbox/process` |
| hourly | `/api/internal/engine/tick` (`TICK_NO_RESPONSE` via outbox) |

Both require `CRON_SECRET`.

## Inbound email

Application foundation exists (`/api/webhooks/inbound`, hashed `reply+{token}@` correlation). Receiving is **not** live until Niel activates Resend Receiving and MX/DNS. Inbound mail is never auto-trusted as evidence.
