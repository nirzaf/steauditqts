import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ACTOR = {
  'partner-demo': 'ACT-PARTNER', 'preparer-demo': 'ACT-JUNIOR', 'audit-senior-demo': 'ACT-OMAR-SENIOR',
  'audit-manager-demo': 'ACT-OMAR', 'client-management-demo': 'ACT-NADIA-MGMT', 'eqr-demo': 'ACT-YUSUF',
  'finance-demo': 'ACT-AISHA', 'accountant-demo': 'ACT-LEILA', 'client-demo': 'ACT-NADIA',
};
const ENG = 'ENG-0018-AUD-2026';

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-04', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }]]),
    tb: new Map(),
    workpapers: new Map(),
    reviews: new Map(),
    artifacts: [],
    decisions: [],
    pbcRequests: new Map(),
    pbcReceipts: new Map(),
    tasks: new Map(),
    events: [],
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_tb_sources')) state.tb.set(`${p[1]}@${p[3]}`, { version: p[3], debit: p[7] });
    else if (sql.includes('INSERT INTO auditflow_workpapers')) state.workpapers.set(p[0], { workpaper_id: p[0], engagement_id: p[1], submitted_by: p[5], state: 'SUBMITTED', revision: 1 });
    else if (sql.includes('UPDATE auditflow_workpapers SET procedure_title')) { const w = state.workpapers.get(p[0]); if (w) { w.revision += 1; w.state = 'SUBMITTED'; w.submitted_by = p[4]; } }
    else if (sql.includes('INSERT INTO auditflow_review_points')) state.reviews.set(p[0], { review_id: p[0], engagement_id: p[1], workpaper_id: p[2], severity: p[3], owner: p[4], author: p[5], state: 'OPEN' });
    else if (sql.includes("UPDATE auditflow_review_points SET response")) { const r = state.reviews.get(p[0]); if (r) { r.response = p[1]; r.state = 'CLEARED'; } }
    else if (sql.includes('INSERT INTO auditflow_artifacts')) state.artifacts.push({ document_id: p[0], engagement_id: p[1], document_type: 'DRAFT_FS', version: p[3], state: 'PUBLISHED', created_at: `2026-09-14 0${state.artifacts.length}:00:00` });
    else if (sql.includes('INSERT INTO auditflow_decisions') && sql.includes('?8, ?9)')) state.decisions.push({ type: p[2], version: p[3], object_version: p[3], decision: p[4], decided_by: p[5], decided_at: '2026-09-14 00:00:00', input_generation: p[8], decision_id: p[0] });
    else if (sql.includes('INSERT INTO auditflow_decisions')) {
      const kind = (sql.match(/ACCEPTANCE|ENGAGEMENT_LETTER|DRAFT_FS|EQR|AUDIT_OPINION|RELEASE/) || [])[0] || 'UNKNOWN';
      state.decisions.push({ type: kind, version: p[2], object_version: p[2], decision: p[3], decided_by: p[4], decided_at: '2026-09-14 00:00:00', input_generation: 1, decision_id: p[0] });
    }
    else if (sql.includes('INSERT INTO auditflow_pbc_requests')) state.pbcRequests.set(p[0], { request_id: p[0], engagement_id: p[1], title: p[2], state: 'OPEN', due_date: p[6] });
    else if (sql.includes('INSERT INTO auditflow_pbc_receipts')) state.pbcReceipts.set(p[0], { receipt_id: p[0], request_id: p[1], engagement_id: p[2], state: 'RECEIVED' });
    else if (sql.includes('UPDATE auditflow_pbc_requests SET state')) { const req = state.pbcRequests.get(p[0]); if (req) req.state = p[1] || 'RECEIVED'; }
    else if (sql.includes('UPDATE auditflow_pbc_receipts SET state')) { const rec = state.pbcReceipts.get(p[0]); if (rec) rec.state = p[1]; }
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], state: p[5] });
    else if (sql.includes("UPDATE auditflow_tasks SET state = 'COMPLETE'")) { const t = state.tasks.get(p[0]); if (t) t.state = 'COMPLETE'; }
    else if (sql.includes('UPDATE auditflow_engagement_state')) { const r = state.engagements.get(p[0]); if (r) { r.revision += 1; if (sql.includes('current_stage')) r.current_stage = p[1]; } }
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ action: p[3] });
  }
  function one(sql, p) {
    if (sql.includes('COUNT(*)')) {
      if (sql.includes("document_type = 'DRAFT_FS'")) return { n: state.artifacts.length };
      if (sql.includes('FROM auditflow_workpapers')) return { n: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0] && w.state === 'SUBMITTED').length };
      if (sql.includes('FROM auditflow_review_points')) return { n: [...state.reviews.values()].filter((r) => r.engagement_id === p[0] && r.state === 'OPEN' && (p.length < 3 || r.severity === p[2])).length };
      if (sql.includes('FROM auditflow_pbc_receipts')) return { n: [...state.pbcReceipts.values()].filter((r) => r.request_id === p[0]).length };
      return { n: 0 };
    }
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_decisions')) return [...state.decisions].reverse().find((d) => d.type === p[1]) || null;
    if (sql.includes('FROM auditflow_pbc_requests WHERE request_id')) return state.pbcRequests.get(p[0]) || null;
    if (sql.includes('FROM auditflow_pbc_receipts WHERE receipt_id')) return state.pbcReceipts.get(p[0]) || null;
    if (sql.includes('FROM auditflow_workpapers')) return state.workpapers.get(p[0]) || null;
    if (sql.includes('FROM auditflow_review_points')) return state.reviews.get(p[0]) || null;
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1]) || null;
    return null;
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() {
          if (sql.includes("document_type = 'DRAFT_FS'")) return { results: state.artifacts.filter((a) => a.engagement_id === params[0] && a.state === 'PUBLISHED') };
          if (sql.includes('FROM auditflow_pbc_requests')) return { results: [...state.pbcRequests.values()].filter((r) => r.engagement_id === params[0]) };
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
const act = (eng, sid, body) => new Request(`https://ste.quadrate.lk/api/engagements/${eng}/actions`, { method: 'POST', headers: { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` }, body: JSON.stringify(body) });
const TB = { sourceId: 'TB-BASELINE-001', sourceVersion: 'v03', period: 'FY2026', currency: 'QAR', rowCount: 14, debitTotal: '1825000.00', creditTotal: '1825000.00', validationState: 'VALIDATED', mappingComplete: true };

test('trial balance: balanced source recorded, unbalanced rejected, finance blocked', async () => {
  const fake = makeFakeDb();
  const fin = sidFor(fake, 'finance-demo', 'sess-fin-tb-000000000001');
  const blocked = await worker.fetch(act(ENG, fin, { action: 'RECORD_TB_SOURCE', ...TB }), envFor(fake));
  assert.equal(blocked.status, 403);
  const acct = sidFor(fake, 'client-demo', 'sess-acct-tb-00000000001');
  const unbalanced = await worker.fetch(act(ENG, acct, { action: 'RECORD_TB_SOURCE', ...TB, creditTotal: '1824999.00' }), envFor(fake));
  assert.equal(unbalanced.status, 400);
  assert.equal((await unbalanced.json()).error.code, 'UNBALANCED_SOURCE');
  const ok = await worker.fetch(act(ENG, acct, { action: 'RECORD_TB_SOURCE', ...TB }), envFor(fake));
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).sourceVersion, 'v03');
  assert.equal(fake.state.events.at(-1).action, 'TB_SOURCE_RECORDED');
});

test('review SoD: author cannot self-clear significant point; others can with response', async () => {
  const fake = makeFakeDb();
  const prep = sidFor(fake, 'preparer-demo', 'sess-prep-sod-0000000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-mgr-sod-00000000001');
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-sod-00000001');
  const wp = await worker.fetch(act(ENG, prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Revenue cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), envFor(fake));
  const workpaperId = (await wp.json()).workpaperId;
  const rp = await worker.fetch(act(ENG, mgr, { action: 'CREATE_REVIEW_POINT', workpaperId, severity: 'SIGNIFICANT', owner: 'Fatima Saleh', detail: 'Tie INV-1042 to the dispatch note.' }), envFor(fake));
  const reviewId = (await rp.json()).reviewId;
  const selfClear = await worker.fetch(act(ENG, mgr, { action: 'CLEAR_REVIEW_POINT', reviewId, response: 'Checked, fine.' }), envFor(fake));
  assert.equal(selfClear.status, 403);
  assert.equal((await selfClear.json()).error.code, 'SOD_VIOLATION');
  const prepClear = await worker.fetch(act(ENG, prep, { action: 'CLEAR_REVIEW_POINT', reviewId, response: 'Fixed.' }), envFor(fake));
  assert.equal(prepClear.status, 403);
  const silent = await worker.fetch(act(ENG, partner, { action: 'CLEAR_REVIEW_POINT', reviewId, response: '' }), envFor(fake));
  assert.equal(silent.status, 400);
  const cleared = await worker.fetch(act(ENG, partner, { action: 'CLEAR_REVIEW_POINT', reviewId, response: 'Dispatch note DT-881 attached; exception closed.' }), envFor(fake));
  assert.equal(cleared.status, 200);
  const again = await worker.fetch(act(ENG, partner, { action: 'CLEAR_REVIEW_POINT', reviewId, response: 'Again.' }), envFor(fake));
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'ALREADY_CLEARED');
});

test('draft FS: versioned publish, exact-version response, reject needs explanation', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-senior-dfs-00000001');
  const mgmt = sidFor(fake, 'client-management-demo', 'sess-mgmt-dfs-0000000001');
  const p1 = await worker.fetch(act(ENG, senior, { action: 'PUBLISH_DRAFT_FS', summary: 'First cut.' }), envFor(fake));
  assert.equal((await p1.json()).version, 'v01');
  const p2 = await worker.fetch(act(ENG, senior, { action: 'PUBLISH_DRAFT_FS', summary: 'With disclosures.' }), envFor(fake));
  assert.equal((await p2.json()).version, 'v02');
  const stale = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01' }), envFor(fake));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'VERSION_MISMATCH');
  const silentReject = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'REJECT', version: 'v02', explanation: '' }), envFor(fake));
  assert.equal(silentReject.status, 400);
  const accepted = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v02' }), envFor(fake));
  assert.equal(accepted.status, 201);
});

test('EQR and opinion: role-gated, opinion bound to exact draft candidate', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-senior-eqr-00000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-mgr-eqr-00000000001');
  const eqr = sidFor(fake, 'eqr-demo', 'sess-eqr-000000000000001');
  const partner = sidFor(fake, 'partner-demo', 'sess-partner-op-000000001');
  const notEqr = await worker.fetch(act(ENG, mgr, { action: 'COMPLETE_EQR', decision: 'APPROVE', candidateId: 'RC-1' }), envFor(fake));
  assert.equal(notEqr.status, 403);
  const earlyOpinion = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'All clear.' }), envFor(fake));
  assert.equal(earlyOpinion.status, 409);
  assert.equal((await earlyOpinion.json()).error.code, 'PRECONDITION_FAILED');
  await worker.fetch(act(ENG, senior, { action: 'PUBLISH_DRAFT_FS', summary: 'Final cut.' }), envFor(fake));
  const vagueReturn = await worker.fetch(act(ENG, eqr, { action: 'COMPLETE_EQR', decision: 'RETURN', candidateId: 'RC-1', note: '' }), envFor(fake));
  assert.equal(vagueReturn.status, 400);
  const eqrOk = await worker.fetch(act(ENG, eqr, { action: 'COMPLETE_EQR', decision: 'APPROVE', candidateId: 'RC-1', note: 'File complete.' }), envFor(fake));
  assert.equal(eqrOk.status, 201);
  const wrongCandidate = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v99', rationale: 'All clear.' }), envFor(fake));
  assert.equal(wrongCandidate.status, 409);
  assert.equal((await wrongCandidate.json()).error.code, 'VERSION_MISMATCH');
  const noDraftResponse = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'All clear.' }), envFor(fake));
  assert.equal(noDraftResponse.status, 409);
  assert.equal((await noDraftResponse.json()).error.code, 'DRAFT_NOT_ACCEPTED');
  const mgmt = sidFor(fake, 'client-management-demo', 'sess-mgmt-op-00000000001');
  const prep = sidFor(fake, 'preparer-demo', 'sess-prep-op-00000000001');
  const client = sidFor(fake, 'client-demo', 'sess-client-op-0000000001');
  const draftAccept = await worker.fetch(act(ENG, mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01', explanation: 'Agreed.' }), envFor(fake));
  assert.equal(draftAccept.status, 201);
  const noManager = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'All clear.' }), envFor(fake));
  assert.equal(noManager.status, 409);
  assert.equal((await noManager.json()).error.code, 'MANAGER_COMPLETION_REQUIRED');
  await worker.fetch(act(ENG, prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Revenue cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), envFor(fake));
  const pbcCreate = await worker.fetch(act(ENG, senior, { action: 'CREATE_PBC_REQUEST', title: 'Bank confirmations', period: 'FY2026', dueDate: '2026-10-10', clientOwner: 'Nadia Faris', reviewer: 'Audit Senior', acceptanceCriteria: 'Complete pack.' }), envFor(fake));
  const requestId = (await pbcCreate.json()).requestId;
  const receipt = await worker.fetch(act(ENG, client, { action: 'SUBMIT_PBC_RECEIPT', requestId, fileName: 'bank-pack.xlsx', fileSize: 24800, comment: 'Uploaded.' }), envFor(fake));
  const receiptId = (await receipt.json()).receiptId;
  await worker.fetch(act(ENG, senior, { action: 'RESPOND_PBC_RECEIPT', receiptId, decision: 'ACCEPT', note: 'Meets criteria.' }), envFor(fake));
  const managerOk = await worker.fetch(act(ENG, mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Workpapers submitted, points clear, draft accepted.' }), envFor(fake));
  assert.equal(managerOk.status, 201);
  const noPartner = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'All clear.' }), envFor(fake));
  assert.equal(noPartner.status, 409);
  assert.equal((await noPartner.json()).error.code, 'PARTNER_REVIEW_REQUIRED');
  const partnerOk = await worker.fetch(act(ENG, partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Completion reviewed against current input.' }), envFor(fake));
  assert.equal(partnerOk.status, 201);
  const opinion = await worker.fetch(act(ENG, partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Completion evidence reviewed; EQR approved.' }), envFor(fake));
  assert.equal(opinion.status, 201);
  assert.equal((await opinion.json()).engagement.currentStage, 'STAGE-07');
});
