-- Phase D: operational portfolio, controlled walkthrough presets, and task
-- routing metadata. Additive only; this changes no unrelated D1 data.

ALTER TABLE auditflow_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE auditflow_tasks ADD COLUMN blocker_code TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN route TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN target TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN stage TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN creator TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN sla_due_at TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_tasks ADD COLUMN escalation_state TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE auditflow_tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tasks_operational_routing
  ON auditflow_tasks (engagement_id, state, priority, sla_due_at);

CREATE TABLE IF NOT EXISTS auditflow_demo_scenario_presets (
  engagement_id TEXT PRIMARY KEY,
  preset_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  applied_by TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (preset_key IN ('NEW_CLIENT', 'FIELDWORK', 'MANAGER_REVIEW_BLOCKED', 'READY_FOR_PARTNER', 'READY_FOR_RELEASE'))
);
