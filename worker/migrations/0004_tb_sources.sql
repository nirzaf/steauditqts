-- DEMO-INTERACTIVE-001 Phase 4: shared trial-balance source status.
-- Additive only. Detailed TB rows stay fixture data; D1 stores the
-- versioned source record every role reads (criterion: TB v03 is current).
CREATE TABLE IF NOT EXISTS auditflow_tb_sources (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  debit_total TEXT NOT NULL DEFAULT '0.00',
  credit_total TEXT NOT NULL DEFAULT '0.00',
  validation_state TEXT NOT NULL DEFAULT 'DRAFT',
  mapping_complete INTEGER NOT NULL DEFAULT 0 CHECK (mapping_complete IN (0, 1)),
  replaces_version TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(source_version) BETWEEN 1 AND 20),
  CHECK (row_count >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_sources_version ON auditflow_tb_sources (engagement_id, source_version);
