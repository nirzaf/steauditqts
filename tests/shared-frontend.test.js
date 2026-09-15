import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __setSharedDemoConfigForTests,
  createDemoSession,
  createSharedIntent,
  getSharedTasks,
  runSharedAction,
} from '../src/sharedDemo.js';
import { useDemoContext } from '../src/demoContext.js';

const realFetch = globalThis.fetch;
let calls = [];

function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
}

function jsonResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => payload,
  };
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  __setSharedDemoConfigForTests({ enabled: null, baseUrl: null });
});

test('disabled build never touches the network', async () => {
  __setSharedDemoConfigForTests({ enabled: false });
  mockFetch(async () => { throw new Error('fetch must not be called'); });
  const result = await createDemoSession('admin-demo');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SHARED_API_DISABLED');
  assert.equal(calls.length, 0);
});

test('workflow action posts to the versioned endpoint with session cookie', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => jsonResponse(201, { ok: true, engagement: { engagementId: 'ENG-1' } }));
  const result = await runSharedAction('ENG-1', 'ACCEPT_CLIENT', { decision: 'ACCEPT' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://demo.test/api/engagements/ENG-1/actions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
  assert.ok(calls[0].options.headers['X-AuditFlow-Request-Id']);
  assert.equal(JSON.parse(calls[0].options.body).action, 'ACCEPT_CLIENT');
});

test('denials keep server code and correlation id (no fake success)', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => jsonResponse(409, { ok: false, error: { code: 'REVISION_CONFLICT', message: 'Stale.' } }, { 'X-Correlation-Id': 'corr-123' }));
  const result = await runSharedAction('ENG-1', 'ACCEPT_CLIENT', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REVISION_CONFLICT');
  assert.equal(result.error.correlationId, 'corr-123');
  assert.equal(result.error.status, 409);
});

test('offline failure is explicit and never committed', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => { throw new TypeError('fetch failed'); });
  const result = await runSharedAction('ENG-1', 'VERIFY_ADVANCE', { reference: 'PAY-SIM-0018' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'NETWORK_UNAVAILABLE');
  assert.match(result.error.message, /not committed/);
});

test('task queue supports assignee filter', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => jsonResponse(200, { ok: true, tasks: [] }));
  await getSharedTasks('ENG-1', 'audit-senior-demo');
  assert.equal(calls[0].url, 'https://demo.test/api/engagements/ENG-1/tasks?assignee=audit-senior-demo');
});

// M7 APPROVAL-03 / APP-F06 - one stable intent per user action: an
// unconfirmed send keeps the SAME idempotency key for the retry, and only a
// parsed COMMITTED/REJECTED outcome retires it.
const intentContext = { engagementId: 'ENG-1', generationId: 'gen-1', viewId: 'view-intent-0001', revision: 1, contextVersion: 1, actorId: 'ACT-1' };

test('intent retry reuses the same idempotency key after an unconfirmed send', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  let attempt = 0;
  mockFetch(async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError('fetch failed');
    return jsonResponse(201, { ok: true, outcome: 'COMMITTED', revision: 2, engagementId: 'ENG-1', generationId: 'gen-1', actorId: 'ACT-1', decision: { decisionId: 'd-1' } });
  });
  const intent = createSharedIntent(intentContext, 'RECORD_MANAGER_COMPLETION', 'ENG-1', { decision: 'RECOMMEND_COMPLETE', rationale: 'Clear.' });
  assert.equal(intent.status, 'READY');
  const first = await intent.send();
  assert.equal(first.ok, false);
  assert.equal(first.outcome, 'UNCERTAIN');
  assert.equal(first.code, 'COMMIT_UNCONFIRMED');
  assert.equal(intent.status, 'UNCERTAIN');
  assert.equal(intent.canRetry(), true);
  const second = await intent.send();
  assert.equal(second.ok, true);
  assert.equal(second.outcome, 'COMMITTED');
  const bodies = calls.map((call) => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].idempotencyKey, intent.key);
  assert.equal(bodies[1].idempotencyKey, intent.key);
  assert.equal(intent.canRetry(), false);
  const third = await intent.send();
  assert.deepEqual(third, second);
  assert.equal(calls.length, 2);
});

test('a 2xx response without a confirmed command outcome is UNCERTAIN', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => jsonResponse(200, { ok: true, saved: 'maybe' }));
  const intent = createSharedIntent(intentContext, 'RECORD_MANAGER_COMPLETION', 'ENG-1', { decision: 'RECOMMEND_COMPLETE', rationale: 'Clear.' });
  const result = await intent.send();
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.equal(result.code, 'COMMIT_UNCONFIRMED');
  assert.equal(intent.canRetry(), true);
});

test('a non-JSON (HTML) response maps to UNCERTAIN, never success', async () => {
  __setSharedDemoConfigForTests({ enabled: true, baseUrl: 'https://demo.test/api' });
  mockFetch(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
  }));
  const intent = createSharedIntent(intentContext, 'RECORD_MANAGER_COMPLETION', 'ENG-1', { decision: 'RECOMMEND_COMPLETE', rationale: 'Clear.' });
  const result = await intent.send();
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.equal(result.code, 'COMMIT_UNCONFIRMED');
  assert.equal(intent.canRetry(), true);
});

// M7 STATE-02 - concurrent refresh callers share the in-flight promise; a
// settled refresh starts a new one instead of being reused forever.
test('refresh coalescing returns the in-flight promise for concurrent callers', async () => {
  const ctx = useDemoContext();
  const first = ctx.refresh();
  const second = ctx.refresh();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(ctx.syncStatus.value, 'READY');
  const third = ctx.refresh();
  assert.notEqual(third, first);
  await third;
});
