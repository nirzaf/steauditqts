-- 0013_leads_groups_commencement.sql
-- Additive tables and columns for end-to-end CRM lead conversion,
-- optional client groups, dynamic engagement staffing, and explicit audit commencement.

CREATE TABLE IF NOT EXISTS auditflow_leads (
  lead_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  estimated_value TEXT NOT NULL DEFAULT '0.00',
  service TEXT NOT NULL DEFAULT 'Financial-statement audit',
  source TEXT NOT NULL DEFAULT 'Referral',
  assigned_actor_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUALIFIED', 'CONVERTED', 'CLOSED')),
  client_id TEXT NOT NULL DEFAULT '',
  engagement_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(lead_id) BETWEEN 1 AND 80),
  CHECK (length(name) BETWEEN 1 AND 120),
  CHECK (length(company) BETWEEN 1 AND 160)
);
CREATE INDEX IF NOT EXISTS idx_auditflow_leads_status ON auditflow_leads (status, created_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_client_groups (
  group_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(group_id) BETWEEN 1 AND 80),
  CHECK (length(name) BETWEEN 1 AND 160)
);

CREATE TABLE IF NOT EXISTS auditflow_clients (
  client_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '["audit"]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(client_id) BETWEEN 1 AND 80),
  CHECK (length(name) BETWEEN 1 AND 160)
);
CREATE INDEX IF NOT EXISTS idx_auditflow_clients_group ON auditflow_clients (group_id);

CREATE TABLE IF NOT EXISTS auditflow_engagement_team (
  engagement_id TEXT NOT NULL,
  role TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  planned_hours TEXT NOT NULL DEFAULT '0',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  responsibility TEXT NOT NULL DEFAULT '',
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (engagement_id, role, actor_id),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(role) BETWEEN 1 AND 60),
  CHECK (length(actor_id) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS idx_engagement_team_engagement ON auditflow_engagement_team (engagement_id);

ALTER TABLE auditflow_engagement_state ADD COLUMN audit_commenced INTEGER NOT NULL DEFAULT 0 CHECK (audit_commenced IN (0, 1));
ALTER TABLE auditflow_engagement_state ADD COLUMN commenced_at TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_engagement_state ADD COLUMN commenced_by TEXT NOT NULL DEFAULT '';
