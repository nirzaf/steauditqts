-- DEMO-INTERACTIVE-001 Phase 1: shared multi-browser demo state.
-- Additive only. Never touches unrelated tables in quadrate-db.
-- All tables use the auditflow_ prefix. No DROP / TRUNCATE / ALTER of existing tables.

CREATE TABLE IF NOT EXISTS auditflow_demo_sessions (
  session_id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_activity TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(session_id) BETWEEN 16 AND 128),
  CHECK (length(persona_id) BETWEEN 1 AND 80),
  CHECK (length(actor_id) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_persona ON auditflow_demo_sessions (persona_id, last_activity DESC);

CREATE TABLE IF NOT EXISTS auditflow_engagement_state (
  engagement_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  current_stage TEXT NOT NULL DEFAULT 'STAGE-01',
  g_status TEXT NOT NULL DEFAULT '{}',
  generation_id TEXT NOT NULL DEFAULT 'gen-seed-01',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(client_id) BETWEEN 1 AND 40),
  CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS auditflow_commercial (
  engagement_id TEXT PRIMARY KEY,
  estimate_hours TEXT NOT NULL DEFAULT '0',
  estimate_cost TEXT NOT NULL DEFAULT '0.00',
  approved_fee TEXT NOT NULL DEFAULT '0.00',
  fee_state TEXT NOT NULL DEFAULT 'DRAFT',
  quotation_id TEXT NOT NULL DEFAULT '',
  quotation_state TEXT NOT NULL DEFAULT 'DRAFT',
  el_version TEXT NOT NULL DEFAULT '',
  el_state TEXT NOT NULL DEFAULT 'DRAFT',
  advance_required TEXT NOT NULL DEFAULT '0.00',
  advance_state TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  advance_reference TEXT NOT NULL DEFAULT '',
  invoice_id TEXT NOT NULL DEFAULT '',
  invoice_state TEXT NOT NULL DEFAULT 'DRAFT',
  actual_hours TEXT NOT NULL DEFAULT '0',
  actual_cost TEXT NOT NULL DEFAULT '0.00',
  commercial_close TEXT NOT NULL DEFAULT 'OPEN',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40)
);

CREATE TABLE IF NOT EXISTS auditflow_tasks (
  task_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  assignee_persona TEXT NOT NULL DEFAULT '',
  assignee_role TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'OPEN',
  due_date TEXT NOT NULL DEFAULT '',
  linked_object_type TEXT NOT NULL DEFAULT '',
  linked_object_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT NOT NULL DEFAULT '',
  CHECK (length(task_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(title) BETWEEN 1 AND 200),
  CHECK (state IN ('OPEN','IN_PROGRESS','BLOCKED','WAITING','COMPLETE','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_engagement ON auditflow_tasks (engagement_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON auditflow_tasks (assignee_persona, state);

CREATE TABLE IF NOT EXISTS auditflow_pbc_requests (
  request_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  client_owner TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'OPEN',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(request_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(title) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS idx_pbc_requests_engagement ON auditflow_pbc_requests (engagement_id, state);

CREATE TABLE IF NOT EXISTS auditflow_pbc_receipts (
  receipt_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  synthetic_hash TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  hard_copy INTEGER NOT NULL DEFAULT 0 CHECK (hard_copy IN (0, 1)),
  comment TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'RECEIVED',
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(receipt_id) BETWEEN 1 AND 80),
  CHECK (length(request_id) BETWEEN 1 AND 80),
  CHECK (length(file_name) BETWEEN 1 AND 240)
);
CREATE INDEX IF NOT EXISTS idx_pbc_receipts_request ON auditflow_pbc_receipts (request_id, version DESC);

CREATE TABLE IF NOT EXISTS auditflow_workpapers (
  workpaper_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  procedure_title TEXT NOT NULL DEFAULT '',
  evidence_reference TEXT NOT NULL DEFAULT '',
  conclusion TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'ASSIGNED',
  revision INTEGER NOT NULL DEFAULT 1,
  submitted_by TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(workpaper_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_workpapers_engagement ON auditflow_workpapers (engagement_id, state);

CREATE TABLE IF NOT EXISTS auditflow_review_points (
  review_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  workpaper_id TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'STANDARD',
  owner TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'OPEN',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cleared_at TEXT NOT NULL DEFAULT '',
  CHECK (length(review_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_review_points_engagement ON auditflow_review_points (engagement_id, state);

CREATE TABLE IF NOT EXISTS auditflow_decisions (
  decision_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  object_version TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  rationale TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  CHECK (length(decision_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(decision_type) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_decisions_engagement ON auditflow_decisions (engagement_id, decision_type, decided_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_artifacts (
  document_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT 'v01',
  state TEXT NOT NULL DEFAULT 'DRAFT',
  visibility TEXT NOT NULL DEFAULT 'INTERNAL',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT NOT NULL DEFAULT '',
  CHECK (length(document_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_engagement ON auditflow_artifacts (engagement_id, visibility);

CREATE TABLE IF NOT EXISTS auditflow_outbox (
  message_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  related_type TEXT NOT NULL DEFAULT '',
  related_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'QUEUED_SIMULATION',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(message_id) BETWEEN 1 AND 80),
  CHECK (channel IN ('EMAIL','WHATSAPP','PORTAL_NOTIFICATION')),
  CHECK (state IN ('QUEUED_SIMULATION','SENT_SIMULATION','READ_SIMULATION','FAILED_SIMULATION'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_engagement ON auditflow_outbox (engagement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_events (
  event_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  object_type TEXT NOT NULL DEFAULT '',
  object_id TEXT NOT NULL DEFAULT '',
  previous_revision INTEGER NOT NULL DEFAULT 0,
  new_revision INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(event_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(action) BETWEEN 1 AND 60)
);
CREATE INDEX IF NOT EXISTS idx_events_engagement ON auditflow_events (engagement_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency ON auditflow_events (engagement_id, idempotency_key);

-- Seed one shared Northstar engagement row (idempotent) so Phase-1 reads work.
INSERT INTO auditflow_engagement_state (engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id)
VALUES ('ENG-0018-AUD-2026', 'CLI-0018', 'AUDIT', 'FY2026', 1, 'STAGE-01', '{}', 'gen-seed-01')
ON CONFLICT (engagement_id) DO NOTHING;
