// P8A/P8B — focused Worker coverage for:
//   * strict staffing validation at ASSIGN_ENGAGEMENT_TEAM (role/actor/hours/dates)
//   * the START_AUDIT commencement staffing profile (no more preparer-only hole)
//   * the senior-review gate before manager completion
//   * SENIOR_REVIEWED workpapers still counting as submitted
//   * P4 automatic next-owner task handoffs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { DEMO_ENGAGEMENT_ID as ENG, act, envFor, makeFakeDb, seedCommencementReady, sidFor } from './helpers/demoWorkerHarness.js';

test('ASSIGN_ENGAGEMENT_TEAM enforces actor role matrix, hours and dates', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-staff-00000001');
  const env = envFor(fake);

  const roleMismatch = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'audit_senior', actorId: 'ACT-JUNIOR', plannedHours: '40' }] }), env);
  assert.equal(roleMismatch.status, 409);
  assert.equal((await roleMismatch.json()).error.code, 'ACTOR_ROLE_MISMATCH');

  const notFound = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-GHOST' }] }), env);
  assert.equal((await notFound.json()).error.code, 'ACTOR_NOT_FOUND');

  const badRole = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'wizard', actorId: 'ACT-JUNIOR' }] }), env);
  assert.equal((await badRole.json()).error.code, 'INVALID_ROLE');

  const badHours = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: 'forty' }] }), env);
  assert.equal((await badHours.json()).error.code, 'HOURS_INVALID');

  const badDates = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR', startDate: '2026-12-01', endDate: '2026-01-01' }] }), env);
  assert.equal((await badDates.json()).error.code, 'DATE_RANGE_INVALID');

  // Nothing written on any failure (no partial writes).
  assert.equal(fake.state.team.length, 0);

  const valid = await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '12' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '30' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '40' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '60', startDate: '2026-10-01', endDate: '2026-12-15' },
    ],
  }), env);
  assert.equal(valid.status, 201);
  assert.equal(fake.state.team.length, 4);
});

test('START_AUDIT rejects a preparer-only team with the full blocker profile', async () => {
  const fake = makeFakeDb();
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-start-00000001');
  const env = envFor(fake);
  await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR' }] }), env);
  const blocked = await worker.fetch(act(partner, { action: 'START_AUDIT' }), env);
  assert.equal(blocked.status, 409);
  const body = await blocked.json();
  const codes = (body.blockers || []).map((b) => b.code);
  assert.ok(codes.includes('PARTNER_REQUIRED'));
  assert.ok(codes.includes('AUDIT_SENIOR_REQUIRED'));
  assert.ok(codes.includes('AUDIT_MANAGER_REQUIRED'));
  assert.ok(!codes.includes('PREPARER_REQUIRED'));
  assert.equal(fake.state.engagements.get(ENG).audit_commenced, 0);
});

test('START_AUDIT succeeds with the full staffing profile and opens fieldwork task', async () => {
  const fake = makeFakeDb();
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-start-00000002');
  const env = envFor(fake);
  await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
  }), env);
  const started = await worker.fetch(act(partner, { action: 'START_AUDIT' }), env);
  assert.equal(started.status, 201);
  assert.equal(fake.state.engagements.get(ENG).audit_commenced, 1);
  assert.equal(fake.state.tasks.get(`audit-fieldwork-${ENG}`)?.state, 'OPEN');
  assert.ok(fake.state.outbox.some((m) => m.subject === 'Audit Commencement Notice'));
});

test('manager completion requires senior review; SENIOR_REVIEWED still counts as submitted', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-p8-senior-00000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-p8-mgr-0000000001');
  const prep = sidFor(fake, 'preparer-demo', 'sess-p8-prep-000000001');
  const env = envFor(fake);

  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Revenue cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), env);
  const workpaperId = (await wp.json()).workpaperId;
  // P4 handoff: submission opens the senior review task.
  assert.equal(fake.state.tasks.get(`wp-senior-review-${workpaperId}`)?.state, 'OPEN');

  const early = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Ready.' }), env);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'SENIOR_REVIEW_REQUIRED');

  const review = await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId }), env);
  assert.equal(review.status, 200);
  const reviewBody = await review.json();
  assert.equal(reviewBody.seniorReview.complete, true);
  // P4 handoff: completing the senior gate opens the manager completion task.
  assert.equal(fake.state.tasks.get(`manager-completion-${ENG}`)?.state, 'OPEN');
  assert.equal(fake.state.tasks.get(`wp-senior-review-${workpaperId}`)?.state, 'COMPLETE');

  // Zero raw SUBMITTED rows remain — the pre-fix NO_SUBMITTED_WORKPAPERS bug
  // would fire here. It must not.
  assert.equal([...fake.state.workpapers.values()].filter((w) => w.state === 'SUBMITTED').length, 0);
  const complete = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Senior review clear.' }), env);
  assert.equal(complete.status, 201);
  // P4 handoff: manager completion opens the partner review task.
  assert.equal(fake.state.tasks.get(`partner-review-${ENG}`)?.state, 'OPEN');
  assert.equal(fake.state.tasks.get(`manager-completion-${ENG}`)?.state, 'COMPLETE');
});

test('RECORD_SENIOR_REVIEW with FAILED returns the workpaper and keeps completion blocked', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-p8-fail-000000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-p8-failmgr-0000001');
  const prep = sidFor(fake, 'preparer-demo', 'sess-p8-failprep-00001');
  const env = envFor(fake);

  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Receivables ageing', evidenceReference: 'AR-019', conclusion: 'Provision discussed.' }), env);
  const workpaperId = (await wp.json()).workpaperId;

  const returned = await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId, decision: 'FAILED', notes: 'Sample not representative; re-perform.' }), env);
  assert.equal(returned.status, 200);
  const returnedBody = await returned.json();
  assert.equal(returnedBody.seniorReview.complete, false);
  assert.equal(returnedBody.state, 'SENIOR_RETURNED');
  assert.equal(fake.state.workpapers.get(workpaperId).state, 'SENIOR_RETURNED');
  // The returned workpaper is still submitted evidence, so the file reports the
  // senior gate rather than an empty file.
  assert.equal([...fake.state.workpapers.values()].filter((w) => w.state === 'SUBMITTED').length, 0);
  // P4 handoff: the correction belongs to the preparer now.
  assert.equal(fake.state.tasks.get(`wp-correct-${workpaperId}`)?.state, 'OPEN');
  assert.equal(fake.state.tasks.get(`manager-completion-${ENG}`), undefined);

  const blocked = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Manager believes the file is ready.' }), env);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'SENIOR_REVIEW_REQUIRED');

  // Re-performing and passing clears the gate.
  await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId, decision: 'PASSED', notes: 'Re-performed sample is representative.' }), env);
  assert.equal(fake.state.workpapers.get(workpaperId).state, 'SENIOR_REVIEWED');
});

test('RECORD_SENIOR_REVIEW rejects a decision that is neither PASSED nor FAILED', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-p8-dec-000000001');
  const prep = sidFor(fake, 'preparer-demo', 'sess-p8-decprep-000001');
  const env = envFor(fake);
  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Inventory cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), env);
  const workpaperId = (await wp.json()).workpaperId;
  const invalid = await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId, decision: 'LOOKS_FINE' }), env);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'SENIOR_REVIEW_DECISION_INVALID');
  assert.equal(fake.state.workpapers.get(workpaperId).state, 'SUBMITTED');
});

test('lead qualification opens a deterministic conversion task', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-lead-000000001');
  const env = envFor(fake);
  await worker.fetch(act(partner, { action: 'CREATE_LEAD', leadId: 'LEAD-P8-001', name: 'Rashid', company: 'Falcon Trading', email: 'rashid@falcon.demo' }), env, 'DEMO-LEADS');
  const qualified = await worker.fetch(act(partner, { action: 'QUALIFY_LEAD', leadId: 'LEAD-P8-001' }), env, 'DEMO-LEADS');
  assert.equal(qualified.status, 200);
  assert.equal(fake.state.tasks.get('lead-convert-LEAD-P8-001')?.state, 'OPEN');
});
