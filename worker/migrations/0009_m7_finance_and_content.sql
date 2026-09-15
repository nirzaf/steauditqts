-- M7 strict finance/evidence details.  Additive project-scoped columns only;
-- existing rows remain readable and legacy routes continue to work.
ALTER TABLE auditflow_assessment_responses ADD COLUMN disposition TEXT NOT NULL DEFAULT '';

ALTER TABLE auditflow_commercial ADD COLUMN advance_allocated TEXT NOT NULL DEFAULT '0.00';
ALTER TABLE auditflow_commercial ADD COLUMN actuals_basis TEXT NOT NULL DEFAULT 'ENTERED_SUMMARY';

ALTER TABLE auditflow_artifacts ADD COLUMN content_json TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_artifacts ADD COLUMN release_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_auditflow_invoice_identity
  ON auditflow_commercial (invoice_id)
  WHERE invoice_id <> '';

-- Business identity is separate from request-key idempotency: two different
-- command keys must still be unable to release the same engagement/candidate
-- twice.  Existing legacy releases are retained; a strict second release is
-- reconciled as a duplicate at the Worker boundary.
CREATE UNIQUE INDEX IF NOT EXISTS idx_auditflow_release_identity
  ON auditflow_decisions (engagement_id, decision_type, object_version)
  WHERE decision_type = 'RELEASE';

CREATE INDEX IF NOT EXISTS idx_auditflow_artifact_release
  ON auditflow_artifacts (engagement_id, release_id, document_type, version);
