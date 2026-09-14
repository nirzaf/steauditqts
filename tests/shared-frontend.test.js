import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __setSharedDemoConfigForTests,
  createDemoSession,
  getSharedTasks,
  runSharedAction,
} from '../src/sharedDemo.js';

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
