import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ACTOR = { 'partner-demo': 'ACT-PARTNER', 'client-demo': 'ACT-NADIA', 'client-management-demo': 'ACT-NADIA-MGMT', 'audit-senior-demo': 'ACT-OMAR-SENIOR', 'audit-manager-demo': 'ACT-OMAR', 'finance-demo': 'ACT-AISHA' };

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([
      ['ENG-0018-AUD-2026', { engagement_id: 'ENG-0018-AUD-2026', client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-02', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }],
      ['ENG-0009-ACC-2026', { engagement_id: 'ENG-0009-ACC-2026', client_id: 'CLI-0009', service: 'ACC', period: 'FY2026', revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }],
    ]),
    commercial: new Map(),
    decisions: [],
    tasks: new Map(),
    requests: new Map(),
    receipts: [],
    events: [],
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_commercial')) {
      const prev = state.commercial.get(p[0]);
      state.commercial.set(p[0], { engagement_id: p[0], estimate_hours: p[1], estimate_cost: p[2], advance_required: p[3], advance_state: 'PENDING', fee_state: 'DRAFT', el_version: '', el_state: 'DRAFT', revision: (prev?.revision || 0) + 1 });
    }
    else if (sql.includes('UPDATE auditflow_commercial SET approved_fee')) {
      const c = state.commercial.get(p[0]);
      Object.assign(c, { approved_fee: p[1], fee_state: 'APPROVED', quotation_id: p[2], quotation_state: 'ISSUED', el_version: 'EL-2026-01', el_state: 'PENDING_CLIENT', revision: c.revision + 1 });
    }
    else if (sql.includes('UPDATE auditflow_commercial SET el_state')) {
      const c = state.commercial.get(p[0]); c.el_state = p[1]; c.revision += 1;
    }
    else if (sql.includes('UPDATE auditflow_engagement_state SET revision')) { const r = state.engagements.get(p[0]); if (r) r.revision += 1; }
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], state: p[5] });
    else if (sql.includes("UPDATE auditflow_tasks SET state = 'COMPLETE'")) { const t = state.tasks.get(p[0]); if (t) t.state = 'COMPLETE'; }
    else if (sql.includes('INSERT INTO auditflow_decisions')) state.decisions.push({ type: 'EL', decision: p[3] });
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ action: p[3] });
    else if (sql.includes('INSERT INTO auditflow_pbc_requests')) state.requests.set(p[0], { request_id: p[0], engagement_id: p[1], title: p[2], state: 'OPEN' });
    else if (sql.includes('INSERT INTO auditflow_pbc_receipts')) state.receipts.push({ receipt_id: p[0], request_id: p[1], engagement_id: p[2], version: p[7], state: 'RECEIVED' });
    else if (sql.includes('UPDATE auditflow_pbc_receipts SET state')) { const r = state.receipts.find((x) => x.receipt_id === p[0]); if (r) r.state = p[1]; }
    else if (sql.includes('UPDATE auditflow_pbc_requests SET state')) { const r = state.requests.get(p[0]); if (r) { r.state = p[1]; } }
  }
  function one(sql, p) {
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_commercial')) return state.commercial.get(p[0]) || null;
    if (sql.includes('FROM auditflow_pbc_requests WHERE request_id')) return state.requests.get(p[0]) || null;
    if (sql.includes('FROM auditflow_pbc_receipts WHERE receipt_id')) return state.receipts.find((x) => x.receipt_id === p[0]) || null;
    if (sql.includes('COUNT(*)')) return { n: state.receipts.filter((x) => x.request_id === p[0]).length };
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1]) || null;
    return null;
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() { return { results: [] }; },
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
const ENG = 'ENG-0018-AUD-2026';
const act = (eng, sid, body) => new Request(`https://ste.quadrate.lk/api/engagements/${eng}/actions`, { method: 'POST', headers: { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` }, body: JSON.stringify(body) });

test('commercial: estimate then approval mints quote+EL; quote never auto-accepts', async () => {
  const fake = makeFakeDb();
  void fake;
  const fin = sidFor(fake, 'finance-demo', 'sess-fin-estimate-000001');
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-sen-estimate-000001');
  const denied = await worker.fetch(act(ENG, senior, { action: 'RECORD_ESTIMATE', estimateHours: '120', estimateCost: '30000.00', advanceRequired: '9000.00' }), envFor(fake));
  assert.equal(denied.status, 403);
  const badMoney = await worker.fetch(act(ENG, fin, { action: 'RECORD_ESTIMATE', estimateHours: '120', estimateCost: '30x.00', advanceRequired: '9000.00' }), envFor(fake));
  assert.equal(badMoney.status, 400);
  const recorded = await worker.fetch(act(ENG, fin, { action: 'RECORD_ESTIMATE', estimateHours: '120', estimateCost: '30000.00', advanceRequired: '9000.00' }), envFor(fake));
  assert.equal(recorded.status, 201);

  const partner = sidFor(fake, 'partner-demo', 'sess-partner-fee-000001');
  const early = await worker.fetch(act('ENG-0009-ACC-2026', partner, { action: 'APPROVE_FEE', approvedFee: '36000.00' }), envFor(fake));
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'PRECONDITION_FAILED');
  const approved = await worker.fetch(act(ENG, partner, { action: 'APPROVE_FEE', approvedFee: '36000.00' }), envFor(fake));
  assert.equal(approved.status, 201);
  const commercial = (await approved.json()).commercial;
  assert.equal(commercial.fee_state, 'APPROVED');
  assert.equal(commercial.el_version, 'EL-2026-01');
  assert.equal(commercial.el_state, 'PENDING_CLIENT');
});

test('engagement letter: exact-version binding, reject needs explanation', async () => {
  const fake = makeFakeDb();
  void fake;
  const fin = sidFor(fake, 'finance-demo', 'sess-fin-el-000000000001');
  await worker.fetch(act(ENG, fin, { action: 'RECORD_ESTIMATE', estimateHours: '120', estimateCost: '30000.00', advanceRequired: '9000.00' }), envFor(fake));
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-el-00000001');
  await worker.fetch(act(ENG, partner, { action: 'APPROVE_FEE', approvedFee: '36000.00' }), envFor(fake));
  const mgmt = sidFor(fake, 'client-management-demo', 'sess-mgmt-el-0000000001');
  const stale = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_EL', decision: 'ACCEPT', version: 'EL-2025-09', rationale: 'ok' }), envFor(fake));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'VERSION_MISMATCH');
  const silentReject = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_EL', decision: 'REJECT', version: 'EL-2026-01', rationale: '' }), envFor(fake));
  assert.equal(silentReject.status, 400);
  const rejected = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_EL', decision: 'REJECT', version: 'EL-2026-01', rationale: 'Fee basis unclear for Cedar scope.' }), envFor(fake));
  assert.equal(rejected.status, 201);
  assert.equal(fake.state.decisions.at(-1).decision, 'REJECT');
  const client = sidFor(fake, 'client-demo', 'sess-client-el-000000001');
  const wrongRole = await worker.fetch(act(ENG, client, { action: 'APPROVE_FEE', approvedFee: '1.00' }), envFor(fake));
  assert.equal(wrongRole.status, 403);
});

test('PBC: senior creates, client submits versions, senior accepts with history', async () => {
  const fake = makeFakeDb();
  void fake;
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-senior-pbc-00000001');
  const client = sidFor(fake, 'client-demo', 'sess-client-pbc-00000001');
  const forbidden = await worker.fetch(act(ENG, client, { action: 'CREATE_PBC_REQUEST', title: 'TB FY2026' }), envFor(fake));
  assert.equal(forbidden.status, 403);
  const created = await worker.fetch(act(ENG, senior, { action: 'CREATE_PBC_REQUEST', title: 'Trial balance FY2026', period: 'FY2026', dueDate: '2026-10-05', clientOwner: 'Nadia Faris', reviewer: 'Omar Aziz', acceptanceCriteria: 'Signed totals match TB control.' }), envFor(fake));
  assert.equal(created.status, 201);
  const requestId = (await created.json()).requestId;
  assert.ok(/^PBC-/.test(requestId));
  const missing = await worker.fetch(act(ENG, client, { action: 'SUBMIT_PBC_RECEIPT', requestId: 'PBC-NOPE-1', fileName: 'tb.xlsx', fileSize: 12, mimeType: 'application/vnd.ms-excel' }), envFor(fake));
  assert.equal(missing.status, 404);
  const v1 = await worker.fetch(act(ENG, client, { action: 'SUBMIT_PBC_RECEIPT', requestId, fileName: 'tb-fy2026.xlsx', fileSize: 48210, mimeType: 'application/vnd.ms-excel', syntheticHash: 'syn-001' }), envFor(fake));
  assert.equal((await v1.json()).version, 1);
  const v2 = await worker.fetch(act(ENG, client, { action: 'SUBMIT_PBC_RECEIPT', requestId, fileName: 'tb-fy2026-r2.xlsx', fileSize: 49100, mimeType: 'application/vnd.ms-excel', syntheticHash: 'syn-002', comment: 'Corrected August payroll.' }), envFor(fake));
  const v2Body = await v2.json();
  assert.equal(v2Body.version, 2);
  assert.equal(fake.state.receipts.length, 2);
  const receiptId = v2Body.receiptId;
  const vague = await worker.fetch(act(ENG, senior, { action: 'RESPOND_PBC_RECEIPT', receiptId, decision: 'CLARIFY', note: '' }), envFor(fake));
  assert.equal(vague.status, 400);
  const clarified = await worker.fetch(act(ENG, senior, { action: 'RESPOND_PBC_RECEIPT', receiptId, decision: 'CLARIFY', note: 'Confirm the August payroll total ties to the payslip run.' }), envFor(fake));
  assert.equal(clarified.status, 200);
  assert.equal(fake.state.receipts.find((x) => x.receipt_id === receiptId).state, 'CLARIFICATION');
});
