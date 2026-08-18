# SOURCE environments

SOURCE persists organisation state, imports, PilotRuns, commands, audit, outbox, and related operational state in Postgres. This is a runtime-infrastructure document. It does not describe product features.

The Missing Information Engine loop is unchanged:

`InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness → READY | UNRESOLVED`

A supplier request remains one attempt. The browser talks to SOURCE APIs. APIs talk to the application layer. Persistence is a `PersistencePort`. React must not query Supabase domain tables.

---

## Environments (strictly separated)

| Runtime | How it is selected | Supabase project |
|---|---|---|
| `local` | `SOURCE_ENV=local`, or no `SOURCE_ENV` / `VERCEL_ENV` (including `vercel dev`) | Local Postgres or the **development/preview** project. Never production. |
| `preview` | `SOURCE_ENV=preview` or Vercel `VERCEL_ENV=preview` | Development/preview only |
| `production` | `SOURCE_ENV=production` or Vercel `VERCEL_ENV=production` | Production only |

Runtime is derived only from trusted server/process environment (`SOURCE_ENV`, Vercel `VERCEL_ENV`). It is never taken from the browser, query parameters, cookies, tenant data, or client config.

`NODE_ENV=production` is **not** a signal to use the production Supabase project. CI `next build` sets `NODE_ENV=production` without Vercel. Self-hosted production **must** set `SOURCE_ENV=production`.

If `SOURCE_ENV` and `VERCEL_ENV` are both set and disagree, the process fails closed.

### Project URLs (public, not secrets)

| Environment | Project URL |
|---|---|
| Development / Preview | `https://hhuurdzzsinzwbkkokzz.supabase.co` |
| Production | `https://vezhdbzizniurehclxpg.supabase.co` |

**Preview deployments must never be given production database secrets.** Preview data is not production data.

Production fails to boot if any configured URL/DSN contains the development project ref `hhuurdzzsinzwbkkokzz`.

Preview (and local) fail to boot if any configured URL/DSN contains the production project ref `vezhdbzizniurehclxpg`.

Failure text is safe, for example:

```text
SOURCE environment configuration mismatch:
production cannot use the development Supabase project.
```

Secrets and DSNs are not logged.

---

## Persistence selection

One factory: `createRuntimePersistence(env)`. Routes must not choose an adapter.

| Runtime | Adapter |
|---|---|
| unit tests (`NODE_ENV=test`, no `SOURCE_ENV`) | `MemoryPersistence` |
| local, default | `MemoryPersistence` |
| local, explicit `SOURCE_PERSISTENCE=postgres` | `PostgresPersistence` |
| preview | `PostgresPersistence` only |
| production | `PostgresPersistence` only |

`MemoryPersistence` is allowed only for tests, injected integration tests, and local/demo when **explicitly** enabled (`SOURCE_PERSISTENCE=memory` or the local default). It is not a silent fallback in preview or production.

If preview or production lacks `SOURCE_APP_DATABASE_URL`, startup fails. SOURCE does not boot on in-memory state.

Local explicit Postgres: `SOURCE_PERSISTENCE=postgres` plus `SOURCE_APP_DATABASE_URL`.

---

## Variables

### Public / client-safe

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Required in preview and production. Not a secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required in preview and production. Client-safe Auth anon key. |
| `NEXT_PUBLIC_SOURCE_APP_URL` | Public app origin for Auth redirects and **supplier portal links in email** (preview vs production). Never derived from the request Host header. |

### Server-only (never put in client bundles)

| Name | Who uses it | Purpose |
|---|---|---|
| `SOURCE_APP_DATABASE_URL` | Application runtime | Restricted `source_app` role. Reads/writes tenant data under RLS. |
| `SOURCE_MIGRATOR_DATABASE_URL` | `npm run db:migrate` / deploy migrate job only | Higher-privilege DDL. **Not** the serverless app. |
| `SOURCE_SESSION_SECRET` | Application runtime | Signed session cookies. |
| `SOURCE_OPAQUE_REF_SECRET` | Application runtime | Opaque evidence refs. |
| `SOURCE_STORAGE_SIGNING_SECRET` | Application runtime | HMAC for memory signed reads in tests/local. |
| `SUPABASE_SERVICE_ROLE_KEY` | `SupabaseObjectStorage` only | Server-only infrastructure credential. Bypasses Storage RLS. Never used to authorize users. Never `NEXT_PUBLIC_`. Required in preview/production. |
| `SOURCE_OBJECT_STORAGE` | Local only | `memory` \| `supabase`. Preview/production always `supabase`. |
| `SOURCE_IMPORT_BUCKET` | Application runtime | Default `source-imports`. |
| `SOURCE_EVIDENCE_BUCKET` | Application runtime | Default `source-evidence`. |
| `SOURCE_SIGNED_READ_TTL_SECONDS` | Application runtime | Default `300`. |
| `SOURCE_TEMP_UPLOAD_TTL_HOURS` | Application runtime | Default `24`. |
| `SOURCE_IDENTITY_PROVIDER` | Local only | `supabase` \| `test`. Rejected in preview/production if `test`. |
| `SOURCE_INVITATION_TTL_DAYS` | Application runtime | Invitation expiry. Default `7`. |
| `SOURCE_EXPOSE_INVITE_LINKS` | Local only | Returns invite URLs for tests. Never set in preview/production. |
| `SOURCE_ENV` | Process | `local` \| `preview` \| `production` |
| `CRON_SECRET` | Application runtime | Bearer secret for `/api/internal/outbox/process` and related worker routes. Required in preview/production. |
| `RESEND_API_KEY` | `ResendEmailAdapter` only | Server-only. Required in production. Preview only if `SOURCE_EMAIL_MODE=live`. |
| `RESEND_WEBHOOK_SECRET` | Webhook route | Svix signing secret. Required in production. |
| `SOURCE_EMAIL_FROM` | Application runtime | Verified SOURCE From address. |
| `SOURCE_EMAIL_REPLY_TO` | Application runtime | Optional support mailbox. No inbound parsing. |
| `SOURCE_EMAIL_MODE` | Process | `test` \| `live`. Preview defaults to `test`. Production is always `live`. |
| `SOURCE_EMAIL_PROVIDER` | Process | `test` \| `resend`. Production is always `resend`. |
| `SOURCE_EMAIL_ALLOWED_RECIPIENTS` | Preview live | Comma-separated allow list. Required if preview is `live`. Production never rewrites recipients. |
| `SOURCE_OUTBOX_BATCH_SIZE` | Worker | Default `20`. |
| `SOURCE_OUTBOX_MAX_ATTEMPTS` | Worker | Default `5`. |
| `SOURCE_PERSISTENCE` | Local only | `memory` \| `postgres`. Rejected in preview/production if `memory`. |
| `SOURCE_PG_POOL_MAX` | Application runtime | Optional pg pool size. Default `3`. |

Do not use a single generic `DATABASE_URL` for both privilege levels in preview/production.

`DATABASE_URL` is allowed only as a **local/CI migrator fallback** when `SOURCE_ENV` is not preview/production. CI uses an isolated Postgres service, not either Supabase project.

---

## Where to set values

Do not paste secret values into chat, git, or this file.

| Place | What |
|---|---|
| local `.env.local` | Optional. Memory is the default. For Postgres-backed local: `SOURCE_PERSISTENCE=postgres`, `NEXT_PUBLIC_SUPABASE_URL` (dev project), `SOURCE_APP_DATABASE_URL` (pooler, `source_app`), `SOURCE_MIGRATOR_DATABASE_URL` (direct, migrator), session/opaque secrets. |
| Vercel **Preview** | Dev/preview project only. See table below. |
| Vercel **Production** | Production project only. Same variable **names**, different **values**. |
| GitHub Actions | Isolated `DATABASE_URL` to CI Postgres. **Never** preview or production Supabase DSNs. |

### Preview (Vercel Preview env)

```text
SOURCE_ENV=preview
NEXT_PUBLIC_SUPABASE_URL=https://hhuurdzzsinzwbkkokzz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Preview Supabase anon key>
NEXT_PUBLIC_SOURCE_APP_URL=<Preview app URL>
SOURCE_APP_DATABASE_URL=<transaction pooler DSN as source_app>
SOURCE_SESSION_SECRET=<preview secret>
SOURCE_OPAQUE_REF_SECRET=<preview secret>
SOURCE_STORAGE_SIGNING_SECRET=<preview secret>
SUPABASE_SERVICE_ROLE_KEY=<Preview project service role>
SOURCE_IMPORT_BUCKET=source-imports
SOURCE_EVIDENCE_BUCKET=source-evidence
SOURCE_SIGNED_READ_TTL_SECONDS=300
CRON_SECRET=<preview secret>
SOURCE_EMAIL_MODE=test
```

`SOURCE_MIGRATOR_DATABASE_URL` belongs in the migrate/deploy job, not necessarily in the serverless runtime.

### Production (Vercel Production env)

```text
SOURCE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://vezhdbzizniurehclxpg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Production Supabase anon key>
NEXT_PUBLIC_SOURCE_APP_URL=<Production app URL>
SOURCE_APP_DATABASE_URL=<transaction pooler DSN as source_app>
SOURCE_SESSION_SECRET=<production secret>
SOURCE_OPAQUE_REF_SECRET=<production secret>
SOURCE_STORAGE_SIGNING_SECRET=<production secret>
SUPABASE_SERVICE_ROLE_KEY=<Production project service role>
SOURCE_IMPORT_BUCKET=source-imports
SOURCE_EVIDENCE_BUCKET=source-evidence
SOURCE_SIGNED_READ_TTL_SECONDS=300
CRON_SECRET=<production secret>
SOURCE_EMAIL_MODE=live
SOURCE_EMAIL_PROVIDER=resend
RESEND_API_KEY=<production Resend key>
RESEND_WEBHOOK_SECRET=<production webhook secret>
SOURCE_EMAIL_FROM=<verified production sender>
```

Again: migrator DSN in the migrate job only.

---

## Database roles

| Role | Connection | Allowed to |
|---|---|---|
| Migrator (schema owner / `postgres`) | `SOURCE_MIGRATOR_DATABASE_URL`, direct/session (port `5432`) | `CREATE TABLE`, `ALTER`, `CREATE POLICY`, `CREATE ROLE` where appropriate, versioned migrations |
| `source_app` | `SOURCE_APP_DATABASE_URL`, transaction pooler (port `6543`) | Runtime DML under RLS. Not superuser. Not schema owner. |

Runtime must not connect as `postgres`, service owner, schema owner, or superuser.

Migrations must not use `SOURCE_APP_DATABASE_URL`. The migrate CLI refuses a `source_app` migrator user.

The `source_app` login role is created by migration `0002` when missing. The SQL password `source_app_dev_only` is for **local/CI only**. On each Supabase project, set the role password to a project-specific secret and put that secret in the runtime DSN. Do not bake production passwords into SQL.

---

## Connection pooling (Vercel + Supabase)

Serverless instances must not open unbounded Postgres sessions.

| Connection | Mode | Why |
|---|---|---|
| Runtime `SOURCE_APP_DATABASE_URL` | Supabase **transaction pooler**, port **6543** | Many Vercel isolates share a small `pg` pool (`max` default 3). Transaction pooling multiplexes them without a third-party pooler. |
| Migrator `SOURCE_MIGRATOR_DATABASE_URL` | **Direct** / session, port **5432** | DDL, `CREATE ROLE`, and migration transactions need a session-capable connection. |

Command path, tenant context, and outbox claim require a real transaction:

```text
BEGIN
SELECT set_config('source.organisation_id', $1, true)  -- SET LOCAL
… engine persist + processed_command + audit + outbox …
COMMIT
```

`SET LOCAL` (via `set_config(..., true)`) lasts only for that transaction. Tenant context cannot bleed across pooled connections. Do not use persistent session `SET`.

`FOR UPDATE` on `engine_states` and `FOR UPDATE SKIP LOCKED` inside `claim_outbox_batch` run inside a transaction, so they are compatible with transaction-mode pooling.

If a pooler username includes the project ref (`source_app.<project-ref>`), SOURCE also uses that ref in the cross-environment assertion. Prefer that username form on Supabase pooler so a swapped DSN cannot hide behind a generic hostname.

---

## Boot sequence

```text
resolve environment
→ validate project URL / DSN refs
→ validate required secrets
→ createRuntimePersistence
→ health check (SELECT 1, current_user = source_app, required schema)
```

If preview/production cannot reach Postgres, SOURCE does not switch to memory.

Safe health payload (`GET /api/health`):

```json
{ "database": "ok", "persistence": "postgres", "storage": "ok", "email": "configured" }
```

No DSNs, roles, bucket secrets, or service-role material. Storage `error` is reported; it does not by itself mark evidence invalid. Database failure still returns 503.

Production boots against an **empty** database. Seeded Acme / Nordic / demo portal tokens are for tests and `npm run db:seed` (local only). A new organisation may have no `engine_states` row; the first load returns valid empty SOURCE state; the first mutation persists the aggregate (JSONB `engine_states` per organisation).

---

## What survives a restart (B1)

Persisted in Postgres:

- Organisation / user / membership rows
- JSONB `EngineState` (requirements, cases, attempts, PilotRun baseline, `missingRequirementIds`, requirement outcomes, supplier-contact avoided, events)
- ImportJob metadata, mapping, parsed `raw_records`, import events
- Processed commands (idempotency)
- Structured audit
- Outbox (pending mail stays pending until the worker sends)
- Outbound message transport records and provider webhook events
- Portal grants, sessions

**Durable in B2 (private Storage + Postgres index):**

- Original import source bytes (`source-imports`)
- Evidence object bytes (`source-evidence`)
- `storage_objects` ownership metadata

Postgres backup alone does not restore Storage bytes. See `docs/architecture/storage.md`.

**PR C:** supplier email goes through `EmailProvider` / Resend after outbox commit. See `docs/architecture/email-and-communication.md` and `docs/operations/email.md`.

Demo HMAC login is **removed**. Preview/production use Supabase Auth (`SupabaseIdentityProvider`). Local/CI may use `TestIdentityProvider`. Tenant context still comes from membership rows, never from browser `organisationId` or `user_metadata`.

See `docs/architecture/auth-and-organisations.md`.

---

## Commands

```bash
npm run db:migrate    # migrator URL only; prints version/result; never prints credentials
npm run db:seed       # local/demo only; refused in preview/production
npm test              # unit/security tests (memory)
npm run test:postgres # isolated CI/local Postgres as source_app
npm run lint
npm run build
```

CI Postgres is a GitHub Actions service (`postgres://source:source@localhost:5432/source`). It must not point at either Supabase project.

---

## Human configuration checklist (Supabase / Vercel)

Migrations create `source_app` and RLS when applied with migrator credentials. A human still must:

1. Put **development/preview** runtime credentials (`source_app` + transaction pooler) in Vercel Preview `SOURCE_APP_DATABASE_URL`.
2. Put **development/preview** migrator credentials (direct, not `source_app`) in the migrate job as `SOURCE_MIGRATOR_DATABASE_URL`.
3. Put **production** runtime credentials in Vercel Production — different project, different secrets.
4. Put **production** migrator credentials in the production migrate job only.
5. After first migrate on each project: `ALTER ROLE source_app PASSWORD …` to a per-project secret (do not keep `source_app_dev_only` in hosted environments).
6. Confirm database network allow-list / Supabase connectivity so Vercel can reach the pooler.
7. Confirm Preview env has the **dev** `NEXT_PUBLIC_SUPABASE_URL` and Production has the **prod** URL.
8. Never copy production DSNs into Preview, and never point CI at Supabase.
9. Put **this environment's** `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Preview key from preview project, Production key from production project). Never mix.
10. Create private buckets `source-imports` and `source-evidence` (`npm run storage:bootstrap` or dashboard). They must not be public.
11. Place Resend keys, webhook secret, From address, and `CRON_SECRET` per environment. Preview stays `SOURCE_EMAIL_MODE=test` unless an allow list is intentional. See `docs/operations/email.md`.

Until hosted Resend credentials and a verified domain exist, CI uses `TestEmailProvider`. Live preview/production sending is blocked on that human placement — not on application code.

See `docs/architecture/storage.md` and `docs/security/data-inventory.md`.
