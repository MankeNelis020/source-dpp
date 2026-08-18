-- SOURCE logical schema (P0 + P0.1). Runtime DDL lives in migrations/.
-- Application authorization is mandatory. RLS is defense in depth, not a substitute.
-- Tenant context: SET LOCAL source.organisation_id = '<id>';
-- Organisation ids are TEXT domain identifiers, not generated UUIDs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  role TEXT NOT NULL CHECK (role IN (
    'OWNER','ADMIN','COMPLIANCE_MANAGER','PROCUREMENT_MANAGER','DATA_STEWARD','REVIEWER','AUDITOR'
  )),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id)
);

CREATE TABLE canonical_actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  vat TEXT,
  lei TEXT,
  country TEXT,
  domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE actor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_actor_id UUID NOT NULL REFERENCES canonical_actors(id),
  alias TEXT NOT NULL
);

CREATE TABLE actor_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_actor_id UUID NOT NULL REFERENCES canonical_actors(id),
  scheme TEXT NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE actor_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_actor_id UUID NOT NULL REFERENCES canonical_actors(id),
  to_actor_id UUID NOT NULL REFERENCES canonical_actors(id),
  subject_id TEXT,
  confidential_upstream BOOLEAN NOT NULL DEFAULT false,
  confidential_downstream BOOLEAN NOT NULL DEFAULT false,
  hide_customer BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE contact_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id),
  actor_id UUID NOT NULL REFERENCES canonical_actors(id),
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  valid BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ
);

CREATE TABLE canonical_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  confidence NUMERIC,
  source_reference TEXT
);

CREATE TABLE subject_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_subject_id UUID NOT NULL REFERENCES canonical_subjects(id),
  alias TEXT NOT NULL
);

CREATE TABLE subject_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_subject_id UUID NOT NULL REFERENCES canonical_subjects(id),
  scheme TEXT NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE subject_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_subject_id UUID NOT NULL REFERENCES canonical_subjects(id),
  child_subject_id UUID NOT NULL REFERENCES canonical_subjects(id),
  quantity NUMERIC,
  unit TEXT,
  source TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_subject_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  source_system TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  canonical_subject_id UUID NOT NULL REFERENCES canonical_subjects(id),
  match_method TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  decision TEXT NOT NULL,
  reviewed_by TEXT,
  model_version TEXT NOT NULL DEFAULT 'heuristic-v0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  subject TEXT NOT NULL,
  query TEXT NOT NULL,
  decision TEXT NOT NULL,
  from_ids TEXT[] NOT NULL DEFAULT '{}',
  to_id TEXT,
  decided_by TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'heuristic-v0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL
);

CREATE TABLE dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id),
  version TEXT NOT NULL
);

CREATE TABLE requirement_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id),
  property_id TEXT NOT NULL,
  required_trust_level TEXT NOT NULL
);

CREATE TABLE information_requirements (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  subject_id TEXT NOT NULL,
  subject_label TEXT NOT NULL,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  property_id TEXT NOT NULL,
  property_label TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  required_trust_level TEXT NOT NULL,
  required_permission_level TEXT NOT NULL,
  required_by DATE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  linked_case_id TEXT
);

CREATE TABLE resolution_cases (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  requirement_id TEXT NOT NULL REFERENCES information_requirements(id),
  state TEXT NOT NULL,
  current_actor_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  blocking_reason TEXT,
  next_action TEXT,
  portal_grant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resolution_attempts (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  case_id TEXT NOT NULL REFERENCES resolution_cases(id),
  actor_id TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE resolution_exceptions (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  case_id TEXT NOT NULL REFERENCES resolution_cases(id),
  code TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  organisation_id UUID REFERENCES organisations(id),
  owner_actor_id TEXT,
  property_id TEXT NOT NULL,
  value TEXT,
  subject_id TEXT NOT NULL,
  ready BOOLEAN NOT NULL DEFAULT false,
  ready_is_cache BOOLEAN NOT NULL DEFAULT true,
  permission_state TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  purpose TEXT NOT NULL
);

CREATE TABLE claim_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id TEXT NOT NULL REFERENCES claims(id),
  version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  organisation_id UUID REFERENCES organisations(id),
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
  visibility TEXT NOT NULL,
  expired BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE evidence_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  kind TEXT NOT NULL,
  scope_id TEXT,
  label TEXT NOT NULL
);

CREATE TABLE claim_evidence_links (
  claim_id TEXT NOT NULL REFERENCES claims(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  PRIMARY KEY (claim_id, evidence_id)
);

CREATE TABLE permission_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_actor_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permission_grants (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  evidence_id TEXT,
  grantee_actor_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  state TEXT NOT NULL,
  visibility TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ
);

CREATE TABLE permission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supplier_requests (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  case_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE supplier_portal_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  tenant_context_id TEXT NOT NULL,
  allowed_case_ids TEXT[] NOT NULL DEFAULT '{}',
  allowed_requirement_ids TEXT[] NOT NULL DEFAULT '{}',
  allowed_commands TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE human_tasks (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  case_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  unlock_estimate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE claim_conflicts (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  case_id TEXT NOT NULL,
  claim_id TEXT NOT NULL
);

CREATE TABLE processed_commands (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  result_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, idempotency_key)
);

CREATE TABLE domain_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  principal_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  result TEXT NOT NULL,
  policy_version TEXT,
  command_id TEXT,
  request_id TEXT,
  reason TEXT,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- append-only: revoke UPDATE/DELETE from application roles

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  state TEXT NOT NULL,
  current_stage TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  mapping_profile JSONB
);

CREATE TABLE import_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES import_jobs(id),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  profile_name TEXT NOT NULL,
  mapping JSONB NOT NULL
);

CREATE TABLE workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  cancelled BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE downstream_dependencies (
  id TEXT PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  claim_id TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL
);

-- Defense in depth. Application still filters by organisation_id.
ALTER TABLE information_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subject_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_requirements ON information_requirements
  USING (organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_cases ON resolution_cases
  USING (organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_claims ON claims
  USING (organisation_id IS NULL OR organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_evidence ON evidence
  USING (organisation_id IS NULL OR organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_requests ON supplier_requests
  USING (organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_imports ON import_jobs
  USING (organisation_id::text = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_audit ON audit_events
  USING (organisation_id IS NULL OR organisation_id = current_setting('source.organisation_id', true));
CREATE POLICY tenant_isolation_mappings ON tenant_subject_mappings
  USING (organisation_id::text = current_setting('source.organisation_id', true));

REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON identity_decisions FROM PUBLIC;
REVOKE UPDATE, DELETE ON permission_events FROM PUBLIC;
