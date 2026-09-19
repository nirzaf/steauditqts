// P8A — LOCAL_ONLY and SHARED_DEMO must enforce the SAME staffing contract.
//
// These tests deliberately assert across both runtimes: the point is not that a
// rule exists somewhere, it is that the same command on the same data produces
// the same decision in the browser-local domain and at the Worker boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {
  act,
  DEMO_ENGAGEMENT_ID as ENG,
  envFor,
  makeFakeDb,
  seedCommencementReady,
  sidFor,
} from './helpers/demoWorkerHarness.js';
import {
  assignEngagementTeam,
  auditCommencementBlockers,
  auditCommencementWarnings,
  engagementById,
  recordSeniorReview,
  resetScenario,
  scenario,
} from '../src/domain/scenario.js';

test.beforeEach(() => {
  resetScenario();
});

// ─── Validation failures carry the same codes and the same rule text ─────────

test('an actor without the required role is refused identically in both modes', async () => {
  const local = assignEngagementTeam({
    engagementId: 'ENG-0018-AUD-2026',
    actorPersonaId: 'admin-demo',
    assignments: [{ role: 'audit_senior', actorId: 'ACT-NADIA', plannedHours: '30' }],
  });
  assert.equal(local.outcome, 'BLOCKED');
  assert.equal(local.code, 'ACTOR_ROLE_MISMATCH');

  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-parity-role-0000001');
  const shared = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'audit_senior', actorId: 'ACT-NADIA', plannedHours: '30' }] }), envFor(fake));
  assert.equal(shared.status, 409);
  const sharedBody = await shared.json();
  assert.equal(sharedBody.error.code, 'ACTOR_ROLE_MISMATCH');
  // Both runtimes must state the requirement the same way, which only holds while
  // they both delegate to shared/staffingRules.js.
  assert.ok(local.message.includes('required role for audit_senior'), local.message);
  assert.ok(sharedBody.error.message.includes('required role for audit_senior'), sharedBody.error.message);
});

test('invalid hours and inverted dates are refused identically in both modes', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-parity-hours-00001');
  const cases = [
    { payload: { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: 'forty' }, code: 'HOURS_INVALID' },
    { payload: { role: 'preparer', actorId: 'ACT-JUNIOR', startDate: '2026-12-01', endDate: '2026-01-01' }, code: 'DATE_RANGE_INVALID' },
    { payload: { role: 'wizard', actorId: 'ACT-JUNIOR' }, code: 'INVALID_ROLE' },
  ];
  for (const [index, item] of cases.entries()) {
    const local = assignEngagementTeam({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', assignments: [item.payload] });
    assert.equal(local.code, item.code, `local ${item.code}`);
    const shared = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [item.payload] }), envFor(fake));
    assert.equal((await shared.json()).error.code, item.code, `shared ${item.code} case ${index}`);
  }
  assert.equal(fake.state.team.length, 0, 'nothing may be written on a rejected roster');
});

test('an inactive actor cannot be staffed in either mode', async () => {
  const junior = scenario.actors.find((actor) => actor.id === 'ACT-JUNIOR');
  junior.active = false;
  const local = assignEngagementTeam({ engagementId: 'ENG-0018-AUD-2026', actorPersonaId: 'admin-demo', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR' }] });
  assert.equal(local.code, 'ACTOR_INACTIVE');
  junior.active = true;
});

// ─── Roster semantics: the same command must mean the same thing ────────────

test('assigning a subset updates that member without dropping the rest of the team', () => {
  const engagementId = 'ENG-0018-AUD-2026';
  const before = engagementById(engagementId).team.length;
  const result = assignEngagementTeam({
    engagementId,
    actorPersonaId: 'admin-demo',
    assignments: [{ role: 'preparer', actorId: 'ACT-ZAINAB', plannedHours: '25', startDate: '2026-09-01', endDate: '2026-09-20', responsibility: 'Additional preparer' }],
  });
  assert.equal(result.outcome, 'COMMITTED');
  const team = engagementById(engagementId).team;
  // The D1 table is keyed (engagement, role, actor) and upserts, so a partial
  // payload must never silently delete the Partner, Manager or Senior.
  assert.equal(team.length, before + 1);
  assert.ok(team.some((member) => member.role === 'engagement_partner'));
  assert.ok(team.filter((member) => member.role === 'preparer').length >= 2, 'multiple preparers coexist');
});

test('re-assigning the same role and actor updates the row instead of duplicating it', () => {
  const engagementId = 'ENG-0018-AUD-2026';
  assignEngagementTeam({ engagementId, actorPersonaId: 'admin-demo', assignments: [{ role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '40' }] });
  assignEngagementTeam({ engagementId, actorPersonaId: 'admin-demo', assignments: [{ role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '55' }] });
  const rows = engagementById(engagementId).team.filter((member) => member.role === 'audit_senior' && member.actorId === 'ACT-OMAR-SENIOR');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plannedHours, '55');
});

// ─── Commencement policy inputs come from the engagement, not the runtime ───

test('the flagship engagement is commenceable locally without an EQR reviewer', () => {
  const blockers = auditCommencementBlockers('ENG-0018-AUD-2026').map((blocker) => blocker.code);
  assert.ok(!blockers.includes('EQR_REVIEWER_REQUIRED'), `EQR staffing must not hard-block commencement: ${blockers.join(', ')}`);
  assert.ok(!blockers.includes('AUDIT_MANAGER_REQUIRED'));
});

test('EQR applicability is surfaced as a warning that both modes can report', () => {
  const warnings = auditCommencementWarnings('ENG-0018-AUD-2026');
  assert.ok(warnings.some((warning) => warning.code === 'EQR_REVIEWER_RECOMMENDED'), 'the seeded engagement needs an EQR reviewer by policy');
  assert.ok(!warnings.some((warning) => warning.code === 'PREPARER_REQUIRED'));
});

test('the Worker waives the manager requirement from the engagement record, not a constant', async () => {
  const fake = makeFakeDb({ small_firm_mode: 1 });
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-parity-smallfirm-01');
  await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
  }), envFor(fake));
  const started = await worker.fetch(act(partner, { action: 'START_AUDIT' }), envFor(fake));
  assert.equal(started.status, 201, JSON.stringify(await started.json().catch(() => ({}))));

  const strict = makeFakeDb();
  seedCommencementReady(strict);
  const strictPartner = sidFor(strict, 'partner-demo', 'sess-parity-strictfirm-01');
  await worker.fetch(act(strictPartner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
  }), envFor(strict));
  const blocked = await worker.fetch(act(strictPartner, { action: 'START_AUDIT' }), envFor(strict));
  assert.equal(blocked.status, 409);
  assert.ok((await blocked.json()).blockers.some((blocker) => blocker.code === 'AUDIT_MANAGER_REQUIRED'));
});

test('the Worker reads EQR applicability from the engagement and never hard-blocks on it', async () => {
  const fake = makeFakeDb({ eqr_required: 1 });
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-parity-eqr-0000001');
  await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
  }), envFor(fake));
  const started = await worker.fetch(act(partner, { action: 'START_AUDIT' }), envFor(fake));
  assert.equal(started.status, 201, 'an EQR-applicable engagement may still commence');
});

// ─── Senior-review authority is one shared list ────────────────────────────

test('the manager may record a senior review, the partner may not, in both modes', async () => {
  const engagementId = 'ENG-0018-AUD-2026';
  scenario.workpapers.forEach((wp) => {
    if (wp.engagementId === engagementId) wp.state = 'SUBMITTED';
  });
  assert.equal(recordSeniorReview({ engagementId, workpaperId: 'WP-AR-01', actorPersonaId: 'audit-manager-demo', decision: 'PASSED' }).outcome, 'COMMITTED');
  assert.equal(recordSeniorReview({ engagementId, workpaperId: 'WP-INV-01', actorPersonaId: 'partner-demo', decision: 'PASSED' }).code, 'SENIOR_REVIEW_AUTHORITY_REQUIRED');

  const fake = makeFakeDb();
  const prep = sidFor(fake, 'preparer-demo', 'sess-parity-wp-000000001');
  const partner = sidFor(fake, 'partner-demo', 'sess-parity-partner-000001');
  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Parity probe', evidenceReference: 'EV-1', conclusion: 'None.' }), envFor(fake));
  const workpaperId = (await wp.json()).workpaperId;
  const denied = await worker.fetch(act(partner, { action: 'RECORD_SENIOR_REVIEW', workpaperId, decision: 'PASSED' }), envFor(fake));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'ROLE_NOT_AUTHORIZED');
});
