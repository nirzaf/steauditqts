import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activationBlockers,
  accountingPackageFor,
  advanceRelease,
  completeSyntheticCredentialSetup,
  commercialRecordFor,
  createPbcRequest,
  clearReviewPoint,
  createWorkpaperDraft,
  createReleaseCheckpoint,
  deriveGates,
  deriveSeniorReviewGate,
  issueSyntheticCredential,
  recordClientInformationResponse,
  recordCompletionRecommendation,
  recordDraftFsDecision,
  recordHardCopyReadiness,
  recordPbcUpload,
  recordRoleTaskAction,
  recordSeniorReview,
  recordTerms,
  recordTermsDecision,
  replaceAccountingSource,
  releaseCandidateBlockers,
  recordLegalHold,
  resetScenario,
  scenario,
  selectedEngagement,
  selectEngagement,
  setActivePersona,
  submitWorkpaper,
  termsAcceptedFor,
  termsFor,
  verifyAdvancePayment,
} from '../src/domain/scenario.js'
import { fixtureRows, mappingSummary, parseCsv, baselineFixture } from '../src/domain/accounting.js'
import { traceabilityCounts, traceabilitySummary } from '../src/domain/traceability.js'

test.beforeEach(() => {
  resetScenario()
  setActivePersona('admin-demo')
})

test('RT-01 reviewer and records personas have useful authority without admin inflation', () => {
  setActivePersona('audit-senior-demo')
  assert.equal(recordRoleTaskAction({ taskId: 'RT-01-TIME', action: 'TIME_ENTRY', actorPersonaId: 'audit-senior-demo', expectedSessionEpoch: 1, idempotencyKey: 'rt01-time' }).outcome, 'COMMITTED')
  setActivePersona('system-admin-only-demo')
  assert.equal(recordRoleTaskAction({ taskId: 'RT-01-TIME-DENIED', action: 'TIME_ENTRY', actorPersonaId: 'system-admin-only-demo', expectedSessionEpoch: 1, idempotencyKey: 'rt01-time-denied' }).code, 'TIME_ENTRY_AUTHORITY_REQUIRED')
  setActivePersona('records-demo')
  assert.equal(recordRoleTaskAction({ taskId: 'RT-01-RECORDS', action: 'TASK_ACKNOWLEDGED', actorPersonaId: 'records-demo', expectedSessionEpoch: 1, idempotencyKey: 'rt01-records' }).outcome, 'COMMITTED')
})

test('RT-02 persona switch cannot retain an unauthorized client scope', () => {
  assert.equal(selectedEngagement().id, 'ENG-0018-AUD-2026')
  setActivePersona('accountant-demo')
  assert.equal(selectedEngagement().id, 'ENG-0018-ACC-2026')
  assert.equal(scenario.selectedEngagementId, 'ENG-0018-ACC-2026')
})

test('RT-03 an engagement without a candidate never falls back to another candidate', () => {
  scenario.releaseCandidates = scenario.releaseCandidates.filter((candidate) => candidate.engagementId !== 'ENG-0009-ACC-2026')
  setActivePersona('accountant-demo')
  assert.equal(selectEngagement('ENG-0009-ACC-2026', { actorPersonaId: 'accountant-demo' }).outcome, 'COMMITTED')
  assert.equal(releaseCandidateBlockers('RC-READY-001')[0].code, 'CANDIDATE_NOT_FOUND')
})

test('RT-04 accountant audit-route access follows assignment policy', () => {
  setActivePersona('accountant-demo')
  const denied = selectEngagement('ENG-0018-AUD-2026', { actorPersonaId: 'accountant-demo' })
  assert.equal(denied.code, 'SCOPE_DENIED')
})

test('RT-05 PBC replacement and hard-copy readiness preserve separate states', async () => {
  const upload = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 1, period: 'FY2026', idempotencyKey: 'rt05-upload', content: 'RT05|PBC-023|FY2026' })
  assert.equal(upload.outcome, 'COMMITTED')
  const ready = recordHardCopyReadiness({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 2, expectedSessionEpoch: 1, idempotencyKey: 'rt05-hard-copy', state: 'READY_FOR_COLLECTION', note: 'Physical count sheets are ready.' })
  assert.equal(ready.outcome, 'COMMITTED')
  const replacement = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 3, period: 'FY2026', idempotencyKey: 'rt05-replacement', content: 'RT05|PBC-023|FY2026|replacement' })
  assert.equal(replacement.outcome, 'COMMITTED')
  const request = scenario.pbcRequests.find((item) => item.id === 'PBC-023')
  assert.equal(request.state, 'REPLACEMENT_RECEIVED')
  assert.equal(request.hardCopyState, 'READY_FOR_COLLECTION')
  assert.equal(request.receipts.length, 2)
})

test('RT-06 portal eligibility is held until accepted terms and advance evidence exist', () => {
  const blockers = activationBlockers('ENG-0018-AUD-2026')
  assert.ok(blockers.some((blocker) => blocker.code === 'ACCEPTANCE_DECISION_REQUIRED'))
  assert.ok(blockers.some((blocker) => blocker.code === 'ADVANCE_VERIFICATION_REQUIRED'))
})

test('Engagement Letter decisions stay bound to the exact version and scoped approver', () => {
  setActivePersona('client-management-demo')
  let current = selectedEngagement()
  const changes = recordTermsDecision({ engagementId: current.id, actorPersonaId: 'client-management-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'terms-version-changes', version: 'EL-2026-01', decision: 'REQUEST_CHANGES', rationale: 'Correct the registered address before signing.' })
  assert.equal(changes.outcome, 'COMMITTED')
  assert.equal(termsFor(current.id).state, 'REVISION_REQUIRED')
  assert.equal(termsAcceptedFor(current.id), false)
  assert.equal(activationBlockers(current.id).some((item) => item.code === 'CLIENT_TERMS_ACCEPTANCE_REQUIRED'), true)

  current = selectedEngagement()
  const reissued = recordTerms({ engagementId: current.id, actorPersonaId: 'client-management-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'terms-version-reissue', version: 'EL-2026-02' })
  assert.equal(reissued.outcome, 'COMMITTED')
  assert.equal(termsFor(current.id).clientDecision.decision, 'PENDING')

  current = selectedEngagement()
  const accepted = recordTermsDecision({ engagementId: current.id, actorPersonaId: 'client-management-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'terms-version-accept', version: 'EL-2026-02', decision: 'ACCEPT', rationale: 'Approved the exact revised engagement letter.' })
  assert.equal(accepted.outcome, 'COMMITTED')
  assert.equal(termsAcceptedFor(current.id), true)
  assert.equal(termsFor(current.id).clientDecision.version, 'EL-2026-02')
})

test('audit manager can record a conditional completion recommendation with visible blockers', async () => {
  setActivePersona('audit-manager-demo')
  let current = selectedEngagement()
  const denied = recordCompletionRecommendation({ engagementId: current.id, actorPersonaId: 'client-management-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-denied', decision: 'RECOMMEND', rationale: 'Reviewed the current file and blockers.' })
  assert.equal(denied.outcome, 'DENIED')
  assert.equal(denied.code, 'COMPLETION_AUTHORITY_REQUIRED')

  // Submit both workpapers through the domain command first: with nothing
  // submitted the shared prerequisite order reports NO_SUBMITTED_WORKPAPERS.
  let wp = scenario.workpapers.find((item) => item.id === 'WP-AR-01')
  const submittedAr = await submitWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'preparer-demo', expectedRevision: wp.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-submit-ar' })
  assert.equal(submittedAr.outcome, 'COMMITTED')
  wp = scenario.workpapers.find((item) => item.id === 'WP-INV-01')
  const submittedInv = await submitWorkpaper({ workpaperId: 'WP-INV-01', actorPersonaId: 'preparer-demo', expectedRevision: wp.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-submit-inv' })
  assert.equal(submittedInv.outcome, 'COMMITTED')

  // P8A — Senior Review is a hard prerequisite: a RECOMMEND is blocked while
  // submitted workpapers have not been cleared by an Audit Senior.
  current = selectedEngagement()
  const blockedBySeniorGate = recordCompletionRecommendation({ engagementId: current.id, actorPersonaId: 'audit-manager-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-senior-gate', decision: 'RECOMMEND', rationale: 'Attempting completion before senior review.' })
  assert.equal(blockedBySeniorGate.outcome, 'BLOCKED')
  assert.ok((blockedBySeniorGate.blockers || []).some((blocker) => blocker.code === 'SENIOR_REVIEW_REQUIRED'))

  assert.equal(recordSeniorReview({ engagementId: current.id, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', expectedSessionEpoch: 1, idempotencyKey: 'completion-senior-ar', decision: 'PASSED' }).outcome, 'COMMITTED')
  assert.equal(recordSeniorReview({ engagementId: current.id, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', expectedSessionEpoch: 1, idempotencyKey: 'completion-senior-inv', decision: 'PASSED' }).outcome, 'COMMITTED')
  assert.equal(deriveSeniorReviewGate(current.id).complete, true)

  // Open review points are a shared hard prerequisite too: both demo modes must
  // refuse a recommendation while a point is unresolved.
  const blockedByReviewPoints = recordCompletionRecommendation({ engagementId: current.id, actorPersonaId: 'audit-manager-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-review-points', decision: 'RECOMMEND', rationale: 'Senior review is clear but review points remain open.' })
  assert.equal(blockedByReviewPoints.outcome, 'BLOCKED')
  assert.ok((blockedByReviewPoints.blockers || []).some((blocker) => blocker.code === 'REVIEW_POINTS_OPEN'))
  for (const pointId of ['RP-042', 'RP-047']) {
    const cleared = clearReviewPoint({ pointId, actorPersonaId: 'independent-reviewer-demo', expectedSessionEpoch: 1, idempotencyKey: `completion-clear-${pointId}`, response: 'Independent re-performance resolved the point; evidence is attached to the current snapshot.' })
    assert.equal(cleared.outcome, 'COMMITTED')
  }

  current = selectedEngagement()
  const recorded = recordCompletionRecommendation({ engagementId: current.id, actorPersonaId: 'audit-manager-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'completion-manager', decision: 'RECOMMEND', rationale: 'Reviewed exact snapshots; partner and EQR blockers remain visible.' })
  assert.equal(recorded.outcome, 'COMMITTED')
  assert.equal(recorded.data.status, 'CONDITIONAL')
  assert.ok(recorded.data.blockers.length > 0)
  assert.ok(!recorded.data.blockers.some((blocker) => blocker.code === 'SENIOR_REVIEW_REQUIRED'))
  assert.equal(scenario.engagements.find((item) => item.id === current.id).evidence.completionRecommendation.decision, 'RECOMMEND')
})

test('RT-07 unknown account mapping reduces truthful coverage and keeps review required', () => {
  const rows = fixtureRows(baselineFixture, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: 'RT07' })
  rows[0].accountCode = '000999'
  const summary = mappingSummary(rows, { '110100': 'Trade receivables' })
  assert.equal(summary.required, 14)
  assert.equal(summary.mapped, 1)
  assert.equal(summary.unmapped, 13)
  assert.equal(summary.state, 'REVIEW_REQUIRED')
})

test('RT-08 Cedar source intake uses Cedar scope and rejects Northstar scope', () => {
  setActivePersona('accountant-demo')
  const cedarRows = fixtureRows(baselineFixture, { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR', sourceId: 'RT08-CEDAR' })
  const accepted = replaceAccountingSource({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'accountant-demo', expectedRevision: 1, idempotencyKey: 'rt08-cedar', sourceId: 'RT08-CEDAR', rows: cedarRows })
  assert.equal(accepted.outcome, 'COMMITTED')
  const wrong = replaceAccountingSource({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'accountant-demo', expectedRevision: 2, idempotencyKey: 'rt08-wrong', sourceId: 'RT08-NORTHSTAR', rows: fixtureRows(baselineFixture, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: 'RT08-NORTHSTAR' }) })
  assert.equal(wrong.code, 'SOURCE_SCOPE_MISMATCH')
})

test('RT-09 Draft FS rejection is recorded and creates a revision task', () => {
  const packageRecord = accountingPackageFor('ENG-0018-ACC-2026')
  packageRecord.statement.components = { balanceSheet: 'DERIVED', incomeStatement: 'DERIVED', cashFlow: 'PROVIDED', comparatives: 'PROVIDED', disclosures: 'PROVIDED' }
  packageRecord.statement.state = 'READY_FOR_APPROVAL'
  setActivePersona('client-management-demo')
  const rejected = recordDraftFsDecision({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'client-management-demo', expectedRevision: packageRecord.revision, expectedSessionEpoch: 1, idempotencyKey: 'rt09-reject', decision: 'REQUEST_CHANGES', rationale: 'Please correct the receivables note before approval.' })
  assert.equal(rejected.outcome, 'COMMITTED')
  assert.equal(accountingPackageFor('ENG-0018-ACC-2026').statement.state, 'REVISION_REQUIRED')
  assert.equal(accountingPackageFor('ENG-0018-ACC-2026').statement.revisionTasks.length, 1)
})

test('RT-10 release labels require retained release records', () => {
  const candidate = scenario.releaseCandidates.find((item) => item.id === 'RC-READY-001')
  assert.equal(candidate.releaseEventId, null)
  assert.equal(candidate.deliveryState, 'NOT_STARTED')
  assert.equal(candidate.archiveState, 'NOT_STARTED')
  assert.ok(releaseCandidateBlockers(candidate.id).every((blocker) => blocker.code !== 'RELEASE_EVENT_COMMITTED'))
})

test('RT-11 a new delivery blocker after checkpoint prevents delivery', () => {
  setActivePersona('admin-demo')
  assert.equal(selectEngagement('ENG-0009-ACC-2026', { actorPersonaId: 'admin-demo' }).outcome, 'COMMITTED')
  const candidate = scenario.releaseCandidates.find((item) => item.id === 'RC-READY-001')
  for (let index = 0; index < 6; index += 1) {
    assert.equal(advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: `rt11-${index}` }).outcome, 'COMMITTED')
  }
  const current = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  const event = advanceRelease({ candidateId: current.id, actorPersonaId: 'admin-demo', expectedRevision: current.revision, idempotencyKey: 'rt11-event' })
  assert.equal(event.outcome, 'COMMITTED')
  const checkpoint = createReleaseCheckpoint({ candidateId: current.id, actorPersonaId: 'compliance-demo', expectedRevision: current.revision, expectedSessionEpoch: 1, idempotencyKey: 'rt11-checkpoint' })
  assert.equal(checkpoint.outcome, 'COMMITTED')
  const refreshed = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  scenario.engagements.find((item) => item.id === 'ENG-0009-ACC-2026').holds.push({ id: 'RT11-HOLD', code: 'LATE_DELIVERY_HOLD', message: 'Synthetic delivery restriction added after checkpoint.' })
  const blocked = advanceRelease({ candidateId: refreshed.id, actorPersonaId: 'admin-demo', expectedRevision: refreshed.revision, idempotencyKey: 'rt11-delivery' })
  assert.equal(blocked.code, 'LATE_DELIVERY_HOLD')
})

test('RT-12 disposal-only legal hold does not block issuance or delivery', () => {
  setActivePersona('compliance-demo')
  const hold = recordLegalHold({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'compliance-demo', expectedRevision: 1, expectedSessionEpoch: 1, idempotencyKey: 'rt12-hold', blocksActions: ['DISPOSAL'], reason: 'Synthetic preservation only.' })
  assert.equal(hold.outcome, 'COMMITTED')
  assert.equal(releaseCandidateBlockers('RC-READY-001').some((blocker) => blocker.code === 'LEGAL_HOLD_ACTIVE'), false)
})

test('RT-13 replay under a revoked actor cannot return the prior result', () => {
  setActivePersona('system-admin-only-demo')
  const first = recordRoleTaskAction({ taskId: 'RT13', action: 'TASK_ACKNOWLEDGED', actorPersonaId: 'system-admin-only-demo', expectedSessionEpoch: 1, idempotencyKey: 'rt13-key' })
  assert.equal(first.outcome, 'COMMITTED')
  scenario.actors.find((actor) => actor.personaId === 'system-admin-only-demo').active = false
  const replay = recordRoleTaskAction({ taskId: 'RT13', action: 'TASK_ACKNOWLEDGED', actorPersonaId: 'system-admin-only-demo', expectedSessionEpoch: 1, idempotencyKey: 'rt13-key' })
  assert.equal(replay.outcome, 'DENIED')
  assert.equal(replay.code, 'ACTOR_INACTIVE')
})

test('RT-14 old session epoch cannot submit protected workpaper', async () => {
  setActivePersona('audit-manager-demo')
  const stale = await submitWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, expectedSessionEpoch: 0, idempotencyKey: 'rt14-stale', content: 'stale snapshot' })
  assert.equal(stale.code, 'SESSION_EPOCH_STALE')
})

test('RT-15 same-revision async captures publish one current snapshot', async () => {
  setActivePersona('audit-manager-demo')
  const first = await submitWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, expectedSessionEpoch: 1, idempotencyKey: 'rt15-a', content: 'same revision A' })
  const second = await submitWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, expectedSessionEpoch: 1, idempotencyKey: 'rt15-b', content: 'same revision B' })
  assert.equal(first.outcome, 'COMMITTED')
  assert.equal(second.code, 'REVISION_CONFLICT')
})

test('RT-16 persistence failures are represented by an explicit unavailable result contract', () => {
  const reset = resetScenario()
  assert.ok(['COMMITTED', 'UNAVAILABLE'].includes(reset.outcome))
  assert.equal(reset.evidenceLevel, 'SIMULATION')
})

test('RT-17 committed records remain in the scenario after the command completes', () => {
  setActivePersona('finance-demo')
  const before = scenario.events.length
  const result = verifyAdvancePayment({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'finance-demo', expectedRevision: commercialRecordFor('ENG-0018-AUD-2026').revision, expectedSessionEpoch: 1, idempotencyKey: 'rt17-advance' })
  assert.equal(result.outcome, 'COMMITTED')
  assert.equal(scenario.events.length, before + 1)
  assert.equal(commercialRecordFor('ENG-0018-AUD-2026').advanceState, 'VERIFIED')
})

test('RT-18 archive verification cannot satisfy commercial close', () => {
  const gates = deriveGates('ENG-0018-AUD-2026')
  assert.notEqual(gates.find((gate) => gate.id === 'G9').status, 'good')
  scenario.engagements.find((item) => item.id === 'ENG-0018-AUD-2026').evidence.archiveVerified = true
  assert.notEqual(deriveGates('ENG-0018-AUD-2026').find((gate) => gate.id === 'G9').status, 'good')
})

test('RT-19 exact artifact reference remains stable after a working-version edit', () => {
  const before = scenario.documents.find((doc) => doc.id === 'DOC-AR-019')
  const originalSnapshot = before.snapshotId
  before.workingHash = 'sha256:edited-working-copy'
  assert.equal(before.snapshotId, originalSnapshot)
})

test('RT-20 shared mode remains disabled in the synthetic scenario', () => {
  assert.equal(scenario.provider.enableExternalEffects, false)
  assert.equal(scenario.recovery.outwardEffectsEnabled, false)
})

test('RT-21 the same primary engagement is addressable by every required role', () => {
  for (const personaId of ['client-demo', 'client-management-demo', 'audit-senior-demo', 'audit-manager-demo', 'partner-demo', 'finance-demo', 'accountant-demo', 'eqr-demo', 'records-demo']) {
    setActivePersona(personaId)
    assert.ok(selectedEngagement(), `${personaId} has a selected assigned engagement`)
  }
})

test('RT-22 traceability separates mapped/executed counts from the 160 acceptance IDs and P0 experiments', () => {
  assert.deepEqual(traceabilityCounts, { AT: 28, ET: 44, VT: 24, BT: 64, P0: 12, acceptanceTotal: 160, total: 172 })
  const summary = traceabilitySummary(['AT-01', 'BT-01', 'P0-01'])
  assert.equal(summary.executed, 3)
  assert.equal(summary.remaining, 169)
  assert.equal(summary.groups.P0.remaining, 11)
})

test('F06 primary create actions create scoped draft records', () => {
  const request = createPbcRequest({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'audit-senior-demo', expectedSessionEpoch: 1, idempotencyKey: 'f06-pbc', title: 'Payroll completeness support', due: '2026-09-20' })
  assert.equal(request.outcome, 'COMMITTED')
  assert.equal(scenario.pbcRequests.some((item) => item.id === request.data.id && item.state === 'OPEN'), true)
  const workpaper = createWorkpaperDraft({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'audit-senior-demo', expectedSessionEpoch: 1, idempotencyKey: 'f06-wp', title: 'Payroll completeness testing', procedureId: 'PROC-PAY-01' })
  assert.equal(workpaper.outcome, 'COMMITTED')
  assert.equal(scenario.workpapers.some((item) => item.id === workpaper.data.id && item.state === 'DRAFT'), true)
  const denied = createPbcRequest({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'finance-demo', expectedSessionEpoch: 1, idempotencyKey: 'f06-pbc-denied', title: 'Should be denied' })
  assert.equal(denied.code, 'PBC_REQUEST_AUTHORITY_REQUIRED')
})

test('information responses are scoped, versioned and visible as a separate handoff', () => {
  setActivePersona('client-management-demo')
  const result = recordClientInformationResponse({ informationRequestId: 'MIR-0018-01', actorPersonaId: 'client-management-demo', expectedRevision: 1, expectedSessionEpoch: 1, idempotencyKey: 'mir-response-test', response: 'Management confirms the receivables ageing and provides the supporting receipt schedule.' })
  assert.equal(result.outcome, 'COMMITTED')
  assert.equal(scenario.informationRequests[0].state, 'RESPONDED')
  assert.equal(scenario.informationRequests[0].response.actorId, 'ACT-NADIA-MGMT')
})

test('parseCsv accepts the selected scope rather than a hard-coded Northstar scope', () => {
  const csv = ['account_code,account_name,area,debit,credit', '100101,Bank,Cash,1.00,0.00', '200100,Payables,Payables,0.00,1.00'].join('\n')
  const parsed = parseCsv(csv, { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR', sourceId: 'RT-SCOPE' })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.rows[0].entityId, 'CLI-0009')
})
