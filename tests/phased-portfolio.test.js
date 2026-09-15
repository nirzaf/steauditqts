import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioRows, deriveProcessHealth, rankTasks, resolveScenarioPreset } from '../worker/portfolio.js';

test('controlled scenario presets accept named keys only', () => {
  const preset = resolveScenarioPreset('ready_for_partner');
  assert.equal(preset?.key, 'READY_FOR_PARTNER');
  assert.equal(preset?.stage, 'STAGE-07');
  assert.equal(resolveScenarioPreset('STAGE-08'), null);
  assert.equal(resolveScenarioPreset('anything from a browser'), null);
});

test('process health reports D1 generation, review, task, and output signals', () => {
  const health = deriveProcessHealth({
    today: '2026-09-15',
    inputGeneration: 3,
    evaluatedGeneration: 2,
    artifactCount: 7,
    publishedArtifactCount: 3,
    tasks: [
      { id: 'TASK-1', state: 'OPEN', dueDate: '2026-09-14' },
      { id: 'TASK-2', state: 'COMPLETE', dueDate: '2026-09-10' },
    ],
    reviewPoints: [
      { id: 'REV-1', state: 'OPEN', severity: 'SIGNIFICANT' },
      { id: 'REV-2', state: 'CLEARED', severity: 'STANDARD', clearedGeneration: 2 },
    ],
    decisions: {
      MANAGER_COMPLETION: { decision: 'RECOMMEND_COMPLETE', generation: 2 },
    },
  }, {
    valid: false,
    currentStage: 'STAGE-07',
    blockers: [{ code: 'REVIEW_POINTS_OPEN', message: 'A significant point remains open.' }],
    warnings: [{ code: 'MANAGER_COMPLETION_STALE' }],
    nextAction: { title: 'Clear the significant review point', ownerRole: 'audit_manager', ownerLabel: 'Audit Manager', route: 'reviews' },
  });
  assert.equal(health.status, 'BLOCKED');
  assert.equal(health.dataGeneration.state, 'STALE');
  assert.equal(health.tasks.open, 1);
  assert.equal(health.tasks.overdue, 1);
  assert.equal(health.significantIssues.length, 1);
  assert.equal(health.staleApprovals.length, 2);
  assert.deepEqual(health.documents, { required: 26, created: 7, ready: 3, missing: 19 });
  assert.equal(health.nextBestAction.route, 'reviews');
});

test('portfolio ordering and task routing rank the actionable work first', () => {
  const contexts = [
    { engagementId: 'ENG-B', clientName: 'Beta', clientShortName: 'Beta', serviceLabel: 'Accounting', period: 'FY2026', currentStage: 'STAGE-05' },
    { engagementId: 'ENG-A', clientName: 'Alpha', clientShortName: 'Alpha', serviceLabel: 'Audit', period: 'FY2026', currentStage: 'STAGE-07' },
  ];
  const rows = buildPortfolioRows(contexts, {
    'ENG-A': { currentStage: 'STAGE-07', completionPercent: 70, nextAction: { title: 'Resolve review', ownerRole: 'audit_manager', ownerLabel: 'Audit Manager', route: 'reviews' } },
    'ENG-B': { currentStage: 'STAGE-05', completionPercent: 45, nextAction: { title: 'Validate TB', ownerRole: 'accounting_reviewer', ownerLabel: 'Accounting Reviewer', route: 'accounting' } },
  }, {
    'ENG-A': { status: 'BLOCKED', blockers: [{ code: 'OPEN_REVIEW', message: 'Open significant review point' }], tasks: { open: 2, overdue: 1 }, significantIssues: [{ id: 'REV-1' }] },
    'ENG-B': { status: 'ON_TRACK', blockers: [], tasks: { open: 1, overdue: 0 }, significantIssues: [] },
  });
  assert.equal(rows[0].engagementId, 'ENG-A');
  assert.equal(rows[0].nextRoute, 'reviews');

  const ranked = rankTasks([
    { taskId: 'normal', state: 'OPEN', priority: 'NORMAL', dueDate: '2026-10-01' },
    { taskId: 'overdue-high', state: 'OPEN', priority: 'HIGH', dueDate: '2026-09-14' },
    { taskId: 'blocked-low', state: 'BLOCKED', priority: 'LOW', dueDate: '2026-10-01' },
  ], '2026-09-15');
  assert.deepEqual(ranked.map((task) => task.taskId), ['blocked-low', 'overdue-high', 'normal']);
});
