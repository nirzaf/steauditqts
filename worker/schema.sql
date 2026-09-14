-- AuditFlow prototype state. These tables are intentionally prefixed so they
-- can safely share Quadrate's existing D1 database without altering other apps.
CREATE TABLE IF NOT EXISTS auditflow_comments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'Client contact',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(page_key) BETWEEN 1 AND 64),
  CHECK (length(step_key) BETWEEN 1 AND 64),
  CHECK (length(author_name) BETWEEN 1 AND 80),
  CHECK (length(author_role) BETWEEN 1 AND 80),
  CHECK (length(body) BETWEEN 1 AND 1200)
);

CREATE INDEX IF NOT EXISTS idx_auditflow_comments_scope
  ON auditflow_comments (engagement_id, page_key, created_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_step_preferences (
  engagement_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1)),
  updated_by TEXT NOT NULL DEFAULT 'Client contact',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (engagement_id, step_key),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(step_key) BETWEEN 1 AND 64),
  CHECK (length(updated_by) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS auditflow_client_profiles (
  engagement_id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  registration TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_period TEXT NOT NULL,
  service_requested TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL DEFAULT 'Client contact',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(legal_name) BETWEEN 1 AND 160),
  CHECK (length(registration) BETWEEN 1 AND 80),
  CHECK (length(contact_name) BETWEEN 1 AND 80),
  CHECK (length(contact_email) BETWEEN 3 AND 160),
  CHECK (length(phone) BETWEEN 3 AND 40),
  CHECK (length(service_period) BETWEEN 1 AND 120),
  CHECK (length(service_requested) BETWEEN 1 AND 160),
  CHECK (length(context) <= 1200),
  CHECK (length(submitted_by) BETWEEN 1 AND 80)
);
