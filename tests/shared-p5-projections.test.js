// P5 in SHARED_DEMO — the handoff card and the completion checklist must read
// D1 through the SAME shared derivations the local projections use, so the card
// cannot say "current" here and "stale" there.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sharedAccountingHandoff,
  sharedCompletionChecklist,
} from '../src/domain/sharedProjections.js';

const AUDIT = 'ENG-0018-AUD-2026';

function gate(id, state, overrides = {}) {
  return { id, label: id.replace(/-/g, ' '), state, reason: '', ownerRole: 'audit_manager', ownerLabel: 'Audit Manager', route: 'reviews', advisory: false, ...overrides };
}

function snapshot(overrides = {}) {
  return {
    engagementId: AUDIT,
    service: 'AUDIT',
    auditCommenced: false,
    eqrRequired: true,
    smallFirmMode: false,
    team: [],
    workpapers: [],
    gateDetails: [],
    accounting: null,
    ...overrides,
  };
}

const itemState = (checklist, key) => checklist.items.find((item) => item.key === key)?.state;

// ─── The handoff card ───────────────────────────────────────────────────────

test('no accounting tracker means no handoff applies', () => {
  const handoff = sharedAccountingHandoff(snapshot());
  assert.equal(handoff.applicable, false);
  assert.equal(handoff.status, 'NOT_APPLICABLE');
});

test('an accepted final package the audit has evaluated reads as current', () => {
  const handoff = sharedAccountingHandoff(snapshot({
    accounting: { exists: true, engagementId: 'ENG-0018-ACC-2026', fsVersion: 'v05', fsState: 'FINAL', mgmtApprovalState: 'ACCEPTED', inputGeneration: 4, auditEvaluatedGeneration: 4 },
  }));
  assert.equal(handoff.status, 'CURRENT');
  assert.equal(handoff.managementApproval, 'ACCEPTED');
  assert.equal(handoff.packageLabel, 'FS v05');
});

test('an un-evaluated generation offers the evaluate action the Senior can take', () => {
  const handoff = sharedAccountingHandoff(snapshot({
    accounting: { exists: true, engagementId: 'ENG-0018-ACC-2026', fsVersion: 'v05', fsState: 'FINAL', mgmtApprovalState: 'ACCEPTED', inputGeneration: 5, auditEvaluatedGeneration: 4 },
  }));
  assert.equal(handoff.status, 'STALE');
  assert.equal(handoff.actionLabel, 'Evaluate g5');
  assert.match(handoff.message, /g5 is ahead of the audit-evaluated g4/);
});

test('a package without management approval is pending, not current', () => {
  const handoff = sharedAccountingHandoff(snapshot({
    accounting: { exists: true, fsVersion: 'v05', fsState: 'IN_REVIEW', mgmtApprovalState: 'PENDING', inputGeneration: 2, auditEvaluatedGeneration: 2 },
  }));
  assert.equal(handoff.status, 'PENDING_APPROVAL');
});

test('a missing snapshot degrades safely instead of throwing', () => {
  assert.equal(sharedAccountingHandoff(null).applicable, false);
  assert.equal(sharedCompletionChecklist(null, AUDIT).applicable, false);
});

// ─── The completion checklist ───────────────────────────────────────────────

test('early stages wait until the upstream D1 gates are approved', () => {
  const checklist = sharedCompletionChecklist(snapshot({
    gateDetails: [gate('client-details', 'APPROVED'), gate('acceptance', 'READY')],
  }), AUDIT);
  assert.equal(checklist.applicable, true);
  assert.equal(itemState(checklist, 'client-accepted'), 'ATTENTION');
  assert.equal(itemState(checklist, 'staffing'), 'PENDING');
  assert.equal(itemState(checklist, 'release'), 'PENDING');
  assert.equal(checklist.complete, false);
});

test('the staffing step uses the D1 roster through the shared profile', () => {
  const checklist = sharedCompletionChecklist(snapshot({
    auditCommenced: true,
    team: [{ role: 'engagement_partner', actorId: 'ACT-PARTNER' }],
    gateDetails: [
      gate('client-details', 'APPROVED'), gate('client-evaluation', 'APPROVED'), gate('acceptance', 'APPROVED'),
      gate('estimate', 'APPROVED'), gate('fee-approval', 'APPROVED'), gate('el-issue', 'APPROVED'), gate('el-decision', 'APPROVED'),
      gate('advance', 'APPROVED'),
    ],
  }), AUDIT);
  assert.equal(itemState(checklist, 'terms-accepted'), 'COMPLETE');
  assert.equal(itemState(checklist, 'staffing'), 'ATTENTION');
  assert.match(checklist.items.find((item) => item.key === 'staffing').detail, /AUDIT_SENIOR_REQUIRED/);
  // Commencement is a recorded D1 fact, so it stays complete even while the
  // roster the audit ran with is reported as short.
  assert.equal(itemState(checklist, 'commenced'), 'COMPLETE');
});

test('the senior step reads D1 workpaper states through the shared gate', () => {
  const checklist = sharedCompletionChecklist(snapshot({
    auditCommenced: true,
    workpapers: [
      { id: 'WP-1', state: 'SENIOR_REVIEWED' },
      { id: 'WP-2', state: 'SUBMITTED' },
    ],
  }), AUDIT);
  assert.equal(itemState(checklist, 'workpapers'), 'COMPLETE');
  assert.equal(itemState(checklist, 'senior-review'), 'ATTENTION');
  assert.match(checklist.items.find((item) => item.key === 'senior-review').detail, /1\/2 cleared/);
});

test('a fully approved D1 record completes the checklist', () => {
  const approved = [
    'client-details', 'client-evaluation', 'acceptance', 'estimate', 'fee-approval', 'el-issue', 'el-decision',
    'advance', 'pbc-readiness', 'tb-source', 'accounting-package', 'workpapers', 'review-points', 'draft-fs',
    'manager-completion', 'partner-review', 'eqr', 'opinion', 'final-discussion', 'release', 'invoice', 'commercial-close',
  ].map((id) => gate(id, 'APPROVED'));
  const checklist = sharedCompletionChecklist(snapshot({
    auditCommenced: true,
    gateDetails: approved,
    team: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
      { role: 'eqr_reviewer', actorId: 'ACT-YUSUF' },
      { role: 'accounting_reviewer', actorId: 'ACT-LEILA' },
    ],
    workpapers: [{ id: 'WP-1', state: 'SENIOR_REVIEWED' }],
    accounting: { exists: true, fsVersion: 'v05', fsState: 'FINAL', mgmtApprovalState: 'ACCEPTED', inputGeneration: 3, auditEvaluatedGeneration: 3 },
  }), AUDIT);
  const outstanding = checklist.items.filter((item) => item.state !== 'COMPLETE').map((item) => `${item.key}=${item.state}`);
  assert.deepEqual(outstanding, [], `every D1 step should read as recorded: ${outstanding.join(', ')}`);
  assert.equal(checklist.complete, true);
});

test('a blocked D1 gate is reported as attention with its own reason', () => {
  const checklist = sharedCompletionChecklist(snapshot({
    auditCommenced: true,
    gateDetails: [gate('pbc-readiness', 'OVERDUE', { reason: '3 request(s) are past due and not accepted.', ownerRole: 'client_contributor', route: 'pbc' })],
    team: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
    workpapers: [{ id: 'WP-1', state: 'SENIOR_REVIEWED' }],
  }), AUDIT);
  assert.equal(itemState(checklist, 'pbc'), 'ATTENTION');
  assert.match(checklist.items.find((item) => item.key === 'pbc').detail, /past due/);
});

test('an accounting engagement is not described by the audit checklist', () => {
  const checklist = sharedCompletionChecklist(snapshot({ service: 'ACCOUNTING' }), 'ENG-0018-ACC-2026');
  assert.equal(checklist.applicable, false);
});
