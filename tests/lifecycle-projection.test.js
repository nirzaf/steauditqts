// P8A-1 — one mode-aware lifecycle projection.
//
// The 11-stage pipeline used to read the LOCAL scenario even in SHARED_DEMO, so
// the fancy stage strip could contradict D1. These tests pin the contract:
//   LOCAL_ONLY  → derived from the scenario state
//   SHARED_DEMO → derived from the D1 progress snapshot, and ONLY from it
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStageStates } from '../src/composables/lifecycleProjection.js';
import {
  recordSeniorReview,
  resetScenario,
  scenario,
  selectEngagement,
} from '../src/domain/scenario.js';

const AUDIT = 'ENG-0018-AUD-2026';
const byStage = (states) => Object.fromEntries(states.map((entry) => [entry.stageId, entry]));

function gate(id, state, overrides = {}) {
  return { id, label: id, state, reason: `${id} is ${state}`, ownerRole: 'audit_manager', route: 'reviews', advisory: false, ...overrides };
}

function progressFor(gateDetails, extra = {}) {
  return { engagementId: AUDIT, currentStage: 'STAGE-06', gateDetails, team: [], ...extra };
}

test.beforeEach(() => {
  resetScenario();
  selectEngagement(AUDIT);
});

// ─── LOCAL_ONLY derives from the scenario, using the shared predicates ───────

test('a recorded manager recommendation advances the review stage whatever shape it is stored in', () => {
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === AUDIT) wp.state = 'SUBMITTED';
  });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' });
  const engagement = scenario.engagements.find((entry) => entry.id === AUDIT);
  engagement.evidence.completionRecommendation = { decision: 'RECOMMEND', status: 'CONDITIONAL', blockers: [], actorId: 'ACT-OMAR' };
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT }));
  assert.equal(stages.review.source, 'local');
  assert.notEqual(stages.review.displayState, 'WAITING_FOR_MANAGER', 'the manager has already recommended completion');
});

test('a returned workpaper holds the review stage at the senior', () => {
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === AUDIT) wp.state = 'SUBMITTED';
  });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-senior-demo', decision: 'FAILED', notes: 'Re-perform the sample.' });
  recordSeniorReview({ engagementId: AUDIT, workpaperId: 'WP-INV-01', actorPersonaId: 'audit-senior-demo', decision: 'PASSED' });
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT }));
  assert.equal(stages.review.displayState, 'WAITING_FOR_SENIOR');
});

test('the staffing stage uses the shared commencement profile', () => {
  const engagement = scenario.engagements.find((entry) => entry.id === AUDIT);
  engagement.auditCommenced = false;
  // Acceptance has to be recorded for the staffing stage to be reached at all.
  scenario.assessments.find((entry) => entry.engagementId === AUDIT && entry.type === 'acceptance').decision = { decision: 'ACCEPT' };
  engagement.team = engagement.team.filter((member) => member.role !== 'audit_senior');
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT }));
  assert.ok(['IN_PROGRESS', 'BLOCKED', 'WAITING_FOR_PARTNER'].includes(stages.staffing.displayState), stages.staffing.displayState);
  assert.match(`${stages.staffing.blocker || ''} ${stages.staffing.nextAction || ''}`, /senior/i);
});

// ─── SHARED_DEMO reads D1 and only D1 ───────────────────────────────────────

test('a D1 snapshot decides the stage states even when the local scenario says otherwise', () => {
  // Local scenario: workpapers submitted and senior-cleared.
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === AUDIT) {
      wp.state = 'SUBMITTED';
      wp.seniorReviewed = true;
      wp.reviewState = 'SENIOR_CLEARED';
    }
  });
  const progress = progressFor([
    gate('workpapers', 'WAITING', { ownerRole: 'preparer' }),
    gate('manager-completion', 'READY', { ownerRole: 'audit_manager' }),
    gate('partner-review', 'WAITING', { ownerRole: 'engagement_partner' }),
  ]);
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress }));
  assert.equal(stages.review.source, 'd1');
  assert.equal(stages.review.displayState, 'WAITING_FOR_MANAGER', 'the D1 gate is the next actionable step');
  assert.notEqual(stages.review.displayState, 'WAITING_FOR_SENIOR');
});

test('every D1 gate approved makes the stage complete', () => {
  const progress = progressFor([
    gate('client-details', 'APPROVED'),
    gate('client-evaluation', 'APPROVED'),
    gate('acceptance', 'APPROVED'),
  ]);
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress }));
  assert.equal(stages.intake.displayState, 'COMPLETE');
  assert.equal(stages.intake.source, 'd1');
});

test('a blocked D1 gate carries its own reason and owner into the stage', () => {
  const progress = progressFor([
    gate('acceptance', 'APPROVED'),
    gate('client-evaluation', 'BLOCKED', { reason: '2 hard-stop answers need a partner disposition.', ownerRole: 'engagement_partner', route: 'clients' }),
  ]);
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress }));
  assert.equal(stages.intake.displayState, 'BLOCKED');
  assert.match(stages.intake.blocker, /hard-stop/);
  assert.equal(stages.intake.route, 'clients');
});

test('an engagement that exists in D1 has passed registration, qualification and conversion', () => {
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress: progressFor([gate('acceptance', 'APPROVED')]) }));
  for (const key of ['lead', 'qualify', 'convert']) {
    assert.equal(stages[key].source, 'd1');
    assert.equal(stages[key].displayState, 'COMPLETE', `${key} is implied by a D1 engagement record`);
  }
});

test('team staffing comes from the D1 roster, not the local team', () => {
  const progress = progressFor([], {
    team: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
    ],
    auditCommenced: false,
  });
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress }));
  assert.equal(stages.staffing.displayState, 'WAITING_FOR_PARTNER');
  assert.match(`${stages.staffing.blocker || ''} ${stages.staffing.nextAction || ''}`, /manager|preparer/i);
});

test('a commenced engagement with no outstanding D1 gate is not stuck', () => {
  const progress = progressFor([gate('announcement', 'APPROVED'), gate('portal-activation', 'APPROVED'), gate('credential', 'APPROVED')], { auditCommenced: true, team: [{ role: 'audit_manager', actorId: 'ACT-OMAR' }] });
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress }));
  assert.equal(stages.planning.displayState, 'COMPLETE');
  assert.notEqual(stages.staffing.displayState, undefined);
});

test('without a D1 snapshot the projection stays on the scenario', () => {
  const stages = byStage(deriveStageStates({ state: scenario, engagementId: AUDIT, progress: null }));
  assert.ok(stages.lead);
  assert.equal(Object.values(stages).every((entry) => entry.source === 'local'), true);
});
