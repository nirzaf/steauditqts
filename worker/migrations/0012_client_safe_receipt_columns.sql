-- Add private storage metadata to the existing AuditFlow receipt record.
-- This file is applied by the idempotent deployment helper, which checks
-- PRAGMA table_info before executing each ALTER because SQLite does not
-- support ADD COLUMN IF NOT EXISTS.
ALTER TABLE auditflow_pbc_receipts ADD COLUMN run_id TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_pbc_receipts ADD COLUMN object_key TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_pbc_receipts ADD COLUMN content_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_pbc_receipts ADD COLUMN expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE auditflow_pbc_receipts ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE auditflow_pbc_receipts ADD COLUMN storage_error TEXT NOT NULL DEFAULT '';
