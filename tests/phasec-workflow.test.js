import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { clientEvaluationQuestionIds } from '../src/domain/questionBanks.js';
import { deriveProgressFromSnapshot } from '../worker/progress.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ACTOR = {
  'admin-demo': 'ACT-MAYA',
  'partner-demo': 'ACT-PARTNER',
  'client-demo': 'ACT-NADIA',
  'client-management-demo': 'ACT-NADIA-MGMT',
  'audit-senior-demo': 'ACT-OMAR-SENIOR',
  'audit-manager-demo': 'ACT-OMAR',
  'preparer-demo': 'ACT-JUNIOR',
  'accountant-demo': 'ACT-LEILA',
  'accounting-reviewer-demo': 'ACT-ACCOUNTING-REVIEWER',
  'finance-demo': 'ACT-AISHA',
  'eqr-demo': 'ACT-YUSUF',
  'compliance-demo': 'ACT-SARA',
};
const ENG = 'ENG-0018-AUD-2026';

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' }]]),
    assessments: new Map(),
    assessmentResponses: [],
    accountingStatus: new Map(),
    decisions: [],
    workpapers: new Map(),
    reviews: new Map(),
    pbcRequests: new Map(),
    pbcReceipts: new Map(),
    tbSources: [],
    artifacts: [],
    tasks: new Map(),
    outbox: [],
    events: [],
    // M7 PIPE-F11 - injectable mid-batch failure point for rollback proofs.
    failBatchAt: null,
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_assessments')) state.assessments.set(p[0], { assessment_id: p[0], engagement_id: p[1], type: p[2], template_version: p[3], revision: 1, updated_at: '2026-09-14 00:00:00' });
    else if (sql.includes('INSERT INTO auditflow_assessment_responses')) {
      const at = state.assessmentResponses.findIndex((r) => r.assessment_id === p[0] && r.question_id === p[1]);
      const row = { assessment_id: p[0], question_id: p[1], answer: p[2], applicability: p[3], verification: p[4], explanation: p[5], evidence_ref: p[6], responder: p[7], verifier: p[8], updated_at: '2026-09-14 00:00:00' };
      if (at >= 0) state.assessmentResponses[at] = row;
      else state.assessmentResponses.push(row);
    }
    else if (sql.includes('UPDATE auditflow_assessments SET revision')) { const a = state.assessments.get(p[0]); if (a) a.revision += 1; }
    else if (sql.includes('INSERT INTO auditflow_accounting_status')) {
      const prev = state.accountingStatus.get(p[0]) || { engagement_id: p[0], source_version: '', source_state: 'PENDING', mapping_state: 'PENDING', mapping_coverage: '', recon_state: 'PENDING', open_recon_count: 0, journal_state: 'PENDING', pending_journal_count: 0, fs_version: '', fs_state: 'DRAFT', mgmt_approval_state: 'PENDING', input_generation: 1, audit_evaluated_generation: 1, revision: 0 };
      const cols = sql.match(/\(engagement_id, ([a-z_, ]+)\)/);
      if (cols) {
        const names = cols[1].split(',').map((s) => s.trim());
        names.forEach((name, i) => { prev[name] = p[i + 1]; });
      }
      prev.revision += 1;
      state.accountingStatus.set(p[0], prev);
    }
    else if (sql.includes('UPDATE auditflow_accounting_status SET audit_evaluated_generation')) { const s = state.accountingStatus.get(p[0]); if (s) { s.audit_evaluated_generation = p[1]; s.revision += 1; } }
    else if (sql.includes('INSERT INTO auditflow_decisions') && sql.includes('?8, ?9)')) state.decisions.push({ decision_id: p[0], type: p[2], object_version: p[3], version: p[3], decision: p[4], decided_by: p[5], rationale: p[6], decided_at: '2026-09-14 00:00:00', input_generation: p[8] });
    else if (sql.includes('INSERT INTO auditflow_decisions')) {
      const kind = (sql.match(/ACCEPTANCE|ENGAGEMENT_LETTER|DRAFT_FS|EQR|AUDIT_OPINION|RELEASE/) || [])[0] || 'UNKNOWN';
      state.decisions.push({ decision_id: p[0], type: kind, object_version: p[2], version: p[2], decision: kind === 'RELEASE' ? 'RELEASED' : p[3], decided_by: p[4], rationale: p[5], decided_at: '2026-09-14 00:00:00', input_generation: kind === 'AUDIT_OPINION' ? p[6] : kind === 'DRAFT_FS' ? p[7] : 1 });
    }
    else if (sql.includes('INSERT INTO auditflow_workpapers')) state.workpapers.set(p[0], { workpaper_id: p[0], engagement_id: p[1], submitted_by: p[5], state: 'SUBMITTED', revision: 1 });
    else if (sql.includes("UPDATE auditflow_workpapers SET state = 'SENIOR_REVIEWED'")) { const w = state.workpapers.get(p[0]); if (w) w.state = 'SENIOR_REVIEWED'; }
    else if (sql.includes('INSERT INTO auditflow_review_points')) state.reviews.set(p[0], { review_id: p[0], engagement_id: p[1], workpaper_id: p[2], severity: p[3], owner: p[4], author: p[5], state: 'OPEN', cleared_generation: 1 });
    else if (sql.includes('UPDATE auditflow_review_points SET response')) { const r = state.reviews.get(p[0]); if (r) { r.response = p[1]; r.state = 'CLEARED'; r.cleared_generation = p[2]; } }
    else if (sql.includes('INSERT INTO auditflow_pbc_requests')) state.pbcRequests.set(p[0], { request_id: p[0], engagement_id: p[1], title: p[2], state: 'OPEN', due_date: p[6] });
    else if (sql.includes('INSERT INTO auditflow_pbc_receipts')) state.pbcReceipts.set(p[0], { receipt_id: p[0], request_id: p[1], engagement_id: p[2], state: 'RECEIVED' });
    else if (sql.includes('UPDATE auditflow_pbc_requests SET state')) { const req = state.pbcRequests.get(p[0]); if (req) req.state = p[1] || 'RECEIVED'; }
    else if (sql.includes('UPDATE auditflow_pbc_receipts SET state')) { const rec = state.pbcReceipts.get(p[0]); if (rec) rec.state = p[1]; }
    else if (sql.includes('INSERT INTO auditflow_tb_sources')) state.tbSources.push({ engagement_id: p[1], source_version: p[3], validation_state: p[9], mapping_complete: p[10] });
    else if (sql.includes('INSERT INTO auditflow_artifacts')) state.artifacts.push({ document_id: p[0], engagement_id: p[1], document_type: sql.includes('FINAL_REPORT') ? 'FINAL_REPORT' : sql.includes('FINAL_FS') ? 'FINAL_FS' : 'DRAFT_FS', version: p[3], state: 'PUBLISHED', created_at: '2026-09-14 0' + state.artifacts.length + ':00:00' });
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], state: p[5] });
    else if (sql.includes('UPDATE auditflow_tasks SET state')) { const key = p.length > 1 ? p[1] : p[0]; const t = state.tasks.get(key); if (t) t.state = p.length > 1 ? p[0] : 'COMPLETE'; }
    else if (sql.includes('UPDATE auditflow_engagement_state')) { const r = state.engagements.get(p[0]); if (r) { r.revision += 1; if (sql.includes('current_stage')) r.current_stage = p[1]; } }
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ engagement_id: p[1], action: p[3] });
  }
  function one(sql, p) {
    if (sql.includes('COUNT(*)')) {
      if (sql.includes("document_type = 'DRAFT_FS'")) return { n: state.artifacts.filter((a) => a.document_type === 'DRAFT_FS').length };
      if (sql.includes('FROM auditflow_workpapers')) return { n: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0] && ['SUBMITTED', 'SENIOR_REVIEWED'].includes(w.state)).length };
      if (sql.includes('FROM auditflow_review_points')) return { n: [...state.reviews.values()].filter((r) => r.engagement_id === p[0] && r.state === 'OPEN' && (p.length < 3 || r.severity === p[2])).length };
      if (sql.includes('FROM auditflow_pbc_receipts')) return { n: [...state.pbcReceipts.values()].filter((r) => r.request_id === p[0]).length };
      return { n: 0 };
    }
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_assessments')) return [...state.assessments.values()].find((a) => a.engagement_id === p[0]) || null;
    if (sql.includes('FROM auditflow_accounting_status')) return state.accountingStatus.get(p[0]) || null;
    if (sql.includes('FROM auditflow_decisions')) return [...state.decisions].reverse().find((d) => d.type === p[1]) || null;
    if (sql.includes('FROM auditflow_pbc_requests WHERE request_id')) return state.pbcRequests.get(p[0]) || null;
    if (sql.includes('FROM auditflow_pbc_receipts WHERE receipt_id')) return state.pbcReceipts.get(p[0]) || null;
    if (sql.includes('FROM auditflow_workpapers')) return state.workpapers.get(p[0]) || null;
    if (sql.includes('FROM auditflow_review_points')) return state.reviews.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1]) || null;
    return null;
  }
  function all(sql, p) {
    if (sql.includes('FROM auditflow_assessment_responses')) return { results: state.assessmentResponses.filter((r) => r.assessment_id === p[0]) };
    if (sql.includes('FROM auditflow_decisions')) return { results: [...state.decisions].reverse().map((d) => ({ decision_type: d.type, object_version: d.object_version, decision: d.decision, decided_by: d.decided_by, decided_at: d.decided_at, input_generation: d.input_generation })) };
    if (sql.includes('FROM auditflow_workpapers')) return { results: state.workpapers.map ? state.workpapers : [...state.workpapers.values()].map((w) => ({ workpaper_id: w.workpaper_id, state: w.state })) };
    if (sql.includes('FROM auditflow_review_points')) return { results: [...state.reviews.values()].map((r) => ({ review_id: r.review_id, state: r.state, severity: r.severity, cleared_generation: r.cleared_generation })) };
    if (sql.includes('FROM auditflow_tb_sources')) return { results: state.tbSources.map((t) => ({ source_version: t.source_version, validation_state: t.validation_state, mapping_complete: t.mapping_complete })) };
    if (sql.includes('FROM auditflow_artifacts')) return { results: state.artifacts.map((a) => ({ document_id: a.document_id, document_type: a.document_type, version: a.version, state: a.state, created_at: a.created_at })) };
    if (sql.includes('FROM auditflow_tasks')) return { results: [...state.tasks.values()].map((t) => ({ task_id: t.task_id, state: t.state, due_date: '', assignee_role: '' })) };
    if (sql.includes('FROM auditflow_credentials')) return { results: [] };
    if (sql.includes('FROM auditflow_pbc_receipts')) return { results: [...state.pbcReceipts.values()].map((r) => ({ receipt_id: r.receipt_id, request_id: r.request_id, state: r.state })) };
    if (sql.includes("document_type = 'DRAFT_FS'")) return { results: state.artifacts.filter((a) => a.engagement_id === p[0] && a.document_type === 'DRAFT_FS' && a.state === 'PUBLISHED') };
    if (sql.includes('FROM auditflow_pbc_requests')) return { results: [...state.pbcRequests.values()].filter((r) => r.engagement_id === p[0]) };
    return { results: [] };
  }
  function cloneRows(map) {
    const next = new Map();
    for (const [key, value] of map.entries()) next.set(key, typeof value === 'object' && value !== null ? { ...value } : value);
    return next;
  }
  function snapshotState() {
    return {
      sessions: cloneRows(state.sessions),
      engagements: cloneRows(state.engagements),
      assessments: cloneRows(state.assessments),
      accountingStatus: cloneRows(state.accountingStatus),
      workpapers: cloneRows(state.workpapers),
      reviews: cloneRows(state.reviews),
      pbcRequests: cloneRows(state.pbcRequests),
      pbcReceipts: cloneRows(state.pbcReceipts),
      tasks: cloneRows(state.tasks),
      assessmentResponses: state.assessmentResponses.map((row) => ({ ...row })),
      decisions: state.decisions.map((row) => ({ ...row })),
      tbSources: state.tbSources.map((row) => ({ ...row })),
      artifacts: state.artifacts.map((row) => ({ ...row })),
      outbox: state.outbox.map((row) => ({ ...row })),
      events: state.events.map((row) => ({ ...row })),
    };
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        __sql: sql,
        __params: params,
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() { return all(sql, params); },
      });
      return { bind: (...params) => bound(...params), async run() { apply(sql, []); return { success: true }; }, async first() { return one(sql, []); }, async all() { return all(sql, []); } };
    },
    // M7 PIPE-F11 - D1-style all-or-nothing batch: sequential apply with an
    // injectable failure point; on error the snapshot is fully restored.
    async batch(statements) {
      const snapshot = snapshotState();
      try {
        for (let i = 0; i < statements.length; i++) {
          if (state.failBatchAt != null && i >= state.failBatchAt) throw new Error('Injected batch failure at statement ' + i);
          apply(statements[i].__sql, statements[i].__params);
        }
        return statements.map(() => ({ success: true }));
      } catch (error) {
        for (const [key, value] of Object.entries(snapshot)) state[key] = value;
        throw error;
      }
    },
  };
  return { state, db };
}

const envFor = (fake) => ({ DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' });
function sidFor(fake, persona, sid) {
  fake.state.sessions.set(sid, { session_id: sid, persona_id: persona, actor_id: ACTOR[persona], expires_at: '2099-01-01 00:00:00' });
  return sid;
}
const act = (sid, body) => new Request('https://ste.quadrate.lk/api/engagements/' + ENG + '/actions', { method: 'POST', headers: { ...TRUSTED, Cookie: 'auditflow_demo_session=' + sid }, body: JSON.stringify(body) });
const get = (path, sid) => new Request('https://ste.quadrate.lk' + path, { headers: { ...TRUSTED, Cookie: 'auditflow_demo_session=' + sid } });

function favorableResponses(skipIds = [], overrides = {}) {
  return clientEvaluationQuestionIds
    .filter((id) => !skipIds.includes(id))
    .map((id) => ({ questionId: id, answer: id === 'CE-032' ? 'NO_MATCH' : 'YES', applicability: 'APPLICABLE', explanation: 'Seeded.', ...(overrides[id] || {}) }));
}

test('assessment responses validate bank IDs, answers and roles', async () => {
  const fake = makeFakeDb();
  const client = sidFor(fake, 'client-demo', 'sess-phasec-client-00000001');
  const env = envFor(fake);
  const unknown = await worker.fetch(act(client, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-999', answer: 'YES' }), env);
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, 'QUESTION_NOT_FOUND');
  const badAnswer = await worker.fetch(act(client, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-001', answer: 'MAYBE' }), env);
  assert.equal(badAnswer.status, 400);
  assert.equal((await badAnswer.json()).error.code, 'ANSWER_INVALID');
  const noRationale = await worker.fetch(act(client, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-001', answer: 'YES', applicability: 'NOT_APPLICABLE' }), env);
  assert.equal(noRationale.status, 400);
  assert.equal((await noRationale.json()).error.code, 'NA_RATIONALE_REQUIRED');
  const professional = await worker.fetch(act(client, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-070', answer: 'YES' }), env);
  assert.equal(professional.status, 403);
  assert.equal((await professional.json()).error.code, 'ROLE_NOT_AUTHORIZED');
  const ok = await worker.fetch(act(client, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-001', answer: 'YES', explanation: 'Registry extract on file.' }), env);
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.equal(body.recorded, 1);
  assert.equal(body.summary.totalQuestions, 62);
  assert.equal(body.summary.answered, 1);
  const stored = fake.state.assessmentResponses.find((r) => r.question_id === 'CE-001');
  assert.equal(stored.verification, 'SUBMITTED');
  assert.equal(stored.responder, 'ACT-NADIA');
});

test('partner verification marks responses VERIFIED', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000001');
  const res = await worker.fetch(act(partner, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-070', answer: 'YES' }), envFor(fake));
  assert.equal(res.status, 201);
  assert.equal(fake.state.assessmentResponses.find((r) => r.question_id === 'CE-070').verification, 'VERIFIED');
});

test('assessment summary derives holds, hard stops and recommendation', async () => {
  const fake = makeFakeDb();
  const compliance = sidFor(fake, 'compliance-demo', 'sess-phasec-compliance-00001');
  const env = envFor(fake);
  const bulk = await worker.fetch(act(compliance, {
    action: 'RECORD_ASSESSMENT_RESPONSE',
    responses: favorableResponses(['CE-050'], { 'CE-011': { answer: 'NO' }, 'CE-032': { answer: 'POSSIBLE_MATCH' } }),
  }), env);
  assert.equal(bulk.status, 201);
  const summary = (await bulk.json()).summary;
  assert.equal(summary.required, 62);
  assert.equal(summary.answered, 61);
  assert.ok(summary.holds.length >= 3);
  assert.ok(summary.hardStops.length >= 1);
  assert.equal(summary.prohibitions.length, 0);
  assert.equal(summary.recommendation, 'HOLD');
  const ownership = summary.categories.find((c) => c.name === 'Ownership and Beneficial Ownership');
  assert.ok(ownership.holds > 0 && !ownership.clear);
  assert.ok(summary.categories.every((c) => c.total > 0 && c.answered <= c.total));
  const fetched = await worker.fetch(get('/api/assessments?engagementId=' + ENG, compliance), env);
  assert.equal(fetched.status, 200);
  const fetchedBody = await fetched.json();
  assert.equal(fetchedBody.summary.recommendation, 'HOLD');
  assert.equal(fetchedBody.assessment.revision, 2);
});

test('client sessions never see professional-only responses', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000002');
  const client = sidFor(fake, 'client-demo', 'sess-phasec-client-00000002');
  const env = envFor(fake);
  await worker.fetch(act(partner, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-070', answer: 'YES' }), env);
  const fetched = await worker.fetch(get('/api/assessments?engagementId=' + ENG, client), env);
  const body = await fetched.json();
  assert.ok(!body.responses.some((r) => r.question_id === 'CE-070'));
});

test('acceptance stays a professional decision gated on evaluation holds', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000003');
  const compliance = sidFor(fake, 'compliance-demo', 'sess-phasec-compliance-00003');
  const env = envFor(fake);
  const notStarted = await worker.fetch(act(partner, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Looks fine.' }), env);
  assert.equal(notStarted.status, 409);
  assert.equal((await notStarted.json()).error.code, 'EVALUATION_NOT_STARTED');
  await worker.fetch(act(compliance, { action: 'RECORD_ASSESSMENT_RESPONSE', responses: favorableResponses(['CE-011']) }), env);
  const held = await worker.fetch(act(partner, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'Looks fine.' }), env);
  assert.equal(held.status, 409);
  assert.equal((await held.json()).error.code, 'EVALUATION_HOLDS');
  const decline = await worker.fetch(act(partner, { action: 'ACCEPT_CLIENT', decision: 'DECLINE', rationale: 'UBO evidence missing; declining.' }), env);
  assert.equal(decline.status, 201);
  await worker.fetch(act(compliance, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-011', answer: 'YES', explanation: 'UBO declaration verified.' }), env);
  const accept = await worker.fetch(act(partner, { action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: 'All holds resolved with evidence.' }), env);
  assert.equal(accept.status, 201);
});

test('accounting tracker validates roles and values', async () => {
  const fake = makeFakeDb();
  const accountant = sidFor(fake, 'admin-demo', 'sess-phasec-acct-000000001');
  const client = sidFor(fake, 'client-demo', 'sess-phasec-client-00000003');
  const env = envFor(fake);
  const denied = await worker.fetch(act(client, { action: 'UPDATE_ACCOUNTING_STATUS', recon_state: 'COMPLETE' }), env);
  assert.equal(denied.status, 403);
  const badState = await worker.fetch(act(accountant, { action: 'UPDATE_ACCOUNTING_STATUS', recon_state: 'DONE' }), env);
  assert.equal(badState.status, 400);
  const badCount = await worker.fetch(act(accountant, { action: 'UPDATE_ACCOUNTING_STATUS', open_recon_count: -1 }), env);
  assert.equal(badCount.status, 400);
  const empty = await worker.fetch(act(accountant, { action: 'UPDATE_ACCOUNTING_STATUS' }), env);
  assert.equal(empty.status, 400);
  const ok = await worker.fetch(act(accountant, { action: 'UPDATE_ACCOUNTING_STATUS', recon_state: 'COMPLETE', open_recon_count: 0, journal_state: 'COMPLETE', pending_journal_count: 0, fs_version: 'FS-v04', fs_state: 'FINAL', mapping_state: 'COMPLETE', mapping_coverage: '14/14 reviewed' }), env);
  assert.equal(ok.status, 200);
  const status = (await ok.json()).status;
  assert.equal(status.reconState, 'COMPLETE');
  assert.equal(status.fsVersion, 'FS-v04');
  assert.equal(status.inputGeneration, 1);
});

test('trial balance advances the input generation until audit evaluates it', async () => {
  const fake = makeFakeDb();
  const accountant = sidFor(fake, 'preparer-demo', 'sess-phasec-acct-000000002');
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-phasec-senior-00000001');
  const client = sidFor(fake, 'client-demo', 'sess-phasec-client-00000004');
  const env = envFor(fake);
  const tb = await worker.fetch(act(accountant, { action: 'RECORD_TB_SOURCE', sourceId: 'TB-BASELINE-001', sourceVersion: 'v03', period: 'FY2026', currency: 'QAR', rowCount: 14, debitTotal: '1250000.00', creditTotal: '1250000.00', validationState: 'VALIDATED', mappingComplete: true }), env);
  assert.equal(tb.status, 201);
  const statusRes = await worker.fetch(get('/api/accounting-status?engagementId=' + ENG, accountant), env);
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.status.inputGeneration, 2);
  assert.equal(statusBody.status.auditEvaluatedGeneration, 1);
  assert.equal(statusBody.generations.current, false);
  assert.ok(statusBody.steps.length === 8);
  assert.equal(statusBody.steps[0].state, 'COMPLETE');
  const denied = await worker.fetch(act(client, { action: 'EVALUATE_ACCOUNTING_INPUT' }), env);
  assert.equal(denied.status, 403);
  const evaluated = await worker.fetch(act(senior, { action: 'EVALUATE_ACCOUNTING_INPUT' }), env);
  assert.equal(evaluated.status, 200);
  assert.equal((await evaluated.json()).evaluatedGeneration, 2);
  const again = await worker.fetch(act(senior, { action: 'EVALUATE_ACCOUNTING_INPUT' }), env);
  assert.equal((await again.json()).duplicate, true);
});

test('management approves the accounting package explicitly', async () => {
  const fake = makeFakeDb();
  const mgmt = sidFor(fake, 'client-management-demo', 'sess-phasec-mgmt-000000001');
  const accountant = sidFor(fake, 'admin-demo', 'sess-phasec-acct-000000003');
  const env = envFor(fake);
  const missing = await worker.fetch(act(mgmt, { action: 'APPROVE_ACCOUNTING_FS', decision: 'ACCEPT', explanation: 'ok' }), env);
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).error.code, 'PRECONDITION_FAILED');
  await worker.fetch(act(accountant, { action: 'UPDATE_ACCOUNTING_STATUS', fs_version: 'FS-v04', fs_state: 'FINAL' }), env);
  const silentReject = await worker.fetch(act(mgmt, { action: 'APPROVE_ACCOUNTING_FS', decision: 'REJECT', explanation: '' }), env);
  assert.equal(silentReject.status, 400);
  const accept = await worker.fetch(act(mgmt, { action: 'APPROVE_ACCOUNTING_FS', decision: 'ACCEPT', explanation: 'Package agreed for handoff.' }), env);
  assert.equal(accept.status, 201);
  const steps = (await accept.json()).steps;
  assert.equal(steps.find((s) => s.id === 'mgmt-approval').state, 'COMPLETE');
  assert.equal(steps.find((s) => s.id === 'audit-handoff').state, 'READY');
});

async function driveReadyChain(fake) {
  const sids = {
    senior: sidFor(fake, 'audit-senior-demo', 'sess-phasec-senior-00000002'),
    mgmt: sidFor(fake, 'client-management-demo', 'sess-phasec-mgmt-000000002'),
    prep: sidFor(fake, 'preparer-demo', 'sess-phasec-prep-000000001'),
    client: sidFor(fake, 'client-demo', 'sess-phasec-client-00000005'),
    mgr: sidFor(fake, 'audit-manager-demo', 'sess-phasec-mgr-00000000001'),
    partner: sidFor(fake, 'partner-demo', 'sess-phasec-partner-00000004'),
    eqr: sidFor(fake, 'eqr-demo', 'sess-phasec-eqr-00000000001'),
  };
  const env = envFor(fake);
  await worker.fetch(act(sids.senior, { action: 'PUBLISH_DRAFT_FS', summary: 'Final cut.' }), env);
  const wpSubmit = await worker.fetch(act(sids.prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Revenue cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), env);
  const workpaperId = (await wpSubmit.json()).workpaperId;
  const created = await worker.fetch(act(sids.senior, { action: 'CREATE_PBC_REQUEST', title: 'Bank confirmations', period: 'FY2026', dueDate: '2026-10-10', clientOwner: 'Nadia Faris', reviewer: 'Audit Senior', acceptanceCriteria: 'Complete pack.' }), env);
  const requestId = (await created.json()).requestId;
  const receipt = await worker.fetch(act(sids.client, { action: 'SUBMIT_PBC_RECEIPT', requestId, fileName: 'bank-pack.xlsx', fileSize: 24800, comment: 'Uploaded.' }), env);
  await worker.fetch(act(sids.senior, { action: 'RESPOND_PBC_RECEIPT', receiptId: (await receipt.json()).receiptId, decision: 'ACCEPT', note: 'Meets criteria.' }), env);
  // P8A — manager completion now requires senior review to clear every
  // submitted workpaper first.
  await worker.fetch(act(sids.senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId }), env);
  return { sids, env, workpaperId };
}

test('manager completion needs submitted work and clear points', async () => {
  const fake = makeFakeDb();
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-phasec-mgr-000000002');
  const prep = sidFor(fake, 'preparer-demo', 'sess-phasec-prep-000000002');
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000005');
  const env = envFor(fake);
  const roleDenied = await worker.fetch(act(partner, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Nope.' }), env);
  assert.equal(roleDenied.status, 403);
  const noWork = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Ready.' }), env);
  assert.equal(noWork.status, 409);
  assert.equal((await noWork.json()).error.code, 'NO_SUBMITTED_WORKPAPERS');
  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'T', evidenceReference: 'E', conclusion: 'C' }), env);
  const workpaperId = (await wp.json()).workpaperId;
  await worker.fetch(act(mgr, { action: 'CREATE_REVIEW_POINT', workpaperId, severity: 'STANDARD', owner: 'ACT-JUNIOR', detail: 'Tie out.' }), env);
  const blocked = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Ready.' }), env);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'REVIEW_POINTS_OPEN');
  const held = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'HOLD', rationale: 'Waiting on point clearance.' }), env);
  assert.equal(held.status, 201);
});

test('partner review needs a current manager recommendation', async () => {
  const fake = makeFakeDb();
  const { sids, env } = await driveReadyChain(fake);
  const missing = await worker.fetch(act(sids.partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Reviewed.' }), env);
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).error.code, 'MANAGER_COMPLETION_REQUIRED');
  await worker.fetch(act(sids.mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'File reviewed and clear.' }), env);
  const approved = await worker.fetch(act(sids.partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Completion reviewed against current input.' }), env);
  assert.equal(approved.status, 201);
  assert.equal((await approved.json()).decision.inputGeneration, 1);
});

test('final discussion needs an opinion first', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000006');
  const env = envFor(fake);
  const early = await worker.fetch(act(partner, { action: 'RECORD_FINAL_DISCUSSION', date: '2026-09-20', attendees: 'A, B', topics: 'T', outcome: 'O' }), env);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'OPINION_REQUIRED');
  const thin = await worker.fetch(act(partner, { action: 'RECORD_FINAL_DISCUSSION', date: '', attendees: '', topics: '', outcome: '' }), env);
  assert.equal(thin.status, 400);
});

test('opinion enforces draft, completion, evidence and currency gates', async () => {
  const fake = makeFakeDb();
  const { sids, env } = await driveReadyChain(fake);
  const draftMissing = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reviewed with care.' }), env);
  assert.equal((await draftMissing.json()).error.code, 'DRAFT_NOT_ACCEPTED');
  await worker.fetch(act(sids.mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01', explanation: 'Agreed.' }), env);
  await worker.fetch(act(sids.mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'File reviewed and clear.' }), env);
  const partnerMissing = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reviewed with care.' }), env);
  assert.equal((await partnerMissing.json()).error.code, 'PARTNER_REVIEW_REQUIRED');
  await worker.fetch(act(sids.partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Completion reviewed against current input.' }), env);
  const opinion = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Completion evidence reviewed with care.' }), env);
  assert.equal(opinion.status, 201);
  assert.equal((await opinion.json()).decision.inputGeneration, 1);
});

test('opinion stays blocked on unevaluated PBC and blocking holds', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-phasec-senior-00000003');
  const mgmt = sidFor(fake, 'client-management-demo', 'sess-phasec-mgmt-000000003');
  const prep = sidFor(fake, 'preparer-demo', 'sess-phasec-prep-000000003');
  const client = sidFor(fake, 'client-demo', 'sess-phasec-client-00000006');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-phasec-mgr-000000003');
  const partner = sidFor(fake, 'partner-demo', 'sess-phasec-partner-0000007');
  const compliance = sidFor(fake, 'compliance-demo', 'sess-phasec-compliance-00004');
  const env = envFor(fake);
  await worker.fetch(act(senior, { action: 'PUBLISH_DRAFT_FS', summary: 'Cut.' }), env);
  await worker.fetch(act(mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01', explanation: 'Agreed.' }), env);
  const wpSubmit = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'T', evidenceReference: 'E', conclusion: 'C' }), env);
  const submittedWpId = (await wpSubmit.json()).workpaperId;
  const created = await worker.fetch(act(senior, { action: 'CREATE_PBC_REQUEST', title: 'Confirmations', period: 'FY2026', dueDate: '2026-10-10', clientOwner: 'Nadia', reviewer: 'Senior', acceptanceCriteria: 'Pack.' }), env);
  const requestId = (await created.json()).requestId;
  const submitted = await worker.fetch(act(client, { action: 'SUBMIT_PBC_RECEIPT', requestId, fileName: 'pack.xlsx', fileSize: 100, comment: 'Up.' }), env);
  const pendingReceiptId = (await submitted.json()).receiptId;
  // P8A — manager completion requires senior review to clear the workpaper.
  await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId: submittedWpId }), env);
  await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Clear.' }), env);
  await worker.fetch(act(partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Clear.' }), env);
  const unevaluated = await worker.fetch(act(partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reviewed with care.' }), env);
  assert.equal(unevaluated.status, 409);
  assert.equal((await unevaluated.json()).error.code, 'PBC_NOT_EVALUATED');
  await worker.fetch(act(senior, { action: 'RESPOND_PBC_RECEIPT', receiptId: pendingReceiptId, decision: 'ACCEPT', note: 'Meets criteria.' }), env);
  await worker.fetch(act(compliance, { action: 'RECORD_ASSESSMENT_RESPONSE', questionId: 'CE-032', answer: 'CONFIRMED_PROHIBITION' }), env);
  const prohibited = await worker.fetch(act(partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reviewed with care.' }), env);
  assert.equal(prohibited.status, 409);
  assert.equal((await prohibited.json()).error.code, 'ASSESSMENT_HOLDS_FOR_OPINION');
});

async function driveReleaseReady(fake) {
  const { sids, env } = await driveReadyChain(fake);
  await worker.fetch(act(sids.mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01', explanation: 'Agreed.' }), env);
  await worker.fetch(act(sids.mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'File reviewed and clear.' }), env);
  await worker.fetch(act(sids.partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Completion reviewed against current input.' }), env);
  await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Completion evidence reviewed.' }), env);
  return { sids, env };
}

test('release shows a visible checklist and requires discussion', async () => {
  const fake = makeFakeDb();
  const eqr = sidFor(fake, 'eqr-demo', 'sess-phasec-eqr-000000002');
  const { sids, env } = await driveReleaseReady(fake);
  await worker.fetch(act(eqr, { action: 'COMPLETE_EQR', decision: 'APPROVE', candidateId: 'v01', note: 'EQR complete.' }), env);
  const noDiscussion = await worker.fetch(act(sids.partner, { action: 'RELEASE_FINAL_REPORT', rationale: 'All green.' }), env);
  assert.equal(noDiscussion.status, 409);
  const noDiscussionBody = await noDiscussion.json();
  assert.equal(noDiscussionBody.error.code, 'FINAL_DISCUSSION_REQUIRED');
  assert.ok(Array.isArray(noDiscussionBody.checks));
  assert.ok(noDiscussionBody.checks.some((c) => c.id === 'manager-completion' && c.pass));
  assert.ok(noDiscussionBody.checks.some((c) => c.id === 'final-discussion' && !c.pass));
  const discussion = await worker.fetch(act(sids.partner, { action: 'RECORD_FINAL_DISCUSSION', date: '2026-09-20', attendees: 'Maya Rahman, Nadia Faris', topics: 'Opinion and subsequent events', outcome: 'No outstanding matters.' }), env);
  assert.equal(discussion.status, 201);
  const released = await worker.fetch(act(sids.partner, { action: 'RELEASE_FINAL_REPORT', rationale: 'All green.' }), env);
  assert.equal(released.status, 201);
  const body = await released.json();
  assert.equal(body.candidateVersion, 'v01');
  assert.ok(body.checks.every((c) => c.pass));
});

test('accounting generation bump stales audit records until re-evaluation', async () => {
  const fake = makeFakeDb();
  const eqr = sidFor(fake, 'eqr-demo', 'sess-phasec-eqr-000000003');
  const accountant = sidFor(fake, 'preparer-demo', 'sess-phasec-acct-000000004');
  const { sids, env } = await driveReleaseReady(fake);
  await worker.fetch(act(eqr, { action: 'COMPLETE_EQR', decision: 'APPROVE', candidateId: 'v01', note: 'EQR complete.' }), env);
  await worker.fetch(act(sids.partner, { action: 'RECORD_FINAL_DISCUSSION', date: '2026-09-20', attendees: 'Maya Rahman, Nadia Faris', topics: 'Opinion', outcome: 'Clear.' }), env);
  const before = await worker.fetch(act(sids.partner, { action: 'RELEASE_FINAL_REPORT', rationale: 'All green.' }), env);
  assert.equal(before.status, 201);
  const bump = await worker.fetch(act(accountant, { action: 'RECORD_TB_SOURCE', sourceId: 'TB-BASELINE-001', sourceVersion: 'v04', period: 'FY2026', currency: 'QAR', rowCount: 14, debitTotal: '1250000.00', creditTotal: '1250000.00', validationState: 'VALIDATED', mappingComplete: true }), env);
  assert.equal(bump.status, 201);
  const staleRelease = await worker.fetch(act(sids.partner, { action: 'RELEASE_FINAL_REPORT', rationale: 'Again.' }), env);
  assert.equal((await staleRelease.json()).duplicate, true);
  const staleOpinionAttempt = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reconfirming against new input.' }), env);
  assert.equal(staleOpinionAttempt.status, 409);
  assert.equal((await staleOpinionAttempt.json()).error.code, 'ACCOUNTING_INPUT_STALE');
  const progressRes = await worker.fetch(get('/api/engagements/' + ENG + '/progress', sids.partner), env);
  const progress = (await progressRes.json()).progress;
  assert.equal(progress.valid, false);
  assert.ok(progress.warnings.some((w) => w.code === 'MANAGER_COMPLETION_STALE'));
  assert.ok(progress.warnings.some((w) => w.code === 'REVIEW_POINTS_STALE' || w.code === 'DRAFT_STALE_INPUT' || w.code === 'CACHED_STAGE_AHEAD') || progress.blockers.length > 0);
  const staleOpinionGate = progress.gateDetails.find((g) => g.id === 'opinion');
  assert.equal(staleOpinionGate.state, 'BLOCKED');
  const evaluated = await worker.fetch(act(sids.senior, { action: 'EVALUATE_ACCOUNTING_INPUT' }), env);
  assert.equal((await evaluated.json()).evaluatedGeneration, 2);
  const stillBlocked = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reconfirming.' }), env);
  assert.equal(stillBlocked.status, 409);
  assert.equal((await stillBlocked.json()).error.code, 'MANAGER_COMPLETION_STALE');
  await worker.fetch(act(sids.mgmt, { action: 'RESPOND_DRAFT_FS', decision: 'ACCEPT', version: 'v01', explanation: 'Reconfirmed against g2.' }), env);
  await worker.fetch(act(sids.mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Reconfirmed against g2.' }), env);
  await worker.fetch(act(sids.partner, { action: 'RECORD_PARTNER_REVIEW', decision: 'APPROVE_FOR_OPINION', rationale: 'Reconfirmed against g2.' }), env);
  const reOpinion = await worker.fetch(act(sids.partner, { action: 'RECORD_AUDIT_OPINION', opinionType: 'UNMODIFIED', candidateVersion: 'v01', rationale: 'Reconfirmed against g2.' }), env);
  assert.equal(reOpinion.status, 201);
  await worker.fetch(act(sids.partner, { action: 'RECORD_FINAL_DISCUSSION', date: '2026-09-21', attendees: 'Maya Rahman, Nadia Faris', topics: 'Reconfirmed opinion', outcome: 'Clear.' }), env);
  const progressAfter = (await (await worker.fetch(get('/api/engagements/' + ENG + '/progress', sids.partner), env)).json()).progress;
  assert.equal(progressAfter.valid, true);
  assert.equal(progressAfter.gateDetails.find((g) => g.id === 'opinion').state, 'APPROVED');
  assert.equal(progressAfter.gateDetails.find((g) => g.id === 'release').state, 'APPROVED');
  assert.equal(progressAfter.gateDetails.find((g) => g.id === 'manager-completion').state, 'APPROVED');
});

function engineSnapshot(overrides = {}) {
  return {
    engagementId: ENG, cachedStage: 'STAGE-01', revision: 1, generationId: 'gen-test-01',
    hasClientProfile: true, decisions: {}, commercial: null, credentialState: null,
    portalActivated: false, announcement: null, pbcRequests: [], pbcReceipts: [],
    tbSources: [], workpapers: [], reviewPoints: [], draftVersions: [], tasks: [],
    artifactCount: 0, publishedArtifactCount: 0, today: '2026-09-14',
    assessment: null, inputGeneration: 1, evaluatedGeneration: 1, accounting: null,
    finalDiscussion: null,
    ...overrides,
  };
}

test('engine derives evaluation holds and accounting package states', () => {
  const held = deriveProgressFromSnapshot(engineSnapshot({
    assessment: { answered: 60, required: 62, verified: 55, holds: [{ questionId: 'CE-011', code: 'HARD_STOP_RESPONSE' }, { questionId: 'CE-050', code: 'RESPONSE_REQUIRED' }], hardStops: 1, prohibitions: 0 },
  }));
  assert.equal(held.gateDetails.find((g) => g.id === 'client-evaluation').state, 'BLOCKED');
  assert.equal(held.valid, false);

  const clear = deriveProgressFromSnapshot(engineSnapshot({
    assessment: { answered: 62, required: 62, verified: 62, holds: [], hardStops: 0, prohibitions: 0 },
    accounting: { reconState: 'COMPLETE', openRecons: 0, journalState: 'COMPLETE', pendingJournals: 0, fsVersion: 'FS-v04', fsState: 'FINAL', mgmtApproval: 'ACCEPTED' },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
  }));
  assert.equal(clear.gateDetails.find((g) => g.id === 'client-evaluation').state, 'APPROVED');
  assert.equal(clear.gateDetails.find((g) => g.id === 'accounting-package').state, 'APPROVED');

  const partial = deriveProgressFromSnapshot(engineSnapshot({
    accounting: { reconState: 'IN_PROGRESS', openRecons: 2, journalState: 'PENDING', pendingJournals: 1, fsVersion: '', fsState: 'DRAFT', mgmtApproval: 'PENDING' },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
  }));
  assert.equal(partial.gateDetails.find((g) => g.id === 'accounting-package').state, 'READY');
});

test('engine stales completion records when input advances', () => {
  const progress = deriveProgressFromSnapshot(engineSnapshot({
    inputGeneration: 2, evaluatedGeneration: 2,
    pbcRequests: [{ id: 'PBC-1', state: 'ACCEPTED', dueDate: '2026-10-10' }],
    tbSources: [{ version: 'v04', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    draftVersions: ['v01'],
    assessment: { answered: 62, required: 62, verified: 62, holds: [], hardStops: 0, prohibitions: 0 },
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v01', by: 'ACT-NADIA-MGMT', at: '2026-09-10', generation: 1 },
      MANAGER_COMPLETION: { decision: 'RECOMMEND_COMPLETE', version: 'rev-9', by: 'ACT-OMAR', at: '2026-09-10', generation: 1 },
      PARTNER_COMPLETION_REVIEW: { decision: 'APPROVE_FOR_OPINION', version: 'rev-10', by: 'ACT-PARTNER', at: '2026-09-11', generation: 1 },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v01', by: 'ACT-PARTNER', at: '2026-09-12', generation: 1 },
    },
  }));
  assert.equal(progress.gateDetails.find((g) => g.id === 'manager-completion').state, 'BLOCKED');
  assert.equal(progress.gateDetails.find((g) => g.id === 'partner-review').state, 'BLOCKED');
  assert.equal(progress.gateDetails.find((g) => g.id === 'draft-fs').state, 'BLOCKED');
  assert.equal(progress.gateDetails.find((g) => g.id === 'opinion').state, 'BLOCKED');
  assert.equal(progress.gateDetails.find((g) => g.id === 'final-discussion').state, 'WAITING');
  assert.ok(progress.warnings.some((w) => w.code === 'MANAGER_COMPLETION_STALE'));
  assert.ok(progress.warnings.some((w) => w.code === 'DRAFT_STALE_INPUT'));
  assert.equal(progress.valid, false);
});
