import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
};
const ENG = 'ENG-0018-AUD-2026';
const EXPIRY = '2099-01-01 00:00:00';

function makeFakeDb() {
  const state = {
    sessions: new Map([
      ['sess-client-read-000001', { session_id: 'sess-client-read-000001', persona_id: 'client-demo', actor_id: 'ACT-NADIA', expires_at: EXPIRY }],
      ['sess-senior-read-000001', { session_id: 'sess-senior-read-000001', persona_id: 'audit-senior-demo', actor_id: 'ACT-OMAR-SENIOR', expires_at: EXPIRY }],
    ]),
    artifacts: [
      { document_id: 'doc-final', engagement_id: ENG, visibility: 'CLIENT_VISIBLE', title: 'Final report' },
      { document_id: 'doc-internal', engagement_id: ENG, visibility: 'INTERNAL', title: 'Review deliberation' },
    ],
    decisions: [
      { decision_id: 'd1', engagement_id: ENG, decision_type: 'ACCEPTANCE', decision: 'ACCEPT' },
      { decision_id: 'd2', engagement_id: ENG, decision_type: 'ENGAGEMENT_LETTER', decision: 'ACCEPT' },
      { decision_id: 'd3', engagement_id: ENG, decision_type: 'DRAFT_FS', decision: 'ACCEPT' },
      { decision_id: 'd4', engagement_id: ENG, decision_type: 'AUDIT_OPINION', decision: 'UNMODIFIED' },
    ],
    workpapers: [{ workpaper_id: 'WP-1', engagement_id: ENG }],
    reviews: [{ review_id: 'R-1', engagement_id: ENG }],
    requests: [{ request_id: 'PBC-1', engagement_id: ENG, state: 'CLARIFICATION' }],
    receipts: [{ receipt_id: 'RC-1', engagement_id: ENG, state: 'CLARIFICATION' }],
  };
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { return { success: true }; },
        async first() {
          if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(params[0]) || null;
          return null;
        },
        async all() {
          if (sql.includes('FROM auditflow_artifacts')) return { results: state.artifacts };
          if (sql.includes('FROM auditflow_decisions')) return { results: state.decisions };
          if (sql.includes('FROM auditflow_workpapers')) return { results: state.workpapers };
          if (sql.includes('FROM auditflow_review_points')) return { results: state.reviews };
          if (sql.includes('FROM auditflow_pbc_requests')) return { results: state.requests };
          if (sql.includes('FROM auditflow_pbc_receipts')) return { results: state.receipts };
          return { results: [] };
        },
      });
      return { bind: (...params) => bound(...params) };
    },
  };
  return { state, db };
}

const envFor = (fake) => ({ DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' });
const get = (path, sid) => new Request(`https://ste.quadrate.lk${path}`, { headers: sid ? { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` } : { ...TRUSTED } });

test('reads require a demo session', async () => {
  const fake = makeFakeDb();
  for (const path of [`/api/pbc?engagementId=${ENG}`, `/api/workpapers?engagementId=${ENG}`, `/api/reviews?engagementId=${ENG}`, `/api/decisions?engagementId=${ENG}`, `/api/artifacts?engagementId=${ENG}`]) {
    const res = await worker.fetch(get(path, null), envFor(fake));
    assert.equal(res.status, 401, path);
    assert.equal((await res.json()).error.code, 'SESSION_REQUIRED');
  }
});

test('client sees published outputs and own decisions, never internal work', async () => {
  const fake = makeFakeDb();
  const sid = 'sess-client-read-000001';
  const artifacts = await (await worker.fetch(get(`/api/artifacts?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.deepEqual(artifacts.artifacts.map((a) => a.document_id), ['doc-final']);
  const decisions = await (await worker.fetch(get(`/api/decisions?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.deepEqual(decisions.decisions.map((d) => d.decision_type).sort(), ['DRAFT_FS', 'ENGAGEMENT_LETTER']);
  const wp = await worker.fetch(get(`/api/workpapers?engagementId=${ENG}`, sid), envFor(fake));
  assert.equal(wp.status, 403);
  const rev = await worker.fetch(get(`/api/reviews?engagementId=${ENG}`, sid), envFor(fake));
  assert.equal(rev.status, 403);
  const pbc = await (await worker.fetch(get(`/api/pbc?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.equal(pbc.requests[0].state, 'CLARIFICATION');
  assert.equal(pbc.receipts[0].state, 'CLARIFICATION');
});

test('staff sees the full shared record', async () => {
  const fake = makeFakeDb();
  const sid = 'sess-senior-read-000001';
  const artifacts = await (await worker.fetch(get(`/api/artifacts?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.equal(artifacts.artifacts.length, 2);
  const decisions = await (await worker.fetch(get(`/api/decisions?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.equal(decisions.decisions.length, 4);
  const wp = await (await worker.fetch(get(`/api/workpapers?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.equal(wp.workpapers.length, 1);
  const rev = await (await worker.fetch(get(`/api/reviews?engagementId=${ENG}`, sid), envFor(fake))).json();
  assert.equal(rev.reviewPoints.length, 1);
});

test('new reads fail closed without trusted configuration', async () => {
  const fake = makeFakeDb();
  const disabled = { DB: { prepare() { throw new Error('no db'); } }, SHARED_DEMO_ENABLED: 'false', SHARED_DEMO_IDENTITY_MODE: 'disabled', SHARED_DEMO_BINDING: 'none' };
  for (const path of [`/api/pbc?engagementId=${ENG}`, `/api/decisions?engagementId=${ENG}`]) {
    const res = await worker.fetch(get(path, 'sess-client-read-000001'), disabled);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'SHARED_DEMO_DISABLED');
  }
});
