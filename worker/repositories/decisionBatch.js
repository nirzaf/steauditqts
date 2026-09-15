// M7 APPROVAL-03 — atomic decision/revision/event/receipt primitive.
// Call only after the Worker has authenticated the viewer, resolved the tab
// view, checked assignment, and evaluated the concrete business rule.

export const receiptSchema = `CREATE TABLE IF NOT EXISTS auditflow_command_receipts (
  command_id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 120),
  request_digest TEXT NOT NULL,
  result_json TEXT NOT NULL,
  claimed_revision INTEGER NOT NULL CHECK(claimed_revision >= 1),
  view_id TEXT NOT NULL DEFAULT '',
  parent_session_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(generation_id, engagement_id, actor_id, idempotency_key)
);`

const ID = /^[A-Za-z0-9_-]{8,120}$/

export function buildDecisionBatch(command = {}, decision = {}, expectedGuards = [], extraStatements = []) {
  const {
    commandId,
    engagementId,
    generationId,
    actorId,
    idempotencyKey,
    requestDigest,
    expectedRevision,
    correlationId = '',
    viewId,
    contextVersion,
    parentSessionId,
  } = command
  if (!ID.test(String(commandId || '')) || !ID.test(String(viewId || '')) || !parentSessionId
    || !Number.isSafeInteger(contextVersion) || contextVersion < 1
    || !/^[A-Za-z0-9_-]{8,120}$/.test(String(idempotencyKey || '')) || !requestDigest
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError('A valid command, view, idempotency key, digest and expected revision are required.')
  }
  if (!decision.id || !decision.type || !decision.objectVersion || !decision.value) throw new TypeError('A complete version-bound decision is required.')
  if (decision.inputGeneration != null && (!Number.isSafeInteger(decision.inputGeneration) || decision.inputGeneration < 1)) throw new TypeError('Invalid decision input generation.')
  if (decision.stage != null && typeof decision.stage !== 'string') throw new TypeError('Invalid decision stage.')
  const params = [commandId, generationId, engagementId, actorId, idempotencyKey, requestDigest,
    JSON.stringify({ outcome: 'COMMITTED', commandId, decisionId: decision.id, actorId, engagementId, generationId, revision: expectedRevision + 1, ...(decision.resultExtras || {}) }),
    engagementId, generationId, expectedRevision, viewId, parentSessionId, actorId, engagementId, generationId, contextVersion]
  const guardSql = (Array.isArray(expectedGuards) ? expectedGuards : []).map((guard) => {
    if (!guard?.engagementId || !guard?.generationId || !Number.isSafeInteger(guard.revision) || guard.revision < 1) throw new TypeError('Invalid server-loaded dependency guard.')
    params.push(guard.engagementId, guard.generationId, guard.revision)
    return `AND EXISTS (SELECT 1 FROM auditflow_engagement_state dependency
      WHERE dependency.engagement_id = ? AND dependency.generation_id = ? AND dependency.revision = ?)`
  }).join('\n')
  const effects = (Array.isArray(extraStatements) ? extraStatements : []).map((statement) => {
    if (!statement || typeof statement.sql !== 'string' || !Array.isArray(statement.params)) throw new TypeError('Invalid prepared effect.')
    return statement
  })
  const decisionRevision = decision.rowRevision ?? expectedRevision + 1
  const withInputGeneration = decision.inputGeneration != null
  const decisionRow = {
    sql: `INSERT INTO auditflow_decisions
      (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision${withInputGeneration ? ', input_generation' : ''})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?${withInputGeneration ? ', ?' : ''})`,
    params: [decision.id, engagementId, decision.type, decision.objectVersion, decision.value, actorId, decision.rationale || '', decisionRevision, ...(withInputGeneration ? [decision.inputGeneration] : [])],
  }
  return [
    {
      sql: `INSERT INTO auditflow_command_receipts
        (command_id, generation_id, engagement_id, actor_id, idempotency_key,
         request_digest, result_json, claimed_revision, view_id, parent_session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?,
          (SELECT revision + 1 FROM auditflow_engagement_state
           WHERE engagement_id = ? AND generation_id = ? AND revision = ?
             AND EXISTS (SELECT 1 FROM auditflow_demo_views v
               JOIN auditflow_demo_sessions s ON s.session_id = v.parent_session_id
               WHERE v.view_id = ? AND v.parent_session_id = ? AND v.actor_id = ?
                 AND v.engagement_id = ? AND v.generation_id = ? AND v.context_version = ?
                 AND v.state = 'ACTIVE' AND s.expires_at > datetime('now')) ${guardSql}), ?, ?)`,
      params: [...params, viewId, parentSessionId],
    },
    {
      sql: `UPDATE auditflow_engagement_state SET revision = revision + 1${decision.stage ? ', current_stage = ?' : ''},
        updated_at = datetime('now') WHERE engagement_id = ? AND generation_id = ? AND revision = ?`,
      params: decision.stage ? [engagementId, generationId, decision.stage, expectedRevision] : [engagementId, generationId, expectedRevision],
    },
    decisionRow,
    ...effects,
    {
      sql: `INSERT INTO auditflow_events
        (event_id, engagement_id, actor, action, object_type, object_id,
         previous_revision, new_revision, idempotency_key, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [commandId, engagementId, actorId, decision.eventAction || decision.type, decision.eventObjectType || 'decision', decision.eventObjectId || decision.id, expectedRevision, expectedRevision + 1, idempotencyKey || commandId, correlationId],
    },
  ]
}

export async function executeDecisionBatch(db, command, decision, guards = [], effects = []) {
  if (!db?.prepare || !db?.batch) throw new TypeError('A D1 database with batch support is required.')
  const receipt = () => db.prepare(`SELECT request_digest, result_json
    FROM auditflow_command_receipts WHERE generation_id = ? AND engagement_id = ?
      AND actor_id = ? AND idempotency_key = ?`).bind(command.generationId, command.engagementId, command.actorId, command.idempotencyKey).first()
  const decode = (row) => {
    if (row.request_digest !== command.requestDigest) return { outcome: 'REJECTED', code: 'IDEMPOTENCY_CONFLICT', message: 'The idempotency key is already bound to another payload.' }
    return { ...JSON.parse(row.result_json), outcome: 'COMMITTED', replayed: true }
  }
  const prior = await receipt()
  if (prior) return decode(prior)
  const plan = buildDecisionBatch(command, decision, guards, effects)
  try {
    await db.batch(plan.map(({ sql, params }) => db.prepare(sql).bind(...params)))
  } catch (error) {
    const after = await receipt()
    if (after) return decode(after)
    if (String(error?.message || '').includes('claimed_revision') || String(error?.message || '').includes('UNIQUE')) return { outcome: 'REJECTED', code: 'REVISION_OR_GENERATION_CONFLICT', message: 'The record changed before this command could commit.' }
    throw error
  }
  return { outcome: 'COMMITTED', commandId: command.commandId, decisionId: decision.id, actorId: command.actorId, engagementId: command.engagementId, generationId: command.generationId, revision: command.expectedRevision + 1, replayed: false }
}

