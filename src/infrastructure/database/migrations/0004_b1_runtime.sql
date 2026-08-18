-- B1 runtime: health-check grants, import-event isolation, lookup helpers.
-- Runtime remains source_app. This migration does not grant DDL to the app role.

GRANT SELECT ON schema_migrations TO source_app;

ALTER TABLE import_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_import_events ON import_job_events;
CREATE POLICY tenant_import_events ON import_job_events
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = import_job_events.job_id
        AND j.organisation_id = current_setting('source.organisation_id', true)
    )
  );

CREATE OR REPLACE FUNCTION find_import_job_by_id(lookup_id text)
RETURNS SETOF import_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM import_jobs WHERE id = lookup_id;
$$;

REVOKE ALL ON FUNCTION find_import_job_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_import_job_by_id(text) TO source_app;

CREATE OR REPLACE FUNCTION count_outbox_by_status(status_filter text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM outbox_events WHERE status = status_filter;
$$;

REVOKE ALL ON FUNCTION count_outbox_by_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_outbox_by_status(text) TO source_app;

CREATE OR REPLACE FUNCTION find_outbox_by_id(lookup_id text)
RETURNS SETOF outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM outbox_events WHERE id = lookup_id;
$$;

REVOKE ALL ON FUNCTION find_outbox_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_outbox_by_id(text) TO source_app;
