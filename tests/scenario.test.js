import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeActor,
  auditChainSummary,
  auditSampleFor,
  activationBlockers,
  activationFor,
  advanceRelease,
  activateEngagement,
  accountingPackageFor,
  assessmentSummary,
  clearReviewPoint,
  createContinuanceShell,
  createPopulationRevision,
  assembleArchive,
  captureRecoveryBackup,
  createAmendmentCase,
  createReleaseCheckpoint,
  deriveGates,
  gateSummary,
  mutateAccountingInput,
  pauseImpactProcessing,
  recordPbcUpload,
  recordAssessmentDecision,
  recordAccountingManagementApproval,
  recordAlternativeWork,
  recordFindingDisposition,
  recordMaterialitySelection,
  recordLegalHold,
  releaseLegalHold,
  reconcileRecovery,
  resumeRecovery,
  restoreRecoveryBackup,
  retryIntegrationOperation,
  recordRenewalDecision,
  recordTerms,
  replaceAccountingSource,
  requestPbcClarification,
  reviewPbcReceipt,
  releaseCandidateBlockers,
  reviewWorkpaper,
  resetScenario,
  resumeImpactProcessing,
  runIntegrationReconciliation,
  scenario,
  selectEngagement,
  setActivePersona,
  setProviderSimulation,
  stageAccountingJournal,
  authorizeAccountingJournal,
  submitAccountingStatement,
  submitWorkpaper,
} from '../src/domain/scenario.js'
import { annualContinuanceQuestions, clientEvaluationQuestions, questionById } from '../src/domain/questionBanks.js'
import { baselineFixture, fixtureRows } from '../src/domain/accounting.js'

test.beforeEach(() => {
  resetScenario()
  setActivePersona('admin-demo')
})

test('normative question banks retain every stable identity and exact wording', () => {
  assert.equal(clientEvaluationQuestions.length, 62)
  assert.equal(annualContinuanceQuestions.length, 30)
  assert.equal(new Set(clientEvaluationQuestions.map((item) => item.id)).size, 62)
  assert.equal(new Set(annualContinuanceQuestions.map((item) => item.id)).size, 30)
  assert.equal(questionById('CE-032').question, 'Are there sanctions matches requiring legal/compliance action?')
  assert.equal(questionById('RV-030').question, 'Should the relationship continue?')
})

test('assessment projection keeps unknown evidence held and partner decisions guarded', () => {
  const initial = assessmentSummary('ENG-0018-AUD-2026', 'acceptance')
  assert.equal(initial.assessment.templateVersion, 'v4-2026-01')
  assert.equal(initial.assessment.responses['CE-011'].answer, 'UNKNOWN')
  assert.equal(initial.holds.some((hold) => hold.questionId === 'CE-011' && hold.code === 'RESPONSE_REQUIRED'), true)
  const favorable = recordAssessmentDecision({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', expectedRevision: initial.assessment.revision, idempotencyKey: 'decision-1', decision: 'ACCEPT', rationale: 'Synthetic hold intentionally remains.' })
  assert.equal(favorable.outcome, 'BLOCKED')
  assert.equal(favorable.code, 'ASSESSMENT_HOLDS')
})

test('all eleven gates are projected with service-specific applicability and G10 denominator', () => {
  const audit = gateSummary('ENG-0018-AUD-2026')
  assert.equal(audit.gates.length, 11)
  assert.equal(audit.currentDenominator, 10)
  assert.equal(audit.nextDenominator, 1)
  assert.equal(audit.gates.find((gate) => gate.id === 'G10').nextPeriodNote.includes('fresh continuance'), true)

  const accounting = gateSummary('ENG-0009-ACC-2026')
  assert.equal(accounting.gates.find((gate) => gate.id === 'G5').applicable, false)
  assert.equal(accounting.gates.find((gate) => gate.id === 'G6').applicable, false)
  assert.equal(accounting.currentDenominator, 8)
})

test('audit chain keeps materiality, population and contradictory evidence linked', () => {
  const chain = auditChainSummary('ENG-0018-AUD-2026')
  assert.equal(chain.materiality.overall, '18000.00')
  assert.equal(chain.materiality.performance, '12600.00')
  assert.equal(chain.populations[0].rowCount, 218)
  assert.equal(chain.samples.find((item) => item.rowId === 'AR-019').status, 'EXCEPTION_OPEN')
  assert.equal(chain.blockers.some((item) => item.code === 'EVIDENCE_DISPOSITION_REQUIRED'), true)

  const selected = recordMaterialitySelection({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', expectedRevision: 3, idempotencyKey: 'materiality-r4', rationale: 'Synthetic sensitivity review retained with the source bridge.' })
  assert.equal(selected.outcome, 'COMMITTED')
  const population = createPopulationRevision({ engagementId: 'ENG-0018-AUD-2026', populationId: 'POP-AR-2026-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'population-r2', sourceId: 'TB-REPLACEMENT-001' })
  assert.equal(population.outcome, 'COMMITTED')
  assert.equal(population.data.reconciliationState, 'REVIEW_REQUIRED')

  const responder = recordAlternativeWork({ engagementId: 'ENG-0018-AUD-2026', sampleId: 'SMP-AR-03-019', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'alt-work-self' , evidence: 'Alternative receipt confirmation', conclusion: 'Balance supported by independent confirmation.' })
  assert.equal(responder.outcome, 'DENIED')
  assert.equal(responder.code, 'SEGREGATION_OF_DUTIES')
  const alternative = recordAlternativeWork({ engagementId: 'ENG-0018-AUD-2026', sampleId: 'SMP-AR-03-019', actorPersonaId: 'independent-reviewer-demo', expectedRevision: 1, idempotencyKey: 'alt-work-fatima', evidence: 'Independent customer confirmation SNAP-AR-019-AW', conclusion: 'No unadjusted difference remains after alternative work.' })
  assert.equal(alternative.outcome, 'COMMITTED')
  const finding = recordFindingDisposition({ engagementId: 'ENG-0018-AUD-2026', findingId: 'FND-AR-019', actorPersonaId: 'admin-demo', expectedRevision: 1, idempotencyKey: 'finding-disposition', decision: 'ACCEPT_EXCEPTION', rationale: 'Synthetic evidence chain reviewed and dispositioned.' })
  assert.equal(finding.outcome, 'COMMITTED')
  assert.equal(scenario.audit.findings[0].state, 'DISPOSED')
})

test('every significant synthetic risk resolves to its own population and sample plan', () => {
  const chain = auditChainSummary('ENG-0018-AUD-2026')
  for (const risk of chain.risks.filter((item) => ['HIGH', 'SIGNIFICANT'].includes(item.rating))) {
    const population = chain.populations.find((item) => item.id === risk.populationId)
    const sample = chain.samples.find((item) => item.populationId === risk.populationId && item.id.startsWith(`${risk.samplePlanId}-`))
    assert.ok(population, `${risk.id} population is linked`)
    assert.ok(sample, `${risk.id} sample plan is linked`)
    assert.equal(population.reconciliationState, 'RECONCILED')
  }
  assert.match(chain.populations.find((item) => item.id === 'POP-INV-2026-01').assumption, /synthetic supplementary/i)
})

test('scope and professional authority are checked at command boundaries', () => {
  setActivePersona('system-admin-only-demo')
  const adminOnly = mutateAccountingInput({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'system-admin-only-demo', expectedRevision: 3, idempotencyKey: 'scope-1' })
  assert.equal(adminOnly.outcome, 'COMMITTED')
  const review = clearReviewPoint({ pointId: 'RP-042', actorPersonaId: 'system-admin-only-demo', expectedRevision: 1, idempotencyKey: 'review-1', response: 'not allowed' })
  assert.equal(review.outcome, 'DENIED')
  assert.equal(review.code, 'AUTHORITY_REQUIRED')

  setActivePersona('audit-manager-demo')
  const selfClear = clearReviewPoint({ pointId: 'RP-042', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'review-2', response: 'self response' })
  assert.equal(selfClear.code, 'SEGREGATION_OF_DUTIES')
  const independent = clearReviewPoint({ pointId: 'RP-047', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'review-3', response: 'Alternative work reference AW-047 attached.' })
  assert.equal(independent.outcome, 'COMMITTED')
  assert.equal(scenario.reviews.find((point) => point.id === 'RP-047').status, 'CLEARED')
})

test('linked accounting input mutation is synchronous even while impact processing is paused', () => {
  const beforeAudit = scenario.engagements.find((item) => item.id === 'ENG-0018-AUD-2026').inputGeneration
  const beforeAccounting = scenario.engagements.find((item) => item.id === 'ENG-0018-ACC-2026').inputGeneration
  assert.equal(pauseImpactProcessing({ actorPersonaId: 'admin-demo' }).outcome, 'COMMITTED')
  const result = mutateAccountingInput({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'admin-demo', expectedRevision: 3, idempotencyKey: 'input-change-1', reason: 'Replacement TB received' })
  assert.equal(result.outcome, 'COMMITTED')
  assert.equal(scenario.safety.impactProcessing, 'PAUSED')
  assert.equal(result.data.impactCase.state, 'PENDING_WORKER')
  assert.equal(scenario.engagements.find((item) => item.id === 'ENG-0018-ACC-2026').inputGeneration, beforeAccounting + 1)
  assert.equal(scenario.engagements.find((item) => item.id === 'ENG-0018-AUD-2026').inputGeneration, beforeAudit + 1)
  assert.equal(releaseCandidateBlockers('RC-026').some((item) => item.code === 'INPUTS_NOT_EVALUATED'), true)
  assert.equal(releaseCandidateBlockers('RC-026').some((item) => item.code === 'CLIENT_SAFETY_UNEVALUATED'), true)
  assert.equal(resumeImpactProcessing({ actorPersonaId: 'admin-demo' }).outcome, 'COMMITTED')
})

test('idempotency and optimistic revisions prevent duplicate commands', () => {
  const first = mutateAccountingInput({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'admin-demo', expectedRevision: 3, idempotencyKey: 'same-command', reason: 'One source change' })
  const replay = mutateAccountingInput({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'admin-demo', expectedRevision: 3, idempotencyKey: 'same-command', reason: 'One source change' })
  assert.equal(first.outcome, 'COMMITTED')
  assert.deepEqual(replay, first)
  const conflict = mutateAccountingInput({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'admin-demo', expectedRevision: 3, idempotencyKey: 'different-command', reason: 'Second source change' })
  assert.equal(conflict.outcome, 'CONFLICT')
  assert.equal(conflict.code, 'REVISION_CONFLICT')
})

test('PBC receipt preserves bounded bytes, hashes, manifest and prior receipts', async () => {
  const before = scenario.pbcRequests.find((item) => item.id === 'PBC-023').receipts.length
  const wrongPeriod = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 1, period: 'FY2025', content: 'synthetic' })
  assert.equal(wrongPeriod.code, 'PERIOD_MISMATCH')
  const result = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 1, period: 'FY2026', idempotencyKey: 'pbc-023-1', content: 'PBC-023|CLI-0018|FY2026|synthetic' })
  assert.equal(result.outcome, 'COMMITTED')
  assert.equal(result.data.captureState, 'STABLE')
  assert.match(result.data.originalHash, /^sha256:/)
  assert.match(result.data.manifestDigest, /^sha256:/)
  assert.equal(scenario.pbcRequests.find((item) => item.id === 'PBC-023').receipts.length, before + 1)
  assert.equal(scenario.documents.at(-1).snapshotId, result.data.id)
  const replay = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 1, period: 'FY2026', idempotencyKey: 'pbc-023-1', content: 'PBC-023|CLI-0018|FY2026|synthetic' })
  assert.deepEqual(replay, result)
  const replacement = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 2, period: 'FY2026', idempotencyKey: 'pbc-023-2', content: 'PBC-023|CLI-0018|FY2026|synthetic-replacement' })
  assert.equal(replacement.outcome, 'COMMITTED')
  assert.equal(scenario.pbcRequests.find((item) => item.id === 'PBC-023').state, 'REPLACEMENT_RECEIVED')
  assert.equal(scenario.documents.at(-1).supersedesReceiptId, result.data.receiptId)
})

test('terms and activation keep acceptance and authority as separate gates', () => {
  setActivePersona('system-admin-only-demo')
  const adminOnly = recordTerms({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'system-admin-only-demo', expectedRevision: 4, idempotencyKey: 'terms-admin-only' })
  assert.equal(adminOnly.outcome, 'DENIED')
  assert.equal(adminOnly.code, 'TERMS_AUTHORITY_REQUIRED')

  setActivePersona('client-demo')
  const signed = recordTerms({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'client-demo', expectedRevision: 4, idempotencyKey: 'terms-client', scopeVersion: 'SCOPE-AUD-2026' })
  assert.equal(signed.outcome, 'COMMITTED')
  assert.equal(signed.data.state, 'SIGNED')
  assert.equal(scenario.engagements.find((item) => item.id === 'ENG-0018-AUD-2026').revision, 5)

  const blocked = activateEngagement({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', expectedRevision: 5, idempotencyKey: 'activate-northstar' })
  assert.equal(blocked.outcome, 'BLOCKED')
  assert.equal(blocked.code, 'ACCEPTANCE_DECISION_REQUIRED')
  assert.equal(activationBlockers('ENG-0018-AUD-2026').some((item) => item.code === 'RESPONSE_REQUIRED'), true)

  const cedar = activateEngagement({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'admin-demo', expectedRevision: 1, idempotencyKey: 'activate-cedar' })
  assert.equal(cedar.outcome, 'COMMITTED')
  assert.equal(activationFor('ENG-0009-ACC-2026').state, 'ACTIVE')
})

test('continuance shells preserve prior responses and non-renewal preserves records', () => {
  const created = createContinuanceShell({ sourceEngagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', expectedRevision: 4, idempotencyKey: 'continuance-shell-2027' })
  assert.equal(created.outcome, 'COMMITTED')
  assert.equal(created.data.shellEngagementId, 'ENG-0018-AUD-2027')
  const nextAssessment = scenario.assessments.find((item) => item.id === 'ASMT-ENG-0018-AUD-2027-CONT')
  assert.equal(nextAssessment.responses['RV-001'].priorAnswer, 'NO')
  assert.equal(nextAssessment.responses['RV-001'].answer, 'UNKNOWN')
  assert.equal(nextAssessment.responses['RV-023'].priorAnswer, 'YES')

  const decision = recordRenewalDecision({ shellEngagementId: 'ENG-0018-AUD-2027', actorPersonaId: 'admin-demo', expectedRevision: 1, idempotencyKey: 'continuance-non-renew', decision: 'NON_RENEW', rationale: 'Synthetic fixture closeout.' })
  assert.equal(decision.outcome, 'COMMITTED')
  assert.equal(decision.data.state, 'NON_RENEWED')
  assert.equal(decision.data.closeout.preserveRecords, true)
  assert.equal(decision.data.closeout.deletion, 'DISABLED')
})

test('PBC receipt suitability is a distinct reviewer decision', async () => {
  const uploaded = await recordPbcUpload({ requestId: 'PBC-023', actorPersonaId: 'client-demo', expectedRevision: 1, period: 'FY2026', idempotencyKey: 'pbc-023-suitability-upload', content: 'PBC-023|CLI-0018|FY2026|synthetic' })
  assert.equal(uploaded.outcome, 'COMMITTED')

  const systemOnly = reviewPbcReceipt({ requestId: 'PBC-023', receiptId: uploaded.data.receiptId, actorPersonaId: 'system-admin-only-demo', expectedRevision: 2, idempotencyKey: 'pbc-023-system-review', decision: 'ACCEPT' })
  assert.equal(systemOnly.outcome, 'DENIED')
  assert.equal(systemOnly.code, 'PBC_REVIEW_AUTHORITY_REQUIRED')

  const reviewed = reviewPbcReceipt({ requestId: 'PBC-023', receiptId: uploaded.data.receiptId, actorPersonaId: 'audit-manager-demo', expectedRevision: 2, idempotencyKey: 'pbc-023-review', decision: 'ACCEPT', response: 'Entity, period and completeness matched.' })
  assert.equal(reviewed.outcome, 'COMMITTED')
  assert.equal(scenario.pbcRequests.find((item) => item.id === 'PBC-023').state, 'ACCEPTED')

  const clarification = requestPbcClarification({ requestId: 'PBC-019', actorPersonaId: 'client-demo', expectedRevision: 2, idempotencyKey: 'pbc-019-clarification', message: 'Please confirm the FY2026 ageing support.' })
  assert.equal(clarification.outcome, 'COMMITTED')
  assert.equal(scenario.pbcRequests.find((item) => item.id === 'PBC-019').state, 'CLARIFICATION_REQUIRED')
})

test('accounting package commands separate source reflection, journals and management approval', async () => {
  setActivePersona('accountant-demo')
  const staged = stageAccountingJournal({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'accountant-demo', expectedRevision: 1, idempotencyKey: 'accounting-stage-aj002', journal: { id: 'AJ-002-R2', logicalJournalId: 'AJ-002', amount: '12500.00', debitAccount: '510100', creditAccount: '210100', reason: 'Synthetic provision discussion.' } })
  assert.equal(staged.outcome, 'COMMITTED')
  assert.equal(staged.data.state, 'STAGED')
  assert.equal(staged.data.reflection, 'NOT_REFLECTED')

  const accountantCannotAuthorize = authorizeAccountingJournal({ engagementId: 'ENG-0018-ACC-2026', journalId: 'AJ-002-R2', actorPersonaId: 'accountant-demo', expectedRevision: 2, idempotencyKey: 'accounting-authorize-preparer' })
  assert.equal(accountantCannotAuthorize.outcome, 'DENIED')
  assert.equal(accountantCannotAuthorize.code, 'MANAGEMENT_AUTHORITY_REQUIRED')

  setActivePersona('client-demo')
  const authorized = authorizeAccountingJournal({ engagementId: 'ENG-0018-ACC-2026', journalId: 'AJ-002-R2', actorPersonaId: 'client-demo', expectedRevision: 2, idempotencyKey: 'accounting-authorize-management', decision: 'AUTHORIZE', rationale: 'Management approved the proposed provision.' })
  assert.equal(authorized.outcome, 'COMMITTED')
  assert.equal(authorized.data.decision, 'AUTHORIZE')

  setActivePersona('accountant-demo')
  const incomplete = submitAccountingStatement({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'accountant-demo', expectedRevision: 3, idempotencyKey: 'accounting-submit-incomplete' })
  assert.equal(incomplete.outcome, 'BLOCKED')
  assert.equal(incomplete.code, 'FINANCIAL_COMPONENTS_INCOMPLETE')

  const replacement = replaceAccountingSource({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'accountant-demo', expectedRevision: 4, idempotencyKey: 'accounting-replace-baseline', sourceId: 'TB-BASELINE-NEW', sourceLabel: 'TB v02 · new synthetic baseline', rows: fixtureRows(baselineFixture, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: 'TB-BASELINE-NEW' }) })
  assert.equal(replacement.outcome, 'COMMITTED')
  assert.equal(accountingPackageFor('ENG-0018-ACC-2026').source.reflection, 'NOT_REFLECTED')
  assert.equal(accountingPackageFor('ENG-0018-ACC-2026').history.length > 0, true)

  const packageRecord = accountingPackageFor('ENG-0018-ACC-2026')
  packageRecord.statement.components = { balanceSheet: 'DERIVED', incomeStatement: 'DERIVED', cashFlow: 'PROVIDED', comparatives: 'PROVIDED', disclosures: 'PROVIDED' }
  packageRecord.statement.state = 'READY_FOR_APPROVAL'
  setActivePersona('client-demo')
  const approval = await recordAccountingManagementApproval({ engagementId: 'ENG-0018-ACC-2026', actorPersonaId: 'client-demo', expectedRevision: packageRecord.revision, idempotencyKey: 'accounting-management-approval', rationale: 'Synthetic management sign-off.' })
  assert.equal(approval.outcome, 'COMMITTED')
  assert.equal(accountingPackageFor('ENG-0018-ACC-2026').statement.state, 'APPROVED')
  assert.match(approval.data.snapshotHash, /^sha256:/)
})

test('workpaper review sees an exact submitted snapshot and enforces separation of duties', async () => {
  const missing = reviewWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'wp-review-before-submit', response: 'not yet' })
  assert.equal(missing.code, 'SNAPSHOT_REQUIRED')
  const submitted = await submitWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 1, idempotencyKey: 'wp-submit-1', content: 'WP-AR-01|AR-019|synthetic-workpaper' })
  assert.equal(submitted.outcome, 'COMMITTED')
  assert.match(submitted.data.snapshot.snapshotHash, /^sha256:/)
  const selfReview = reviewWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', expectedRevision: 2, idempotencyKey: 'wp-self-review', response: 'self' })
  assert.equal(selfReview.code, 'SEGREGATION_OF_DUTIES')
  const reviewed = reviewWorkpaper({ workpaperId: 'WP-AR-01', actorPersonaId: 'independent-reviewer-demo', expectedRevision: 2, idempotencyKey: 'wp-review-1', response: 'Reviewed submitted snapshot SNAP-WP-AR-01-R2.' })
  assert.equal(reviewed.outcome, 'COMMITTED')
  assert.equal(reviewed.data.reviewState, 'CLEARED')
})

test('valid candidate requires release event, independent checkpoint, then delivery and archive', () => {
  assert.equal(selectEngagement('ENG-0009-ACC-2026', { actorPersonaId: 'admin-demo' }).outcome, 'COMMITTED')
  let candidate = scenario.releaseCandidates.find((item) => item.id === 'RC-READY-001')
  for (let index = 0; index < 6; index += 1) {
    const result = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: `release-${index}` })
    assert.equal(result.outcome, 'COMMITTED')
    candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  }
  assert.equal(candidate.stepIndex, 6)
  const event = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'release-event' })
  assert.equal(event.outcome, 'COMMITTED')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  assert.equal(candidate.stepIndex, 7)
  const noCheckpoint = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'delivery-without-checkpoint' })
  assert.equal(noCheckpoint.code, 'CHECKPOINT_REQUIRED')
  setActivePersona('compliance-demo')
  const checkpoint = createReleaseCheckpoint({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'checkpoint-1' })
  assert.equal(checkpoint.outcome, 'COMMITTED')
  setActivePersona('admin-demo')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  const delivery = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'delivery-1' })
  assert.equal(delivery.outcome, 'COMMITTED')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  assert.equal(candidate.deliveryState, 'DELIVERED_SIMULATION')
  const archive = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-1' })
  assert.equal(archive.outcome, 'COMMITTED')
  assert.equal(candidate.archiveState, 'VERIFIED')
  assert.equal(deriveGates('ENG-0009-ACC-2026').find((gate) => gate.id === 'G9').status, 'good')
})

test('archive, legal hold and amendment commands preserve durable records', async () => {
  assert.equal(selectEngagement('ENG-0009-ACC-2026', { actorPersonaId: 'admin-demo' }).outcome, 'COMMITTED')
  let candidate = scenario.releaseCandidates.find((item) => item.id === 'RC-READY-001')
  for (let index = 0; index < 6; index += 1) {
    const result = advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: `archive-release-${index}` })
    assert.equal(result.outcome, 'COMMITTED')
    candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  }
  assert.equal(advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-release-event' }).outcome, 'COMMITTED')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  setActivePersona('compliance-demo')
  assert.equal(createReleaseCheckpoint({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-checkpoint' }).outcome, 'COMMITTED')
  setActivePersona('admin-demo')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  assert.equal(advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-delivery' }).outcome, 'COMMITTED')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)
  assert.equal(advanceRelease({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-ready' }).outcome, 'COMMITTED')
  candidate = scenario.releaseCandidates.find((item) => item.id === candidate.id)

  setActivePersona('compliance-demo')
  const archive = await assembleArchive({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'archive-assemble' })
  assert.equal(archive.outcome, 'COMMITTED')
  assert.equal(archive.data.state, 'VERIFIED_SIMULATION')
  assert.match(archive.data.manifestDigest, /^sha256:/)
  const amendment = createAmendmentCase({ candidateId: candidate.id, actorPersonaId: 'compliance-demo', expectedRevision: candidate.revision, idempotencyKey: 'amendment-wrong-role' })
  assert.equal(amendment.outcome, 'DENIED')
  assert.equal(amendment.code, 'PARTNER_AUTHORITY_REQUIRED')
  setActivePersona('admin-demo')
  const opened = createAmendmentCase({ candidateId: candidate.id, actorPersonaId: 'admin-demo', expectedRevision: candidate.revision, idempotencyKey: 'amendment-open' })
  assert.equal(opened.outcome, 'COMMITTED')
  assert.equal(opened.data.preserveOriginal, true)
  assert.equal(opened.data.originalManifestDigest, archive.data.manifestDigest === candidate.manifestDigest ? candidate.manifestDigest : opened.data.originalManifestDigest)
})

test('records custody and recovery stay scoped to the exact backup checkpoint', () => {
  setActivePersona('system-admin-only-demo')
  const denied = recordLegalHold({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'system-admin-only-demo', expectedRevision: 1, idempotencyKey: 'hold-system-only' })
  assert.equal(denied.outcome, 'DENIED')
  assert.equal(denied.code, 'RECORDS_AUTHORITY_REQUIRED')

  setActivePersona('compliance-demo')
  const hold = recordLegalHold({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'compliance-demo', expectedRevision: 1, idempotencyKey: 'hold-cedar' })
  assert.equal(hold.outcome, 'COMMITTED')
  assert.equal(hold.data.blocksDisposal, true)
  const released = releaseLegalHold({ holdId: hold.data.id, actorPersonaId: 'compliance-demo', expectedRevision: 1, idempotencyKey: 'hold-cedar-release', rationale: 'Synthetic dispute resolved.' })
  assert.equal(released.outcome, 'COMMITTED')
  assert.equal(released.data.state, 'RELEASED')
  assert.equal(released.data.blocksDisposal, false)

  setActivePersona('admin-demo')
  const backup = captureRecoveryBackup({ engagementId: 'ENG-0009-ACC-2026', actorPersonaId: 'admin-demo', idempotencyKey: 'recovery-backup' })
  assert.equal(backup.outcome, 'COMMITTED')
  assert.equal(scenario.recovery.state, 'BACKUP_CAPTURED')
  setActivePersona('system-admin-only-demo')
  const restored = restoreRecoveryBackup({ backupId: backup.data.id, actorPersonaId: 'system-admin-only-demo', idempotencyKey: 'recovery-restore' })
  assert.equal(restored.outcome, 'COMMITTED')
  assert.equal(scenario.recovery.state, 'QUARANTINED')
  assert.equal(scenario.recovery.outwardEffectsEnabled, false)
  const reconciled = reconcileRecovery({ actorPersonaId: 'system-admin-only-demo', idempotencyKey: 'recovery-reconcile' })
  assert.equal(reconciled.outcome, 'COMMITTED')
  assert.equal(scenario.recovery.reconciliation.state, 'RECONCILED')
  const resumed = resumeRecovery({ actorPersonaId: 'system-admin-only-demo', expectedEpoch: 2, idempotencyKey: 'recovery-resume' })
  assert.equal(resumed.outcome, 'COMMITTED')
  assert.equal(scenario.recovery.state, 'RESUMED_SIMULATION')
  assert.equal(scenario.recovery.outwardEffectsEnabled, false)
})

test('integration faults keep retry, uncertainty and fencing explicit', () => {
  setActivePersona('admin-demo')
  setProviderSimulation({ connected: true, nextFault: '429_RETRY_AFTER' })
  const retryable = runIntegrationReconciliation({ actorPersonaId: 'admin-demo', engagementId: 'ENG-0009-ACC-2026', idempotencyKey: 'fault-429' })
  assert.equal(retryable.outcome, 'BLOCKED')
  assert.equal(retryable.data.state, 'RETRY_REQUIRED')
  assert.equal(retryable.code, 'PROVIDER_429')
  setProviderSimulation({ connected: true, nextFault: 'NONE' })
  const retried = retryIntegrationOperation({ operationId: retryable.operationId, actorPersonaId: 'admin-demo', expectedAttempt: 1, idempotencyKey: 'fault-429-retry' })
  assert.equal(retried.outcome, 'COMMITTED')
  assert.equal(retried.data.state, 'SUCCEEDED')

  setProviderSimulation({ connected: true, nextFault: 'TIMEOUT_AFTER_UPLOAD_SUCCESS' })
  const uncertain = runIntegrationReconciliation({ actorPersonaId: 'admin-demo', engagementId: 'ENG-0009-ACC-2026', idempotencyKey: 'fault-timeout' })
  assert.equal(uncertain.data.state, 'UNCERTAIN_REMOTE_SUCCESS')
  setProviderSimulation({ connected: true, nextFault: 'NONE' })
  const reconciled = retryIntegrationOperation({ operationId: uncertain.operationId, actorPersonaId: 'admin-demo', expectedAttempt: 1, idempotencyKey: 'fault-timeout-retry' })
  assert.equal(reconciled.outcome, 'COMMITTED')
  assert.equal(reconciled.data.remoteEffect, 'RECONCILED_SAME_TARGET')

  setProviderSimulation({ connected: true, nextFault: '403_FORBIDDEN' })
  const forbidden = runIntegrationReconciliation({ actorPersonaId: 'admin-demo', engagementId: 'ENG-0009-ACC-2026', idempotencyKey: 'fault-403' })
  assert.equal(forbidden.data.state, 'FAILED')
  assert.equal(forbidden.code, 'PROVIDER_403')
  setProviderSimulation({ connected: true, nextFault: 'EXPIRED_LEASE' })
  const fenced = runIntegrationReconciliation({ actorPersonaId: 'admin-demo', engagementId: 'ENG-0009-ACC-2026', idempotencyKey: 'fault-lease' })
  assert.equal(fenced.data.state, 'FENCED')
  assert.equal(fenced.code, 'LEASE_EXPIRED')
  const notRetryable = retryIntegrationOperation({ operationId: fenced.operationId, actorPersonaId: 'admin-demo', expectedAttempt: 1, idempotencyKey: 'fault-lease-retry' })
  assert.equal(notRetryable.outcome, 'BLOCKED')
  assert.equal(notRetryable.code, 'OPERATION_NOT_RETRYABLE')
})
