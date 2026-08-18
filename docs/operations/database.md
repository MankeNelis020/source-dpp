# Database operations

Postgres is the durable source of truth. Supabase is the hosted adapter.

Runtime role: **`source_app`**. Migrator/owner role is separate and is the only role that applies DDL.

## Connection

Hosted SOURCE uses the Supabase **Shared Transaction Pooler on port 6543** (`SOURCE_APP_DATABASE_URL`).

TLS:

- `rejectUnauthorized: true` is mandatory.
- Hosted preview/production require `SUPABASE_DB_CA_CERT` (PEM).
- Never set `rejectUnauthorized: false`.

`source_app` is the runtime role in the DSN. Fail closed if the URL user is not `source_app` in hosted environments.

## Migrations

Apply with the migrator URL, never the app role:

```bash
SOURCE_MIGRATOR_DATABASE_URL=… npm run db:migrate
```

Current files live in `src/infrastructure/database/migrations/`:

| File | Purpose |
|---|---|
| `0001`–`0004` | Operational foundation, hardening, import lineage, runtime |
| `0005` | Auth organisations / invitations |
| `0006` | Storage objects |
| `0007` | Outbound email / provider events |
| `0008` | `list_organisation_ids()` for reminder ticks |
| `0009` | Inbound correlation + inbound event tables (application foundation) |

Rollback: restore the previous schema snapshot / backup. SOURCE does not auto-downgrade JSONB engine state. Failed migration files are not recorded in `schema_migrations`.

## Roles

| Role | Use |
|---|---|
| migrator / owner | DDL, `schema_migrations` |
| `source_app` | API runtime. RLS applies. |

RLS is defense-in-depth. Application authorization still decides organisation scope from the server-derived principal.

`list_organisation_ids()` is `SECURITY DEFINER` and returns organisation ids only so the hourly tick can load each tenant with `source.organisation_id` set.

## Safe diagnostics

`GET /api/health` and `GET /api/internal/health` (cron secret) report adapter status without DSNs, PEMs, or secrets.

If Postgres is unavailable: the app fails health checks; domain commands are not partially committed. Retry after the pooler recovers. Do not switch hosted Preview to in-memory persistence.
