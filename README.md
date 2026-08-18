# SOURCE

The Missing Information Engine. Connect your product system. SOURCE detects what is missing, finds who probably knows, reuses what it can, asks only for the rest, and does not stop at `REQUEST SENT`.

This repository is a strangler migration of the Missing Information Engine: domain behaviour stays in `src/domain/source`, while business truth, authorization, and persistence live in `src/server/source`. The browser consumes authorized projections — not the full engine state.

See `docs/architecture/p0-production.md` for the P0 audit, schema, threat model, and test plan.
See `docs/architecture/auth-and-organisations.md` for Supabase Auth and organisation membership.
See `docs/architecture/storage.md` for private import and evidence files.
See `docs/operations/environments.md` for local, preview, and production configuration.

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
| `/app/missing` | Resolution cases — missing information |
| `/s/demo` | Supplier request (no account wall; first-class unhappy actions) |

We never say a claim is true. We show you how it's known.
