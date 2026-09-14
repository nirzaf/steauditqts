// A deliberately explicit, browser-local rehearsal of the small v4 vertical
// slice.  This is an orchestration helper for the demonstrator, not a second
// workflow engine: each step delegates to the same scoped domain commands used
// by the pages and records the returned outcome as evidence.
import {
  activateEngagement,
  advanceRelease,
  captureRecoveryBackup,
  createContinuanceShell,
  createReleaseCheckpoint,
  assembleArchive,
  engagementById,
  assessmentSummary,
  mutateAccountingInput,
  pauseImpactProcessing,
  recordAssessmentDecision,
  recordPbcUpload,
  recordRenewalDecision,
  recordTerms,
  releaseCandidateBlockers,
  replaceAccountingSource,
  resetScenario,
  resumeImpactProcessing,
  restoreRecoveryBackup,
  reconcileRecovery,
  resumeRecovery,
  reviewPbcReceipt,
  reviewWorkpaper,
  runIntegrationReconciliation,
  retryIntegrationOperation,
  scenario,
  SCENARIO_STORAGE_KEY,
  selectEngagement,
  setActivePersona,
  setProviderSimulation,
  saveAssessmentResponse,
  submitWorkpaper,
} from './scenario.js'
import { baselineFixture, fixtureRows, replacementFixture } from './accounting.js'
import { traceabilitySummary } from './traceability.js'

const now = () => new Date().toISOString()

const STEP_COVERAGE = Object.freeze({
  'P06-HOLD': ['AT-01'],
  'P07-PROHIBITION-BLOCK': ['AT-02'],
  'P09-UPLOAD': ['P0-05'],
  'P11-BASELINE': ['P0-07'],
  'P12-AJ001-REUPLOAD': ['AT-10', 'ET-27', 'VT-16', 'P0-07'],
  'P15-REVIEW': ['ET-30'],
  'P16-STALE-BLOCK': ['VT-04', 'VT-08', 'P0-06'],
  'P08-SHELL': ['AT-06', 'AT-28', 'ET-43'],
  'P08-NON-RENEW': ['AT-06'],
  'P19-RETRYABLE': ['ET-20', 'P0-10'],
  'P19-RETRY': ['VT-15', 'P0-10'],
  'P17-RELEASE-EVENT': ['ET-36', 'P0-11'],
  'P17-CHECKPOINT': ['P0-11'],
  'P20-RESUME': ['ET-41', 'VT-23', 'VT-24', 'P0-11'],
})

function outcomeMatches(result, expected) {
  if (typeof expected === 'function') return Boolean(expected(result))
  return Array.isArray(expected) ? expected.includes(result?.outcome) : result?.outcome === expected
}

function addStep(steps, id, label, result, expected = 'COMMITTED', detail = '') {
  const passed = outcomeMatches(result, expected)
  steps.push({
    id,
    label,
    status: passed ? 'PASS' : 'FAIL',
    outcome: result?.outcome || 'OBSERVED',
    code: result?.code || null,
    message: result?.message || detail || '',
    operationId: result?.operationId || null,
    evidenceLevel: result?.evidenceLevel || 'SIMULATION',
    coverage: STEP_COVERAGE[id] || [],
  })
  return result
}

function addObservation(steps, id, label, passed, detail, code = null) {
  steps.push({
    id,
    label,
    status: passed ? 'PASS' : 'FAIL',
    outcome: 'OBSERVED',
    code,
    message: detail,
    operationId: null,
    evidenceLevel: 'SIMULATION',
    coverage: STEP_COVERAGE[id] || [],
  })
}

function actor(personaId) {
  setActivePersona(personaId)
  return personaId
}

/**
 * Run the complete synthetic vertical slice from a clean demo state.
 *
 * `reset` is intentionally explicit.  The browser UI labels this action as a
 * clean rehearsal and the reset is separate from every professional command;
 * no release, approval or records operation can use this helper as a hidden
 * status setter.  The function never calls a network/API route.
 */
export async function runSyntheticCycle({ reset = true } = {}) {
  const steps = []
  const startedAt = now()
  const startingPersonaId = scenario.activePersonaId || 'admin-demo'
  if (reset) {
    addStep(steps, 'M4-RESET', 'Reset synthetic scenario', resetScenario(), 'COMMITTED', 'The demo-only scenario was reset before the rehearsal.')
  } else {
    addObservation(steps, 'M4-RESET-SKIPPED', 'Use current synthetic scenario', true, 'Reset was intentionally skipped; existing browser-local state is in scope.')
  }

  // P06/P07: demonstrate a held assessment, resolve it through the scoped
  // compliance role, then record the partner decision and activation controls.
  actor('admin-demo')
  let acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P06-HOLD', 'Partner decision is held by missing evidence', recordAssessmentDecision({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    actorPersonaId: 'admin-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-acceptance-hold',
    decision: 'ACCEPT',
    rationale: 'Synthetic negative path: unresolved UBO verification must remain a hold.',
  }), (result) => result?.outcome === 'BLOCKED' && result.code === 'ASSESSMENT_HOLDS')

  actor('compliance-demo')
  acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P06-RESPONSE', 'Compliance records the missing CE-011 evidence', saveAssessmentResponse({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    questionId: 'CE-011',
    actorPersonaId: 'compliance-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-ce-011-response',
    answer: 'YES',
    applicability: 'APPLICABLE',
    explanation: 'Synthetic registry and UBO declaration matched for the walkthrough.',
  }))

  actor('admin-demo')
  acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P07-ACCEPT', 'Partner records the scoped acceptance decision', recordAssessmentDecision({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    actorPersonaId: 'admin-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-acceptance-decision',
    decision: 'ACCEPT',
    rationale: 'Synthetic partner decision after all current holds were resolved.',
  }))

  let engagement = engagementById('ENG-0018-AUD-2026')
  actor('client-demo')
  addStep(steps, 'P07-TERMS', 'Management signs scoped terms', recordTerms({
    engagementId: engagement.id,
    actorPersonaId: 'client-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-terms',
    scopeVersion: 'SCOPE-AUD-2026',
  }))

  actor('admin-demo')
  engagement = engagementById('ENG-0018-AUD-2026')
  addStep(steps, 'P07-ACTIVATE', 'Partner activates the eligible engagement', activateEngagement({
    engagementId: engagement.id,
    actorPersonaId: 'admin-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-activation',
  }))

  // P07 negative branch: a confirmed prohibition cannot be overridden. Restore
  // the synthetic fixture afterwards so the remainder of the walkthrough has
  // a coherent accepted relationship.
  actor('compliance-demo')
  acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P07-PROHIBITION', 'Confirmed prohibition remains non-overridable', saveAssessmentResponse({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    questionId: 'CE-032',
    actorPersonaId: 'compliance-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-prohibition-response',
    answer: 'CONFIRMED_PROHIBITION',
    applicability: 'APPLICABLE',
    explanation: 'Synthetic negative-path marker; no real screening result is represented.',
  }))
  actor('admin-demo')
  acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P07-PROHIBITION-BLOCK', 'Partner cannot override the prohibition', recordAssessmentDecision({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    actorPersonaId: 'admin-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-prohibition-decision',
    decision: 'ACCEPT',
    rationale: 'This must remain blocked in the simulation.',
  }), (result) => result?.outcome === 'BLOCKED' && result.code === 'CONFIRMED_PROHIBITION')
  actor('compliance-demo')
  acceptance = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  addStep(steps, 'P07-PROHIBITION-RESTORE', 'Restore the neutral synthetic screening fixture', saveAssessmentResponse({
    engagementId: 'ENG-0018-AUD-2026',
    type: 'acceptance',
    questionId: 'CE-032',
    actorPersonaId: 'compliance-demo',
    expectedRevision: acceptance.assessment.revision,
    idempotencyKey: 'cycle-prohibition-restore',
    answer: 'NO_MATCH',
    applicability: 'APPLICABLE',
    explanation: 'Synthetic fixture restored after the negative-path demonstration.',
  }))

  // P09/P10: receipt, snapshot and independent suitability review.
  actor('client-demo')
  let request = scenario.pbcRequests.find((item) => item.id === 'PBC-023')
  const upload = await recordPbcUpload({
    requestId: request.id,
    actorPersonaId: 'client-demo',
    expectedRevision: request.revision,
    period: request.period,
    idempotencyKey: 'cycle-pbc-upload',
    content: 'PBC-023|CLI-0018|FY2026|synthetic-receipt-v1',
  })
  addStep(steps, 'P09-UPLOAD', 'Client receipt is stored as a stable snapshot', upload)
  actor('audit-manager-demo')
  request = scenario.pbcRequests.find((item) => item.id === 'PBC-023')
  addStep(steps, 'P09-SUITABILITY', 'Reviewer records receipt suitability separately', reviewPbcReceipt({
    requestId: request.id,
    receiptId: upload.data?.receiptId,
    actorPersonaId: 'audit-manager-demo',
    expectedRevision: request.revision,
    idempotencyKey: 'cycle-pbc-suitability',
    decision: 'ACCEPT',
    response: 'Synthetic entity, period and completeness checks matched.',
  }))

  // P11/P12/P15/P16: source replacement, exact workpaper review, and the
  // synchronous stale-input barrier while impact processing is paused.
  actor('system-admin-only-demo')
  addStep(steps, 'P16-PAUSE', 'Pause impact processing for the stale-input test', pauseImpactProcessing({ actorPersonaId: 'system-admin-only-demo' }))
  actor('accountant-demo')
  engagement = engagementById('ENG-0018-ACC-2026')
  const baselineRows = fixtureRows(baselineFixture, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: 'TB-CYCLE-BASELINE' })
  const replacementRows = fixtureRows(replacementFixture, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: 'TB-CYCLE-REFLECTED' })
  addStep(steps, 'P11-BASELINE', 'Promote the exact 14-account baseline CSV', replaceAccountingSource({
    engagementId: engagement.id,
    actorPersonaId: 'accountant-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-tb-baseline',
    sourceId: 'TB-CYCLE-BASELINE',
    sourceLabel: 'Synthetic baseline fixture · 14 accounts',
    rows: baselineRows,
  }))
  engagement = engagementById('ENG-0018-ACC-2026')
  const reflected = replaceAccountingSource({
    engagementId: engagement.id,
    actorPersonaId: 'accountant-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-tb-reflected',
    sourceId: 'TB-CYCLE-REFLECTED',
    sourceLabel: 'Synthetic replacement fixture · AJ-001 already reflected',
    rows: replacementRows,
  })
  addStep(steps, 'P12-AJ001-REUPLOAD', 'Re-upload reflected AJ-001 without double applying it', reflected, (result) => result?.outcome === 'COMMITTED' && result.data?.reflection === 'REFLECTED')

  actor('audit-manager-demo')
  let workpaper = scenario.workpapers.find((item) => item.id === 'WP-AR-01')
  const submission = await submitWorkpaper({
    workpaperId: workpaper.id,
    actorPersonaId: 'audit-manager-demo',
    expectedRevision: workpaper.revision,
    idempotencyKey: 'cycle-workpaper-submit',
    content: 'WP-AR-01|AR-019|synthetic-submitted-snapshot',
  })
  addStep(steps, 'P15-SUBMIT', 'Freeze the exact workpaper submission snapshot', submission)
  actor('independent-reviewer-demo')
  workpaper = scenario.workpapers.find((item) => item.id === 'WP-AR-01')
  addStep(steps, 'P15-REVIEW', 'Independent reviewer clears the submitted snapshot', reviewWorkpaper({
    workpaperId: workpaper.id,
    actorPersonaId: 'independent-reviewer-demo',
    expectedRevision: workpaper.revision,
    idempotencyKey: 'cycle-workpaper-review',
    response: `Reviewed exact submitted snapshot ${workpaper.submittedSnapshotId}.`,
  }))

  actor('system-admin-only-demo')
  engagement = engagementById('ENG-0018-ACC-2026')
  const inputChange = mutateAccountingInput({
    engagementId: engagement.id,
    actorPersonaId: 'system-admin-only-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-stale-input',
    reason: 'Synthetic linked accounting input changed while impact processing is paused.',
  })
  addStep(steps, 'P16-INPUT', 'Commit linked input generation synchronously', inputChange)
  const staleBlockers = releaseCandidateBlockers('RC-026')
  addObservation(steps, 'P16-STALE-BLOCK', 'Release immediately sees the stale generation', staleBlockers.some((item) => item.code === 'INPUTS_NOT_EVALUATED'), `RC-026 blockers: ${staleBlockers.map((item) => item.code).join(', ')}`, 'INPUTS_NOT_EVALUATED')
  addStep(steps, 'P16-RESUME', 'Resume impact processing after the barrier test', resumeImpactProcessing({ actorPersonaId: 'system-admin-only-demo' }))

  // P08: create a fresh next-period shell and preserve the non-renewal path.
  actor('admin-demo')
  engagement = engagementById('ENG-0018-AUD-2026')
  const shellResult = createContinuanceShell({
    sourceEngagementId: engagement.id,
    actorPersonaId: 'admin-demo',
    expectedRevision: engagement.revision,
    idempotencyKey: 'cycle-continuance-shell',
    nextPeriod: 'FY2027',
  })
  addStep(steps, 'P08-SHELL', 'Create next-period shell with fresh UNKNOWN responses', shellResult)
  const shellId = shellResult.data?.shellEngagementId
  const shell = shellId ? engagementById(shellId) : null
  addStep(steps, 'P08-NON-RENEW', 'Record non-renewal without deleting historical records', recordRenewalDecision({
    shellEngagementId: shellId,
    actorPersonaId: 'admin-demo',
    expectedRevision: shell?.revision,
    idempotencyKey: 'cycle-non-renewal',
    decision: 'NON_RENEW',
    rationale: 'Synthetic non-renewal branch; preserve records and complete closeout.',
  }))

  // P19: make provider faults visible, then reconcile the same operation.
  actor('admin-demo')
  addStep(steps, 'P19-FAULT', 'Provider 429 creates a retryable operation', setProviderSimulation({ actorPersonaId: 'admin-demo', connected: true, nextFault: '429_RETRY_AFTER' }))
  const faultResult = runIntegrationReconciliation({ actorPersonaId: 'admin-demo', engagementId: 'ENG-0009-ACC-2026', idempotencyKey: 'cycle-provider-429' })
  addStep(steps, 'P19-RETRYABLE', 'Retry-after remains explicit and bounded', faultResult, (result) => result?.outcome === 'BLOCKED' && result.code === 'PROVIDER_429')
  addStep(steps, 'P19-FAULT-CLEAR', 'Clear the provider fault for the retry', setProviderSimulation({ actorPersonaId: 'admin-demo', connected: true, nextFault: 'NONE' }))
  addStep(steps, 'P19-RETRY', 'Reconcile the same deterministic operation target', retryIntegrationOperation({
    operationId: faultResult.operationId,
    actorPersonaId: 'admin-demo',
    expectedAttempt: 1,
    idempotencyKey: 'cycle-provider-429-retry',
  }))
  setProviderSimulation({ actorPersonaId: 'admin-demo', connected: false, nextFault: 'NONE' })

  // P17/P18: the seeded accounting-only candidate is intentionally complete,
  // making it a safe independent release path for this rehearsal.
  actor('admin-demo')
  addStep(steps, 'P17-SCOPE', 'Select the accounting-only release scope', selectEngagement('ENG-0009-ACC-2026', { actorPersonaId: 'admin-demo' }))
  let candidate = scenario.releaseCandidates.find((item) => item.id === 'RC-READY-001')
  for (let index = 0; index < 6; index += 1) {
    const result = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: `cycle-release-${index}` })
    addStep(steps, `P17-GUARD-${index + 1}`, `Run release guard ${index + 1}`, result)
    candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  }
  const releaseEvent = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'cycle-release-event' })
  addStep(steps, 'P17-RELEASE-EVENT', 'Commit one atomic release event', releaseEvent)
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  actor('compliance-demo')
  const checkpoint = createReleaseCheckpoint({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'cycle-release-checkpoint' })
  addStep(steps, 'P17-CHECKPOINT', 'Verify the independent checkpoint after release event', checkpoint)
  actor('admin-demo')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  addStep(steps, 'P17-DELIVERY', 'Deliver the exact checkpointed package', advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'cycle-release-delivery' }))
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  addStep(steps, 'P18-ARCHIVE-EVENT', 'Complete the archive state transition', advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'cycle-release-archive' }))
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  actor('compliance-demo')
  addStep(steps, 'P18-ARCHIVE', 'Assemble and verify the structured archive', await assembleArchive({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'cycle-archive-assemble' }))

  // P20: capture an app-state backup, restore into quarantine, reconcile the
  // independent checkpoint and resume with outward effects still fenced.
  actor('admin-demo')
  addStep(steps, 'P20-BACKUP', 'Capture an earlier scoped application backup', captureRecoveryBackup({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'admin-demo', idempotencyKey: 'cycle-recovery-backup' }))
  const backupId = scenario.recovery.backup?.id
  actor('system-admin-only-demo')
  addStep(steps, 'P20-QUARANTINE', 'Restore into quarantine with external effects disabled', restoreRecoveryBackup({ backupId, actorPersonaId: 'system-admin-only-demo', idempotencyKey: 'cycle-recovery-restore' }))
  addStep(steps, 'P20-RECONCILE', 'Reconcile the historical release checkpoint', reconcileRecovery({ actorPersonaId: 'system-admin-only-demo', idempotencyKey: 'cycle-recovery-reconcile' }))
  addStep(steps, 'P20-RESUME', 'Resume only the fenced simulation epoch', resumeRecovery({ actorPersonaId: 'system-admin-only-demo', expectedEpoch: scenario.recovery.activeEpoch, idempotencyKey: 'cycle-recovery-resume' }))

  // Keep the browser session and the domain actor aligned after the runner has
  // exercised privileged personas. The rehearsal never changes the signed-in
  // account; it only borrows scoped synthetic actors for individual commands.
  setActivePersona(startingPersonaId)
  const coveredIds = steps.flatMap((step) => step.coverage || [])
  const failed = steps.filter((step) => step.status === 'FAIL')
  const run = {
    id: `CYCLE-${Date.now()}`,
    startedAt,
    completedAt: now(),
    state: failed.length ? 'FAILED_SIMULATION' : 'PASSED_SIMULATION',
    evidenceLevel: 'SIMULATION',
    reset,
    steps,
    summary: { total: steps.length, passed: steps.length - failed.length, failed: failed.length },
    traceability: traceabilitySummary(coveredIds),
    externalProof: 'NOT_RUN',
  }
  scenario.cycleRuns = [...(scenario.cycleRuns || []), run]
  // Keep only a short evidence history so a browser-local rehearsal cannot
  // grow storage without bound.
  if (scenario.cycleRuns.length > 5) scenario.cycleRuns = scenario.cycleRuns.slice(-5)
  // `scenario` persistence is intentionally reached through a domain command
  // above; the final run record is persisted by the next safe state command.
  // Calling reset is not repeated here because it would erase the evidence.
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenario))
  } catch {
    // The run result is still returned to the caller; storage failure remains a
    // local diagnostic rather than a false committed external operation.
  }
  return run
}

export function latestSyntheticCycle() {
  return scenario.cycleRuns?.at(-1) || null
}
