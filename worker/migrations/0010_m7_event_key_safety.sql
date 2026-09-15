-- M7 command-key safety.  Empty idempotency keys are allowed by legacy
-- routes, but they must not collide with one another. Strict commands are
-- validated before mutation and always carry a non-empty key.
DROP INDEX IF EXISTS idx_events_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency_nonempty
  ON auditflow_events (engagement_id, idempotency_key)
  WHERE idempotency_key <> '';
