// M7 APPROVAL-03 / PIPE-01 — shared command names and transport contracts.
// Validators are deliberately small and side-effect free; authority and
// business checks still belong to the Worker use case that executes them.

export const SHARED_ACTIONS = Object.freeze([
  // Core lifecycle actions (kept together so every Worker write can use the
  // same envelope, including the older portal actions).
  'SUBMIT_CLIENT_DETAILS',
  'VERIFY_ADVANCE',
  'ISSUE_TEMP_CREDENTIAL',
  'ACTIVATE_PORTAL',
  'ISSUE_ANNOUNCEMENT',
  'RECORD_ESTIMATE',
  'APPROVE_FEE',
  'RESPOND_EL',
  'CREATE_PBC_REQUEST',
  'SUBMIT_PBC_RECEIPT',
  'RESPOND_PBC_RECEIPT',
  'SUBMIT_WORKPAPER',
  'CREATE_REVIEW_POINT',
  'CLEAR_REVIEW_POINT',
  'PUBLISH_DRAFT_FS',
  'COMPLETE_EQR',
  'RELEASE_FINAL_REPORT',
  'DELIVER_FINAL_REPORT',
  'CREATE_INVOICE',
  'CLOSE_ENGAGEMENT',
  'SUBMIT_AUDIT_FILE',
  'RECOMMEND_COMPLETION',
  'RETURN_TO_TEAM',
  'REVIEW_PARTNER_COMPLETION',
  'RETURN_TO_MANAGER',
  'RECORD_FINAL_DISCUSSION',
  'VERIFY_RELEASE_CHECKPOINT',
  'ASSEMBLE_ARCHIVE',
  'ACCEPT_CLIENT',
  'RECORD_MANAGER_COMPLETION',
  'RECORD_PARTNER_REVIEW',
  'RECORD_AUDIT_OPINION',
  'RESPOND_DRAFT_FS',
  'APPROVE_ACCOUNTING_FS',
  'APPLY_SCENARIO_PRESET',
  'RECORD_ASSESSMENT_RESPONSE',
  'UPDATE_ACCOUNTING_STATUS',
  'EVALUATE_ACCOUNTING_INPUT',
  'RECORD_TB_SOURCE',
])

export const SHARED_ACTION_SET = new Set(SHARED_ACTIONS)
export const COMMAND_FIELDS = Object.freeze([
  'action',
  'targetId',
  'payload',
  'idempotencyKey',
  'expectedGenerationId',
  'expectedRevision',
  'expectedContextVersion',
])

const ID = /^[A-Za-z0-9_-]{1,80}$/
const DIGEST = /^[a-f0-9]{64}$/i

export function isSafeId(value, { min = 1, max = 80 } = {}) {
  return typeof value === 'string' && value.length >= min && value.length <= max && ID.test(value)
}

export function validateCommandEnvelope(input, registeredActions = SHARED_ACTION_SET) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, code: 'COMMAND_INVALID', message: 'Expected a command object.' }
  const unknown = Object.keys(input).filter((key) => !COMMAND_FIELDS.includes(key))
  if (unknown.length) return { ok: false, code: 'COMMAND_PROTECTED_FIELD', message: 'Unknown or protected command field.' }
  if (!registeredActions?.has?.(input.action)) return { ok: false, code: 'ACTION_NOT_ENABLED', message: 'Action is not enabled.' }
  if (!isSafeId(input.targetId)) return { ok: false, code: 'COMMAND_ID_INVALID', message: 'A valid targetId is required.' }
  if (!isSafeId(input.expectedGenerationId)) return { ok: false, code: 'COMMAND_GENERATION_INVALID', message: 'A valid expectedGenerationId is required.' }
  if (!isSafeId(input.idempotencyKey, { min: 8 })) return { ok: false, code: 'COMMAND_IDEMPOTENCY_INVALID', message: 'A valid idempotencyKey is required.' }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) return { ok: false, code: 'COMMAND_REVISION_INVALID', message: 'expectedRevision is required.' }
  if (!Number.isSafeInteger(input.expectedContextVersion) || input.expectedContextVersion < 1) return { ok: false, code: 'COMMAND_CONTEXT_INVALID', message: 'expectedContextVersion is required.' }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) return { ok: false, code: 'COMMAND_PAYLOAD_INVALID', message: 'payload must be an object.' }
  return { ok: true, value: input }
}

export function validateActionPayload(action, payload = {}) {
  if (!SHARED_ACTION_SET.has(action)) return { ok: false, code: 'ACTION_NOT_ENABLED', message: 'Action is not enabled.' }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, code: 'PAYLOAD_INVALID', message: 'Payload must be an object.' }
  const text = (name, max = 1200, required = false) => {
    const value = payload[name]
    if (value == null && !required) return true
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max
  }
  if (['RECOMMEND_COMPLETION', 'RETURN_TO_TEAM', 'REVIEW_PARTNER_COMPLETION', 'RETURN_TO_MANAGER'].includes(action) && !text('rationale', 1200, true) && !text('reason', 1200, true)) {
    return { ok: false, code: 'RATIONALE_REQUIRED', message: 'A rationale or correction reason is required.' }
  }
  if (action === 'RECORD_FINAL_DISCUSSION' && !text('date', 40, true)) return { ok: false, code: 'DATE_REQUIRED', message: 'A discussion date is required.' }
  if (action === 'RECORD_FINAL_DISCUSSION' && (!text('attendees', 400, true) || !text('topics', 1200, true) || !text('outcome', 1200, true))) {
    return { ok: false, code: 'DISCUSSION_DETAILS_REQUIRED', message: 'Record attendees, topics and outcome for the final discussion.' }
  }
  if (action === 'VERIFY_RELEASE_CHECKPOINT' && !text('releaseId', 80, true)) return { ok: false, code: 'RELEASE_ID_REQUIRED', message: 'A releaseId is required.' }
  if (action === 'DELIVER_FINAL_REPORT' && !text('releaseId', 80, true)) return { ok: false, code: 'RELEASE_ID_REQUIRED', message: 'A releaseId is required.' }
  if (action === 'ASSEMBLE_ARCHIVE' && !text('releaseId', 80, true)) return { ok: false, code: 'RELEASE_ID_REQUIRED', message: 'A releaseId is required to bind the archive to the release.' }
  return { ok: true, value: payload }
}

export function normalizeOutcome(result = {}) {
  const outcome = String(result.outcome || '').toUpperCase()
  if (!['COMMITTED', 'REJECTED', 'UNCERTAIN'].includes(outcome)) return { outcome: 'UNCERTAIN', code: 'COMMIT_UNCONFIRMED' }
  return { ...result, outcome }
}

export function digestPayload(payload, canonicalizeImpl = null) {
  const raw = canonicalizeImpl ? canonicalizeImpl(payload) : JSON.stringify(payload)
  return { raw, valid: typeof raw === 'string' && raw.length > 0, digest: DIGEST.test(raw) ? raw : '' }
}
