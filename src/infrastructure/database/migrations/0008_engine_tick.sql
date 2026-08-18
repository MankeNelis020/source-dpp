-- Cross-tenant operational scan for reminder ticks.
-- Application authorization remains mandatory. RLS stays tenant-scoped on engine_states.
-- source_app cannot SELECT all engine_states; this SECURITY DEFINER function returns ids only.

CREATE OR REPLACE FUNCTION list_organisation_ids()
RETURNS TABLE (id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisations.id FROM organisations ORDER BY organisations.created_at;
$$;

REVOKE ALL ON FUNCTION list_organisation_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_organisation_ids() TO source_app;
