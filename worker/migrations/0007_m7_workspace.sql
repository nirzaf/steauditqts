-- M7: one viewer session, independent tab-scoped effective-actor views,
-- durable command receipts and exact decision targets. Additive only.
-- These objects are project-prefixed and do not alter unrelated quadrate-db
-- tables. Apply once after inspecting the target D1 migration state.

CREATE TABLE IF NOT EXISTS auditflow_demo_runs (
  run_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Workshop demo',
  generation_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'ACTIVE',
  host_session_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(run_id) BETWEEN 8 AND 80),
  CHECK (length(generation_id) BETWEEN 1 AND 80),
  CHECK (state IN ('ACTIVE', 'PAUSED', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS idx_auditflow_demo_runs_state
  ON auditflow_demo_runs (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_demo_views (
  view_id TEXT PRIMARY KEY,
  parent_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  context_version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  CHECK (length(view_id) BETWEEN 8 AND 120),
  CHECK (length(parent_session_id) BETWEEN 16 AND 128),
  CHECK (context_version >= 1),
  CHECK (state IN ('ACTIVE', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_auditflow_demo_views_session
  ON auditflow_demo_views (parent_session_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditflow_demo_views_scope
  ON auditflow_demo_views (engagement_id, generation_id, actor_id);

CREATE TABLE IF NOT EXISTS auditflow_command_receipts (
  command_id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  result_json TEXT NOT NULL,
  claimed_revision INTEGER NOT NULL,
  view_id TEXT NOT NULL DEFAULT '',
  parent_session_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(command_id) BETWEEN 8 AND 120),
  CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  CHECK (claimed_revision >= 1),
  UNIQUE (generation_id, engagement_id, actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_auditflow_receipts_scope
  ON auditflow_command_receipts (generation_id, engagement_id, actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_decision_targets (
  decision_id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  input_generation INTEGER NOT NULL DEFAULT 1,
  policy_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (target_revision >= 1),
  CHECK (input_generation >= 1),
  UNIQUE (generation_id, engagement_id, target_id, target_revision)
);

CREATE INDEX IF NOT EXISTS idx_auditflow_decision_targets_scope
  ON auditflow_decision_targets (engagement_id, generation_id, target_id, target_revision DESC);

