// P8A parity — one authoritative implementation of the lifecycle gates that the
// local domain (src/domain/scenario.js), the shared Worker (worker/index.js),
// the P5 projections and the pipeline composable all have to agree on.
//
// These tests pin the contract: if any runtime re-derives "submitted",
// "senior cleared" or "manager recommended" differently, LOCAL_ONLY and
// SHARED_DEMO diverge, which is the defect class P8A exists to remove.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completionRecommendationView,
  isSeniorClearedWorkpaper,
  isWorkpaperSubmitted,
  managerCompletionGateBlockers,
  mergeTeamAssignments,
  normalizeSeniorReviewDecision,
  SENIOR_REVIEW_DECISIONS,
  SENIOR_REVIEW_ROLES,
  seniorReviewGateFrom,
  staffingPolicyFor,
  TEAM_ASSIGNMENT_ROLES,
} from '../shared/lifecycleRules.js';

// ─── "submitted workpaper" has exactly one definition ───────────────────────

test('a draft workpaper is never submitted in either runtime', () => {
  assert.equal(isWorkpaperSubmitted({ state: 'DRAFT' }), false);
  assert.equal(isWorkpaperSubmitted({ state: 'draft' }), false);
  assert.equal(isWorkpaperSubmitted({ state: '' }), false);
  assert.equal(isWorkpaperSubmitted(null), false);
});

test('local SUBMITTED and worker SENIOR_REVIEWED both count as submitted', () => {
  assert.equal(isWorkpaperSubmitted({ state: 'SUBMITTED' }), true);
  assert.equal(isWorkpaperSubmitted({ state: 'SENIOR_REVIEWED' }), true);
  assert.equal(isWorkpaperSubmitted({ state: 'SENIOR_RETURNED' }), true);
  // An unknown or terminal state must not silently count as submitted evidence.
  assert.equal(isWorkpaperSubmitted({ state: 'ARCHIVED' }), false);
});

test('senior cleared accepts both runtimes\' vocabularies and nothing else', () => {
  // LOCAL_ONLY records the clearance on reviewState, SHARED_DEMO on state.
  assert.equal(isSeniorClearedWorkpaper({ state: 'SUBMITTED', reviewState: 'SENIOR_CLEARED' }), true);
  assert.equal(isSeniorClearedWorkpaper({ state: 'SENIOR_REVIEWED' }), true);
  // An independent reviewer clearing a point is a different control.
  assert.equal(isSeniorClearedWorkpaper({ state: 'SUBMITTED', reviewState: 'CLEARED' }), false);
  assert.equal(isSeniorClearedWorkpaper({ state: 'SUBMITTED', reviewState: 'CHANGES_REQUIRED' }), false);
  assert.equal(isSeniorClearedWorkpaper({ state: 'SUBMITTED', reviewState: 'SENIOR_RETURNED' }), false);
  assert.equal(isSeniorClearedWorkpaper({ state: 'DRAFT', seniorReviewed: true }), false);
});

// ─── The senior gate is a single derivation ────────────────────────────────

test('senior gate reports the worker vocabulary', () => {
  const gate = seniorReviewGateFrom([
    { id: 'WP-1', state: 'SENIOR_REVIEWED' },
    { id: 'WP-2', state: 'SENIOR_REVIEWED' },
  ]);
  assert.equal(gate.complete, true);
  assert.equal(gate.total, 2);
  assert.equal(gate.reviewed, 2);
  assert.deepEqual(gate.pending, []);
});

test('senior gate reports the local vocabulary', () => {
  const gate = seniorReviewGateFrom([
    { id: 'WP-1', state: 'SUBMITTED', reviewState: 'SENIOR_CLEARED' },
    { id: 'WP-2', state: 'SUBMITTED', reviewState: 'OPEN' },
  ]);
  assert.equal(gate.complete, false);
  assert.equal(gate.total, 2);
  assert.equal(gate.reviewed, 1);
  assert.deepEqual(gate.pending.map((item) => item.id), ['WP-2']);
});

test('drafts do not count toward the gate and an empty file is not complete', () => {
  const draftOnly = seniorReviewGateFrom([{ id: 'WP-1', state: 'DRAFT' }]);
  assert.equal(draftOnly.complete, false);
  assert.equal(draftOnly.total, 0);
  assert.equal(seniorReviewGateFrom([]).complete, false);
});

// ─── A senior review records a professional outcome, not just an action ─────

test('only PASSED and FAILED are senior review decisions', () => {
  assert.deepEqual([...SENIOR_REVIEW_DECISIONS], ['PASSED', 'FAILED']);
  assert.deepEqual(normalizeSeniorReviewDecision('passed'), { decision: 'PASSED' });
  assert.deepEqual(normalizeSeniorReviewDecision(undefined), { decision: 'PASSED' });
  assert.equal(normalizeSeniorReviewDecision('MAYBE').code, 'SENIOR_REVIEW_DECISION_INVALID');
  assert.equal(normalizeSeniorReviewDecision('APPROVE').code, 'SENIOR_REVIEW_DECISION_INVALID');
});

test('a returned workpaper is counted but never cleared', () => {
  const gate = seniorReviewGateFrom([
    { id: 'WP-1', state: 'SUBMITTED', reviewState: 'SENIOR_RETURNED', seniorReviewed: false },
  ]);
  assert.equal(gate.complete, false);
  assert.equal(gate.returned, 1);
  assert.match(gate.message, /SENIOR_RETURNED|returned/i);
});

// ─── Manager completion blockers are ordered identically in both runtimes ───

test('an empty file reports NO_SUBMITTED_WORKPAPERS before the senior gate', () => {
  const blockers = managerCompletionGateBlockers({ workpapers: [], openReviewPointCount: 0 });
  assert.equal(blockers[0].code, 'NO_SUBMITTED_WORKPAPERS');
  assert.ok(!blockers.some((entry) => entry.code === 'SENIOR_REVIEW_REQUIRED'));
});

test('open review points are reported ahead of the senior gate', () => {
  const blockers = managerCompletionGateBlockers({
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    openReviewPointCount: 2,
  });
  assert.deepEqual(blockers.map((entry) => entry.code), ['REVIEW_POINTS_OPEN', 'SENIOR_REVIEW_REQUIRED']);
});

test('a cleared file reports no manager completion blockers', () => {
  const blockers = managerCompletionGateBlockers({
    workpapers: [{ id: 'WP-1', state: 'SENIOR_REVIEWED' }],
    openReviewPointCount: 0,
  });
  assert.deepEqual(blockers, []);
});

// ─── Recommendation and staffing inputs are normalized once ────────────────

test('the manager recommendation normalizes both stored shapes', () => {
  assert.equal(completionRecommendationView(null), null);
  assert.equal(completionRecommendationView('RECOMMEND_COMPLETE').recommended, true);
  assert.equal(completionRecommendationView('RECOMMEND_COMPLETE').legacyMarker, true);
  const object = { decision: 'RECOMMEND', status: 'CONDITIONAL', blockers: [{ code: 'EQR_INCOMPLETE' }] };
  const view = completionRecommendationView(object);
  assert.equal(view.recommended, true);
  assert.deepEqual(view.blockers, object.blockers);
  assert.equal(completionRecommendationView({ decision: 'HOLD' }).recommended, false);
});

test('staffing policy reads the local and D1 field naming identically', () => {
  assert.deepEqual(
    staffingPolicyFor({ service: 'audit', evidence: { eqrRequired: true }, smallFirmMode: true }),
    { eqrRequired: true, smallFirmMode: true },
  );
  assert.deepEqual(
    staffingPolicyFor({ service: 'AUDIT', eqr_required: 1, small_firm_mode: 1 }),
    { eqrRequired: true, smallFirmMode: true },
  );
  assert.deepEqual(staffingPolicyFor({}), { eqrRequired: false, smallFirmMode: false });
  assert.deepEqual(staffingPolicyFor(null), { eqrRequired: false, smallFirmMode: false });
});

test('staffing and senior-review authority lists are shared constants', () => {
  assert.deepEqual([...SENIOR_REVIEW_ROLES], ['audit_senior', 'audit_manager']);
  assert.ok(TEAM_ASSIGNMENT_ROLES.includes('eqr_reviewer'));
});

// ─── Team assignment merges identically to the D1 upsert ───────────────────

test('merging a roster keeps members the payload does not mention', () => {
  const existing = [
    { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '30' },
    { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '60' },
  ];
  const merged = mergeTeamAssignments(existing, [
    { role: 'preparer', actorId: 'ACT-OTHER', plannedHours: '20' },
  ]);
  assert.equal(merged.length, 3);
  assert.ok(merged.some((m) => m.role === 'engagement_partner'));
  assert.ok(merged.some((m) => m.actorId === 'ACT-JUNIOR' && m.plannedHours === '60'));
});

test('re-assigning the same role and actor updates the row without duplicating it', () => {
  const existing = [{ role: 'audit_senior', actorId: 'ACT-S', plannedHours: '40', startDate: '2026-09-01', endDate: '2026-09-20', responsibility: 'old' }];
  const merged = mergeTeamAssignments(existing, [
    { role: 'audit_senior', actorId: 'ACT-S', plannedHours: '55', startDate: '2026-10-01', endDate: '2026-10-20', responsibility: 'supervision' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].plannedHours, '55');
  assert.equal(merged[0].responsibility, 'supervision');
});

test('multiple preparers coexist, matching the D1 (engagement, role, actor) key', () => {
  const merged = mergeTeamAssignments([], [
    { role: 'preparer', actorId: 'ACT-A', plannedHours: '40' },
    { role: 'preparer', actorId: 'ACT-B', plannedHours: '30' },
  ]);
  assert.deepEqual(merged.map((m) => m.actorId), ['ACT-A', 'ACT-B']);
});
