-- B2 durable object storage index. Bytes live in private Supabase Storage buckets.
-- SOURCE authorization remains primary. Service role is an infrastructure credential.

CREATE TABLE IF NOT EXISTS storage_objects (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('IMPORT_SOURCE', 'EVIDENCE', 'TEMPORARY_UPLOAD', 'EXPORT')),
  availability TEXT NOT NULL CHECK (availability IN ('UPLOADING', 'PROCESSING', 'AVAILABLE', 'REJECTED', 'QUARANTINED')),
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  created_by_principal_id TEXT,
  created_via_portal_grant_id TEXT,
  case_id TEXT,
  requirement_id TEXT,
  evidence_id TEXT,
  scan_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING', 'CLEAN', 'REJECTED', 'FAILED', 'SKIPPED_NON_PRODUCTION')),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  supersedes_storage_object_id TEXT,
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS storage_objects_org_idx ON storage_objects (organisation_id);
CREATE INDEX IF NOT EXISTS storage_objects_temp_idx ON storage_objects (expires_at)
  WHERE deleted_at IS NULL AND purpose = 'TEMPORARY_UPLOAD';

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS source_storage_object_ids JSONB;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS source_files JSONB;

ALTER TABLE evidence_objects ADD COLUMN IF NOT EXISTS storage_object_id TEXT;
ALTER TABLE evidence_objects ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE evidence_objects ADD COLUMN IF NOT EXISTS supersedes_evidence_id TEXT;
ALTER TABLE evidence_objects ADD COLUMN IF NOT EXISTS uploaded_via_portal_grant_id TEXT;

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_storage_objects ON storage_objects;
CREATE POLICY tenant_storage_objects ON storage_objects
  USING (organisation_id = current_setting('source.organisation_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON storage_objects TO source_app;

CREATE OR REPLACE FUNCTION find_storage_object_by_id(lookup_id text)
RETURNS SETOF storage_objects
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM storage_objects WHERE id = lookup_id;
$$;

REVOKE ALL ON FUNCTION find_storage_object_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_storage_object_by_id(text) TO source_app;

CREATE OR REPLACE FUNCTION list_expired_temporary_uploads(now_ts timestamptz)
RETURNS SETOF storage_objects
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM storage_objects
  WHERE purpose = 'TEMPORARY_UPLOAD'
    AND deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < now_ts;
$$;

REVOKE ALL ON FUNCTION list_expired_temporary_uploads(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_expired_temporary_uploads(timestamptz) TO source_app;
