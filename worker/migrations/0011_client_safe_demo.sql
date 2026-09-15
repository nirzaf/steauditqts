-- Client-safe shared demo additions.  These objects are intentionally
-- project-prefixed and additive so the existing quadrate-db applications are
-- untouched.  A run is an isolated synthetic scenario inside the existing
-- AuditFlow tables; it is not a production tenant or audit record.

CREATE TABLE IF NOT EXISTS auditflow_demo_invitations (
  invitation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  persona_id TEXT NOT NULL DEFAULT 'client-demo',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  max_sessions INTEGER NOT NULL DEFAULT 5,
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL DEFAULT '',
  CHECK (length(invitation_id) BETWEEN 8 AND 120),
  CHECK (length(run_id) BETWEEN 8 AND 80),
  CHECK (length(token_hash) BETWEEN 32 AND 128),
  CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  CHECK (max_sessions BETWEEN 1 AND 20),
  CHECK (session_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_auditflow_demo_invitations_run
  ON auditflow_demo_invitations (run_id, status, expires_at);

CREATE TABLE IF NOT EXISTS auditflow_demo_run_contexts (
  run_id TEXT NOT NULL,
  logical_engagement_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL PRIMARY KEY,
  client_id TEXT NOT NULL,
  service TEXT NOT NULL,
  period TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  linked_logical_engagement_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(run_id) BETWEEN 8 AND 80),
  CHECK (length(logical_engagement_id) BETWEEN 1 AND 40),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(client_id) BETWEEN 1 AND 80),
  UNIQUE (run_id, logical_engagement_id)
);
CREATE INDEX IF NOT EXISTS idx_auditflow_demo_run_contexts_run
  ON auditflow_demo_run_contexts (run_id, logical_engagement_id);

CREATE TABLE IF NOT EXISTS auditflow_demo_session_scopes (
  session_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL DEFAULT '',
  client_mode INTEGER NOT NULL DEFAULT 0 CHECK (client_mode IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(session_id) BETWEEN 16 AND 128),
  CHECK (length(run_id) BETWEEN 8 AND 80)
);
CREATE INDEX IF NOT EXISTS idx_auditflow_demo_session_scopes_run
  ON auditflow_demo_session_scopes (run_id, invitation_id);

CREATE TABLE IF NOT EXISTS auditflow_portal_messages (
  message_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  request_id TEXT NOT NULL DEFAULT '',
  thread_id TEXT NOT NULL DEFAULT '',
  reply_to TEXT NOT NULL DEFAULT '',
  sender_persona_id TEXT NOT NULL,
  sender_actor_id TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  client_visible INTEGER NOT NULL DEFAULT 1 CHECK (client_visible IN (0, 1)),
  state TEXT NOT NULL DEFAULT 'UNREAD',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT NOT NULL DEFAULT '',
  CHECK (length(message_id) BETWEEN 8 AND 120),
  CHECK (length(run_id) BETWEEN 8 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(request_id) <= 80),
  CHECK (length(thread_id) <= 120),
  CHECK (length(reply_to) <= 120),
  CHECK (length(sender_persona_id) BETWEEN 1 AND 80),
  CHECK (length(sender_actor_id) BETWEEN 1 AND 80),
  CHECK (length(sender_role) BETWEEN 1 AND 80),
  CHECK (length(body) BETWEEN 1 AND 2000),
  CHECK (state IN ('UNREAD', 'READ', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS idx_auditflow_portal_messages_scope
  ON auditflow_portal_messages (run_id, engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditflow_portal_messages_thread
  ON auditflow_portal_messages (thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS auditflow_demo_uploads (
  receipt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  content_sha256 TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  storage_state TEXT NOT NULL DEFAULT 'STAGING',
  storage_error TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(receipt_id) BETWEEN 8 AND 120),
  CHECK (length(run_id) BETWEEN 8 AND 80),
  CHECK (length(request_id) BETWEEN 1 AND 80),
  CHECK (length(engagement_id) BETWEEN 1 AND 40),
  CHECK (length(object_key) BETWEEN 8 AND 512),
  CHECK (length(file_name) BETWEEN 1 AND 240),
  CHECK (file_size BETWEEN 0 AND 10000000),
  CHECK (length(content_sha256) <= 128),
  CHECK (storage_state IN ('STAGING', 'RECEIVED', 'EXPIRED', 'WITHDRAWN', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_auditflow_demo_uploads_expiry
  ON auditflow_demo_uploads (storage_state, expires_at);
CREATE INDEX IF NOT EXISTS idx_auditflow_demo_uploads_scope
  ON auditflow_demo_uploads (run_id, engagement_id, request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auditflow_demo_uploads_idempotency
  ON auditflow_demo_uploads (run_id, request_id, idempotency_key)
  WHERE idempotency_key <> '';
