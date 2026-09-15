import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {
  buildBreadcrumbs,
  buildNotifications,
  deriveLocalProgress,
  deriveStageSummary,
  filterPalette,
  isEscapeEvent,
  localContextsForPersona,
  isStaleRefresh,
  loadActiveEngagementId,
  mergeSliceResult,
  parseStageNumber,
  resolveContextCorrection,
  resolvePersonaSwitch,
  stageLabel,
} from '../src/demoContext.js';
import { ROUTE_REGISTRY, routeMenuForRole } from '../src/navigation/registry.js';

const trustedHeaders = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'maya@quadrate.demo',
  'Content-Type': 'application/json',
};

const disabledEnv = {
  DB: { prepare() { throw new Error('DB must not be touched while shared mode is disabled'); } },
  SHARED_DEMO_ENABLED: 'false',
  SHARED_DEMO_IDENTITY_MODE: 'disabled',
  SHARED_DEMO_BINDING: 'none',
};

const ENGAGEMENT_ROWS = [
  { engagement_id: 'ENG-0018-AUD-2026', client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 4, current_stage: 'STAGE-06', generation_id: 'gen-1', updated_at: '2026-09-14 10:00:00' },
  { engagement_id: 'ENG-0018-ACC-2026', client_id: 'CLI-0018', service: 'ACCOUNTING', period: 'FY2026', revision: 2, current_stage: 'STAGE-03', generation_id: 'gen-1', updated_at: '2026-09-14 10:00:00' },
  { engagement_id: 'ENG-0009-ACC-2026', client_id: 'CLI-0009', service: 'ACCOUNTING', period: 'FY2026', revision: 1, current_stage: 'STAGE-02', generation_id: 'gen-1', updated_at: '2026-09-14 10:00:00' },
];

function contextsEnv(sessionRow) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async run() { return { success: true }; },
              async first() {
                if (String(sql).includes('FROM auditflow_demo_sessions')) return sessionRow;
                return null;
              },
              async all() {
                if (String(sql).includes('FROM auditflow_engagement_state')) {
                  return { results: ENGAGEMENT_ROWS.filter((row) => params.includes(row.engagement_id)) };
                }
                return { results: [] };
              },
            };
          },
        };
      },
    },
    SHARED_DEMO_ENABLED: 'true',
    SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified',
    SHARED_DEMO_BINDING: 'isolated-non-production',
    ALLOW_DEMO_WRITES: 'true',
  };
}

function contextsRequest(sessionId) {
  return new Request('https://ste.quadrate.lk/api/demo/contexts', {
    headers: sessionId ? { ...trustedHeaders, Cookie: `auditflow_demo_session=${sessionId}` } : trustedHeaders,
  });
}

test('GET /api/demo/contexts fails closed without trusted configuration', async () => {
  const res = await worker.fetch(contextsRequest('sess-any-000000000001'), disabledEnv);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'SHARED_DEMO_DISABLED');
});

test('GET /api/demo/contexts requires a demo session', async () => {
  const res = await worker.fetch(contextsRequest(null), contextsEnv(null));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'SESSION_REQUIRED');
});

test('GET /api/demo/contexts returns only server-authorized contexts', async () => {
  const partnerEnv = contextsEnv({ session_id: 'sess-partner-00000001', persona_id: 'partner-demo', actor_id: 'ACT-PARTNER', expires_at: '2099-01-01 00:00:00' });
  const partnerRes = await worker.fetch(contextsRequest('sess-partner-00000001'), partnerEnv);
  assert.equal(partnerRes.status, 200);
  const partnerBody = await partnerRes.json();
  assert.equal(partnerBody.ok, true);
  assert.equal(partnerBody.contexts.length, 3);
  const audit = partnerBody.contexts.find((c) => c.engagementId === 'ENG-0018-AUD-2026');
  assert.equal(audit.clientName, 'Northstar Trading W.L.L.');
  assert.equal(audit.serviceLabel, 'Financial Statement Audit');
  assert.equal(audit.period, 'FY2026');
  assert.equal(audit.currentStage, 'STAGE-06');
  const cedar = partnerBody.contexts.find((c) => c.engagementId === 'ENG-0009-ACC-2026');
  assert.equal(cedar.clientName, 'Cedar & Coast Logistics');
  assert.equal(partnerBody.evidenceLevel, 'SIMULATION');

  const seniorEnv = contextsEnv({ session_id: 'sess-senior-0000000001', persona_id: 'audit-senior-demo', actor_id: 'ACT-OMAR-SENIOR', expires_at: '2099-01-01 00:00:00' });
  const seniorRes = await worker.fetch(contextsRequest('sess-senior-0000000001'), seniorEnv);
  assert.equal(seniorRes.status, 200);
  const seniorBody = await seniorRes.json();
  assert.deepEqual(seniorBody.contexts.map((c) => c.engagementId), ['ENG-0018-AUD-2026']);
});

test('navigator stage summary is derived from D1 revision plus open queue', () => {
  assert.equal(parseStageNumber('STAGE-06'), 6);
  assert.equal(parseStageNumber('bogus'), 0);
  assert.equal(stageLabel('STAGE-06'), 'Stage 6 / 8');
  const summary = deriveStageSummary(
    { engagementId: 'ENG-0018-AUD-2026', currentStage: 'STAGE-06', revision: 4 },
    [
      { taskId: 'T-1', title: 'Review WP-AR-01', state: 'OPEN', assigneeRole: 'audit_manager', linkedObjectType: 'workpaper', linkedObjectId: 'WP-1', createdAt: '2026-09-14T10:00:00Z' },
      { taskId: 'T-2', title: 'Blocked fee item', state: 'BLOCKED', assigneeRole: 'finance_team', linkedObjectType: 'decision', linkedObjectId: 'D-1', createdAt: '2026-09-14T09:00:00Z' },
      { taskId: 'T-3', title: 'Done item', state: 'COMPLETE', assigneeRole: 'audit_manager', createdAt: '2026-09-14T08:00:00Z' },
    ],
  );
  assert.equal(summary.label, 'Stage 6 / 8');
  assert.equal(summary.stageTitle, 'Audit & Draft FS');
  assert.equal(summary.openCount, 2);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.completionPercent, 75);
  assert.equal(summary.nextAction.title, 'Review WP-AR-01');
  assert.equal(summary.nextAction.owner, 'audit_manager');
  assert.equal(summary.nextAction.route, 'reviews');
  assert.equal(deriveStageSummary(null, []).nextAction, null);
});

test('navigator uses the authoritative workspace progress projection when available', () => {
  const summary = deriveStageSummary(
    { engagementId: 'ENG-0018-AUD-2026', currentStage: 'STAGE-05', revision: 4 },
    [{ taskId: 'T-1', title: 'Older local queue item', state: 'OPEN', assigneeRole: 'audit_senior' }],
    {
      currentStage: 'STAGE-07',
      completionPercent: 82,
      openCount: 3,
      blockedCount: 1,
      nextAction: {
        title: 'Clear the EQR decision',
        ownerLabel: 'EQR reviewer',
        route: 'reviews',
        targetId: 'EQR-001',
      },
    },
  );
  assert.equal(summary.label, 'Stage 7 / 8');
  assert.equal(summary.stageTitle, 'Review & opinion');
  assert.equal(summary.completionPercent, 82);
  assert.equal(summary.openCount, 3);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.nextAction.title, 'Clear the EQR decision');
  assert.equal(summary.nextAction.owner, 'EQR reviewer');
  assert.equal(summary.nextAction.route, 'reviews');
  assert.equal(summary.nextAction.targetId, 'EQR-001');
});

test('local shell context and progress stay derived from assigned scenario state', () => {
  const seniorContexts = localContextsForPersona('audit-senior-demo');
  assert.deepEqual(seniorContexts.map((context) => context.engagementId), ['ENG-0018-AUD-2026']);
  const clientContexts = localContextsForPersona('client-demo');
  assert.deepEqual(clientContexts.map((context) => context.engagementId), ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026']);

  const progress = deriveLocalProgress('ENG-0018-AUD-2026');
  assert.ok(progress);
  assert.match(progress.currentStage, /^STAGE-0[1-8]$/);
  assert.ok(progress.openCount >= progress.blockedCount);
  assert.ok(progress.completionPercent >= 0 && progress.completionPercent <= 100);
  assert.ok(progress.nextAction?.route);
});

test('route registry remains the single policy source for visible navigation metadata', () => {
  assert.equal(Object.isFrozen(ROUTE_REGISTRY), true);
  const managerRoutes = routeMenuForRole('audit-manager');
  const reviews = managerRoutes.find((route) => route.key === 'reviews');
  assert.deepEqual(reviews, { key: 'reviews', ...ROUTE_REGISTRY.reviews });
  assert.ok(!managerRoutes.some((route) => route.key === 'dashboard'));
});

test('breadcrumbs keep every middle segment clickable', () => {
  const crumbs = buildBreadcrumbs({
    personaLabel: 'Audit Manager',
    context: { clientShortName: 'Northstar Trading', serviceLabel: 'Financial Statement Audit', period: 'FY2026', engagementId: 'ENG-0018-AUD-2026' },
    pageLabel: 'Reviews & approvals',
  });
  assert.equal(crumbs.length, 4);
  assert.equal(crumbs[0].route, 'role-workspace');
  assert.equal(crumbs[1].route, 'clients');
  assert.equal(crumbs[2].route, 'engagements');
  assert.equal(crumbs[3].route, null);
  assert.match(crumbs[2].label, /FY2026/);
});

test('notifications derive from D1 tasks, timeline and outbox', () => {
  const items = buildNotifications({
    assignee: 'audit_manager',
    tasks: [
      { taskId: 'T-1', title: 'Review WP-AR-01', state: 'OPEN', assigneeRole: 'audit_manager', linkedObjectType: 'workpaper', createdAt: '2026-09-14T10:00:00Z' },
      { taskId: 'T-9', title: 'Other queue', state: 'OPEN', assigneeRole: 'finance_team', createdAt: '2026-09-14T10:01:00Z' },
      { taskId: 'T-3', title: 'Done', state: 'COMPLETE', assigneeRole: 'audit_manager', createdAt: '2026-09-14T10:02:00Z' },
    ],
    events: [{ eventId: 'E-1', action: 'PBC_RECEIPT_SUBMITTED', actor: 'ACT-NADIA', engagementId: 'ENG-0018-AUD-2026', createdAt: '2026-09-14T10:03:00Z' }],
    outbox: [{ message_id: 'M-1', subject: 'Draft FS v02 needs response', channel: 'PORTAL_NOTIFICATION', state: 'QUEUED_SIMULATION', created_at: '2026-09-14T10:04:00Z' }],
  });
  assert.ok(items.some((item) => item.id === 'task-T-1'));
  assert.ok(!items.some((item) => item.id === 'task-T-9'));
  assert.ok(!items.some((item) => item.id === 'task-T-3'));
  assert.ok(items.some((item) => item.kind === 'event'));
  assert.ok(items.some((item) => item.kind === 'message'));
  assert.ok(items.every((item) => item.route));
});

test('command palette matches clients, IDs, stages, personas and routes', () => {
  const contexts = [
    { engagementId: 'ENG-0018-AUD-2026', clientName: 'Northstar Trading W.L.L.', clientShortName: 'Northstar Trading', service: 'AUDIT', serviceLabel: 'Financial Statement Audit', period: 'FY2026', clientId: 'CLI-0018' },
    { engagementId: 'ENG-0009-ACC-2026', clientName: 'Cedar & Coast Logistics', clientShortName: 'Cedar & Coast', service: 'ACCOUNTING', serviceLabel: 'Accounting', period: 'FY2026', clientId: 'CLI-0009' },
  ];
  const personas = [{ id: 'partner-demo', role: 'partner', roleLabel: 'Audit partner / signatory', name: 'Maya Rahman', email: 'partner@quadrate.demo' }];
  const routes = [{ key: 'pipeline', label: 'Pipeline visualizer', title: 'Audit portal pipeline' }, { key: 'reviews', label: 'Reviews & approvals', title: 'Reviews & approvals' }];
  assert.ok(filterPalette('northstar', { contexts, personas, routes }).some((r) => r.action.engagementId === 'ENG-0018-AUD-2026'));
  assert.ok(filterPalette('ENG-0009', { contexts, personas, routes }).some((r) => r.action.engagementId === 'ENG-0009-ACC-2026'));
  assert.ok(filterPalette('RP-002', { contexts, personas, routes, tasks: [{ taskId: 'RP-002', title: 'Review point RP-002', state: 'OPEN', assigneeRole: 'audit_manager' }] }).some((r) => r.kind === 'task'));
  assert.ok(filterPalette('STAGE-06', { contexts, personas, routes }).some((r) => r.kind === 'stage'));
  assert.ok(filterPalette('Switch to Partner', { contexts, personas, routes }).some((r) => r.action.personaId === 'partner-demo'));
  assert.ok(filterPalette('Open pipeline', { contexts, personas, routes }).some((r) => r.action.route === 'pipeline'));
});

test('persona quick-switch retains allowed context and guards the route', () => {
  const routeRoles = { audit: { }, };
  const roles = { audit: ['admin', 'audit-manager'], reviews: ['admin', 'audit-manager'] };
  const stay = resolvePersonaSwitch({
    currentEngagementId: 'ENG-0018-AUD-2026',
    allowedEngagementIds: ['ENG-0018-AUD-2026', 'ENG-0009-ACC-2026'],
    currentRouteKey: 'audit',
    routeRoles: roles,
    newRole: 'audit-manager',
  });
  assert.equal(stay.retainedEngagementId, 'ENG-0018-AUD-2026');
  assert.equal(stay.targetRouteKey, 'audit');
  assert.equal(stay.stayed, true);
  assert.equal(routeRoles.audit !== undefined, true);

  const fallback = resolvePersonaSwitch({
    currentEngagementId: 'ENG-0018-AUD-2026',
    allowedEngagementIds: ['ENG-0009-ACC-2026'],
    currentRouteKey: 'audit',
    routeRoles: roles,
    newRole: 'accountant',
  });
  assert.equal(fallback.retainedEngagementId, 'ENG-0009-ACC-2026');
  assert.equal(fallback.targetRouteKey, 'role-workspace');
  assert.equal(fallback.stayed, false);
});

test('active engagement storage only accepts engagement ids', () => {
  const store = new Map();
  const storage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) };
  storage.setItem('auditflow-demo-context-v1', 'ENG-0009-ACC-2026');
  assert.equal(loadActiveEngagementId(storage), 'ENG-0009-ACC-2026');
  storage.setItem('auditflow-demo-context-v1', 'not-an-engagement');
  assert.equal(loadActiveEngagementId(storage), 'ENG-0018-AUD-2026');
});

test('stale refresh responses are dropped when selection or sequence moved on', () => {
  assert.equal(isStaleRefresh('ENG-0018-AUD-2026', 'ENG-0018-AUD-2026', 3, 3), false);
  assert.equal(isStaleRefresh('ENG-0018-AUD-2026', 'ENG-0009-ACC-2026', 3, 3), true);
  assert.equal(isStaleRefresh('ENG-0018-AUD-2026', 'ENG-0018-AUD-2026', 2, 3), true);
  assert.equal(isStaleRefresh('', '', 1, 1), false);
});

test('context correction retains allowed selection and falls back explicitly', () => {
  const contexts = [{ engagementId: 'ENG-0018-AUD-2026' }, { engagementId: 'ENG-0009-ACC-2026' }];
  assert.deepEqual(resolveContextCorrection('ENG-0009-ACC-2026', contexts), { activeEngagementId: 'ENG-0009-ACC-2026', corrected: false });
  assert.deepEqual(resolveContextCorrection('ENG-0018-AUD-2026', [{ engagementId: 'ENG-0009-ACC-2026' }]), { activeEngagementId: 'ENG-0009-ACC-2026', corrected: true });
  assert.deepEqual(resolveContextCorrection('ENG-0018-AUD-2026', []), { activeEngagementId: 'ENG-0018-AUD-2026', corrected: false });
  assert.deepEqual(resolveContextCorrection('ENG-0018-AUD-2026', null), { activeEngagementId: 'ENG-0018-AUD-2026', corrected: false });
});

test('failed slices retain the last good snapshot with an explicit error', () => {
  const prev = [{ taskId: 'T-1' }];
  const synced = mergeSliceResult(prev, { ok: true, tasks: [{ taskId: 'T-2' }] }, (res) => res.tasks);
  assert.deepEqual(synced.value, [{ taskId: 'T-2' }]);
  assert.equal(synced.error, null);
  assert.equal(synced.synced, true);
  const denied = mergeSliceResult(prev, { ok: false, error: { code: 'SCOPE_DENIED', message: 'Denied.', status: 403, correlationId: 'c' } }, (res) => res.tasks);
  assert.deepEqual(denied.value, prev);
  assert.equal(denied.error.code, 'SCOPE_DENIED');
  assert.equal(denied.synced, false);
  const offline = mergeSliceResult(prev, { ok: false, error: null }, (res) => res.tasks);
  assert.deepEqual(offline.value, prev);
  assert.equal(offline.error.code, 'API_ERROR');
  assert.equal(offline.synced, false);
});

test('only the Escape key closes overlays', () => {
  assert.equal(isEscapeEvent({ key: 'Escape' }), true);
  assert.equal(isEscapeEvent({ key: 'Esc' }), false);
  assert.equal(isEscapeEvent({ key: 'Enter' }), false);
  assert.equal(isEscapeEvent({}), false);
  assert.equal(isEscapeEvent(null), false);
});
