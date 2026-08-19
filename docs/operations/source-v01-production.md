# SOURCE v0.1 production operations

This is the canonical operations document for the first controlled production release at `https://source-dpp.eu`.

SOURCE v0.1 is **production infrastructure + invited pilot**. It is not open public self-serve SaaS. Data Disclosure Terms remain `REQUIRES_LEGAL_REVIEW`. Do not treat signup copy or supplier terms as a formally approved contract.

Do not print or paste secrets, DSNs, CA PEMs, portal tokens, Auth codes, PKCE verifiers, Resend keys, or service-role keys into tickets, chat, or logs.

Related detail (do not treat as the release checklist): `environments.md`, `database.md`, `email.md`, `storage.md`, `hosted-smoke-test.md`.

---

## 1. Architecture summary

SOURCE is a Missing Information Engine:

`SIGN UP → VERIFY EMAIL → LOGIN → CREATE ORGANISATION → IMPORT CATALOGUE → IDENTIFY PRODUCTS / INLINE SUPPLIERS / MISSING REQUIREMENTS → RESOLUTION PLAN → DELEGATE GAPS → SUPPLIER PORTAL (no SOURCE account) → EVIDENCE + DISCLOSURE → SUFFICIENCY → READY only when justified`

Loop: `InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness`. A supplier request is one attempt.

Runtime:

| Concern | Production |
|---|---|
| App | Next.js on Vercel Production, custom domain `source-dpp.eu` |
| Auth | Hosted Supabase Auth (PKCE, SSR callback `/auth/callback`) |
| Domain state | Postgres JSONB `engine_states` per organisation, RLS + `source_app` |
| Files | Private Supabase Storage (`source-imports`, `source-evidence`) |
| Email | Resend live, outbox + signed delivery webhooks |
| Workers | Vercel Cron: outbox every 5 minutes, engine tick hourly |
| Identity | Server-derived principal from membership. Never trust browser `organisationId`. |

Fail closed. Preview and production never fall back to in-memory persistence, test identity, test email, or `rejectUnauthorized: false`.

Inbound email receiving is **not** required for v0.1. The webhook fails closed (401) until `SOURCE_INBOUND_WEBHOOK_SECRET` is set. Do not point MX at SOURCE for this release.

---

## 2. Release candidate

Do **not** deploy `main`. `main` does not contain the stacked production work.

Release candidate branch: `cursor/v01-production-release-f5f6`, based on `cursor/evidence-disclosure-v1-f5f6` (PR #22). That stack already includes Auth, persistence, storage, email, inline suppliers, resolution-plan invariant, Evidence & Disclosure V1, and explicit reuse consent.

Production must receive this entire chain. Deploying a mid-stack Preview branch is an incomplete product.

---

## 3. Production environment contract

Classify every variable before placing it in Vercel Production.

### REQUIRED (Vercel Production)

| Name | Notes |
|---|---|
| `SOURCE_ENV` | `production` (self-hosted must set this; Vercel Production also sets `VERCEL_ENV=production`) |
| `NEXT_PUBLIC_SOURCE_APP_URL` | `https://source-dpp.eu` — never a `*.vercel.app` URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Production project `https://vezhdbzizniurehclxpg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key |
| `SOURCE_APP_DATABASE_URL` | `source_app` role, transaction pooler **port 6543** |
| `SUPABASE_DB_CA_CERT` | Production project CA PEM. Literal `\n` newlines accepted. Never `NEXT_PUBLIC_` |
| `SOURCE_SESSION_SECRET` | Session / org-cookie signing |
| `SOURCE_OPAQUE_REF_SECRET` | Opaque evidence refs |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage only. Never used to authorize users |
| `CRON_SECRET` | Bearer for `/api/internal/*` workers |
| `RESEND_API_KEY` | Production Resend |
| `SOURCE_EMAIL_FROM` | Verified SOURCE From address |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for `/api/webhooks/resend` |

### REQUIRED (migrate job only, not the serverless app)

| Name | Notes |
|---|---|
| `SOURCE_MIGRATOR_DATABASE_URL` | Direct **port 5432**, never `source_app` |
| `SUPABASE_DB_CA_CERT` | Same production CA |
| `NEXT_PUBLIC_SUPABASE_URL` | Production project URL (isolation check) |
| `SOURCE_ENV` | `production` |

### OPTIONAL

| Name | Notes |
|---|---|
| `SOURCE_EMAIL_REPLY_TO` | Support mailbox. No inbound parsing |
| `SOURCE_IMPORT_BUCKET` | Default `source-imports` |
| `SOURCE_EVIDENCE_BUCKET` | Default `source-evidence` |
| `SOURCE_SIGNED_READ_TTL_SECONDS` | Default `300` |
| `SOURCE_TEMP_UPLOAD_TTL_HOURS` | Default `24` |
| `SOURCE_PG_POOL_MAX` | Default `3` |
| `SOURCE_OUTBOX_BATCH_SIZE` | Default `20` |
| `SOURCE_OUTBOX_MAX_ATTEMPTS` | Default `5` |
| `SOURCE_INVITATION_TTL_DAYS` | Default `7` |
| `SOURCE_STORAGE_SIGNING_SECRET` | Memory/local HMAC; not required when Storage is Supabase |
| `SOURCE_INBOUND_WEBHOOK_SECRET` | Leave unset for v0.1 (inbound 401) |
| `SOURCE_INBOUND_REPLY_DOMAIN` | Leave unset for v0.1 |

### PREVIEW_ONLY

| Name | Notes |
|---|---|
| `SOURCE_EMAIL_ALLOWED_RECIPIENTS` | Required only if Preview `SOURCE_EMAIL_MODE=live`. Production **does not** enforce this list. Do not set it in Production. |
| Preview `NEXT_PUBLIC_SUPABASE_URL` | Dev project `https://hhuurdzzsinzwbkkokzz.supabase.co` |
| Preview DSNs / keys | Never copy production secrets into Preview |

### PRODUCTION_FORBIDDEN

Setting these in preview/production fails boot (or is ignored where noted):

| Name | Effect |
|---|---|
| `SOURCE_PERSISTENCE=memory` | Fail closed |
| `SOURCE_IDENTITY_PROVIDER=test` | Fail closed |
| `SOURCE_OBJECT_STORAGE=memory` | Fail closed |
| `SOURCE_EMAIL_MODE=test` | Fail closed |
| `SOURCE_EMAIL_PROVIDER=test` | Fail closed |
| `SOURCE_DEMO_AUTH=1` | Fail closed |
| `SOURCE_EXPOSE_INVITE_LINKS=1` | Fail closed |
| `NEXT_PUBLIC_SOURCE_APP_URL` on `*.vercel.app` | Fail closed in production |
| `rejectUnauthorized: false` | Not a supported option. Do not add it |

`SOURCE_EMAIL_ALLOWED_RECIPIENTS` in Production is ignored by the sender. Do not use it as a safety net.

There is no IndexNow / site-verification runtime contract in v0.1.

---

## 4. Database and migrations

Production Postgres is the **production** Supabase project only.

| Role | Port | Use |
|---|---|---|
| `source_app` | 6543 transaction pooler | App runtime. RLS applies |
| migrator / owner | 5432 direct | DDL only |

TLS: `rejectUnauthorized: true` plus `SUPABASE_DB_CA_CERT`. Never disable verification.

### One ordered migration command

Apply **0001 through 0009** with the migrator URL only:

```bash
SOURCE_ENV=production \
SOURCE_MIGRATOR_DATABASE_URL=… \
SUPABASE_DB_CA_CERT=… \
NEXT_PUBLIC_SUPABASE_URL=https://vezhdbzizniurehclxpg.supabase.co \
npm run db:migrate
```

| File | Purpose |
|---|---|
| `0001_operational_foundation.sql` | Core operational tables |
| `0002_p01_hardening.sql` | Hardening |
| `0003_p1_import_lineage.sql` | Import lineage |
| `0004_b1_runtime.sql` | Runtime persistence |
| `0005_auth_organisations.sql` | Auth organisations / invitations |
| `0006_storage_objects.sql` | Storage metadata |
| `0007_outbound_email.sql` | Outbox / provider events |
| `0008_engine_tick.sql` | `list_organisation_ids()` for ticks |
| `0009_inbound_email.sql` | Inbound foundation tables (unused until receiving is enabled) |

Failed files are not recorded in `schema_migrations`. Re-run the same command. Do not apply random SQL in the dashboard.

Production boots against an **empty** database. Do not run `npm run db:seed` in production.

Backup: enable point-in-time recovery on the production Supabase project before go-live. Postgres backup does **not** restore Storage bytes.

---

## 5. Auth setup (Supabase production project)

Dashboard → Authentication:

| Setting | Value |
|---|---|
| Site URL | `https://source-dpp.eu` |
| Redirect URLs | `https://source-dpp.eu/auth/callback` and `https://source-dpp.eu/auth/callback?**` (or the equivalent wildcard allowed by the project) |
| Email confirmations | Enabled |
| SMTP | Production Resend / verified sender. Do not leave the default Supabase example sender for pilot mail |

Remove any Vercel Preview URL as the **canonical** Site URL. Preview URLs may exist only on the **preview** Supabase project.

Signup confirmation emails use `NEXT_PUBLIC_SOURCE_APP_URL`, not `window.location.origin`.

Vercel **Deployment Protection** must be **off** for Production so manufacturers and suppliers are not stopped by a Vercel login screen.

---

## 6. Resend setup

1. Verify the sending domain in Resend. Copy SPF, DKIM, and DMARC **from the Resend dashboard**. Do not invent records.
2. Set `SOURCE_EMAIL_FROM` to that verified address.
3. Optional: `SOURCE_EMAIL_REPLY_TO` to a monitored support mailbox.
4. Production webhook endpoint: `https://source-dpp.eu/api/webhooks/resend` (signed).
5. Do not enable Resend Receiving / inbound MX for v0.1.

CI uses `TestEmailProvider` and never sends live mail. `POST /api/internal/email/test` returns **403** in production.

Allow-list does not limit production supplier mail.

---

## 7. Storage

Create private buckets (not public):

- `source-imports`
- `source-evidence`

No object should have a permanent public URL. Manufacturer reads use short-lived signed URLs after SOURCE policy. `PROTECTED_SOURCE` and `VERIFICATION_ONLY` must not return original bytes/filename to the manufacturer.

---

## 8. Cron / background jobs

`vercel.json` (required for v0.1):

| Path | Schedule | Auth |
|---|---|---|
| `/api/internal/outbox/process` | `*/5 * * * *` | `Authorization: Bearer CRON_SECRET` |
| `/api/internal/engine/tick` | `0 * * * *` | same |

Both GET and POST are accepted so Vercel Cron can invoke them.

Idempotency: outbox semantic keys + processed-command keys. Repeated cron must not duplicate supplier mail.

Not required for v0.1: inbound receiving, IndexNow.

To pause outreach without undeploying: disable the two Vercel crons (or rotate `CRON_SECRET` and leave workers failing closed). Pending outbox rows remain until processed or the app is rolled back.

---

## 9. Health checks

Public (generic):

```bash
curl -sS https://source-dpp.eu/api/health
```

Expect `database: ok`, `persistence: postgres`, `storage: ok`, `email: configured`. No DSNs or secrets in the body.

Internal (Bearer `CRON_SECRET`):

```bash
curl -sS https://source-dpp.eu/api/internal/health -H "Authorization: Bearer …"
```

Expect the same plus `outboxBacklog` / `outboxDeadLetter`.

Hosted smoke (health only on production):

```bash
SMOKE_ALLOW_PRODUCTION=1 SMOKE_BASE_URL=https://source-dpp.eu npm run smoke:preview
```

Optional: `CRON_SECRET` for the internal health stage. Email test is skipped on production.

---

## 10. Golden-path browser test

Fixture: `fixtures/pilot/combined-20-products.csv` (20 products, 1 supplier, 20 relationships). Replace `supplier@example.test` with the invited supplier mailbox before the hosted run.

No Terminal, SQL, Vercel dashboard, internal APIs, or Supabase admin during steps 1–30.

1. Open `https://source-dpp.eu`.
2. Create a completely new manufacturer account.
3. Receive the real confirmation email.
4. Confirm in the same browser.
5. Land in onboarding.
6. Create organisation.
7. Upload the combined 20-product CSV only (do not split suppliers).
8. Confirm 20 products, 1 supplier, 20 product–supplier relationships.
9. Confirm every missing requirement has a disposition (auto + supplier + user + review = missing).
10. Click **Let SOURCE handle the gaps**.
11. Confirm supplier case / outreach generated.
12. Receive the real supplier email.
13. Open the supplier portal without a SOURCE account.
14. Verify requesting organisation, products, requirements, purpose, disclosure protocol.
15. Accept the authority checkbox.
16. Accept the current Data Disclosure Terms (draft / legal-review banner must be visible).
17. Upload original evidence (PDF).
18. Select `PROTECTED_SOURCE`.
19. Leave `ASK_FOR_REUSE` selected.
20. Submit.
21. Manufacturer sees the permitted derived result.
22. Manufacturer cannot access the protected original (no filename/bytes).
23. Requirement is READY only if policy and sufficiency allow it. A PDF is not automatically VERIFIED. Attestation does not satisfy an EVIDENCED requirement.
24. Create or encounter a second compatible requirement.
25. SOURCE identifies a reuse candidate.
26. Manufacturer sees waiting-for-supplier-permission (discovery is not attachment).
27. Supplier approves reuse for that scope.
28. SOURCE reassesses sufficiency.
29. Confirm disclosure did not widen.
30. Confirm PilotRun / value metrics updated.

---

## 11. Rollback

| Layer | Action |
|---|---|
| Application | Instant rollback to the previous Vercel Production deployment |
| Cron | Disable the two crons if outbound mail must stop |
| Database | Restore from the pre-migrate backup / PITR. There are **no down-migrations**. JSONB engine state is not auto-downgraded |
| Email / outbox | Unprocessed rows stay pending. Do not drain the outbox against a rolled-back app that cannot understand current payloads |
| Portal grants | Existing hashed tokens remain. Rolling back the app may change portal UX; revoke grants in the current app if a token must die |
| Evidence | Storage objects remain. Do not delete buckets as part of rollback |

Migrations `0001`–`0009` are additive. They do not drop tenant data. Safe application rollback is possible **until** a future destructive migration exists. If a migrate job is mid-failure, fix forward with `npm run db:migrate`; do not hand-edit `schema_migrations`.

---

## 12. Known limitations (post-launch)

- Data Disclosure Terms and workspace terms are draft (`REQUIRES_LEGAL_REVIEW`).
- Open public self-serve is not authorised until legal review.
- Inbound email receiving is disabled / fail-closed.
- `BROADER_REUSE` is recorded; v0.1 does not silently share evidence across customers.
- Identity tables rely on application authorization; RLS is defense-in-depth on engine/storage/outbox.
- Grant revoke-on-resend and some UX polish are deferred.
- No Catena-X / Gaia-X / blockchain / marketplace.

---

## 13. Deployment sequence

A. Merge / deploy the release-candidate branch (this document’s stack), not `main`.
B. Confirm production Supabase project `vezhdbzizniurehclxpg` is separate from preview `hhuurdzzsinzwbkkokzz`.
C. Create `source_app` via migrations; set a per-project password (not the local default).
D. Place `SUPABASE_DB_CA_CERT` for the production project.
E. Run the one migrator command in section 4.
F. Set Auth Site URL + Redirect URLs to `https://source-dpp.eu`.
G. Verify Resend domain; set From + webhook.
H. Create private Storage buckets.
I. Set Vercel Production env from section 3. Do not copy Preview secrets.
J. Confirm `vercel.json` crons are active on Production.
K. Attach `source-dpp.eu`; disable Deployment Protection on Production.
L. Deploy.
M. `GET /api/health` and internal health.
N. `SMOKE_ALLOW_PRODUCTION=1` smoke.
O. Browser golden path (section 10).
P. Invite the controlled manufacturers/suppliers. Do not announce public self-serve.
