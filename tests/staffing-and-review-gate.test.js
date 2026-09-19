/**
 * Tests for P2 (strict staffing role validation) and P3 (senior review gate).
 * Covers: ACTOR_ROLE_MISMATCH, per-role staffing blockers, deriveSeniorReviewGate,
 * multiple preparers, and manager dependency on senior review.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignEngagementTeam,
  auditCommencementBlockers,
  deriveSeniorReviewGate,
  engagementById,
  qualifyLead,
  convertLeadToClient,
  createLead,
  recordCompletionRecommendation,
  recordSeniorReview,
  resetScenario,
  scenario,
} from '../src/domain/scenario.js'

test.beforeEach(() => {
  resetScenario()
})

// ─── P2: Strict role-to-actor validation ────────────────────────────────────

test('P2: ACTOR_ROLE_MISMATCH rejected when actor does not hold the engagement role', () => {
  // ACT-NADIA holds client roles but not audit_senior
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'audit_senior', actorId: 'ACT-NADIA', plannedHours: '30' },
    ],
  })
  assert.equal(result.outcome, 'BLOCKED')
  assert.equal(result.code, 'ACTOR_ROLE_MISMATCH')
})

test('P2: ACTOR_ROLE_MISMATCH when finance team actor assigned as EQR reviewer', () => {
  // ACT-AISHA holds finance_team, not eqr_reviewer
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'eqr_reviewer', actorId: 'ACT-AISHA', plannedHours: '10' },
    ],
  })
  assert.equal(result.outcome, 'BLOCKED')
  assert.equal(result.code, 'ACTOR_ROLE_MISMATCH')
})

test('P2: valid staffing assignment succeeds when actor holds required role', () => {
  // ACT-YUSUF holds eqr_reviewer
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '20' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '35' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '25' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '50' },
      { role: 'eqr_reviewer', actorId: 'ACT-YUSUF', plannedHours: '10' },
      { role: 'accounting_reviewer', actorId: 'ACT-LEILA', plannedHours: '15' },
    ],
  })
  assert.equal(result.outcome, 'COMMITTED')
})

test('P2: disabled/inactive actor cannot be assigned to team', () => {
  // Disable ACT-JUNIOR first
  const juniorActor = scenario.actors.find((a) => a.id === 'ACT-JUNIOR')
  juniorActor.active = false
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40' },
    ],
  })
  assert.equal(result.outcome, 'BLOCKED')
  assert.equal(result.code, 'ACTOR_INACTIVE')
})

test('P2: HOURS_INVALID when planned hours is not a valid decimal', () => {
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: 'not-a-number' },
    ],
  })
  assert.equal(result.outcome, 'BLOCKED')
  assert.equal(result.code, 'HOURS_INVALID')
})

test('P2: DATE_RANGE_INVALID when start date is after end date', () => {
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40', startDate: '2026-09-30', endDate: '2026-09-01' },
    ],
  })
  assert.equal(result.outcome, 'BLOCKED')
  assert.equal(result.code, 'DATE_RANGE_INVALID')
})

// ─── P2: Multiple preparers ───────────────────────────────────────────────────

test('P2: multiple preparers are supported in one assignment', () => {
  // ACT-JUNIOR and ACT-SARA both hold preparer-compatible roles
  // ACT-SARA holds compliance_reviewer + records_custodian but NOT preparer — use ACT-LEILA (preparer)
  const result = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '20' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '35' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '25' },
      // Two preparers
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40', responsibility: 'Workpaper drafting' },
      { role: 'preparer', actorId: 'ACT-LEILA', plannedHours: '30', responsibility: 'TB and journals' },
    ],
  })
  assert.equal(result.outcome, 'COMMITTED')
  const engagement = engagementById('ENG-0018-AUD-2026')
  const preparers = engagement.team.filter((t) => t.role === 'preparer')
  assert.equal(preparers.length, 2)
})

// ─── P5: Precise staffing blockers in auditCommencementBlockers ──────────────

test('P5: AUDIT_SENIOR_REQUIRED blocker when no senior in team', () => {
  const leadRes = createLead({ name: 'Minimal Co', company: 'Minimal Co W.L.L.', email: 'cfo@minimal.demo' })
  qualifyLead({ leadId: leadRes.data.id })
  const convertRes = convertLeadToClient({ leadId: leadRes.data.id, clientName: 'Minimal Co W.L.L.' })
  const engId = convertRes.data.engagement.id

  // Assign partner only (no senior)
  assignEngagementTeam({
    engagementId: engId,
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-MAYA', plannedHours: '10' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '15' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '30' },
    ],
  })
  const blockers = auditCommencementBlockers(engId)
  assert.ok(blockers.some((b) => b.code === 'AUDIT_SENIOR_REQUIRED'), 'Should have AUDIT_SENIOR_REQUIRED blocker')
})

test('P5: PARTNER_REQUIRED blocker when no partner in team', () => {
  const leadRes = createLead({ name: 'No Partner Co', company: 'No Partner Co W.L.L.', email: 'cfo@nopartner.demo' })
  qualifyLead({ leadId: leadRes.data.id })
  const convertRes = convertLeadToClient({ leadId: leadRes.data.id, clientName: 'No Partner Co W.L.L.' })
  const engId = convertRes.data.engagement.id
  // Accept the engagement
  const assessment = scenario.assessments.find((a) => a.engagementId === engId && a.type === 'acceptance')
  if (assessment) assessment.decision = { decision: 'ACCEPT', rationale: 'Test', actorId: 'ACT-MAYA', recordedAt: new Date().toISOString(), revision: 1 }
  scenario.terms.push({ id: `TERMS-${engId}`, engagementId: engId, version: 'EL-2026-01', state: 'SIGNED', clientDecision: { decision: 'ACCEPT', version: 'EL-2026-01', actorId: 'ACT-NADIA', recordedAt: new Date().toISOString() } })
  // Assign senior + manager + preparer but NOT partner
  assignEngagementTeam({
    engagementId: engId,
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '30' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '20' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40' },
    ],
  })
  const blockers = auditCommencementBlockers(engId)
  assert.ok(blockers.some((b) => b.code === 'PARTNER_REQUIRED'), 'Should have PARTNER_REQUIRED blocker')
})

test('P5: PREPARER_REQUIRED blocker when no preparer in team', () => {
  const leadRes = createLead({ name: 'No Prep Co', company: 'No Prep Co W.L.L.', email: 'cfo@noprep.demo' })
  qualifyLead({ leadId: leadRes.data.id })
  const convertRes = convertLeadToClient({ leadId: leadRes.data.id, clientName: 'No Prep Co W.L.L.' })
  const engId = convertRes.data.engagement.id
  assignEngagementTeam({
    engagementId: engId,
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-MAYA', plannedHours: '15' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '30' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '20' },
      // No preparer
    ],
  })
  const blockers = auditCommencementBlockers(engId)
  assert.ok(blockers.some((b) => b.code === 'PREPARER_REQUIRED'), 'Should have PREPARER_REQUIRED blocker')
})

// ─── P3: Senior Review Gate ──────────────────────────────────────────────────

test('P3: deriveSeniorReviewGate returns incomplete when no submitted workpapers', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  // All workpapers are DRAFT in the initial scenario
  const gate = deriveSeniorReviewGate(engagementId)
  assert.equal(gate.complete, false)
  assert.equal(gate.total, 0)
})

test('P3: deriveSeniorReviewGate complete when all submitted workpapers are senior-cleared', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  // Submit both workpapers
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === engagementId) {
      wp.state = 'SUBMITTED'
      wp.submittedSnapshotId = `SNAP-${wp.id}-01`
    }
  })
  // Senior-review both
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  recordSeniorReview({ engagementId, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  const gate = deriveSeniorReviewGate(engagementId)
  assert.equal(gate.complete, true)
  assert.equal(gate.reviewed, 2)
  assert.equal(gate.total, 2)
  assert.equal(gate.pending.length, 0)
})

test('P3: one unreviewed submitted workpaper keeps senior gate incomplete', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  // Submit both workpapers
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === engagementId) wp.state = 'SUBMITTED'
  })
  // Only review one
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  const gate = deriveSeniorReviewGate(engagementId)
  assert.equal(gate.complete, false)
  assert.equal(gate.reviewed, 1)
  assert.equal(gate.total, 2)
  assert.equal(gate.pending.length, 1)
  assert.equal(gate.pending[0].id, 'WP-INV-01')
})

test('P3: unauthorized role cannot record senior review', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  // Submit workpaper
  const wp = scenario.workpapers.find((w) => w.id === 'WP-AR-01')
  if (wp) wp.state = 'SUBMITTED'
  // ACT-JUNIOR is a preparer, not audit_senior
  const result = recordSeniorReview({
    engagementId,
    workpaperId: 'WP-AR-01',
    actorPersonaId: 'preparer-demo',
    decision: 'PASSED',
  })
  assert.equal(result.outcome, 'DENIED')
  assert.equal(result.code, 'SENIOR_REVIEW_AUTHORITY_REQUIRED')
})

test('P3: DRAFT workpaper does not count toward senior review gate', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  // Submit one workpaper, leave the other as DRAFT
  const wpAr = scenario.workpapers.find((w) => w.id === 'WP-AR-01' && w.engagementId === engagementId)
  if (wpAr) wpAr.state = 'SUBMITTED'
  // Senior-review the submitted one
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  // Gate should be complete since the only submitted WP is reviewed
  const gate = deriveSeniorReviewGate(engagementId)
  assert.equal(gate.complete, true)
  assert.equal(gate.total, 1)
})

// ─── P8A: a senior review records an outcome, and only PASSED clears ────────

function submitBothWorkpapers(engagementId) {
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === engagementId && wp.state === 'DRAFT') {
      wp.state = 'SUBMITTED'
      wp.submittedSnapshotId = `SNAP-${wp.id}-P8A`
    }
  })
}

test('P8A: a FAILED senior review returns the workpaper and never clears the gate', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  submitBothWorkpapers(engagementId)
  const returned = recordSeniorReview({
    engagementId,
    workpaperId: 'WP-AR-01',
    actorPersonaId: 'audit-senior-demo',
    decision: 'FAILED',
    notes: 'Sample was not representative; re-perform the test.',
  })
  assert.equal(returned.outcome, 'COMMITTED')
  const workpaper = scenario.workpapers.find((w) => w.id === 'WP-AR-01')
  assert.equal(workpaper.seniorReviewed, false)
  assert.equal(workpaper.reviewState, 'SENIOR_RETURNED')
  recordSeniorReview({ engagementId, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  const gate = deriveSeniorReviewGate(engagementId)
  assert.equal(gate.complete, false)
  assert.equal(gate.returned, 1)
})

test('P8A: a returned workpaper cannot unblock a manager completion recommendation', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  submitBothWorkpapers(engagementId)
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'FAILED', notes: 'Re-perform the sample.' })
  recordSeniorReview({ engagementId, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' })
  const recommendation = recordCompletionRecommendation({
    engagementId,
    actorPersonaId: 'audit-manager-demo',
    expectedSessionEpoch: 1,
    idempotencyKey: 'p8a-recommend-after-return',
    decision: 'RECOMMEND',
    rationale: 'Manager believes the file is complete despite the returned workpaper.',
  })
  assert.equal(recommendation.outcome, 'BLOCKED')
  // Both runtimes report the shared prerequisite order, so the senior gate is
  // asserted through the reported blocker set rather than a single first code.
  assert.ok((recommendation.blockers || []).some((entry) => entry.code === 'SENIOR_REVIEW_REQUIRED'), 'SENIOR_REVIEW_REQUIRED must be reported')
})

test('P8A: an unrecognised senior review decision is rejected without mutating the workpaper', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  submitBothWorkpapers(engagementId)
  const before = JSON.stringify(scenario.workpapers.find((w) => w.id === 'WP-AR-01'))
  const rejected = recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'LOOKS_FINE' })
  assert.equal(rejected.outcome, 'BLOCKED')
  assert.equal(rejected.code, 'SENIOR_REVIEW_DECISION_INVALID')
  assert.equal(JSON.stringify(scenario.workpapers.find((w) => w.id === 'WP-AR-01')), before)
})

test('P8A: recommending completion on an empty file reports NO_SUBMITTED_WORKPAPERS', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  const recommendation = recordCompletionRecommendation({
    engagementId,
    actorPersonaId: 'audit-manager-demo',
    expectedSessionEpoch: 1,
    idempotencyKey: 'p8a-recommend-empty-file',
    decision: 'RECOMMEND',
    rationale: 'Nothing has been submitted yet but the manager wants to proceed.',
  })
  assert.equal(recommendation.outcome, 'BLOCKED')
  assert.equal(recommendation.code, 'NO_SUBMITTED_WORKPAPERS')
})

test('P8A: senior review authority is the shared role list, not the admin escape hatch', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  submitBothWorkpapers(engagementId)
  const byAdmin = recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'admin-demo', decision: 'PASSED' })
  assert.equal(byAdmin.outcome, 'DENIED')
  assert.equal(byAdmin.code, 'SENIOR_REVIEW_AUTHORITY_REQUIRED')
  const byPartner = recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'partner-demo', decision: 'PASSED' })
  assert.equal(byPartner.outcome, 'DENIED')
  assert.equal(byPartner.code, 'SENIOR_REVIEW_AUTHORITY_REQUIRED')
})

test('P8A: re-performing a returned workpaper clears it', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  submitBothWorkpapers(engagementId)
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'FAILED', notes: 'Re-perform the sample.' })
  recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED', notes: 'Re-performed sample is representative.' })
  const workpaper = scenario.workpapers.find((w) => w.id === 'WP-AR-01')
  assert.equal(workpaper.seniorReviewed, true)
  assert.equal(workpaper.reviewState, 'SENIOR_CLEARED')
})
