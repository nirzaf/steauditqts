// Phase A — unified demo navigation and context (M7 navigation slice).
// Pure helpers are unit-tested in tests/demo-navigator-phaseA.test.js.
// The composable keeps ONE shared polling loop (5s, visible-tab only) for
// contexts + engagement + tasks + timeline + outbox. No new framework.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  SHARED_POLL_MS,
  getDemoContexts,
  getSharedWorkspace,
  getAccountingStatus,
  getEngagementProgress,
  getSharedEngagement,
  getSharedOutbox,
  getSharedTasks,
  getSharedTimeline,
  isSharedDemoEnabled,
} from './sharedDemo.js';

export const SHARED_DEMO_POLL_MS = SHARED_POLL_MS;
export const DEMO_CONTEXT_STORAGE_KEY = 'auditflow-demo-context-v1';
export const DEFAULT_DEMO_ENGAGEMENT_ID = 'ENG-0018-AUD-2026';

export const DEMO_STAGE_TOTAL = 8;

export const DEMO_STAGE_TITLES = Object.freeze({
  'STAGE-01': 'Acceptance',
  'STAGE-02': 'Commercial & terms',
  'STAGE-03': 'Activation',
  'STAGE-04': 'Planning',
  'STAGE-05': 'Evidence & TB',
  'STAGE-06': 'Audit & Draft FS',
  'STAGE-07': 'Review & opinion',
  'STAGE-08': 'Release & close',
});

export const LOCAL_FALLBACK_CONTEXTS = Object.freeze([
  {
    engagementId: 'ENG-0018-AUD-2026',
    clientId: 'CLI-0018',
    clientName: 'Northstar Trading W.L.L.',
    clientShortName: 'Northstar Trading',
    service: 'AUDIT',
    serviceLabel: 'Financial Statement Audit',
    period: 'FY2026',
    currentStage: '',
    revision: 0,
    generationId: 'local',
    updatedAt: '',
  },
  {
    engagementId: 'ENG-0018-ACC-2026',
    clientId: 'CLI-0018',
    clientName: 'Northstar Trading W.L.L.',
    clientShortName: 'Northstar Trading',
    service: 'ACCOUNTING',
    serviceLabel: 'Accounting',
    period: 'FY2026',
    currentStage: '',
    revision: 0,
    generationId: 'local',
    updatedAt: '',
  },
  {
    engagementId: 'ENG-0009-ACC-2026',
    clientId: 'CLI-0009',
    clientName: 'Cedar & Coast Logistics',
    clientShortName: 'Cedar & Coast',
    service: 'ACCOUNTING',
    serviceLabel: 'Accounting',
    period: 'FY2026',
    currentStage: '',
    revision: 0,
    generationId: 'local',
    updatedAt: '',
  },
]);

const TASK_ROUTE_MAP = [
  [/pbc|receipt|request/i, 'pbc'],
  [/review|eqr|opinion|approval/i, 'reviews'],
  [/workpaper|fieldwork|procedure/i, 'audit'],
  [/draft.?fs|statement/i, 'accounting'],
  [/invoice|commercial|fee|advance|close/i, 'release'],
  [/accept|client.?detail|assessment/i, 'clients'],
  [/engagement|plan|team/i, 'engagements'],
  [/artifact|document|report/i, 'artifacts'],
  [/release|archive/i, 'release'],
];

export function parseStageNumber(currentStage) {
  const match = String(currentStage || '').match(/STAGE-(\d{2})/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 1 && n <= DEMO_STAGE_TOTAL ? n : 0;
}

export function stageLabel(currentStage) {
  const n = parseStageNumber(currentStage);
  return n > 0 ? `Stage ${n} / ${DEMO_STAGE_TOTAL}` : 'Stage — / 8';
}

export function mapTaskToRoute(task = {}) {
  const haystack = `${task.linkedObjectType || ''} ${task.linkedObjectId || ''} ${task.title || ''}`;
  for (const [pattern, route] of TASK_ROUTE_MAP) {
    if (pattern.test(haystack)) return route;
  }
  return 'role-workspace';
}

export function isTaskOpen(task = {}) {
  return !['COMPLETE', 'CANCELLED'].includes(String(task.state || 'OPEN').toUpperCase());
}

// D1-derived lightweight summary for the navigator (Phase A). The full
// prerequisite validator is Phase B; this never invents gates, it only
// projects the shared revision + open queue that D1 already returned.
export function deriveStageSummary(engagement, tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  const open = list.filter(isTaskOpen);
  const stageNumber = parseStageNumber(engagement?.currentStage);
  const completionPercent = stageNumber > 0 ? Math.round((stageNumber / DEMO_STAGE_TOTAL) * 100) : 0;
  const blockers = open.slice(0, 5).map((task) => ({
    id: task.taskId,
    title: task.title || task.taskId,
    owner: task.assigneeRole || task.assigneePersona || 'Unassigned',
    route: mapTaskToRoute(task),
  }));
  const first = open[0] || null;
  const nextAction = first
    ? { title: first.title || first.taskId, owner: first.assigneeRole || first.assigneePersona || 'Unassigned', route: mapTaskToRoute(first), taskId: first.taskId }
    : null;
  return {
    stageNumber,
    stageTotal: DEMO_STAGE_TOTAL,
    label: stageLabel(engagement?.currentStage),
    stageTitle: DEMO_STAGE_TITLES[String(engagement?.currentStage || '').toUpperCase()] || '',
    revision: engagement?.revision ?? null,
    openCount: open.length,
    blockedCount: list.filter((t) => String(t.state || '').toUpperCase() === 'BLOCKED').length,
    completionPercent,
    blockers,
    nextAction,
  };
}

export function buildNotifications({ tasks = [], events = [], outbox = [], assignee = '' } = {}) {
  const wanted = String(assignee || '').trim();
  const items = [];
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isTaskOpen(task)) continue;
    if (wanted && task.assigneePersona !== wanted && task.assigneeRole !== wanted && wanted !== '') continue;
    items.push({
      id: `task-${task.taskId}`,
      kind: 'task',
      title: task.title || task.taskId,
      detail: `${task.assigneeRole || task.assigneePersona || 'Queue'} · ${task.state || 'OPEN'}`,
      route: mapTaskToRoute(task),
      engagementId: task.engagementId || '',
      recordId: task.target || task.linkedObjectId || task.taskId || '',
      createdAt: task.createdAt || '',
    });
  }
  for (const event of (Array.isArray(events) ? events : []).slice(0, 10)) {
    items.push({
      id: `event-${event.eventId || event.action}-${event.createdAt || ''}`,
      kind: 'event',
      title: String(event.action || 'Update').replaceAll('_', ' '),
      detail: `${event.actor || 'Shared demo'} · ${event.engagementId || ''}`.trim(),
      route: 'pipeline',
      engagementId: event.engagementId || '',
      recordId: event.objectId || event.eventId || '',
      createdAt: event.createdAt || '',
    });
  }
  for (const message of (Array.isArray(outbox) ? outbox : []).slice(0, 10)) {
    items.push({
      id: `msg-${message.message_id || message.subject}`,
      kind: 'message',
      title: message.subject || message.related_id || 'Portal message',
      detail: `${message.channel || 'PORTAL_NOTIFICATION'} · ${message.state || ''}`.trim(),
      route: 'client-communications',
      engagementId: message.engagement_id || message.engagementId || '',
      recordId: message.related_id || message.relatedId || message.message_id || '',
      createdAt: message.created_at || message.createdAt || '',
    });
  }
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return items.slice(0, 20);
}

export function buildBreadcrumbs({ personaLabel = '', context = null, pageLabel = '', clientRoute = 'clients', engagementRoute = 'engagements' } = {}) {
  const crumbs = [];
  if (personaLabel) crumbs.push({ label: personaLabel, route: 'role-workspace' });
  if (context) {
    crumbs.push({ label: context.clientShortName || context.clientName || context.clientId, route: clientRoute });
    crumbs.push({
      label: `${context.serviceLabel || context.service || ''} ${context.period || ''}`.trim() || context.engagementId,
      route: engagementRoute,
    });
  }
  if (pageLabel) crumbs.push({ label: pageLabel, route: null });
  return crumbs;
}

function paletteIncludes(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(needle);
}

// Lightweight Ctrl/Cmd+K palette matching (Phase A): clients, engagement
// IDs, stages, personas, routes + a few presenter commands. No dependency.
export function filterPalette(query, { contexts = [], personas = [], routes = [], tasks = [], stages = [] } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  const results = [];
  const push = (kind, label, detail, action) => {
    if (results.length >= 24) return;
    results.push({ kind, label, detail, action });
  };
  if (!needle) {
    for (const context of contexts.slice(0, 5)) {
      push('context', `${context.clientShortName || context.clientName} · ${context.serviceLabel} ${context.period}`, context.engagementId, { type: 'switch-context', engagementId: context.engagementId });
    }
    for (const route of routes.slice(0, 5)) {
      push('route', `Open ${route.label}`, route.key, { type: 'navigate', route: route.key });
    }
    return results;
  }
  const switchMatch = needle.replace(/^switch to\s+/, '');
  const openMatch = needle.replace(/^open\s+/, '');
  for (const context of contexts) {
    const hay = `${context.clientName} ${context.clientShortName} ${context.engagementId} ${context.service} ${context.serviceLabel} ${context.period} ${context.clientId}`.toLowerCase();
    if (paletteIncludes(hay, needle) || paletteIncludes(hay, switchMatch)) {
      push('context', `${context.clientShortName || context.clientName} · ${context.serviceLabel} ${context.period}`, context.engagementId, { type: 'switch-context', engagementId: context.engagementId });
    }
  }
  for (const persona of personas) {
    const hay = `${persona.roleLabel} ${persona.name} ${persona.email} ${persona.id} ${persona.role}`.toLowerCase();
    if (paletteIncludes(hay, needle) || paletteIncludes(hay, switchMatch)) {
      push('persona', `Switch to ${persona.roleLabel}`, `${persona.name} · ${persona.email}`, { type: 'switch-persona', personaId: persona.id });
    }
  }
  for (const route of routes) {
    const hay = `${route.label} ${route.key} ${route.title || ''}`.toLowerCase();
    if (paletteIncludes(hay, needle) || paletteIncludes(hay, openMatch)) {
      push('route', `Open ${route.label}`, route.key, { type: 'navigate', route: route.key });
    }
  }
  for (const task of tasks.slice(0, 30)) {
    const hay = `${task.taskId} ${task.title} ${task.assigneeRole} ${task.assigneePersona}`.toLowerCase();
    if (needle && paletteIncludes(hay, needle)) {
      push('task', `${task.taskId} · ${task.title}`, String(task.state || 'OPEN'), {
        type: 'navigate', route: mapTaskToRoute(task), engagementId: task.engagementId || '',
        recordId: task.target || task.linkedObjectId || task.taskId || '',
      });
    }
  }
  const stagePool = stages.length ? stages : Object.entries(DEMO_STAGE_TITLES).map(([id, title]) => ({ id, title }));
  for (const stage of stagePool) {
    const hay = `${stage.id} ${stage.title}`.toLowerCase();
    if (needle && paletteIncludes(hay, needle)) {
      push('stage', `${stage.id} · ${stage.title}`, 'Pipeline stage', { type: 'navigate', route: 'pipeline' });
    }
  }
  if (paletteIncludes('restart walkthrough', needle)) push('command', 'Restart walkthrough', 'Admin / Partner only · return to the starting point', { type: 'command', command: 'reset-demo' });
  if (paletteIncludes('open pipeline', needle)) push('command', 'Open pipeline', 'Shared stage projection', { type: 'navigate', route: 'pipeline' });
  if (paletteIncludes('open approvals', needle)) push('command', 'Open approvals', 'Reviews & approvals queue', { type: 'navigate', route: 'reviews' });
  return results;
}

// Presenter quick-switch (Phase A §3.1): retain the engagement when the new
// persona may view it, otherwise fall back to the first allowed context.
// Never invents access: callers must pass the server-authorized list.
export function resolvePersonaSwitch({ currentEngagementId = '', allowedEngagementIds = [], currentRouteKey = '', routeRoles = {}, newRole = '' } = {}) {
  const allowed = Array.isArray(allowedEngagementIds) ? allowedEngagementIds : [];
  const retainedEngagementId = allowed.includes(currentEngagementId)
    ? currentEngagementId
    : (allowed[0] || currentEngagementId || DEFAULT_DEMO_ENGAGEMENT_ID);
  const roles = routeRoles[currentRouteKey];
  const canStay = Array.isArray(roles) ? roles.includes(newRole) : false;
  return {
    retainedEngagementId,
    targetRouteKey: canStay ? currentRouteKey : 'role-workspace',
    stayed: canStay,
  };
}

export function loadActiveEngagementId(storage) {
  try {
    const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    const value = target?.getItem?.(DEMO_CONTEXT_STORAGE_KEY) || '';
    return /^(?:ENG-|run-)[A-Za-z0-9_-]{1,79}$/.test(value.trim()) ? value.trim() : DEFAULT_DEMO_ENGAGEMENT_ID;
  } catch {
    return DEFAULT_DEMO_ENGAGEMENT_ID;
  }
}

export function isEscapeEvent(event) {
  return String(event?.key || '') === 'Escape';
}

// An in-flight refresh response may only be applied when it still describes
// the selected engagement. Prevents a slow response for engagement A from
// overwriting the fresh records of engagement B after a context switch.
export function isStaleRefresh(requestedId, activeId, requestSeq, latestSeq) {
  if (Number(requestSeq) !== Number(latestSeq)) return true;
  return String(requestedId || '') !== String(activeId || '');
}

// Server-authorized contexts changed under the presenter (for example another
// browser switched persona). Keep the selection when still allowed, else fall
// back to the first allowed context. An empty list keeps the current id so
// the last good snapshot stays visible instead of a blank navigator.
export function resolveContextCorrection(activeId, nextContexts) {
  const list = Array.isArray(nextContexts) ? nextContexts : [];
  if (list.some((context) => context && context.engagementId === activeId)) {
    return { activeEngagementId: activeId, corrected: false };
  }
  if (!list.length || !list[0]?.engagementId) return { activeEngagementId: activeId, corrected: false };
  return { activeEngagementId: list[0].engagementId, corrected: true };
}

// One refresh slice: on denial/offline keep the last good snapshot and
// surface the failure explicitly instead of silently clearing the panel.
export function mergeSliceResult(prev, res, pick) {
  if (res && res.ok) {
    let value = prev;
    try {
      const next = pick(res);
      value = next === undefined ? prev : next;
    } catch { value = prev; }
    return { value, error: null, synced: true };
  }
  const fallback = res && res.error
    ? res.error
    : { message: 'The shared demo request failed.', status: 0, code: 'API_ERROR', correlationId: '' };
  return { value: prev, error: fallback, synced: false };
}

export function saveActiveEngagementId(engagementId, storage) {
  try {
    const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    target?.setItem?.(DEMO_CONTEXT_STORAGE_KEY, String(engagementId || ''));
  } catch { /* persistence is best-effort for the demo */ }
}

// ---- Shared reactive store (single polling loop, owned by App.vue) ----
const activeEngagementId = ref(loadActiveEngagementId());
const contexts = ref([]);
const engagement = ref(null);
const tasks = ref([]);
const events = ref([]);
const outbox = ref([]);
const artifacts = ref([]);
const progress = ref(null);
const progressError = ref(null);
const accountingStatus = ref(null);
const accountingSteps = ref([]);
const allowedActions = ref([]);
const loading = ref(false);
const contextsError = ref(null);
const syncError = ref(null);
const syncStatus = ref('IDLE');
const lastSync = ref('');
let pollTimer = null;
let visibilityHandler = null;
let mountedCount = 0;
let refreshSeq = 0;

async function runRefreshShared() {
  if (!isSharedDemoEnabled) {
    contexts.value = [...LOCAL_FALLBACK_CONTEXTS];
    if (!contexts.value.some((c) => c.engagementId === activeEngagementId.value)) {
      activeEngagementId.value = DEFAULT_DEMO_ENGAGEMENT_ID;
    }
    engagement.value = null;
    tasks.value = [];
    events.value = [];
    outbox.value = [];
    progress.value = null;
    progressError.value = null;
    accountingStatus.value = null;
    accountingSteps.value = [];
    allowedActions.value = [];
    artifacts.value = [];
    contextsError.value = null;
    syncError.value = null;
    syncStatus.value = 'READY';
    lastSync.value = new Date().toISOString();
    return;
  }
  const id = activeEngagementId.value || DEFAULT_DEMO_ENGAGEMENT_ID;
  const seq = ++refreshSeq;
  syncStatus.value = lastSync.value ? 'REFRESHING' : 'LOADING';
  loading.value = true;
  try {
    // M7 STATE-01: the workspace endpoint is the authoritative snapshot for
    // a visible tab. Contexts are fetched alongside it only to correct a
    // presenter selection when the server changes the allowed scope. The
    // older slice endpoints remain a compatibility fallback for deployments
    // that have not applied the workspace migration yet.
    const [ctxRes, workspaceRes] = await Promise.all([getDemoContexts(), getSharedWorkspace(id)]);
    // A slow response for a previous engagement (or an older poll) must never
    // overwrite the records of the current selection. Drop it silently: a
    // newer refresh is already in flight or scheduled.
    if (isStaleRefresh(id, activeEngagementId.value, seq, refreshSeq)) return;
    if (ctxRes.ok && Array.isArray(ctxRes.contexts)) {
      contexts.value = ctxRes.contexts;
      contextsError.value = null;
      const correction = resolveContextCorrection(activeEngagementId.value, ctxRes.contexts);
      if (correction.corrected) {
        // The previous engagement is no longer authorized: never display its
        // records under the new selection. Clear, persist, and re-fetch for
        // the corrected engagement instead of mixing old records with new
        // contexts.
        activeEngagementId.value = correction.activeEngagementId;
        saveActiveEngagementId(correction.activeEngagementId);
        engagement.value = null;
        tasks.value = [];
        events.value = [];
        outbox.value = [];
        progress.value = null;
        progressError.value = null;
        accountingStatus.value = null;
        accountingSteps.value = [];
        allowedActions.value = [];
        artifacts.value = [];
        syncError.value = null;
        syncStatus.value = 'RESET_REQUIRED';
        // The re-fetch must start fresh even though a promise is still
        // in flight for the abandoned engagement.
        refreshInFlight = null;
        void refreshShared();
        return;
      }
    } else if (!contexts.value.length) {
      contextsError.value = ctxRes.error || null;
    }
    if (workspaceRes.ok && workspaceRes.workspace) {
      const workspace = workspaceRes.workspace;
      const scope = workspace.scope || {};
      const wsProgress = workspace.progress || null;
      engagement.value = {
        engagementId: workspace.engagementId || id,
        clientId: scope.clientId || '',
        clientName: scope.clientName || '',
        service: scope.service || '',
        period: scope.period || '',
        currentStage: wsProgress?.cachedStage || wsProgress?.currentStage || '',
        revision: Number(workspace.revision || 0),
        generationId: workspace.generationId || '',
        updatedAt: new Date().toISOString(),
        gStatus: {},
      };
      tasks.value = Array.isArray(workspace.tasks) ? workspace.tasks : [];
      events.value = Array.isArray(workspace.recentEvents) ? workspace.recentEvents : [];
      outbox.value = Array.isArray(workspace.outbox) ? workspace.outbox : [];
      artifacts.value = Array.isArray(workspace.artifacts) ? workspace.artifacts : [];
      progress.value = wsProgress;
      progressError.value = null;
      accountingStatus.value = workspace.accounting || null;
      accountingSteps.value = Array.isArray(workspace.accountingSteps) ? workspace.accountingSteps : [];
      allowedActions.value = Array.isArray(workspace.allowedActions) ? workspace.allowedActions : [];
      const snapshotStale = String(workspace.consistency || '').toUpperCase() === 'STALE';
      syncError.value = snapshotStale
        ? { code: 'SNAPSHOT_STALE', message: workspace.consistencyReason || 'The shared snapshot changed while related records were being read.' }
        : (ctxRes.ok ? null : (ctxRes.error || null));
      if (ctxRes.ok) contextsError.value = null;
      syncStatus.value = snapshotStale ? 'STALE' : (ctxRes.ok ? 'READY' : 'STALE');
      if (!snapshotStale) lastSync.value = new Date().toISOString();
      return;
    }

    // Failed workspace reads retain the last good snapshot; fall back to the
    // pre-M7 slices so an older Worker still provides a useful demo.
    const [engRes, taskRes, timeRes, outRes, progRes, acctRes] = await Promise.all([
      getSharedEngagement(id),
      getSharedTasks(id),
      getSharedTimeline(id, 20),
      getSharedOutbox(id),
      getEngagementProgress(id),
      getAccountingStatus(id),
    ]);
    // Failed slices retain the last good snapshot; the first failure is kept
    // in syncError so panels can say stale data is shown explicitly.
    const mergedEngagement = mergeSliceResult(engagement.value, engRes, (res) => res.engagement || null);
    const mergedTasks = mergeSliceResult(tasks.value, taskRes, (res) => res.tasks || []);
    const mergedEvents = mergeSliceResult(events.value, timeRes, (res) => res.events || []);
    const mergedOutbox = mergeSliceResult(outbox.value, outRes, (res) => res.messages || res.outbox || []);
    const mergedProgress = mergeSliceResult(progress.value, progRes, (res) => res.progress || null);
    const mergedStatus = mergeSliceResult(accountingStatus.value, acctRes, (res) => res.status || null);
    const mergedSteps = mergeSliceResult(accountingSteps.value, acctRes, (res) => res.steps || []);
    engagement.value = mergedEngagement.value;
    tasks.value = mergedTasks.value;
    events.value = mergedEvents.value;
    outbox.value = mergedOutbox.value;
    progress.value = mergedProgress.value;
    progressError.value = mergedProgress.error;
    accountingStatus.value = mergedStatus.value;
    accountingSteps.value = mergedSteps.value;
    syncError.value = mergedEngagement.error || mergedTasks.error || mergedEvents.error || mergedOutbox.error || mergedProgress.error || mergedStatus.error || null;
    // lastSync advances only when at least one slice actually synced, so the
    // stale label never describes a fully failed attempt.
    if (mergedEngagement.synced || mergedTasks.synced || mergedEvents.synced || mergedOutbox.synced || mergedProgress.synced || mergedStatus.synced) {
      lastSync.value = new Date().toISOString();
      syncStatus.value = syncError.value ? 'STALE' : 'READY';
    } else {
      syncStatus.value = 'ERROR';
    }
  } finally {
    loading.value = false;
  }
}

// M7 STATE-02 — single-flight refresh coalescing. Concurrent callers (page
// mounts, poll ticks, visibility changes, post-command refreshes) share the
// in-flight promise instead of stacking overlapping fetches.
let refreshInFlight = null;

function refreshShared() {
  if (refreshInFlight) return refreshInFlight;
  const current = runRefreshShared().finally(() => {
    if (refreshInFlight === current) refreshInFlight = null;
  });
  refreshInFlight = current;
  return current;
}

let pollChainActive = false;

function scheduleNextPoll() {
  if (!SHARED_DEMO_POLL_MS || SHARED_DEMO_POLL_MS <= 0 || typeof window === 'undefined') return;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    if (typeof document !== 'undefined' && document.hidden) {
      scheduleNextPoll();
      return;
    }
    // The next tick is scheduled only after the current refresh settles, so
    // slow responses can never stack overlapping polls.
    void Promise.resolve(refreshShared()).finally(() => { scheduleNextPoll(); });
  }, SHARED_DEMO_POLL_MS);
}

function startPolling() {
  mountedCount += 1;
  if (pollChainActive || typeof window === 'undefined') return;
  pollChainActive = true;
  void refreshShared();
  scheduleNextPoll();
  if (!visibilityHandler && typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (typeof document !== 'undefined' && !document.hidden) void refreshShared();
    };
    document?.addEventListener?.('visibilitychange', visibilityHandler);
  }
}

function stopPolling() {
  mountedCount = Math.max(0, mountedCount - 1);
  if (mountedCount > 0) return;
  pollChainActive = false;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (visibilityHandler && typeof document !== 'undefined') document?.removeEventListener?.('visibilitychange', visibilityHandler);
  visibilityHandler = null;
}

export function switchSharedEngagement(engagementId) {
  const next = String(engagementId || '').trim() || DEFAULT_DEMO_ENGAGEMENT_ID;
  // Invalidate any in-flight refresh for the previous engagement so its late
  // response is dropped by the stale guard instead of overwriting the switch.
  refreshSeq += 1;
  activeEngagementId.value = next;
  saveActiveEngagementId(next);
  // Never render records from the previous engagement under a new deep link;
  // the next authoritative workspace snapshot repopulates this scope.
  engagement.value = null;
  tasks.value = [];
  events.value = [];
  outbox.value = [];
  artifacts.value = [];
  progress.value = null;
  progressError.value = null;
  accountingStatus.value = null;
  accountingSteps.value = [];
  allowedActions.value = [];
  syncStatus.value = 'LOADING';
  // The in-flight response still describes the previous engagement; drop it
  // so the coalesced refresh below fetches the new selection immediately.
  refreshInFlight = null;
  // Keep the browser-local scenario scope aligned best-effort so local pages
  // do not describe a different engagement than the navigator. A denial
  // keeps the shared selection; local pages remain labelled LOCAL.
  try {
    void import('./domain/scenario.js').then((module) => {
      try { module.selectEngagement?.(next, {}); } catch { /* local scope is advisory */ }
    }).catch(() => {});
  } catch { /* dynamic import is best-effort */ }
  void refreshShared();
}

export function useDemoContext() {
  onMounted(startPolling);
  onUnmounted(stopPolling);
  const mode = computed(() => (isSharedDemoEnabled ? 'shared' : 'local'));
  const activeContext = computed(() => contexts.value.find((c) => c.engagementId === activeEngagementId.value) || null);
  const stageSummary = computed(() => deriveStageSummary(engagement.value, tasks.value));
  return {
    mode,
    sharedEnabled: isSharedDemoEnabled,
    activeEngagementId,
    contexts,
    activeContext,
    engagement,
    tasks,
    events,
    outbox,
    artifacts,
    progress,
    progressError,
    accountingStatus,
    accountingSteps,
    allowedActions,
    loading,
    contextsError,
    syncError,
    syncStatus,
    lastSync,
    stageSummary,
    refresh: refreshShared,
    switchEngagement: switchSharedEngagement,
  };
}
