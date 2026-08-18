-- Hosted Supabase hardening: SOURCE uses server-side pg as source_app, not PostgREST for domain I/O.
-- Keep public schema objects inaccessible to anon/authenticated while allowing the runtime role.

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS runtime_organisations ON organisations;
CREATE POLICY runtime_organisations ON organisations TO source_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS runtime_users ON users;
CREATE POLICY runtime_users ON users TO source_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS runtime_memberships ON memberships;
CREATE POLICY runtime_memberships ON memberships TO source_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS runtime_schema_migrations ON schema_migrations;
CREATE POLICY runtime_schema_migrations ON schema_migrations TO source_app USING (true);
DROP POLICY IF EXISTS runtime_rate_limits ON rate_limit_windows;
CREATE POLICY runtime_rate_limits ON rate_limit_windows TO source_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS runtime_identity_commands ON identity_commands;
CREATE POLICY runtime_identity_commands ON identity_commands TO source_app USING (true) WITH CHECK (true);

ALTER VIEW shareable_trust_directory SET (security_invoker = true);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_outbox_batch(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION find_portal_grant_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_session_by_id(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_outbox_succeeded(text, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_outbox_failed(text, text, timestamptz, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION find_import_job_by_id(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION count_outbox_by_status(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION find_outbox_by_id(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION find_invitation_by_hash(text) FROM anon, authenticated;
