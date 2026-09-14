import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ACTOR = {
  'partner-demo': 'ACT-PARTNER', 'audit-senior-demo': 'ACT-OMAR-SENIOR', 'audit-manager-demo': 'ACT-OMAR',
  'client-management-demo': 'ACT-NADIA-MGMT', 'eqr-demo': 'ACT-YUSUF', 'finance-demo': 'ACT-AISHA',
};
const ENG = 'ENG-0018-AUD-2026';

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-07', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }]]),
    commercial: new Map(),
    decisions: [],
    reviews: [],
    artifacts: [],
    tasks: new Map(),
    outbox: [],
    events: [],
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_commercial')) {
      const prev = state.commercial.get(p[0]);
      state.commercial.set(p[0], { engagement_id: p[0], estimate_hours: p[1], estimate_cost: p[2], advance_required: p[3], advance_state: 'PENDING', fee_state: 'DRAFT', el_version: '', el_state: 'DRAFT', actual_hours: '0', actual_cost: '0.00', invoice_id: '', invoice_state: 'DRAFT', commercial_close: 'OPEN', revision: (prev?.revision || 0) + 1 });
    }
    else if (sql.includes('UPDATE auditflow_commercial SET approved_fee')) {
      const c = state.commercial.get(p[0]);
      Object.assign(c, { approved_fee: p[1], fee_state: 'APPROVED', quotation_id: p[2], quotation_state: 'ISSUED', el_version: 'EL-2026-01', el_state: 'PENDING_CLIENT', revision: c.revision + 1 });
    }
    else if (sql.includes('UPDATE auditflow_commercial SET actual_hours')) {
      const c = state.commercial.get(p[0]);
      Object.assign(c, { actual_hours: p[1], actual_cost: p[2], invoice_id: p[3], invoice_state: 'ISSUED', revision: c.revision + 1 });
    }
    else if (sql.includes('INSERT INTO auditflow_decisions')) {
      const kind = (sql.match(/'(ACCEPTANCE|ENGAGEMENT_LETTER|DRAFT_FS|EQR|AUDIT_OPINION|RELEASE)'/) || [])[1] || 'UNKNOWN';
      state.decisions.push({ decision_id: p[0], decision_id_alias: p[0], type: kind, object_version: p[2], version: p[2], decision: kind === 'RELEASE' ? 'RELEASED' : p[3] });
    }
    else if (sql.includes('INSERT INTO auditflow_artifacts')) state.artifacts.push({ document_id: p[0], engagement_id: p[1], document_type: sql.includes("'FINAL_REPORT'") ? 'FINAL_REPORT' : sql.includes("'FINAL_FS'") ? 'FINAL_FS' : 'DRAFT_FS', version: p[3], state: 'PUBLISHED', created_at: `2026-09-14 0${state.artifacts.length}:00:00` });
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], state: p[5] });
    else if (sql.includes("UPDATE auditflow_tasks SET state = 'COMPLETE'")) { const t = state.tasks.get(p[0]); if (t) t.state = 'COMPLETE'; }
    else if (sql.includes('INSERT INTO auditflow_outbox')) state.outbox.push({ channel: p[2], state: 'QUEUED_SIMULATION' });
    else if (sql.includes('UPDATE auditflow_engagement_state')) { const r = state.engagements.get(p[0]); if (r) { r.revision += 1; if (sql.includes('current_stage')) r.current_stage = p[1]; } }
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ action: p[3] });
  }
  function one(sql, p) {
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_commercial')) return state.commercial.get(p[0]) || null;
    if (sql.includes('FROM auditflow_decisions')) return [...state.decisions].reverse().find((d) => d.type === p[1]) || null;
    if (sql.includes('FROM auditflow_review_points')) return { n: state.reviews.filter((r) => r.state === 'OPEN').length };
    if (sql.includes('COUNT(*)') && sql.includes("document_type = 'DRAFT_FS'")) return { n: state.artifacts.filter((a) => a.document_type === 'DRAFT_FS').length };
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1]) || null;
    return null;
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() {
          if (sql.includes("document_type = 'DRAFT_FS'")) return { results: state.artifacts.filter((a) => a.engagement_id === params[0] && a.document_type === 'DRAFT_FS' && a.state === 'PUBLISHED') };
          return { results: [] };
        },
      });
      return { bind: (...params) => bound(...params), async run() { apply(sql, []); return { success: true }; }, async first() { return one(sql, []); }, async all() { return { results: [] }; } };
    },
  };
  return { state, db };
}

const envFor = (fake) => ({ DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' });
function sidFor(fake, persona, sid) {
  fake.state.sessions.set(sid, { session_id: sid, persona_id: persona, actor_id: ACTOR[persona], expires_at: '2099-01-01 00:00:00' });
  return sid;
}
const act = (sid, body) => new Request(`https://ste.quadrate.lk/api/engagements/${ENG}/actions`, { method: 'POST', headers: { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` }, body: JSON.stringify(body) });

async function driveToOpinion(fake) {
  const fin = sidFor(fake, 'finance-demo', 'sess-fin-chain-00000001');
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-chain-00001');
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-senior-chain-000001');
  const eqr = sidFor(fake, 'eqr-demo', 'sess-eqr-chain-0000000001');
  const env = envFor(fake);
  await worker.fetch(act(fin, { action: 'RECORD_ESTIMATE', estimateHours: '160', estimateCost: '32000.00', advanceRequired: '9000.00' }), env);
  await worker.fetch(act(partner, { action: 'APPROVE_FEE', approvedFee: '36000.00' }), env);
  await worker.fetch(act(senior, { action: 'PUBLISH_DRAFT_FS', summary: 'Final cut.' }), env);
  await worker.fetch(act(eqr, { action: 'COMPLETE_EQR', decision: 'APPROVE', candidateId: 'RC-READY-001', note: 'File complete.' }), env);
  await worker.fetch(act(partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Completion evidence reviewed.' }), env);
  return { fin, partner, senior, eqr };
}

test('release gates: opinion, EQR and open points block; duplicate is stable', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-rel-000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-mgr-rel-00000000001');
  const env = envFor(fake);
  const roleDenied = await worker.fetch(act(mgr, { action: 'RELEASE_FINAL_REPORT' }), env);
  assert.equal(roleDenied.status, 403);
  const noOpinion = await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT' }), env);
  assert.equal(noOpinion.status, 409);
  assert.equal((await noOpinion.json()).error.code, 'PRECONDITION_FAILED');

  await driveToOpinion(fake);
  fake.state.reviews.push({ state: 'OPEN' });
  const blocked = await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT' }), env);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'REVIEW_POINTS_OPEN');
  fake.state.reviews.length = 0;

  const released = await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT', rationale: 'All gates green.' }), env);
  assert.equal(released.status, 201);
  const body = await released.json();
  assert.equal(body.candidateVersion, 'v01');
  assert.equal(body.engagement.currentStage, 'STAGE-08');
  assert.equal(fake.state.tasks.get(`invoice-${ENG}`).state, 'OPEN');
  const again = await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT' }), env);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(fake.state.artifacts.filter((a) => a.document_type === 'FINAL_REPORT').length, 1);
});

test('EQR gate: release without approval is blocked', async () => {
  const fake = makeFakeDb();
  const fin = sidFor(fake, 'finance-demo', 'sess-fin-noeqr-00000001');
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-noeqr-00001');
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-senior-noeqr-000001');
  const env = envFor(fake);
  await worker.fetch(act(fin, { action: 'RECORD_ESTIMATE', estimateHours: '160', estimateCost: '32000.00', advanceRequired: '9000.00' }), env);
  await worker.fetch(act(partner, { action: 'APPROVE_FEE', approvedFee: '36000.00' }), env);
  await worker.fetch(act(senior, { action: 'PUBLISH_DRAFT_FS', summary: 'Final cut.' }), env);
  await worker.fetch(act(partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reviewed.' }), env);
  const blocked = await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT' }), env);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'EQR_INCOMPLETE');
});

test('invoice: needs release, allocates advance, queues simulated delivery, close stays open', async () => {
  const fake = makeFakeDb();
  const { fin, partner } = await driveToOpinion(fake);
  const env = envFor(fake);
  const early = await worker.fetch(act(fin, { action: 'CREATE_INVOICE', actualHours: '148', actualCost: '29500.00' }), env);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'PRECONDITION_FAILED');
  await worker.fetch(act(partner, { action: 'RELEASE_FINAL_REPORT' }), env);
  const wrongRole = await worker.fetch(act(partner, { action: 'CREATE_INVOICE', actualHours: '148', actualCost: '29500.00' }), env);
  assert.equal(wrongRole.status, 403);
  const invoiced = await worker.fetch(act(fin, { action: 'CREATE_INVOICE', actualHours: '148', actualCost: '29500.00' }), env);
  assert.equal(invoiced.status, 201);
  const body = await invoiced.json();
  assert.equal(body.balance, '27000.00');
  assert.ok(body.invoiceId.startsWith('INV-2026-'));
  assert.deepEqual(fake.state.outbox.map((m) => m.channel).sort(), ['EMAIL', 'PORTAL_NOTIFICATION', 'WHATSAPP']);
  assert.ok(fake.state.outbox.every((m) => m.state === 'QUEUED_SIMULATION'));
  assert.equal(body.commercial.commercial_close, 'OPEN');
  assert.equal(body.commercial.invoice_state, 'ISSUED');
});
