// P8A/P8C — walkthrough presets must reach their state through domain commands.
//
// A preset that patches professional state directly fabricates conditions the
// application itself cannot produce, so the demo shows a file state no actor
// could have recorded. These tests hold the presets to the same gates as users.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalPreset, LOCAL_SCENARIO_PRESETS } from '../src/domain/localPresets.js';
import {
  assignEngagementTeam,
  auditCommencementBlockers,
  completionRecommendationFor,
  deriveSeniorReviewGate,
  engagementById,
  resetScenario,
  scenario,
} from '../src/domain/scenario.js';

const AUDIT = 'ENG-0018-AUD-2026';

test.beforeEach(() => {
  resetScenario();
});

test('every preset applies through the documented command path', async () => {
  for (const preset of LOCAL_SCENARIO_PRESETS) {
    resetScenario();
    const applied = await applyLocalPreset(preset.key, { personaId: 'admin-demo' });
    assert.equal(applied.outcome, 'COMMITTED', `${preset.key} must apply: ${applied.message || ''}`);
  }
});

test('the manager-review preset submits workpapers as real snapshots', async () => {
  await applyLocalPreset('MANAGER_REVIEW', { personaId: 'admin-demo' });
  const submitted = scenario.workpapers.filter((wp) => wp.engagementId === AUDIT && wp.state === 'SUBMITTED');
  assert.ok(submitted.length, 'the preset should leave submitted workpapers');
  for (const workpaper of submitted) {
    const snapshot = scenario.snapshots.find((entry) => entry.id === workpaper.submittedSnapshotId);
    assert.ok(snapshot, `${workpaper.id} references a snapshot the domain actually captured`);
    assert.equal(snapshot.engagementId, AUDIT);
  }
});

test('the ready-for-partner preset records a real manager recommendation', async () => {
  await applyLocalPreset('READY_FOR_PARTNER', { personaId: 'admin-demo' });
  const recommendation = completionRecommendationFor(AUDIT);
  assert.ok(recommendation, 'the manager recommendation must be recorded');
  assert.equal(recommendation.legacyMarker, false, 'a preset may not fabricate the legacy string marker');
  assert.equal(recommendation.decision, 'RECOMMEND');
  assert.equal(recommendation.actorId, 'ACT-OMAR', 'recorded by the audit manager');
  assert.ok(recommendation.rationale.length >= 8);
  assert.equal(deriveSeniorReviewGate(AUDIT).complete, true);
  assert.equal(engagementById(AUDIT).revision > 1, true);
});

test('the release-blocked preset stays blocked for a reason a user can reach', async () => {
  const applied = await applyLocalPreset('RELEASE_BLOCKED', { personaId: 'admin-demo' });
  assert.equal(applied.outcome, 'COMMITTED');
  const recommendation = completionRecommendationFor(AUDIT);
  const gate = deriveSeniorReviewGate(AUDIT);
  assert.equal(gate.complete, false, 'the demo point is that senior review is outstanding');
  // Without a completed senior review the manager cannot have recommended
  // completion, so the blocked state must not be fabricated.
  assert.notEqual(recommendation?.recommended, true);
});

test('the staffing-blocked preset really leaves the profile short', async () => {
  await applyLocalPreset('STAFFING_BLOCKED', { personaId: 'admin-demo' });
  const codes = auditCommencementBlockers(AUDIT).map((blocker) => blocker.code);
  assert.ok(codes.includes('PARTNER_REQUIRED'), codes.join(', '));
  assert.ok(codes.includes('AUDIT_SENIOR_REQUIRED'), codes.join(', '));
  assert.ok(codes.includes('AUDIT_MANAGER_REQUIRED'), codes.join(', '));
  assert.ok(!codes.includes('PREPARER_REQUIRED'), codes.join(', '));
});

test('the acceptance-declined preset declines through the decision command', async () => {
  await applyLocalPreset('ACCEPTANCE_DECLINED', { personaId: 'admin-demo' });
  const assessment = scenario.assessments.find((entry) => entry.engagementId === AUDIT && entry.type === 'acceptance');
  assert.equal(assessment.decision.decision, 'DECLINE');
  assert.ok(assessment.decision.actorId, 'the declining partner is recorded');
});

// ─── Roster replacement is an explicit, shared capability ───────────────────

test('replaceRoster sets the exact team instead of merging into it', () => {
  const engagement = engagementById(AUDIT);
  assert.ok(engagement.team.length > 1, 'the seeded engagement starts with a full roster');
  const result = assignEngagementTeam({
    engagementId: AUDIT,
    actorPersonaId: 'admin-demo',
    replaceRoster: true,
    assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40' }],
  });
  assert.equal(result.outcome, 'COMMITTED');
  assert.deepEqual(engagement.team.map((member) => member.role), ['preparer']);
});
