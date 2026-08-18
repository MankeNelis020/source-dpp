-- PR A: organisation lifecycle, membership status, invitations, identity command idempotency.
-- SOURCE profiles remain the `users` table; id equals the Supabase auth user id.
-- Authorization is never taken from auth.users raw_user_meta_data.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS created_by TEXT;

UPDATE memberships SET status = 'ACTIVE' WHERE status IS NULL OR status = '';

CREATE TABLE IF NOT EXISTS organisation_invitations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organisation_invitations_org_email_idx
  ON organisation_invitations (organisation_id, email_normalized);

CREATE TABLE IF NOT EXISTS identity_commands (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  command_type TEXT NOT NULL,
  organisation_id TEXT,
  result_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

ALTER TABLE organisation_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_invitations ON organisation_invitations;
CREATE POLICY tenant_invitations ON organisation_invitations
  USING (organisation_id = current_setting('source.organisation_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_invitations, identity_commands TO source_app;

CREATE OR REPLACE FUNCTION find_invitation_by_hash(lookup_hash text)
RETURNS SETOF organisation_invitations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM organisation_invitations WHERE token_hash = lookup_hash;
$$;

REVOKE ALL ON FUNCTION find_invitation_by_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_invitation_by_hash(text) TO source_app;
