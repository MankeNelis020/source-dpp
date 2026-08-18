# SOURCE — Pilot-ready SaaS

Milestone base: `d375f3d` on `cursor/p1-real-data-validation-f5f6` (PR #6), stacked on P0.1 (PR #5) and P0 (PR #4).

SOURCE is the Missing Information Engine. This document is the required **audit** before turning that architecture into a product a first external manufacturer can use without developer intervention.

The domain loop is unchanged:

```
InformationRequirement → ResolutionCase → ResolutionAttempt(s) → readiness gates → READY | UNRESOLVED
```

A supplier request remains one attempt. DPP remains an output. P0 security invariants are constraints. P1 measurement semantics (immutable `PilotRun` baseline, contact avoidance from events) stay sacred.

This is **not** an implementation plan that rewrites the engine. It is a gap analysis of what already exists, what is demo-only, and the smallest production slice that proves:

```
authenticated manufacturer
  → real import
  → SOURCE resolution
  → real supplier email
  → secure supplier response
  → propagated result
```

---

## 0. How to read this document

Statuses:

| Status | Meaning |
|---|---|
| **COMPLETE** | Exists, is used on the live path, and matches the invariant. Do not rebuild. |
| **PARTIAL** | Real code exists but is unused at runtime, incomplete, or only proven in tests. |
| **DEMO ONLY** | Works with seeded Acme/Nordic, demo tokens, or invented UI numbers. Cannot survive a real manufacturer. |
| **MISSING** | Not in the repository. |

Inspected: architecture docs P0 / P0.1 / P1, stacked PRs #4–#6, domain/application/infrastructure, Next.js app routes, CI, `package.json`. Do not assume this prompt is more accurate than the tree.

---

## 1. Current-state capability matrix

### Identity and access

| Capability | Status | Evidence |
|---|---|---|
| Signup | DEMO ONLY | `src/app/signup/page.tsx` writes `localStorage` and never creates a user or organisation. |
| Login | DEMO ONLY | `POST /api/auth/login` is gated by `assertDemoAuthAllowed()`. Password is not sent. Email substring maps to seeded `acme` / `nordic`. |
| Email verification | MISSING | Signup step 2 is a UI stub. No tokens, no mail. |
| Password reset | MISSING | No forgot/reset routes. Correct: do not invent password storage; use Supabase Auth. |
| Logout / session cookie | PARTIAL | httpOnly signed cookie + revoke in `sessions` (`src/infrastructure/auth/session.ts`). Dual client `localStorage` session still exists (`src/lib/session.ts`). |
| Demo principal fallback | DEMO ONLY | Unauthenticated API calls become `user-acme-owner` when `demoAuthEnabled()` (`src/app/api/source/_lib.ts`). `/app` has no middleware wall. |
| Organisation model | PARTIAL | Tables `organisations`, `users`, `memberships` exist. No create-organisation API. Signup does not persist. |
| Memberships + roles | COMPLETE (server) / DEMO ONLY (UX) | Seven roles → capabilities in `authorization.ts`. Enforced on `dispatchCommand`. Settings “Members” is static copy. Prompt’s `MEMBER` is a subset; keep the richer role set and map UI “Member” to `DATA_STEWARD` or add `MEMBER` later — do not scatter role-name checks in React. |
| Invitations | MISSING | No invitation table, token, email, accept, revoke, or expiry. |
| Multi-org | MISSING | Session binds one `organisationId`. `listMemberships` exists; no switcher. |
| Supplier users | COMPLETE (intent) | Portal is a separate principal. Do not force supplier SOURCE accounts in the pilot. |

### Persistence and runtime

| Capability | Status | Evidence |
|---|---|---|
| Postgres adapter | COMPLETE | `PostgresPersistence` implements `PersistencePort`. Proven in `npm run test:postgres`. |
| Migrations | PARTIAL | Deterministic files `0001`–`0003`. Applied in CI as DB superuser. `source_migrator` is documented, not created. |
| RLS | PARTIAL | Enabled in `0002_p01_hardening.sql`. Tenant GUC `source.organisation_id`. Application authz remains mandatory. Unused at app boot. |
| Runtime Postgres | MISSING | `getPersistence()` returns Postgres only if `setPersistenceForRuntime()` was called. **Nothing in app startup calls it.** `DATABASE_URL` alone does not change the running app. Process restart wipes all manufacturer work. |
| Production seed | DEMO ONLY | `seed-postgres.ts` copies the Acme/Nordic **demo** engine into Postgres for tests. Production must not depend on this. |
| JSONB engine aggregate | COMPLETE | `engine_states` per organisation. P0.1 scale triggers (rebuild shareable trust; row lock) remain measurement-gated. Do not normalize now. |

### Import, storage, evidence

| Capability | Status | Evidence |
|---|---|---|
| Import mapping + graph | COMPLETE | `createImportJob` / `runImportJob`: raw rows, mapping, identity, BOM, plan-only requirements, frozen `PilotRun` baseline. |
| Plan vs execute | COMPLETE | Import fails closed if a `SupplierRequest` appears. CTA `executeResolutionRun` is idempotent (`processed_commands`). |
| Import transport | DEMO ONLY | HTTP JSON of CSV **strings**. Textareas + sample CSV. No authorized file upload, no private object, no durable bytes. |
| Import as background job | PARTIAL | Job + events + SSE replay exist. `runImportJob` still executes **in the HTTP request**. Fine for SME CSV; not for “leave and poll”. |
| Import history UI | MISSING | `GET /api/imports` exists (header banner). No Imports page. |
| Evidence metadata | PARTIAL | Engine `evidence` + `evidence_objects` table. Bytes: in-process `MemoryEvidenceStorage` only. |
| Evidence GET | COMPLETE | Authz → disclosure → short-lived signed URL. Opaque `evr1_` refs. Never a public bucket. |
| Evidence upload (tenant / portal) | DEMO ONLY / MISSING | Portal posts `{ filename: "supplier-upload.pdf" }`. Engine invents a sha. No multipart, no storage object. |
| Imports / evidence / exports buckets | MISSING | No S3/Supabase Storage adapter. Port exists (`ObjectStoragePort`). |

### Resolution, email, portal

| Capability | Status | Evidence |
|---|---|---|
| Planner + execute CTA | COMPLETE | Wired into `OPEN_REQUIREMENT` and `executeResolutionRun`. |
| Outbox schema + processor | PARTIAL | Semantic keys, claim/backoff/dead-letter, Needs You on transport failure. Processor is **only called from tests**. Sends to `noreply@source.invalid`. |
| `executeResolutionRun` → outbox | MISSING | Execute calls `applyCommand` directly. Pilot happy path **does not enqueue mail**. |
| Portal grant issuance | MISSING | `issuePortalGrant()` + `generateBearerToken()` exist and are **never called** on send. Live grants are seed tokens (`demo`, `textile`, …). |
| Portal validate / scope / projection | COMPLETE | Hash at rest, expiry, revoke, scoped commands, 404 not 403. |
| Portal UX | PARTIAL | Real API. Defaults token `"demo"`. Fake upload filename. Actions exist. |
| Resend adapter | MISSING | `EmailPort` + `MemoryEmailPort` only. No HTML template, no provider id persistence, no webhook. |
| Bounce ≠ no-response | PARTIAL | Domain `MARK_BOUNCE` exists. Outbox dead-letter opens a task. No Resend webhook → `MARK_BOUNCE`. |
| Reminder scheduler | MISSING | `WorkflowScheduler` memory adapter unused. Escalation rules exist; no worker tick. |

### Product surface

| Capability | Status | Evidence |
|---|---|---|
| Overview | PARTIAL | Live workspace + workboard APIs. No empty/error states. Workboard is embedded, not a primary nav item. |
| Missing information / case detail | COMPLETE | Live cases + commands. Best product screen. |
| Needs You | PARTIAL | Live `/api/source/needs-you`. Confirm identity hardcodes `actorId: "acme-alu-gmbh"`. Copy not yet “Are these the same component?” with unlock counts. |
| Pilot results | COMPLETE | `evaluatePilotRun` from frozen cohort + events. Empty state exists. |
| Products / suppliers / claims / evidence / requests **lists** | DEMO ONLY | `demo-data.ts`. Dual data plane. |
| Product / supplier **detail** | PARTIAL | Live blockers/children/open cases; claims/evidence/history still demo. |
| Graph / integrations / exports / settings | DEMO ONLY | Invented counts (`8,421`, `421 / 500`). |
| Command search | DEMO ONLY | Live `/api/source/search` unused. |
| Manual catalogue entry | PARTIAL | Add component/material on product detail via `ADD_SUBJECT`. No add-product / add-supplier / correct-claim UX with `USER_ADDED` provenance in the happy path. |
| Empty / loading / error | PARTIAL | Case detail and portal are good. Overview/lists mostly silent `—`. |
| Legal placeholders | MISSING | No Privacy / Terms / Security / Subprocessors routes. |
| Marketing metrics | DEMO ONLY | Homepage `8,421` / `61%`. Product page claims async import. Developers page lists `/v1` that does not exist. |

### Commercial, ops, deploy

| Capability | Status | Evidence |
|---|---|---|
| Stripe / Checkout / Customer Portal / webhooks | MISSING | No SDK. Settings billing is fiction. |
| Entitlements | MISSING | Role capabilities ≠ plan entitlements. Do not scatter `if (plan === "PRO")`. |
| Trial | MISSING | |
| Sentry (or equivalent) | MISSING | In-process `metrics.ts` counters + redacted logs only. |
| Health endpoint | MISSING | |
| Env validation | PARTIAL | Per-module throws in production for session/opaque-ref/storage secrets. No central LOCAL/PREVIEW/PRODUCTION schema. No fail-fast at boot for `DATABASE_URL` in production. |
| Vercel / Docker | MISSING | CI builds Next.js. No `vercel.json`, no worker process, no migrate-on-deploy. |
| Supabase project | MISSING | No `supabase/` directory. MCP server not authenticated in this environment. Postgres dialect is compatible; Supabase is infrastructure, not the domain. |
| Backup / recovery doc | MISSING | P0.1 has retention *direction* placeholders only. |
| Data inventory | MISSING | This milestone will add `docs/security/data-inventory.md`. |
| Two-user isolation in UI | PARTIAL | Proven in memory + Postgres **tests**. Not a real AuthUser pair. Runtime is one in-memory demo singleton. |

### Demo-data classification

Every frontend import of `src/lib/source/demo-data.ts` is **REMOVE BEFORE PILOT** (products, suppliers, claims, evidence, requests, graph, settings org, command search, workspace fallback). Unused exports (`DEMO_COVERAGE`, review fixtures) are **DEVELOPMENT FIXTURE**. Marketing hero animations are **SAFE PRESENTATIONAL PLACEHOLDER** if labeled as illustration, not workspace truth.

Seed engine (`src/domain/source/seed.ts`, `MemoryPersistence.reset`) is a **DEVELOPMENT FIXTURE**. Production must boot empty organisations.

---

## 2. Gaps that block the first manufacturer

A normal happy path today, without a developer:

1. Signup creates nothing.
2. Login is demo-auth or production-refused.
3. All work lives in `MemoryPersistence` and dies on restart.
4. Import is pasted sample CSV into the demo tenant.
5. **Let SOURCE handle the gaps** plans and marks requests `SENT` but does not enqueue outbox mail and does not issue a portal grant.
6. Supplier never receives email. `/s/demo` only works because of seed grants.
7. Supplier cannot upload real evidence bytes.
8. Catalogue screens still show Acme Urban Chair 04.
9. No billing, no monitoring, no legal pages — secondary to the loop, but procurement will ask.

P0 isolation, disclosure, idempotency, and P1 measurement **code** are ahead of the **runtime wiring**. Do not rebuild them. Connect them.

---

## 3. Dependency graph

```
Human: Supabase project + Auth + Storage buckets
Human: Resend domain (SPF/DKIM/DMARC)
Human: Vercel project + preview/prod env split
Human (later): Stripe + Sentry
        │
        ▼
Env validation (fail closed in production)
        │
        ├─► Auth adapter (Supabase Auth) ──► Profile + Membership + Organisation
        │         │
        │         └─► Session cookie still SOURCE-issued (or @supabase/ssr cookies)
        │
        ├─► PostgresPersistence at boot (migrator ≠ source_app)
        │         │
        │         ├─► empty engine_states per new org (no Acme seed)
        │         ├─► ImportJob + object storage (imports/)
        │         └─► Evidence bytes (evidence/) after disclosure
        │
        └─► Communication plane
                  │
                  ├─► SEND_REQUEST / executeResolutionRun
                  │         → processed_commands + outbox + issuePortalGrant
                  ├─► Worker claims outbox → EmailPort (Resend)
                  ├─► Webhook: bounce/complaint → MARK_BOUNCE (not TICK_NO_RESPONSE)
                  └─► Portal token in email CTA → scoped /s/[token]
```

Stripe and Sentry do **not** sit on this path. Product cohesion (live lists, empty states, nav) can proceed in parallel once identity + data plane exist, but the golden path test can run against APIs before every screen is pretty.

**Do not** introduce `React → Supabase domain tables`. Browser talks to SOURCE HTTP. SOURCE talks to ports. Ports talk to Supabase Postgres/Auth/Storage.

---

## 4. Proposed PR stack

Deviation from the prompt’s A–F: **commercial plane (Stripe) after the golden path**, and **product cohesion overlapped with communication**, because a manufacturer cannot pay us before they can import and a supplier cannot answer before mail exists. Identity and data plane stay separate PRs but the first vertical *test* spans A+B+C.

Stacked on PR #6 (`cursor/p1-real-data-validation-f5f6`).

| PR | Name | What lands | What does not |
|---|---|---|---|
| **This PR** | Architecture | This document | Code |
| **A** | Production identity | Env schema LOCAL/PREVIEW/PRODUCTION; Supabase Auth adapter; signup/verify/login/reset/logout; create organisation (name, country, optional website) → OWNER; invitations (expiry, revoke, one-time, audit); no demo principal in production | Stripe, full settings UI polish |
| **B** | Production data plane | Wire `PostgresPersistence` + `PostgresRateLimiter` at boot; `source_migrator` vs `source_app`; private Storage adapter (imports/evidence/exports); import upload → object → job; evidence upload tenant+portal; empty org engine; production must not seed Acme | Graph DB, JSONB split |
| **C** | Communication plane | `issuePortalGrant` on send; execute path uses same outbox transaction as `dispatchCommand`; Resend adapter + idempotency key = semantic_key; worker (Vercel cron or route); delivery webhooks; bounce → contact problem; one production email template; persist provider message ids | Supplier SOURCE accounts, marketing mail |
| **D** | Product cohesion | Nav: Overview, Products, Suppliers, Missing, Workboard, Imports, Pilot + Organisation/Team/Billing/Settings; remove `demo-data.ts` from authenticated paths; live lists from queries; empty/loading/error; import history; Needs You copy; portal page without internal jargon; file picker | Beautiful redesign, i18n |
| **E** | Commercial | Stripe Checkout + Customer Portal + webhooks; `OrganisationSubscription`; entitlement service (`canUse` / `limit`); TRIAL_ACTIVE default so the first manufacturer is not blocked on pricing | Final price list, custom invoicing |
| **F** | Pilot readiness | Alice/Bob isolation E2E; golden-path E2E; Sentry scrubbing; `/api/internal/health`; `docs/security/data-inventory.md`; `docs/release/pilot-readiness-report.md`; legal placeholders; backup expectations (honest) | 10k load as a *gate* — measure, don’t block the first SME |

### First vertical production slice (definition)

A test (memory in CI, Postgres when `DATABASE_URL` is set) that, **without SQL edits or demo tokens**, does:

1. Create organisation (OWNER membership). Auth may be a test double until PR A’s Supabase project exists; production forbids the double.
2. Import `fixtures/p1-manufacturer/`.
3. Assert `requests.length === 0` and a frozen baseline.
4. `executeResolutionRun` (idempotent).
5. Assert outbox row + portal grant (hash only).
6. Process outbox → `EmailPort` receives one message with CTA containing the raw token (test adapter captures it; production never logs it).
7. Open portal with that token; submit a value + evidence bytes.
8. Readiness READY on that requirement; compatible same-tenant requirements may propagate.
9. Product completeness and `evaluatePilotRun` reconstruct from events.

Until that slice is green, do not spend the milestone on Stripe polish or a DPP designer.

---

## 5. Security implications

Preserve without weakening:

- Tenant from principal, never from client `tenantId`.
- 404 not 403 for cross-tenant guesses.
- Disclosure policy (P0.1); React must not decide.
- Portal grant hash, expiry, revoke, allow-list.
- Command idempotency + `expectedVersion`.
- Outbox in the same transaction as engine persist.
- Confidential upstream projections.
- Opaque evidence refs; no public storage URLs.

New risks this milestone must design for:

| Risk | Control |
|---|---|
| Supabase Auth `user_metadata` is user-editable | Authorization from SOURCE `memberships` / `app_metadata` only — never `user_metadata` in RLS. |
| Supabase Data API on `public` | Domain tables stay behind RLS **and** the app uses a server role, not the anon key, for engine JSONB. Prefer a private schema or revoke `anon`/`authenticated` on operational tables. SOURCE server remains the authorization layer. |
| Preview deployments hitting prod | Separate Supabase projects (or branches) for PREVIEW vs PRODUCTION. Fail boot if `SOURCE_ENV=production` and preview host, or if `DATABASE_URL` equals a prod DSN on a non-prod host (explicit allow-list). |
| Portal token in email | Residual: referrer, forwards. Keep no-referrer portal; expiry; revoke on “wrong contact”; rate limit. |
| Storage path as authz | Object key is not authorization. Always re-check org + disclosure before `signGet`. |
| Service role in Next.js | Never `NEXT_PUBLIC_` the service role. Server-only. |
| Demo auth in production | Production refuses to boot if `SOURCE_DEMO_AUTH=1` unless an explicit break-glass documented for a named preview. Default: throw. |
| Worker / webhook spoofing | Resend/Stripe signature verify; idempotent event ids. |

Stop-and-report conditions from the prompt: none are true **yet**. Supabase as Postgres+Auth+Storage does not conflict with P0 if the Data API is not the domain API. Resend can take `Idempotency-Key`. The aggregate model is not failing under measured load because production load has not been measured. If Auth RLS on `engine_states` cannot be expressed without stuffing org ids into user-editable JWT claims, **stop** and keep authorization in the SOURCE server (already the design).

---

## 6. Environment and secrets

### Environments

| Name | Data | Auth | Notes |
|---|---|---|---|
| LOCAL | developer database / memory fallback only when `SOURCE_ALLOW_MEMORY=1` | local Supabase or demo-auth **opt-in** | Never the default in `NODE_ENV=production` |
| PREVIEW | isolated preview project | preview Auth | Must not use PRODUCTION `DATABASE_URL` / storage |
| PRODUCTION | customer data | production Auth | Fail boot if any `*_DEMO_*` flag or missing critical secret |

### Critical secrets (production fail-fast)

| Secret | Purpose |
|---|---|
| `SOURCE_ENV` | `local` \| `preview` \| `production` |
| `DATABASE_URL` | Migrator (owner). Not the runtime pool. |
| `SOURCE_APP_DATABASE_URL` | Runtime `source_app` role |
| `SOURCE_SESSION_SECRET` | Cookie HMAC until fully on Supabase SSR |
| `SOURCE_OPAQUE_REF_SECRET` | Evidence refs |
| `SOURCE_STORAGE_SIGNING_SECRET` | Signed GET if not using Supabase signed URLs |
| `SUPABASE_URL` | Auth + Storage |
| `SUPABASE_ANON_KEY` | Browser Auth only (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — never client |
| `RESEND_API_KEY` | EmailPort |
| `RESEND_WEBHOOK_SECRET` | Webhook verify |
| `RESEND_FROM` | e.g. `SOURCE <requests@mail.source.example>` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | PR E |
| `SENTRY_DSN` | PR F |
| `CRON_SECRET` | Outbox worker route |

No silent fallback from production config to demo credentials.

---

## 7. External accounts that require a human

This environment cannot create them. Implementation of adapters can proceed against ports and tests.

1. **Supabase** project (prod) + separate preview project: Auth (email), Postgres, Storage buckets `imports`, `evidence`, `exports` (private). Disable public Data API on operational tables or use a non-exposed schema.
2. **Resend** account + domain verification (SPF, DKIM, DMARC). Document in runbook; do not fake verification in app code.
3. **Vercel** project, preview env vars pointing at preview Supabase, production env vars pointing at prod. Cron for outbox.
4. **Stripe** (PR E) test mode first.
5. **Sentry** (PR F) with scrubbing rules.
6. **DNS** for app domain + mail domain.

---

## 8. What can be implemented autonomously

Without waiting on those accounts:

- This architecture document.
- Central env validation module (throws with named missing keys).
- Organisation create / invite domain+API against `PersistencePort` (memory + Postgres tests).
- Wire `setPersistenceForRuntime` when `SOURCE_APP_DATABASE_URL` is set (still needs a human DSN to observe in preview).
- `issuePortalGrant` on `SEND_REQUEST` / execute; capture raw token only for the email payload, never persist plaintext.
- Route execute through the same transactional outbox insert as `dispatchCommand`.
- `EmailPort.send` HTML + text; Resend adapter behind the port; `MemoryEmailPort` for tests.
- Outbox processor uses contact email from the case, not `noreply@source.invalid`.
- Golden-path integration test on the manufacturer fixture.
- Live query endpoints for product/supplier lists (engine projections) so UI can drop `demo-data.ts`.
- Health payload from existing metrics/outbox counts.
- Legal **placeholder** routes marked “requires legal review”.
- Entitlement **interface** + TRIAL defaults (no Stripe until keys exist).

Cannot complete for a real external user until humans provide Supabase + Resend + Vercel env.

---

## 9. Roles vs prompt

Existing roles: `OWNER`, `ADMIN`, `COMPLIANCE_MANAGER`, `PROCUREMENT_MANAGER`, `DATA_STEWARD`, `REVIEWER`, `AUDITOR`.

Prompt suggested `OWNER | ADMIN | MEMBER | REVIEWER`.

**Keep the existing capability matrix.** UI can show a shorter list for invitations (Owner, Admin, Reviewer, Member). Map Member → a capability bundle equivalent to `DATA_STEWARD` minus dangerous merges, documented in one server file. Do not check role strings in React.

Supplier portal stays a **capability grant**, not a membership.

---

## 10. Email (production intent)

One transactional template for supplier outreach:

- Subject: `{organisationName} needs product information`
- Who is asking (manufacturer legal name, not a raw org id).
- What SOURCE is (one sentence).
- Why they received it (they are listed as a supplier of named product/component — no extra BOM).
- How many items (count only).
- Action: **Provide information** → `https://{host}/s/{token}`
- Expiry date.
- No confidential upstream names, no other customers, no evidence values.

Idempotency: outbox `semantic_key` → Resend `Idempotency-Key`. Retries must not duplicate mail.

Preferences: transactional/security always; operational supplier mail always for the manufacturer’s chosen contacts; marketing never mixed in.

---

## 11. JSONB and performance

Do not normalize `engine_states` because we are adding SaaS infrastructure. Continue recording aggregate bytes, save duration, command latency. Optional SME-scale fixture (10k / 1k / 50k / 100k) is a **measurement**, not a release gate for the first manufacturer. P1 already noted CI should stay on a small fixture.

---

## 12. Release gates (target, not current)

Copied as the definition of done for PR F. **None of these are green today** except domain/security **unit** tests.

### Security

- Tenant isolation green (memory + Postgres + real Auth users Alice/Bob).
- Portal isolation green (unguessable token; no demo tokens in production).
- Storage isolation green.
- No production demo auth.
- Secrets validated at boot.

### Reliability

- Outbox functioning in preview.
- Dead-letter visible.
- Webhook idempotency.
- Import resumable after request timeout (job row + object).

### Product

- Signup, organisation, import, execute, Needs You, supplier loop.

### Operations

- Errors observable; migrations tested; backups understood (Supabase PITR — document only what is configured); mail domain verified.

### Validation

- `PilotRun` baseline and outcomes reconstructable.

---

## 13. What not to build (this milestone)

ERP/SAP/Shopify/PIM, mobile, workflow builder, chatbot, DPP visual designer, QR passports, enterprise SSO/SCIM, custom invoicing, CRM, graph database, twenty regulations, i18n, marketing CMS.

Standard for every decision: does this help a real manufacturer go from messy data to resolved, evidenced information with less manual supplier work?

---

## 14. Next action

1. Merge/stack this document on P1.
2. Implement the golden-path slice (portal grant + outbox + email port + org create + import fixture test) while Auth is still a test principal.
3. Swap the test principal for Supabase Auth as soon as a project exists.
4. Only then Stripe, Sentry, and surface polish that is not on the loop.
