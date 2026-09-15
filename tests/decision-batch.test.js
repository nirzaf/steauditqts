// M7 PIPE-F11 - atomic decision commits. A strict completion-chain command
// must commit the receipt claim, guarded revision bump, decision, effects and
// event as ONE all-or-nothing D1 batch; duplicates replay from the stored
// receipt; a mid-batch failure leaves no trace; and the legacy payload path
// keeps committing sequentially without a receipt.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ENG = 'ENG-0018-AUD-2026';
const GEN = 'gen-seed-01';
const SESSION_ID = 'sess-batch-mgr-0001';
const VIEW_ID = 'view-mgr-0000000001';

// Fake D1 with the semantics executeDecisionBatch relies on: the receipt
// claim INSERT evaluates its engagement revision/generation + active view
// session subselect (a failed guard rejects claimed_revision), the revision
// bump is guarded by generation + revision, and batch() is all-or-nothing
// with an injectable failure point.
function makeStrictFakeDb() {
  const state = {
    sessions: new Map(),
    views: new Map(),
    receipts: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-06', g_status: '{}', generation_id: GEN, updated_at: '2026-09-14 00:00:00' }]]),
    accountingStatus: new Map(),
    decisions: [],
    workpapers: new Map(),
    reviews: new Map(),
    tasks: new Map(),
    events: [],
    failBatchAt: null,
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_command_receipts')) {
      const fingerprint = [p[1], p[2], p[3], p[4]].join('|');
      if (state.receipts.has(fingerprint)) {
        throw new Error('UNIQUE constraint failed: auditflow_command_receipts.generation_id, auditflow_command_receipts.engagement_id, auditflow_command_receipts.actor_id, auditflow_command_receipts.idempotency_key');
      }
      const engagement = state.engagements.get(p[7]);
      const view = state.views.get(p[10]);
      const parent = state.sessions.get(p[11]);
      const guarded = Boolean(
        engagement && engagement.generation_id === p[8] && engagement.revision === p[9]
        && view && view.parent_session_id === p[11] && view.actor_id === p[12]
        && view.engagement_id === p[13] && view.generation_id === p[14]
        && view.context_version === p[15] && view.state === 'ACTIVE'
        && parent && new Date(String(parent.expires_at) + 'Z').getTime() > Date.now(),
      );
      if (!guarded) throw new Error('CHECK constraint failed: claimed_revision');
      state.receipts.set(fingerprint, {
        command_id: p[0], generation_id: p[1], engagement_id: p[2], actor_id: p[3],
        idempotency_key: p[4], request_digest: p[5], result_json: p[6],
        claimed_revision: p[9] + 1, view_id: p[16], parent_session_id: p[17],
        created_at: '2026-09-14 00:00:00',
      });
    }
    else if (sql.includes('UPDATE auditflow_engagement_state') && sql.includes('AND revision = ?')) {
      const row = state.engagements.get(p[0]);
      if (row && row.generation_id === p[1] && row.revision === p[p.length - 1]) {
        row.revision += 1;
        if (p.length === 4) row.current_stage = p[2];
      }
    }
    else if (sql.includes('INSERT INTO auditflow_decisions') && sql.includes('VALUES (?, ?, ?, ?, ?, ?, ?, ?')) {
      state.decisions.push({ decision_id: p[0], engagement_id: p[1], type: p[2], object_version: p[3], version: p[3], decision: p[4], decided_by: p[5], rationale: p[6], revision: p[7], input_generation: p.length > 8 ? p[8] : 1, decided_at: '2026-09-14 00:00:00' });
    }
    else if (sql.includes('INSERT INTO auditflow_decisions') && sql.includes('?8, ?9)')) {
      state.decisions.push({ decision_id: p[0], engagement_id: p[1], type: p[2], object_version: p[3], version: p[3], decision: p[4], decided_by: p[5], rationale: p[6], revision: p[7], input_generation: p[8], decided_at: '2026-09-14 00:00:00' });
    }
    else if (sql.includes('INSERT INTO auditflow_events')) {
      state.events.push({ event_id: p[0], engagement_id: p[1], actor: p[2], action: p[3], object_type: p[4], object_id: p[5], previous_revision: p[6], new_revision: p[7], idempotency_key: p[8], correlation_id: p[9], created_at: '2026-09-14 00:00:00' });
    }
    else if (sql.includes('INSERT INTO auditflow_tasks')) {
      state.tasks.set(p[0], { task_id: p[0], engagement_id: p[1], state: p[5] });
    }
    else if (sql.includes('UPDATE auditflow_engagement_state')) {
      const row = state.engagements.get(p[0]);
      if (row) { row.revision += 1; if (sql.includes('current_stage')) row.current_stage = p[1]; }
    }
  }
  function one(sql, p) {
    if (sql.includes('COUNT(*)')) {
      if (sql.includes('FROM auditflow_workpapers')) return { n: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0] && w.state === p[1]).length };
      if (sql.includes('FROM auditflow_review_points')) return { n: [...state.reviews.values()].filter((r) => r.engagement_id === p[0] && r.state === p[1]).length };
      return { n: 0 };
    }
    if (sql.includes('FROM auditflow_demo_views')) {
      const view = state.views.get(p[0]);
      return view && view.parent_session_id === p[1] && view.state === 'ACTIVE' ? view : null;
    }
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_command_receipts')) {
      return [...state.receipts.values()].find((r) => r.generation_id === p[0] && r.engagement_id === p[1] && r.actor_id === p[2] && r.idempotency_key === p[3]) || null;
    }
    if (sql.includes('FROM auditflow_accounting_status')) return state.accountingStatus.get(p[0]) || null;
    if (sql.includes('FROM auditflow_decisions')) return [...state.decisions].reverse().find((d) => d.engagement_id === p[0] && d.type === p[1]) || null;
    if (sql.includes('FROM auditflow_events WHERE engagement_id')) {
      return state.events.find((e) => e.engagement_id === p[0] && e.idempotency_key === p[1] && (p.length < 3 || e.actor === p[2])) || null;
    }
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_workpapers')) return state.workpapers.get(p[0]) || null;
    if (sql.includes('FROM auditflow_review_points')) return state.reviews.get(p[0]) || null;
    return null;
  }
  function all() { return { results: [] }; }
  function cloneState() {
    const cloneMap = (map) => {
      const next = new Map();
      for (const [key, value] of map.entries()) next.set(key, typeof value === 'object' && value !== null ? { ...value } : value);
      return next;
    };
    return {
      sessions: cloneMap(state.sessions),
      views: cloneMap(state.views),
      receipts: cloneMap(state.receipts),
      engagements: cloneMap(state.engagements),
      accountingStatus: cloneMap(state.accountingStatus),
      workpapers: cloneMap(state.workpapers),
      reviews: cloneMap(state.reviews),
      tasks: cloneMap(state.tasks),
      decisions: state.decisions.map((row) => ({ ...row })),
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
    async batch(statements) {
      const snapshot = cloneState();
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

function seedStrictScenario(fake) {
  fake.state.sessions.set(SESSION_ID, { session_id: SESSION_ID, persona_id: 'audit-manager-demo', actor_id: 'ACT-OMAR', expires_at: '2099-01-01 00:00:00' });
  fake.state.views.set(VIEW_ID, {
    view_id: VIEW_ID, parent_session_id: SESSION_ID, run_id: 'm7-demo',
    persona_id: 'audit-manager-demo', actor_id: 'ACT-OMAR', engagement_id: ENG,
    generation_id: GEN, context_version: 1, state: 'ACTIVE',
    created_at: '2026-09-14 00:00:00', updated_at: '2026-09-14 00:00:00', expires_at: '2099-01-01 00:00:00',
  });
  fake.state.workpapers.set('wp-batch-seed-01', { workpaper_id: 'wp-batch-seed-01', engagement_id: ENG, submitted_by: 'ACT-JUNIOR', state: 'SUBMITTED', revision: 1 });
}

function strictAct(fake, envelope) {
  return worker.fetch(new Request('https://ste.quadrate.lk/api/engagements/' + ENG + '/actions', {
    method: 'POST',
    headers: {
      ...TRUSTED,
      Cookie: 'auditflow_demo_session=' + SESSION_ID,
      'X-AuditFlow-Command': 'v1',
      'X-AuditFlow-View': VIEW_ID,
      'X-AuditFlow-Context-Version': '1',
    },
    body: JSON.stringify(envelope),
  }), envFor(fake));
}

function managerEnvelope(idempotencyKey, expectedRevision = 1) {
  return {
    action: 'RECORD_MANAGER_COMPLETION',
    targetId: ENG,
    payload: { decision: 'RECOMMEND_COMPLETE', rationale: 'File reviewed and clear.' },
    idempotencyKey,
    expectedGenerationId: GEN,
    expectedRevision,
    expectedContextVersion: 1,
  };
}

test('strict completion commits receipt, revision, decision, task and event in one batch', async () => {
  const fake = makeStrictFakeDb();
  seedStrictScenario(fake);
  const response = await strictAct(fake, managerEnvelope('batch-commit-0001'));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.outcome, 'COMMITTED');
  assert.equal(body.revision, 2);
  assert.equal(body.decision.decision, 'RECOMMEND_COMPLETE');
  assert.equal(body.decision.inputGeneration, 1);

  const receipt = [...fake.state.receipts.values()][0];
  assert.equal(receipt.claimed_revision, 2);
  assert.equal(receipt.idempotency_key, 'batch-commit-0001');
  assert.ok(receipt.result_json.includes('"outcome":"COMMITTED"'));
  assert.equal(fake.state.engagements.get(ENG).revision, 2);
  assert.equal(fake.state.decisions.length, 1);
  assert.equal(fake.state.decisions[0].type, 'MANAGER_COMPLETION');
  assert.equal(fake.state.decisions[0].revision, 2);
  assert.equal(fake.state.decisions[0].decision, 'RECOMMEND_COMPLETE');
  assert.equal(fake.state.events.length, 1);
  assert.equal(fake.state.events[0].action, 'MANAGER_COMPLETION_RECORDED');
  assert.equal(fake.state.events[0].idempotency_key, 'batch-commit-0001');
  assert.equal(fake.state.events[0].new_revision, 2);
  assert.equal(fake.state.tasks.get('partner-review-' + ENG).state, 'OPEN');
});

test('duplicate strict command replays the stored receipt without recommitting', async () => {
  const fake = makeStrictFakeDb();
  seedStrictScenario(fake);
  const envelope = managerEnvelope('batch-replay-0001');
  const first = await strictAct(fake, envelope);
  assert.equal(first.status, 201);
  const replay = await strictAct(fake, envelope);
  assert.equal(replay.status, 200);
  const body = await replay.json();
  assert.equal(body.replayed, true);
  assert.equal(body.outcome, 'COMMITTED');
  assert.equal(body.revision, 2);
  assert.equal(fake.state.receipts.size, 1);
  assert.equal(fake.state.engagements.get(ENG).revision, 2);
  assert.equal(fake.state.decisions.length, 1);
  assert.equal(fake.state.events.length, 1);
});

test('mid-batch failure leaves no receipt, revision bump, decision or event', async () => {
  const fake = makeStrictFakeDb();
  seedStrictScenario(fake);
  fake.state.failBatchAt = 2; // receipt claim + revision bump applied, decision insert throws
  const response = await strictAct(fake, managerEnvelope('batch-fail-000001'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.outcome, 'UNCERTAIN');
  assert.equal(body.code, 'COMMIT_UNCONFIRMED');
  assert.equal(body.revision, 1);
  assert.equal(fake.state.receipts.size, 0);
  assert.equal(fake.state.engagements.get(ENG).revision, 1);
  assert.equal(fake.state.decisions.length, 0);
  assert.equal(fake.state.events.length, 0);
});

test('legacy payload path keeps sequential writes without a receipt', async () => {
  const fake = makeStrictFakeDb();
  seedStrictScenario(fake);
  const response = await worker.fetch(new Request('https://ste.quadrate.lk/api/engagements/' + ENG + '/actions', {
    method: 'POST',
    headers: { ...TRUSTED, Cookie: 'auditflow_demo_session=' + SESSION_ID },
    body: JSON.stringify({ action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'File reviewed and clear.' }),
  }), envFor(fake));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.decision.decision, 'RECOMMEND_COMPLETE');
  assert.equal(fake.state.engagements.get(ENG).revision, 2);
  assert.equal(fake.state.receipts.size, 0);
  assert.equal(fake.state.decisions.length, 1);
  assert.equal(fake.state.decisions[0].type, 'MANAGER_COMPLETION');
  assert.equal(fake.state.events.length, 1);
  assert.equal(fake.state.tasks.get('partner-review-' + ENG).state, 'OPEN');
});
