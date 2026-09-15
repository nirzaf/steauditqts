import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { clientEvaluationQuestionIds } from '../src/domain/questionBanks.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};

const PERSONA_ACTOR = {
  'admin-demo': 'ACT-MAYA',
  'partner-demo': 'ACT-PARTNER',
  'client-demo': 'ACT-NADIA',
  'audit-senior-demo': 'ACT-OMAR-SENIOR',
  'finance-demo': 'ACT-AISHA',
  'preparer-demo': 'ACT-JUNIOR',
};

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([
      ['ENG-0018-AUD-2026', { engagement_id: 'ENG-0018-AUD-2026', client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }],
      ['ENG-0009-ACC-2026', { engagement_id: 'ENG-0009-ACC-2026', client_id: 'CLI-0009', service: 'ACC', period: 'FY2026', revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }],
    ]),
    profiles: new Map(),
    decisions: [],
    assessments: new Map(),
    assessmentResponses: [],
    commercial: new Map(),
    commercialWrites: 0,
    credentials: [],
    tasks: new Map(),
    artifacts: [],
    outbox: [],
    events: [],
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_client_profiles')) state.profiles.set(p[0], { engagement_id: p[0], legal_name: p[1], contact_email: p[4] });
    else if (sql.includes('UPDATE auditflow_engagement_state SET revision = revision + 1, current_stage')) {
      const row = state.engagements.get(p[0]); if (row) { row.revision += 1; row.current_stage = p[1]; row.updated_at = '2026-09-14 01:00:00'; }
    }
    else if (sql.includes('UPDATE auditflow_engagement_state SET revision = revision + 1, updated_at')) {
      const row = state.engagements.get(p[0]); if (row) { row.revision += 1; row.updated_at = '2026-09-14 01:00:00'; }
    }
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], state: p[5] });
    else if (sql.includes("UPDATE auditflow_tasks SET state = 'COMPLETE'")) { const t = state.tasks.get(p[0]); if (t) t.state = 'COMPLETE'; }
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ engagement_id: p[1], action: p[3], idempotency_key: p[8] });
    else if (sql.includes('INSERT INTO auditflow_decisions')) state.decisions.push({ decision: p[3], decided_by: p[4] });
    else if (sql.includes('INSERT INTO auditflow_commercial')) {
      state.commercialWrites += 1;
      const prev = state.commercial.get(p[0]);
      state.commercial.set(p[0], { engagement_id: p[0], advance_state: 'VERIFIED', advance_reference: p[1], revision: (prev?.revision || 0) + 1 });
    }
    else if (sql.includes('INSERT INTO auditflow_credentials')) state.credentials.push({ credential_id: p[0], engagement_id: p[1], password_hash: p[3] });
    else if (sql.includes('INSERT INTO auditflow_assessments')) state.assessments.set(p[0], { assessment_id: p[0], engagement_id: p[1], type: p[2], template_version: p[3], revision: 1, updated_at: '2026-09-14 00:00:00' });
    else if (sql.includes('INSERT INTO auditflow_assessment_responses')) state.assessmentResponses.push({ assessment_id: p[0], question_id: p[1], answer: p[2], applicability: p[3], verification: p[4], explanation: p[5], evidence_ref: p[6], responder: p[7], verifier: p[8], updated_at: '2026-09-14 00:00:00' });
    else if (sql.includes('UPDATE auditflow_assessments SET revision')) { const a = state.assessments.get(p[0]); if (a) a.revision += 1; }
    else if (sql.includes('INSERT INTO auditflow_artifacts')) state.artifacts.push({ document_id: p[0] });
    else if (sql.includes('INSERT INTO auditflow_outbox')) state.outbox.push({ message_id: p[0] });
  }
  function one(sql, p) {
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_assessments')) return [...state.assessments.values()].find((a) => a.engagement_id === p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1]) || null;
    if (sql.includes('FROM auditflow_commercial')) return state.commercial.get(p[0]) || null;
    if (sql.includes('FROM auditflow_credentials')) return [...state.credentials].reverse().find((c) => c.engagement_id === p[0]) ? { credential_id: state.credentials[state.credentials.length - 1].credential_id } : null;
    return null;
  }
  function all(sql, p) {
    if (sql.includes('FROM auditflow_assessment_responses')) return { results: state.assessmentResponses.filter((r) => r.assessment_id === p[0]) };
    return { results: [] };
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() { return all(sql, params); },
      });
      return { bind: (...params) => bound(...params), async run() { apply(sql, []); return { success: true }; }, async first() { return one(sql, []); }, async all() { return all(sql, []); } };
    },
  };
  return { state, db };
}

function seedClearAssessment(fake, engagementId, skipIds = []) {
  const assessmentId = 'ASMT-seed-' + engagementId;
  fake.state.assessments.set(assessmentId, { assessment_id: assessmentId, engagement_id: engagementId, type: 'acceptance', template_version: 'v4-2026-01', revision: 4, updated_at: '2026-09-14 00:00:00' });
  for (const questionId of clientEvaluationQuestionIds) {
    if (skipIds.includes(questionId)) continue;
    fake.state.assessmentResponses.push({
      assessment_id: assessmentId, question_id: questionId,
      answer: questionId === 'CE-032' ? 'NO_MATCH' : 'YES',
      applicability: 'APPLICABLE', verification: 'VERIFIED', explanation: 'Seeded synthetic evidence.',
      evidence_ref: '', responder: 'ACT-SARA', verifier: 'ACT-PARTNER', updated_at: '2026-09-14 00:00:00',
    });
  }
  return assessmentId;
}

function envFor(fake) {
  return { DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' };
}

function sessionFor(fake, personaId, sid) {
  fake.state.sessions.set(sid, { session_id: sid, persona_id: personaId, actor_id: PERSONA_ACTOR[personaId], expires_at: '2099-01-01 00:00:00' });
  return sid;
}

function actionReq(engagementId, sid, body) {
  return new Request(`https://ste.quadrate.lk/api/engagements/${engagementId}/actions`, {
    method: 'POST',
    headers: { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` },
    body: JSON.stringify(body),
  });
}

const PROFILE = { legalName: 'Northstar Trading W.L.L.', registration: 'CR-12345', contactName: 'Nadia Faris', contactEmail: 'nadia@northstar.demo', phone: '+974 4400 0000', servicePeriod: 'FY2026', serviceRequested: 'Statutory audit', context: 'Synthetic demo' };

test('client details: client commits, partner cannot submit, validation enforced', async () => {
  const fake = makeFakeDb();
  const sid = sessionFor(fake, 'client-demo', 'sess-client-details-01');
  const ok = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'SUBMIT_CLIENT_DETAILS', ...PROFILE }), envFor(fake));
  assert.equal(ok.status, 201);
  assert.equal(fake.state.events.at(-1).action, 'CLIENT_DETAILS_SUBMITTED');
  assert.equal(fake.state.tasks.get('acceptance-ENG-0018-AUD-2026').state, 'OPEN');

  const bad = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'SUBMIT_CLIENT_DETAILS', ...PROFILE, contactEmail: 'not-an-email' }), envFor(fake));
  assert.equal(bad.status, 400);

  const partnerSid = sessionFor(fake, 'partner-demo', 'sess-partner-submit-01');
  const denied = await worker.fetch(actionReq('ENG-0018-AUD-2026', partnerSid, { action: 'SUBMIT_CLIENT_DETAILS', ...PROFILE }), envFor(fake));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'ROLE_NOT_AUTHORIZED');
});

test('acceptance: partner decides with rationale, stale revision conflicts, client blocked', async () => {
  const fake = makeFakeDb();
  const clientSid = sessionFor(fake, 'client-demo', 'sess-client-accept-0001');
  const blocked = await worker.fetch(actionReq('ENG-0018-AUD-2026', clientSid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'looks fine' }), envFor(fake));
  assert.equal(blocked.status, 403);

  const sid = sessionFor(fake, 'partner-demo', 'sess-partner-accept-001');
  const noRationale = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: '' }), envFor(fake));
  assert.equal(noRationale.status, 400);

  const stale = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Evidence complete.', expectedRevision: 99 }), envFor(fake));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'REVISION_CONFLICT');

  const notStarted = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Evidence complete.', expectedRevision: 1 }), envFor(fake));
  assert.equal(notStarted.status, 409);
  assert.equal((await notStarted.json()).error.code, 'EVALUATION_NOT_STARTED');

  seedClearAssessment(fake, 'ENG-0018-AUD-2026', ['CE-011']);
  const held = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Evidence complete.', expectedRevision: 1 }), envFor(fake));
  assert.equal(held.status, 409);
  assert.equal((await held.json()).error.code, 'EVALUATION_HOLDS');

  seedClearAssessment(fake, 'ENG-0018-AUD-2026');
  const ok = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Evidence complete.', expectedRevision: 1 }), envFor(fake));
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.equal(body.engagement.currentStage, 'STAGE-02');
  assert.equal(fake.state.decisions.at(-1).decision, 'ACCEPT');
});

test('advance: finance-only, idempotent on retry key', async () => {
  const fake = makeFakeDb();
  const seniorSid = sessionFor(fake, 'audit-senior-demo', 'sess-senior-advance-001');
  const denied = await worker.fetch(actionReq('ENG-0018-AUD-2026', seniorSid, { action: 'VERIFY_ADVANCE', reference: 'PAY-SIM-0018' }), envFor(fake));
  assert.equal(denied.status, 403);

  const sid = sessionFor(fake, 'finance-demo', 'sess-finance-advance-01');
  const first = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'VERIFY_ADVANCE', reference: 'PAY-SIM-0018', idempotencyKey: 'advance-0018-v1' }), envFor(fake));
  assert.equal(first.status, 201);
  assert.equal((await first.json()).duplicate, false);
  const retry = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'VERIFY_ADVANCE', reference: 'PAY-SIM-0018', idempotencyKey: 'advance-0018-v1' }), envFor(fake));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(fake.state.commercialWrites, 1);
});

test('credential: blocked before advance, one-time password hashed, no duplicate issue', async () => {
  const fake = makeFakeDb();
  const sid = sessionFor(fake, 'partner-demo', 'sess-partner-credent-01');
  const early = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ISSUE_TEMP_CREDENTIAL' }), envFor(fake));
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'PRECONDITION_FAILED');

  const finSid = sessionFor(fake, 'finance-demo', 'sess-finance-credent-001');
  await worker.fetch(actionReq('ENG-0018-AUD-2026', finSid, { action: 'VERIFY_ADVANCE', reference: 'PAY-SIM-0018' }), envFor(fake));
  const issued = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ISSUE_TEMP_CREDENTIAL' }), envFor(fake));
  assert.equal(issued.status, 201);
  const body = await issued.json();
  assert.ok(body.temporaryPassword?.startsWith('STE-'));
  const stored = fake.state.credentials.at(-1);
  assert.equal(stored.password_hash.length, 64);
  assert.ok(!stored.password_hash.includes(body.temporaryPassword));

  const again = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ISSUE_TEMP_CREDENTIAL' }), envFor(fake));
  assert.equal((await again.json()).duplicate, true);
  assert.equal(fake.state.credentials.length, 1);
});

test('announcement: senior issues artifact + client notification; scope enforced', async () => {
  const fake = makeFakeDb();
  const sid = sessionFor(fake, 'audit-senior-demo', 'sess-senior-announce-001');
  const ok = await worker.fetch(actionReq('ENG-0018-AUD-2026', sid, { action: 'ISSUE_ANNOUNCEMENT', subject: 'FY2026 fieldwork dates', plannedDates: 'Oct 5-16' }), envFor(fake));
  assert.equal(ok.status, 201);
  assert.equal(fake.state.artifacts.length, 1);
  assert.equal(fake.state.outbox.length, 1);
  assert.equal((await ok.json()).engagement.currentStage, 'STAGE-04');

  const clientSid = sessionFor(fake, 'client-demo', 'sess-client-announce-001');
  const denied = await worker.fetch(actionReq('ENG-0018-AUD-2026', clientSid, { action: 'ISSUE_ANNOUNCEMENT', subject: 'x' }), envFor(fake));
  assert.equal(denied.status, 403);

  const prepSid = sessionFor(fake, 'preparer-demo', 'sess-preparer-scope-0001');
  const scoped = await worker.fetch(actionReq('ENG-0009-ACC-2026', prepSid, { action: 'ISSUE_ANNOUNCEMENT', subject: 'x' }), envFor(fake));
  assert.equal(scoped.status, 403);
  assert.equal((await scoped.json()).error.code, 'SCOPE_DENIED');
});
