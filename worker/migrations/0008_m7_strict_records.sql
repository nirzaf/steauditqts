-- M7 strict record identity.  Additive and project-prefixed; existing source
-- rows remain readable and receive an empty hash until their next immutable
-- replacement is recorded through the strict command path.
ALTER TABLE auditflow_tb_sources ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tb_sources_hash
  ON auditflow_tb_sources (engagement_id, source_hash);
