-- Inbound email application foundation. Receiving DNS is not activated by this migration.
-- Correlation tokens are hashed. Raw mail bodies are not stored.

CREATE TABLE IF NOT EXISTS inbound_correlations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  case_id TEXT NOT NULL,
  request_id TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_email_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  organisation_id TEXT REFERENCES organisations(id),
  case_id TEXT,
  correlation_id TEXT REFERENCES inbound_correlations(id),
  from_normalized TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disposition TEXT NOT NULL,
  UNIQUE (provider, provider_event_id)
);

ALTER TABLE inbound_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_inbound_correlations ON inbound_correlations;
CREATE POLICY tenant_inbound_correlations ON inbound_correlations
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_inbound_email_events ON inbound_email_events;
CREATE POLICY tenant_inbound_email_events ON inbound_email_events
  USING (organisation_id IS NULL OR organisation_id = current_setting('source.organisation_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_correlations, inbound_email_events TO source_app;

CREATE OR REPLACE FUNCTION find_inbound_correlation_by_hash(lookup_hash text)
RETURNS SETOF inbound_correlations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM inbound_correlations WHERE token_hash = lookup_hash;
$$;

CREATE OR REPLACE FUNCTION insert_inbound_email_event(
  lookup_id text,
  lookup_provider text,
  event_id text,
  org_id text,
  lookup_case text,
  corr_id text,
  from_norm text,
  occurred timestamptz,
  processed timestamptz,
  lookup_disposition text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO inbound_email_events (
    id, provider, provider_event_id, organisation_id, case_id, correlation_id, from_normalized, occurred_at, processed_at, disposition
  ) VALUES (
    lookup_id, lookup_provider, event_id, org_id, lookup_case, corr_id, from_norm, occurred, processed, lookup_disposition
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION find_inbound_correlation_by_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_inbound_correlation_by_hash(text) TO source_app;
REVOKE ALL ON FUNCTION insert_inbound_email_event(text, text, text, text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_inbound_email_event(text, text, text, text, text, text, text, timestamptz, timestamptz, text) TO source_app;
