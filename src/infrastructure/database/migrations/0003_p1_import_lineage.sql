ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS raw_records JSONB;

CREATE TABLE IF NOT EXISTS import_mapping_profiles (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  source_format TEXT NOT NULL,
  mapping JSONB NOT NULL,
  mapping_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (organisation_id, source_format)
);

ALTER TABLE import_mapping_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_mapping_profiles ON import_mapping_profiles;
CREATE POLICY tenant_mapping_profiles ON import_mapping_profiles
  USING (organisation_id = current_setting('source.organisation_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_profiles TO source_app;
