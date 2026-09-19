// P5 — the accounting→audit handoff card and the consolidated engagement
// completion checklist. These are the two stakeholder-facing projections the
// corrective pass asked for, so the tests pin the facts a presenter can act on:
// the recorded management approval, the input-generation gap, and the
// COMPLETE / ATTENTION / PENDING ordering of the completion sequence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountingGenerationsFor,
  evaluateAccountingInput,
  mutateAccountingInput,
  recordSeniorReview,
  resetScenario,
  scenario,
  selectEngagement,
} from '../src/domain/scenario.js';
import {
  deriveAccountingHandoff,
  deriveEngagementCompletionChecklist,
} from '../src/domain/localProjections.js';
import {
  deriveAccountingHandoffFacts,
  linkedAccountingEngagementFrom,
  termsAcceptanceIsCurrent,
} from '../shared/lifecycleRules.js';

const AUDIT = 'ENG-0018-AUD-2026';
const ACCOUNTING = 'ENG-0018-ACC-2026';

function cloneState(overrides = {}) {
  const state = JSON.parse(JSON.stringify({ ...scenario, ...overrides }));
  return state;
}

function packageRecord(state) {
  return state.accountingPackages.find((entry) => entry.engagementId === ACCOUNTING);
}

function engagementByIdIn(state, id) {
  return state.engagements.find((entry) => entry.id === id);
}

test.beforeEach(() => {
  resetScenario();
  selectEngagement(AUDIT);
});

// ─── The shared handoff facts are read from where the domain stores them ─────

test('the handoff reports the recorded management approval and a current package', () => {
  const pkg = packageRecord(scenario);
  pkg.statement.state = 'APPROVED';
  pkg.statement.managementApproval = { decision: 'APPROVE', rationale: 'Management approved the package.', actorId: 'ACT-NADIA' };
  const handoff = deriveAccountingHandoff(scenario, AUDIT);
  assert.equal(handoff.applicable, true);
  assert.equal(handoff.managementApproval, 'ACCEPTED');
  assert.equal(handoff.status, 'CURRENT');
  assert.equal(handoff.actionLabel, '');
  assert.match(handoff.packageLabel, /^FS v\d+$/);
});

test('an approved package missing management approval is pending, not current', () => {
  const pkg = packageRecord(scenario);
  pkg.statement.state = 'APPROVED';
  pkg.statement.managementApproval = null;
  assert.equal(deriveAccountingHandoff(scenario, AUDIT).status, 'PENDING_APPROVAL');
});

test('the same facts read a D1-shaped accounting tracker', () => {
  // The shared demo has no statement object: its tracker carries fsState and
  // mgmtApprovalState. One derivation must serve both, or the card would lie in
  // one mode while telling the truth in the other.
  const facts = deriveAccountingHandoffFacts({
    auditEngagement: { id: 'ENG-0018-AUD-2026', service: 'AUDIT', evidence: { accountingInputGeneration: 4, accountingEvaluatedGeneration: 4 } },
    accountingEngagement: null,
    tracker: { exists: true, engagementId: 'ENG-0018-ACC-2026', inputGeneration: 4, fsState: 'FINAL', mgmtApprovalState: 'ACCEPTED' },
  });
  assert.equal(facts.status, 'CURRENT');
  assert.equal(facts.managementApproval, 'ACCEPTED');
  const stale = deriveAccountingHandoffFacts({
    auditEngagement: { id: 'ENG-0018-AUD-2026', service: 'AUDIT', evidence: { accountingInputGeneration: 5, accountingEvaluatedGeneration: 4 } },
    tracker: { exists: true, engagementId: 'ENG-0018-ACC-2026', inputGeneration: 5, fsState: 'FINAL', mgmtApprovalState: 'ACCEPTED' },
  });
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.actionLabel, 'Evaluate g5');
});

// ─── One source for the input generation, and the CTA really clears it ───────

test('a source mutation makes the card stale and evaluation clears it', () => {
  const acc = engagementByIdIn(scenario, ACCOUNTING);
  const audit = engagementByIdIn(scenario, AUDIT);
  const pkg = packageRecord(scenario);
  pkg.statement.state = 'APPROVED';
  pkg.statement.managementApproval = { decision: 'APPROVE' };
  assert.equal(deriveAccountingHandoff(scenario, AUDIT).status, 'CURRENT');

  const mutated = mutateAccountingInput({
    engagementId: ACCOUNTING,
    actorPersonaId: 'accountant-demo',
    expectedRevision: acc.revision,
    idempotencyKey: 'p5-mutate',
    reason: 'Client restated the trial balance for the intercompany account.',
  });
  assert.equal(mutated.outcome, 'COMMITTED');

  const stale = deriveAccountingHandoff(scenario, AUDIT);
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.actionLabel, `Evaluate g${stale.accountingInputGeneration}`);
  // The command the button calls has to see the same gap the card shows.
  assert.deepEqual(accountingGenerationsFor(AUDIT), {
    input: stale.accountingInputGeneration,
    evaluated: stale.auditEvaluatedGeneration,
    linkedAccountingEngagementId: ACCOUNTING,
  });

  const evaluated = evaluateAccountingInput({
    engagementId: AUDIT,
    actorPersonaId: 'audit-manager-demo',
    expectedSessionEpoch: 1,
    idempotencyKey: 'p5-evaluate',
  });
  assert.equal(evaluated.outcome, 'COMMITTED');
  assert.equal(evaluated.data.duplicate, false, 'a reported STALE gap must not resolve as a duplicate');
  assert.equal(deriveAccountingHandoff(scenario, AUDIT).status, 'CURRENT');
  assert.equal(audit.evidence.accountingEvaluatedGeneration, stale.accountingInputGeneration);
});

test('an engagement without a linked accounting package has no handoff', () => {
  const state = cloneState();
  const audit = engagementByIdIn(state, AUDIT);
  audit.linkedEngagementId = null;
  state.engagements.find((entry) => entry.id === ACCOUNTING).linkedEngagementId = null;
  const handoff = deriveAccountingHandoff(state, AUDIT);
  assert.equal(handoff.applicable, false);
  assert.equal(handoff.status, 'NOT_APPLICABLE');
  assert.equal(handoff.engagementId, AUDIT);
});

test('the linked accounting engagement resolves from either side of the pair', () => {
  const oneSided = cloneState();
  engagementByIdIn(oneSided, ACCOUNTING).linkedEngagementId = null;
  const linked = linkedAccountingEngagementFrom(oneSided.engagements, engagementByIdIn(oneSided, AUDIT));
  assert.equal(linked?.id, ACCOUNTING);
});

// ─── The completion checklist keeps its documented three states ──────────────

const itemState = (checklist, key) => checklist.items.find((item) => item.key === key)?.state;
const itemDetail = (checklist, key) => checklist.items.find((item) => item.key === key)?.detail;

test('downstream steps wait instead of looking actionable', () => {
  const checklist = deriveEngagementCompletionChecklist(scenario, AUDIT);
  assert.equal(itemState(checklist, 'workpapers'), 'ATTENTION', 'submission is actionable now');
  assert.equal(itemState(checklist, 'manager-completion'), 'PENDING', 'completion cannot be recommended before workpapers');
  assert.equal(itemState(checklist, 'release'), 'PENDING');
  assert.equal(checklist.complete, false);
});

test('a superseded engagement letter acceptance is not an acceptance', () => {
  const state = cloneState();
  const terms = state.terms.find((entry) => entry.engagementId === AUDIT);
  terms.version = 'EL-2026-02';
  assert.equal(termsAcceptanceIsCurrent(terms), false);
  assert.equal(itemState(deriveEngagementCompletionChecklist(state, AUDIT), 'terms-accepted'), 'ATTENTION');
  terms.clientDecision.version = 'EL-2026-02';
  assert.equal(termsAcceptanceIsCurrent(terms), true);
  assert.equal(itemState(deriveEngagementCompletionChecklist(state, AUDIT), 'terms-accepted'), 'COMPLETE');
});

test('a returned workpaper keeps the senior step open', () => {
  const state = cloneState();
  for (const wp of state.workpapers.filter((entry) => entry.engagementId === AUDIT)) wp.state = 'SUBMITTED';
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === AUDIT) wp.state = 'SUBMITTED';
  });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'FAILED', notes: 'Re-perform the sample.' });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' });
  const checklist = deriveEngagementCompletionChecklist(scenario, AUDIT);
  assert.equal(itemState(checklist, 'senior-review'), 'ATTENTION');
  assert.match(itemDetail(checklist, 'senior-review'), /1\/2 cleared/);
});

test('client acceptance and commencement never contradict each other', () => {
  const state = cloneState();
  // The seeded audit already recorded commencement, so acceptance has to read as
  // satisfied from the same evidence the commencement step reports.
  engagementByIdIn(state, AUDIT).auditCommenced = true;
  const checklist = deriveEngagementCompletionChecklist(state, AUDIT);
  assert.equal(itemState(checklist, 'commenced'), 'COMPLETE');
  assert.notEqual(itemState(checklist, 'client-accepted'), 'ATTENTION');
});

test('a fully recorded file reports a complete checklist', () => {
  const state = cloneState();
  const audit = engagementByIdIn(state, AUDIT);
  const acc = engagementByIdIn(state, ACCOUNTING);
  acc.inputGeneration = 3;
  audit.evidence = {
    ...audit.evidence,
    accepted: true,
    advanceVerified: true,
    termsSigned: true,
    managementApproved: true,
    partnerApproved: true,
    eqrRequired: true,
    eqrComplete: true,
    accountingInputGeneration: 3,
    accountingEvaluatedGeneration: 3,
    completionRecommendation: { decision: 'RECOMMEND', status: 'CONDITIONAL', blockers: [] },
    archiveVerified: true,
  };
  audit.auditCommenced = true;
  audit.releaseEventId = 'REL-P5-001';
  if (!audit.team.some((member) => member.role === 'eqr_reviewer')) {
    audit.team.push({ role: 'eqr_reviewer', actorId: 'ACT-YUSUF', actorName: 'Yusuf Ali', plannedHours: '8' });
  }
  const terms = state.terms.find((entry) => entry.engagementId === AUDIT);
  terms.clientDecision = { decision: 'ACCEPT', version: terms.version };
  const pkg = packageRecord(state);
  pkg.statement.state = 'APPROVED';
  pkg.statement.managementApproval = { decision: 'APPROVE' };
  state.commercialRecords.find((entry) => entry.engagementId === AUDIT).advanceState = 'VERIFIED';
  state.assessments.find((entry) => entry.engagementId === AUDIT && entry.type === 'acceptance').decision = { decision: 'ACCEPT' };
  state.reviews.forEach((point) => {
    if (point.engagementId === AUDIT) point.status = 'CLEARED';
  });
  state.workpapers.forEach((wp) => {
    if (wp.engagementId !== AUDIT) return;
    wp.state = 'SUBMITTED';
    wp.seniorReviewed = true;
    wp.reviewState = 'SENIOR_CLEARED';
  });
  state.pbcRequests.forEach((request) => {
    if (request.engagementId === AUDIT) request.state = 'ACCEPTED';
  });

  const checklist = deriveEngagementCompletionChecklist(state, AUDIT);
  const notComplete = checklist.items.filter((item) => item.state !== 'COMPLETE').map((item) => `${item.key}=${item.state}`);
  assert.deepEqual(notComplete, [], `every step should be recorded: ${notComplete.join(', ')}`);
  assert.equal(checklist.complete, true);
  assert.equal(checklist.completeCount, checklist.totalCount);
});

test('an accounting engagement is reported as not applicable, not silently empty', () => {
  const checklist = deriveEngagementCompletionChecklist(scenario, ACCOUNTING);
  assert.equal(checklist.applicable, false);
  assert.match(checklist.message || '', /audit/i);
});
