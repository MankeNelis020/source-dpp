# SOURCE

The Missing Information Engine. Connect your product system. SOURCE detects what is missing, finds who probably knows, reuses what it can, asks only for the rest, and does not stop at `REQUEST SENT`.

This repository is a strangler migration of the Missing Information Engine: domain behaviour stays in `src/domain/source`, while business truth, authorization, and persistence live in `src/server/source`. The browser consumes authorized projections — not the full engine state.

See `docs/architecture/p0-production.md` for the P0 audit, schema, threat model, and test plan.
See `docs/architecture/auth-and-organisations.md` for Supabase Auth and organisation membership.
See `docs/architecture/storage.md` for private import and evidence files.
See `docs/architecture/supplier-loop.md` for the manufacturer → supplier path.
See `docs/operations/hosted-smoke-test.md` for `npm run smoke:preview`.

```bash
npm install
npm run dev
npm test
npm run db:migrate   # when using Postgres; requires SOURCE_MIGRATOR_DATABASE_URL or local DATABASE_URL
```

Open [http://localhost:3000](http://localhost:3000).

| Path | What |
|---|---|
| `/` | Public homepage |
| `/product` `/how-it-works` `/suppliers` `/pricing` `/developers` | Marketing pages |
| `/signup` `/login` `/verify-email` `/forgot-password` `/onboarding/organisation` | Auth and first organisation |
| `/app` | Manufacturer workspace (empty until you import) |
| `/app/import` | Upload catalogue |
| `/app/missing` | Missing information |
| `/s/{token}` | Supplier portal from the email (no SOURCE account) |

We never say a claim is true. We show you how it's known.
