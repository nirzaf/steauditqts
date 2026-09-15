// M7 repository seams. Keep queries close to the D1 boundary; pure projection
// and transition rules stay outside this module.

export function engagementById(db, engagementId) {
  return db.prepare('SELECT engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id, updated_at FROM auditflow_engagement_state WHERE engagement_id = ?1').bind(engagementId).first()
}

export function activeViewById(db, viewId, parentSessionId) {
  return db.prepare(`SELECT view_id, parent_session_id, run_id, persona_id, actor_id,
      engagement_id, generation_id, context_version, state, created_at, updated_at, expires_at
    FROM auditflow_demo_views
    WHERE view_id = ?1 AND parent_session_id = ?2 AND state = 'ACTIVE'`).bind(viewId, parentSessionId).first()
}

export function commandReceipt(db, { generationId, engagementId, actorId, idempotencyKey }) {
  return db.prepare(`SELECT command_id, request_digest, result_json, claimed_revision
    FROM auditflow_command_receipts
    WHERE generation_id = ?1 AND engagement_id = ?2 AND actor_id = ?3 AND idempotency_key = ?4`).bind(generationId, engagementId, actorId, idempotencyKey).first()
}

export function boundedBatch(db, statements = []) {
  if (!db?.batch || !Array.isArray(statements)) throw new TypeError('D1 batch and prepared statements are required.')
  return db.batch(statements.map((statement) => db.prepare(statement.sql).bind(...(statement.params || []))))
}

