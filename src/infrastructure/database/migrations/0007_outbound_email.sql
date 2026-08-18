-- PR C: outbound email transport records. Domain request state remains separate.
-- Application authorization remains mandatory. RLS is defense in depth.

CREATE TABLE IF NOT EXISTS outbound_messages (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  case_id TEXT,
  request_id TEXT,
  supplier_actor_id TEXT,
  portal_grant_id TEXT,
  outbox_event_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  from_address TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  category TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('RESEND', 'TEST')),
  provider_message_id TEXT,
  transport_status TEXT NOT NULL CHECK (
    transport_status IN (
      'QUEUED', 'SUBMITTING', 'PROVIDER_ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED'
    )
  ),
  token_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,
  last_provider_event_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (organisation_id, semantic_key)
);

CREATE INDEX IF NOT EXISTS outbound_messages_org_idx ON outbound_messages (organisation_id);
CREATE INDEX IF NOT EXISTS outbound_messages_case_idx ON outbound_messages (organisation_id, case_id);
CREATE INDEX IF NOT EXISTS outbound_messages_provider_idx ON outbound_messages (provider, provider_message_id);

CREATE TABLE IF NOT EXISTS email_provider_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT REFERENCES organisations(id),
  outbound_message_id TEXT REFERENCES outbound_messages(id),
  provider TEXT NOT NULL CHECK (provider IN ('RESEND', 'TEST')),
  provider_event_id TEXT NOT NULL,
  provider_message_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS email_provider_events_message_idx ON email_provider_events (outbound_message_id);

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_outbound_messages ON outbound_messages;
CREATE POLICY tenant_outbound_messages ON outbound_messages
  USING (organisation_id = current_setting('source.organisation_id', true));

DROP POLICY IF EXISTS tenant_email_provider_events ON email_provider_events;
CREATE POLICY tenant_email_provider_events ON email_provider_events
  USING (organisation_id = current_setting('source.organisation_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON outbound_messages TO source_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_provider_events TO source_app;

CREATE OR REPLACE FUNCTION find_outbound_message_by_id(lookup_id text)
RETURNS SETOF outbound_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM outbound_messages WHERE id = lookup_id;
$$;

CREATE OR REPLACE FUNCTION find_outbound_message_by_provider_id(lookup_provider text, lookup_id text)
RETURNS SETOF outbound_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM outbound_messages
  WHERE provider = lookup_provider AND provider_message_id = lookup_id;
$$;

CREATE OR REPLACE FUNCTION insert_email_provider_event(
  lookup_id text,
  org_id text,
  message_id text,
  lookup_provider text,
  event_id text,
  provider_msg_id text,
  event_type text,
  occurred timestamptz,
  processed timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO email_provider_events (
    id, organisation_id, outbound_message_id, provider, provider_event_id, provider_message_id, event_type, occurred_at, processed_at
  ) VALUES (
    lookup_id, org_id, message_id, lookup_provider, event_id, provider_msg_id, event_type, occurred, processed
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION reset_outbox_for_retry(lookup_id text, available timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE outbox_events
  SET status = 'PENDING', available_at = available, last_error = NULL, processed_at = NULL
  WHERE id = lookup_id AND status = 'DEAD_LETTER';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION update_outbox_payload(lookup_id text, next_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE outbox_events SET payload = next_payload WHERE id = lookup_id;
$$;

CREATE OR REPLACE FUNCTION find_email_provider_event(lookup_provider text, event_id text)
RETURNS SETOF email_provider_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM email_provider_events WHERE provider = lookup_provider AND provider_event_id = event_id;
$$;

REVOKE ALL ON FUNCTION find_email_provider_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_email_provider_event(text, text) TO source_app;
REVOKE ALL ON FUNCTION find_outbound_message_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_outbound_message_by_id(text) TO source_app;
REVOKE ALL ON FUNCTION find_outbound_message_by_provider_id(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_outbound_message_by_provider_id(text, text) TO source_app;
REVOKE ALL ON FUNCTION insert_email_provider_event(text, text, text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_email_provider_event(text, text, text, text, text, text, text, timestamptz, timestamptz) TO source_app;
REVOKE ALL ON FUNCTION reset_outbox_for_retry(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_outbox_for_retry(text, timestamptz) TO source_app;
REVOKE ALL ON FUNCTION update_outbox_payload(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_outbox_payload(text, jsonb) TO source_app;
