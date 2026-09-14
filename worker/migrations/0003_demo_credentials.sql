-- DEMO-INTERACTIVE-001 Phase 2: synthetic temporary credentials.
-- Additive only. Stores a SHA-256 hash, never a plain-text password.
CREATE TABLE IF NOT EXISTS auditflow_credentials (
  credential_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'ISSUED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT NOT NULL DEFAULT '',
  CHECK (length(credential_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(password_hash) BETWEEN 32 AND 128),
  CHECK (state IN ('ISSUED','ACTIVATED','EXPIRED','REVOKED'))
);
CREATE INDEX IF NOT EXISTS idx_credentials_engagement ON auditflow_credentials (engagement_id, created_at DESC);
