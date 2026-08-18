-- P0.1 operational foundation.
-- Domain organisation ids stay TEXT (e.g. acme). Do not coerce the engine into UUIDs.
-- Application authorization remains mandatory. RLS is defense in depth.

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  role TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id)
);

CREATE TABLE IF NOT EXISTS engine_states (
  organisation_id TEXT PRIMARY KEY REFERENCES organisations(id),
  state_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_commands (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  principal_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  result_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS supplier_portal_grants (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  tenant_context_id TEXT NOT NULL REFERENCES organisations(id),
  allowed_case_ids TEXT[] NOT NULL DEFAULT '{}',
  allowed_requirement_ids TEXT[] NOT NULL DEFAULT '{}',
  allowed_commands TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT REFERENCES organisations(id),
  principal_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  resource TEXT,
  result TEXT NOT NULL,
  policy_version TEXT,
  command_id TEXT,
  request_id TEXT,
  reason TEXT,
  detail TEXT,
  public_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  private_context JSONB,
  protected_references JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  state TEXT NOT NULL,
  current_stage TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  mapping JSONB,
  summary JSONB
);

CREATE TABLE IF NOT EXISTS import_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES import_jobs(id),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_objects (
  evidence_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  organisation_id TEXT REFERENCES organisations(id),
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  original_filename TEXT NOT NULL,
  issuer TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  visibility TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
