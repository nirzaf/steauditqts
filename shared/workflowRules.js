// M7 PIPE-01 / APPROVAL-02 — pure business rules shared by projections and
// command handlers. No Vue, Request/Response, storage or D1 imports.

const BLOCKED = new Set(['BLOCKED', 'STALE', 'RETURNED', 'REJECTED'])

// Exact target/version comparison used by completion and release gates. The
// Worker repository must normalize its current candidate before calling this.
export function approvalMatches(decision, target, acceptedValues = []) {
  return Boolean(decision && target && typeof target.id === 'string' && target.id
    && Number.isSafeInteger(target.version) && target.version >= 1
    && typeof target.contentHash === 'string' && target.contentHash
    && Number.isSafeInteger(target.inputGeneration) && target.inputGeneration >= 1
    && typeof target.policyVersion === 'string' && target.policyVersion
    && acceptedValues.includes(decision.decision)
    && decision.targetId === target.id
    && Number(decision.targetVersion) === target.version
    && decision.contentHash === target.contentHash
    && Number(decision.inputGeneration) === target.inputGeneration
    && decision.policyVersion === target.policyVersion)
}

export function evaluateCompletion(snapshot = {}, { forRelease = false } = {}) {
  const s = snapshot || {}
  const blockers = []
  const need = (ok, code, owner, message, targetId = '') => {
    if (!ok) blockers.push({ code, owner, message, targetId })
  }
  need(s.readModelComplete === true, 'SNAPSHOT_INCOMPLETE', 'system_admin', 'Refresh the complete workspace.')
  need(s.service === 'AUDIT', 'SERVICE_NOT_APPLICABLE', 'system_admin', 'Use the accounting-only completion route.')
  need(s.acceptanceClear === true, 'ACCEPTANCE_BLOCKED', 'compliance_reviewer', 'Resolve acceptance evidence and decision.')
  need(s.termsAccepted === true, 'TERMS_REQUIRED', 'management_approver', 'Accept the current engagement terms.')
  need(s.planApproved === true && s.pbcReady === true, 'FIELDWORK_NOT_READY', 'audit_manager', 'Approve the plan and critical evidence.')
  need(s.accountingReady === true, 'ACCOUNTING_NOT_READY', 'accounting_reviewer', 'Complete accounting review and handoff.')
  need(s.workpapersReviewed === true, 'WORKPAPER_REVIEW_REQUIRED', 'audit_manager', 'Review the required workpaper versions.')
  need(Number(s.openBlockingReviewCount || 0) === 0, 'REVIEW_POINTS_OPEN', 'audit_manager', 'Resolve blocking review points.')
  need(s.informationResponsesEvaluated === true, 'MANAGEMENT_REQUEST_PENDING', 'audit_manager', 'Evaluate management responses or the approved exception path.')
  const target = s.candidate
  need(Boolean(target?.id && target?.version && target?.contentHash), 'CANDIDATE_REQUIRED', 'audit_senior', 'Prepare an exact candidate.', target?.id || '')
  need(Number.isSafeInteger(s.inputGeneration) && s.inputGeneration >= 1
    && s.inputGeneration === s.evaluatedInputGeneration
    && target?.inputGeneration === s.inputGeneration, 'INPUTS_STALE', 'audit_manager', 'Re-evaluate the changed accounting or audit inputs.', target?.id || '')
  need(target?.policyVersion === s.policyVersion && Boolean(s.policyVersion), 'POLICY_STALE', 'audit_manager', 'Re-evaluate the current policy version.', target?.id || '')
  need(approvalMatches(s.managementResponse, target, ['ACCEPT']), 'CLIENT_RESPONSE_REQUIRED', 'management_approver', 'Obtain the current client response, not acceptance of an older draft.', target?.id || '')
  need(approvalMatches(s.managerCompletion, target, ['RECOMMEND_COMPLETE']), 'MANAGER_COMPLETION_REQUIRED', 'audit_manager', 'Record the manager completion recommendation.', target?.id || '')
  need(approvalMatches(s.partnerReview, target, ['APPROVE_FOR_OPINION']), 'PARTNER_REVIEW_REQUIRED', 'engagement_partner', 'Review the exact manager handoff.', target?.id || '')
  if (forRelease) {
    need(typeof s.eqrRequired === 'boolean', 'EQR_POLICY_UNKNOWN', 'engagement_partner', 'Record EQR applicability.', target?.id || '')
    need(s.eqrRequired === false || approvalMatches(s.eqr, target, ['APPROVE']), 'EQR_NOT_CURRENT', 'eqr_reviewer', 'Complete EQR for this exact candidate.', target?.id || '')
    need(approvalMatches(s.opinion, target, ['UNMODIFIED', 'QUALIFIED', 'ADVERSE', 'DISCLAIMER']), 'OPINION_NOT_CURRENT', 'engagement_partner', 'Bind the professional opinion to this candidate.', target?.id || '')
    need(s.finalDiscussionCurrent === true, 'FINAL_DISCUSSION_REQUIRED', 'engagement_partner', 'Record the final client discussion.', target?.id || '')
    need(s.protectedArtifactsMatch === true, 'ARTIFACT_PROTECTION_REQUIRED', 'records_custodian', 'Verify the exact final report/FS pair in simulation.', target?.id || '')
    need(s.releaseHold === false, 'RELEASE_HOLD', 'engagement_partner', 'Resolve the action-specific release hold.', target?.id || '')
  }
  return { allowed: blockers.length === 0, blockers, warnings: [], nextActions: blockers.slice(0, 1).map((item) => ({ action: item.code, targetId: item.targetId, requiredRole: item.owner })) }
}

export function blocker(code, message, responsibleRole = '', targetId = '') {
  return { code, message, responsibleRole, targetId }
}

export function validateTransition({ action, actorRoles = [], allowedRoles = [], prerequisites = [], targetId = '' } = {}) {
  const blockers = []
  if (!String(action || '').trim()) blockers.push(blocker('ACTION_REQUIRED', 'Choose a registered action.', '', targetId))
  if (!allowedRoles.some((role) => actorRoles.includes(role))) blockers.push(blocker('ROLE_NOT_AUTHORIZED', 'The current effective actor is not authorized for this action.', allowedRoles[0] || '', targetId))
  for (const prerequisite of Array.isArray(prerequisites) ? prerequisites : []) {
    if (!prerequisite?.satisfied) blockers.push(blocker(prerequisite.code || 'PRECONDITION_FAILED', prerequisite.message || 'A required prerequisite is not satisfied.', prerequisite.role || '', prerequisite.targetId || targetId))
  }
  return { allowed: blockers.length === 0, blockers, warnings: [], nextActions: blockers.length ? blockers.slice(0, 1).map((item) => ({ action, targetId: item.targetId || targetId, requiredRole: item.responsibleRole })) : [] }
}

export function validateVersionBinding({ candidate, expectedGenerationId, expectedRevision, targetId, targetRevision, targetHash } = {}) {
  const blockers = []
  if (!candidate) blockers.push(blocker('TARGET_NOT_FOUND', 'The selected candidate is no longer available.', 'owner', targetId))
  if (candidate && expectedGenerationId && candidate.generationId !== expectedGenerationId) blockers.push(blocker('GENERATION_CONFLICT', 'The candidate belongs to another demo generation.', 'owner', targetId))
  if (candidate && Number.isSafeInteger(expectedRevision) && Number(candidate.revision) !== expectedRevision) blockers.push(blocker('REVISION_CONFLICT', 'The record changed since it was loaded.', 'owner', targetId))
  if (candidate && targetRevision != null && Number(candidate.targetRevision) !== Number(targetRevision)) blockers.push(blocker('TARGET_VERSION_STALE', 'The decision target is not the current version.', 'owner', targetId))
  if (candidate && targetHash && candidate.contentHash && candidate.contentHash !== targetHash) blockers.push(blocker('TARGET_HASH_MISMATCH', 'The decision target content changed.', 'owner', targetId))
  return { allowed: blockers.length === 0, blockers, warnings: [], nextActions: [] }
}

export function deriveApprovalReadiness({ required = [], decisions = [], generationId = '', revision = 0 } = {}) {
  const rows = Array.isArray(required) ? required : []
  const list = Array.isArray(decisions) ? decisions : []
  const current = list.filter((decision) => (!generationId || decision.generationId === generationId) && (!revision || Number(decision.revision) <= Number(revision)))
  const missing = rows.filter((requiredDecision) => !current.some((decision) => decision.decisionType === requiredDecision.decisionType && decision.targetId === requiredDecision.targetId && ['APPROVE', 'ACCEPT', 'COMMITTED', 'RECOMMEND_COMPLETE', 'RELEASED'].includes(String(decision.decision || '').toUpperCase())))
  const stale = list.filter((decision) => generationId && decision.generationId && decision.generationId !== generationId)
  return { ready: missing.length === 0 && stale.length === 0, required: rows.length, approved: rows.length - missing.length, missing, stale }
}

export function canRelease({ progress = {}, release = {}, candidate = {} } = {}) {
  const blockers = []
  if (!progress.valid) blockers.push(blocker('PROCESS_INVALID', 'Resolve the process integrity blockers before release.', 'audit_manager', candidate.id || ''))
  if (!release.opinionCurrent) blockers.push(blocker('OPINION_REQUIRED', 'A current Partner opinion is required.', 'engagement_partner', candidate.id || ''))
  if (release.eqrRequired && !release.eqrCurrent) blockers.push(blocker('EQR_REQUIRED', 'The required EQR approval is not bound to this candidate.', 'eqr_reviewer', candidate.id || ''))
  if (!release.finalDiscussion) blockers.push(blocker('FINAL_DISCUSSION_REQUIRED', 'Record the final client discussion before release.', 'engagement_partner', candidate.id || ''))
  if (release.checkpointBeforeDelivery && release.delivered && !release.checkpointVerified) blockers.push(blocker('CHECKPOINT_REQUIRED', 'Verify the release checkpoint before delivery.', 'records_custodian', release.releaseId || candidate.id || ''))
  return { allowed: blockers.length === 0, blockers, warnings: [], nextActions: blockers.slice(0, 1).map((item) => ({ action: item.code, targetId: item.targetId, requiredRole: item.responsibleRole })) }
}

export function stageFromEvidence(snapshot = {}) {
  const gates = snapshot.gates || {}
  if (gates.archive) return 'STAGE-08'
  if (gates.release) return 'STAGE-08'
  if (gates.opinion || gates.eqr || gates.finalDiscussion) return 'STAGE-07'
  if (gates.workpapers || gates.draftFs) return 'STAGE-06'
  if (gates.pbc || gates.accounting) return 'STAGE-05'
  if (gates.plan) return 'STAGE-04'
  if (gates.activation) return 'STAGE-03'
  if (gates.commercial) return 'STAGE-02'
  return 'STAGE-01'
}

export function classifyTaskState(state) {
  const normalized = String(state || 'OPEN').toUpperCase()
  return BLOCKED.has(normalized) ? 'BLOCKED' : normalized === 'COMPLETE' ? 'COMPLETE' : 'OPEN'
}
