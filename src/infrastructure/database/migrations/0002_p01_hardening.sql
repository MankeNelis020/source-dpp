-- P0.1 hardening: outbox, distributed rate limits, shareable trust directory, RLS, runtime role.
-- Forward-fix: these objects are additive. Rollback is DROP of new objects; do not restore free-text audit as a control.

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED','DEAD_LETTER')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (organisation_id, semantic_key)
);

CREATE INDEX IF NOT EXISTS outbox_claim_idx ON outbox_events (status, available_at);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE IF NOT EXISTS shareable_trust_objects (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  subject_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  permission_state TEXT NOT NULL,
  visibility TEXT,
  purpose TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  expired BOOLEAN NOT NULL DEFAULT false,
  network_visible BOOLEAN NOT NULL DEFAULT false
);

CREATE OR REPLACE VIEW shareable_trust_directory AS
SELECT id, subject_id, property_id, trust_level, permission_state, visibility, purpose, valid_until, expired
FROM shareable_trust_objects
WHERE network_visible = true;

ALTER TABLE engine_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_portal_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareable_trust_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_engine ON engine_states;
CREATE POLICY tenant_engine ON engine_states
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_commands ON processed_commands;
CREATE POLICY tenant_commands ON processed_commands
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_audit ON audit_events;
CREATE POLICY tenant_audit ON audit_events
  USING (organisation_id IS NULL OR organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_imports ON import_jobs;
CREATE POLICY tenant_imports ON import_jobs
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_evidence_objects ON evidence_objects;
CREATE POLICY tenant_evidence_objects ON evidence_objects
  USING (organisation_id IS NULL OR organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_outbox ON outbox_events;
CREATE POLICY tenant_outbox ON outbox_events
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_sessions ON sessions;
CREATE POLICY tenant_sessions ON sessions
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_portal ON supplier_portal_grants;
CREATE POLICY tenant_portal ON supplier_portal_grants
  USING (tenant_context_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_shareable ON shareable_trust_objects;
CREATE POLICY tenant_shareable ON shareable_trust_objects
  USING (organisation_id = current_setting('source.organisation_id', true));

REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'source_app') THEN
    CREATE ROLE source_app LOGIN PASSWORD 'source_app_dev_only';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO source_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organisations, users, memberships, engine_states, processed_commands,
  supplier_portal_grants, import_jobs, import_job_events, evidence_objects,
  sessions, outbox_events, rate_limit_windows, shareable_trust_objects
TO source_app;
GRANT SELECT, INSERT ON audit_events TO source_app;
GRANT SELECT ON shareable_trust_directory TO source_app;
REVOKE UPDATE, DELETE ON audit_events FROM source_app;

CREATE OR REPLACE FUNCTION claim_outbox_batch(lim integer)
RETURNS SETOF outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM outbox_events
    WHERE status IN ('PENDING','FAILED') AND available_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT lim
  )
  UPDATE outbox_events o SET status = 'PROCESSING'
  FROM picked
  WHERE o.id = picked.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_outbox_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_outbox_batch(integer) TO source_app;

CREATE OR REPLACE FUNCTION find_portal_grant_by_hash(lookup_hash text)
RETURNS SETOF supplier_portal_grants
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM supplier_portal_grants WHERE token_hash = lookup_hash;
$$;
REVOKE ALL ON FUNCTION find_portal_grant_by_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_portal_grant_by_hash(text) TO source_app;

CREATE OR REPLACE FUNCTION get_session_by_id(lookup_id text)
RETURNS SETOF sessions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM sessions WHERE id = lookup_id;
$$;
REVOKE ALL ON FUNCTION get_session_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_session_by_id(text) TO source_app;

CREATE OR REPLACE FUNCTION mark_outbox_succeeded(lookup_id text, processed timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE outbox_events SET status = 'SUCCEEDED', processed_at = processed, last_error = NULL WHERE id = lookup_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_outbox_failed(lookup_id text, err text, next_at timestamptz, dead boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE outbox_events
  SET status = CASE WHEN dead THEN 'DEAD_LETTER' ELSE 'FAILED' END,
      last_error = err,
      available_at = next_at,
      attempt_count = attempt_count + 1,
      processed_at = CASE WHEN dead THEN now() ELSE processed_at END
  WHERE id = lookup_id;
END;
$$;

REVOKE ALL ON FUNCTION mark_outbox_succeeded(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_outbox_failed(text, text, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_outbox_succeeded(text, timestamptz) TO source_app;
GRANT EXECUTE ON FUNCTION mark_outbox_failed(text, text, timestamptz, boolean) TO source_app;
