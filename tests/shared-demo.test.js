import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const disabledEnv = {
  DB: { prepare() { throw new Error('DB must not be touched while shared mode is disabled'); } },
  SHARED_DEMO_ENABLED: 'false',
  SHARED_DEMO_IDENTITY_MODE: 'disabled',
  SHARED_DEMO_BINDING: 'none',
};

const trustedHeaders = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'maya@quadrate.demo',
  'Content-Type': 'application/json',
};

function makeStore() {
  const runs = [];
  let sessionRow = null;
  let scopeRow = null;
  return {
    runs,
    setSession(row) { sessionRow = row; },
    setScope(row) { scopeRow = row; },
    db: {
      prepare(sql) {
        const direct = {
          async run() { runs.push({ sql, params: [] }); return { success: true }; },
          async first() { return null; },
          async all() { return { results: [] }; },
        };
        return {
          ...direct,
          bind(...params) {
            return {
              async run() { runs.push({ sql, params }); return { success: true }; },
              async first() {
                if (sql.includes('FROM auditflow_demo_sessions')) return sessionRow;
                if (sql.includes('FROM auditflow_demo_session_scopes')) return scopeRow;
                if (sql.includes('FROM auditflow_engagement_state')) {
                  return { engagement_id: 'ENG-0018-AUD-2026', client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00' };
                }
                return null;
              },
              async all() { return { results: [] }; },
            };
          },
        };
      },
    },
  };
}

function enabledEnv(store) {
  return {
    DB: store.db,
    SHARED_DEMO_ENABLED: 'true',
    SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified',
    SHARED_DEMO_BINDING: 'isolated-non-production',
    ALLOW_DEMO_WRITES: 'true',
  };
}

test('shared demo routes fail closed without trusted configuration', async () => {
  for (const req of [
    new Request('https://ste.quadrate.lk/api/demo/session', { method: 'POST', body: JSON.stringify({ personaId: 'admin-demo' }) }),
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026'),
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/tasks'),
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/timeline'),
    new Request('https://ste.quadrate.lk/api/demo/reset', { method: 'POST' }),
  ]) {
    const res = await worker.fetch(req, disabledEnv);
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.error.code, 'SHARED_DEMO_DISABLED');
  }
});

test('demo session rejects unknown persona and accepts allowlisted persona', async () => {
  const store = makeStore();
  const bad = await worker.fetch(new Request('https://ste.quadrate.lk/api/demo/session', { method: 'POST', headers: trustedHeaders, body: JSON.stringify({ personaId: 'hacker' }) }), enabledEnv(store));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'UNKNOWN_PERSONA');

  const good = await worker.fetch(new Request('https://ste.quadrate.lk/api/demo/session', { method: 'POST', headers: trustedHeaders, body: JSON.stringify({ personaId: 'admin-demo' }) }), enabledEnv(store));
  assert.equal(good.status, 201);
  const payload = await good.json();
  assert.equal(payload.session.actorId, 'ACT-MAYA');
  assert.ok(good.headers.get('Set-Cookie')?.includes('auditflow_demo_session'));
  assert.ok(good.headers.get('Set-Cookie')?.includes('HttpOnly'));
});

test('presenter login clears stale client invitation scope in the same browser', async () => {
  const store = makeStore();
  store.setSession({ session_id: 'sess-client-preview-0001', persona_id: 'client-demo', actor_id: 'ACT-NADIA', expires_at: '2099-01-01 00:00:00' });
  store.setScope({ session_id: 'sess-client-preview-0001', run_id: 'run-preview1234', invitation_id: 'inv-stale-0001', client_mode: 1 });
  const response = await worker.fetch(new Request('https://ste.quadrate.lk/api/demo/session', {
    method: 'POST',
    headers: { ...trustedHeaders, Cookie: 'auditflow_demo_session=sess-client-preview-0001' },
    body: JSON.stringify({ personaId: 'admin-demo' }),
  }), enabledEnv(store));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.session.clientMode, 0);
  assert.equal(payload.session.invitationId, '');
  const scopeWrite = store.runs.find((entry) => entry.sql.includes('INSERT INTO auditflow_demo_session_scopes'));
  assert.ok(scopeWrite, 'presenter handoff should rewrite the existing scope');
  assert.deepEqual(scopeWrite.params.slice(-3), ['run-preview1234', '', 0]);
});

test('workflow actions never fake success: session required, then role/precondition denial', async () => {
  const store = makeStore();
  const noSession = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/actions', { method: 'POST', headers: trustedHeaders, body: JSON.stringify({ action: 'ACCEPT_CLIENT' }) }),
    enabledEnv(store),
  );
  assert.equal(noSession.status, 401);
  assert.equal((await noSession.json()).error.code, 'SESSION_REQUIRED');

  store.setSession({ session_id: 'sess-valid-000001', persona_id: 'partner-demo', actor_id: 'ACT-PARTNER', expires_at: '2099-01-01 00:00:00' });
  const unimplemented = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/actions', {
      method: 'POST',
      headers: { ...trustedHeaders, Cookie: 'auditflow_demo_session=sess-valid-000001' },
      body: JSON.stringify({ action: 'CLOSE_ENGAGEMENT' }),
    }),
    enabledEnv(store),
  );
  assert.equal(unimplemented.status, 403);
  assert.equal((await unimplemented.json()).error.code, 'ROLE_NOT_AUTHORIZED');
  // Implemented actions validate instead of faking success: ACCEPT_CLIENT
  // without a rationale must be rejected, not committed.
  const invalid = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/actions', {
      method: 'POST',
      headers: { ...trustedHeaders, Cookie: 'auditflow_demo_session=sess-valid-000001' },
      body: JSON.stringify({ action: 'ACCEPT_CLIENT', decision: 'ACCEPT', rationale: '' }),
    }),
    enabledEnv(store),
  );
  assert.equal(invalid.status, 400);
});

test('shared reset is admin-gated and scoped to demo engagements', async () => {
  const store = makeStore();
  store.setSession({ session_id: 'sess-client-000001', persona_id: 'client-demo', actor_id: 'ACT-NADIA', expires_at: '2099-01-01 00:00:00' });
  const denied = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/demo/reset', { method: 'POST', headers: { ...trustedHeaders, Cookie: 'auditflow_demo_session=sess-client-000001' } }),
    enabledEnv(store),
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'RESET_NOT_AUTHORIZED');

  store.setSession({ session_id: 'sess-admin-000001', persona_id: 'admin-demo', actor_id: 'ACT-MAYA', expires_at: '2099-01-01 00:00:00' });
  const ok = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/demo/reset', { method: 'POST', headers: { ...trustedHeaders, Cookie: 'auditflow_demo_session=sess-admin-000001' } }),
    enabledEnv(store),
  );
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.ok(payload.generationId?.startsWith('gen-'));
  const touched = store.runs.map((r) => r.sql).join('\n');
  assert.ok(!/DROP TABLE/i.test(touched));
  assert.ok(touched.includes('auditflow_tasks'));
});
