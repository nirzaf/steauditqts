-- Phase C: shared client evaluation, accounting status tracker, input
-- generations, and decision/record generation markers.
-- Additive only. Never touches unrelated tables in quadrate-db.

CREATE TABLE IF NOT EXISTS auditflow_assessments (
  assessment_id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'acceptance',
  template_version TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(assessment_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(type) BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_engagement_type
  ON auditflow_assessments (engagement_id, type);

CREATE TABLE IF NOT EXISTS auditflow_assessment_responses (
  assessment_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT 'UNKNOWN',
  applicability TEXT NOT NULL DEFAULT 'APPLICABLE',
  verification TEXT NOT NULL DEFAULT 'UNVERIFIED',
  explanation TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT '',
  responder TEXT NOT NULL DEFAULT '',
  verifier TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assessment_id, question_id),
  CHECK (length(assessment_id) BETWEEN 1 AND 80),
  CHECK (length(question_id) BETWEEN 1 AND 20)
);
CREATE INDEX IF NOT EXISTS idx_assessment_responses_assessment
  ON auditflow_assessment_responses (assessment_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS auditflow_accounting_status (
  engagement_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL DEFAULT '',
  source_state TEXT NOT NULL DEFAULT 'PENDING',
  mapping_state TEXT NOT NULL DEFAULT 'PENDING',
  mapping_coverage TEXT NOT NULL DEFAULT '',
  recon_state TEXT NOT NULL DEFAULT 'PENDING',
  open_recon_count INTEGER NOT NULL DEFAULT 0,
  journal_state TEXT NOT NULL DEFAULT 'PENDING',
  pending_journal_count INTEGER NOT NULL DEFAULT 0,
  fs_version TEXT NOT NULL DEFAULT '',
  fs_state TEXT NOT NULL DEFAULT 'DRAFT',
  mgmt_approval_state TEXT NOT NULL DEFAULT 'PENDING',
  input_generation INTEGER NOT NULL DEFAULT 1,
  audit_evaluated_generation INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (open_recon_count >= 0),
  CHECK (pending_journal_count >= 0),
  CHECK (input_generation >= 1),
  CHECK (audit_evaluated_generation >= 1)
);

ALTER TABLE auditflow_decisions ADD COLUMN input_generation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE auditflow_review_points ADD COLUMN cleared_generation INTEGER NOT NULL DEFAULT 1;
