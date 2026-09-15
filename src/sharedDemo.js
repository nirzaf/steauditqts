// Shared synthetic demo client (DEMO-INTERACTIVE-001).
// Talks to the Cloudflare Worker D1 backend when the build explicitly opts
// into the shared demo (VITE_SHARED_DEMO_* triple flag). Unlike comments /
// preferences, WORKFLOW actions here never fall back to local success: a
// failed shared write is always surfaced as { ok: false, error } so the UI
// can say "was not committed" instead of pretending.
import { AuditFlowApiError, apiErrorFromResponse, isSharedDemoEnabled } from './api.js';
import { normalizeOutcome } from '../shared/actionContracts.js';
import { canRetryOperation, createOperation, operationPayload } from './infrastructure/commandTransport.js';
import { ref, readonly } from 'vue';

export { isSharedDemoEnabled };
export const SHARED_ENGAGEMENT_ID = 'ENG-0018-AUD-2026';
export const SHARED_POLL_MS = 5000;

const testOverrides = { baseUrl: null, enabled: null };
let activeViewDescriptor = null;
const activeSessionRef = ref(null);
export const activeDemoSession = readonly(activeSessionRef);
/** Test-only hook: force the client on/off with a mock fetch base. */
export function __setSharedDemoConfigForTests(config = {}) {
  testOverrides.baseUrl = config.baseUrl ?? null;
  testOverrides.enabled = config.enabled ?? null;
  if (config.resetView === true || config.enabled === false) {
    activeViewDescriptor = null;
    activeSessionRef.value = null;
  }
}

function sharedEnabled() {
  return testOverrides.enabled != null ? testOverrides.enabled : isSharedDemoEnabled;
}

function apiBase() {
  if (testOverrides.baseUrl) return String(testOverrides.baseUrl).replace(/\/$/, '');
  let env = {};
  try { env = (import.meta && import.meta.env) || {}; } catch { env = {}; }
  return String(env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
}

export function setActiveDemoView(view) {
  activeViewDescriptor = view && view.viewId ? { ...view } : null;
  return activeViewDescriptor;
}

export function getActiveDemoView() {
  return activeViewDescriptor;
}

export function getActiveDemoSession() {
  return activeSessionRef.value;
}

export function clearActiveDemoSession() {
  activeSessionRef.value = null;
  activeViewDescriptor = null;
}

function invitationTokenFromLocation() {
  try {
    return new URL(window.location.href).searchParams.get('invite') || '';
  } catch { return ''; }
}

function clearInvitationToken() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('invite')) return;
    url.searchParams.delete('invite');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch { /* non-browser tests */ }
}

function requestId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `af-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function idempotencyKey(prefix = 'demo') {
  const clean = String(prefix || 'demo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'demo';
  return `${clean}-${requestId().replaceAll('-', '').slice(0, 12)}`;
}

// §5.4 — retry guidance surfaced with every unconfirmed outcome.
const RETRY_GUIDANCE = 'Retry this same request; do not create a new intent.';

function disabledError() {
  return new AuditFlowApiError('Shared demo API is disabled; this walkthrough is browser-local.', {
    code: 'SHARED_API_DISABLED',
    correlationId: requestId(),
  });
}

async function sharedRequest(path, { method = 'GET', body, headers = {} } = {}) {
  if (!sharedEnabled()) throw disabledError();
  const id = requestId();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      ...(controller ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-AuditFlow-Request-Id': id,
        ...(activeViewDescriptor?.viewId && !path.startsWith('/demo/views') ? {
          'X-AuditFlow-View': activeViewDescriptor.viewId,
          'X-AuditFlow-Context-Version': String(activeViewDescriptor.contextVersion || 1),
        } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw new AuditFlowApiError('The shared demo API did not respond. The action was not committed.', {
      code: 'NETWORK_UNAVAILABLE',
      correlationId: id,
      cause,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw apiErrorFromResponse(response, payload, id);
  return payload;
}

// Keep the active tab descriptor's server-confirmed revision current so the
// next command can carry a complete generation/version envelope.
function syncViewFromCommandResult(data) {
  const view = data?.view || data?.workspace?.view;
  if (view?.viewId) setActiveDemoView(view);
  const revision = Number(data?.revision ?? data?.engagement?.revision ?? data?.progress?.revision ?? data?.workspace?.revision);
  const generationId = data?.generationId || data?.engagement?.generationId || data?.progress?.generationId || data?.workspace?.generationId;
  if (activeViewDescriptor && (data?.engagementId || data?.engagement?.engagementId || data?.progress?.engagementId || data?.workspace?.engagementId) === activeViewDescriptor.engagementId) {
    if (Number.isSafeInteger(revision) && revision >= 1) activeViewDescriptor = { ...activeViewDescriptor, revision };
    if (generationId) activeViewDescriptor = { ...activeViewDescriptor, generationId: String(generationId) };
  }
}

function toResult(promise) {
  return promise.then(
    (data) => {
      syncViewFromCommandResult(data);
      return ({ ok: true, ...data });
    },
    (error) => ({
      ok: false,
      error: {
        message: error?.message || 'The shared demo request failed.',
        status: Number(error?.status || 0),
        code: error?.code || 'API_ERROR',
        correlationId: error?.correlationId || '',
      },
    }),
  );
}

export function createDemoSession(personaId, options = {}) {
  const inviteToken = String(options.inviteToken ?? invitationTokenFromLocation()).trim();
  const body = inviteToken ? { personaId, inviteToken } : { personaId };
  return toResult(sharedRequest('/demo/session', { method: 'POST', body })).then((result) => {
    if (result.ok && result.session) activeSessionRef.value = { ...result.session };
    if (result.ok && result.view) setActiveDemoView(result.view)
    if (result.ok && inviteToken) clearInvitationToken();
    return result
  });
}

export function createDemoInvitation(payload = {}) {
  return toResult(sharedRequest('/demo/invitations', { method: 'POST', body: payload }));
}

export function getDemoMe() {
  return toResult(sharedRequest('/demo/me')).then((result) => {
    if (result.ok && result.session) activeSessionRef.value = { ...result.session };
    if (result.ok && result.view) setActiveDemoView(result.view);
    return result;
  });
}

// Phase A — server-authorized engagement contexts for the Demo Navigator.
// Returns only engagements the current Worker demo session may view.
export function getDemoContexts() {
  return toResult(sharedRequest('/demo/contexts'));
}

export function getDemoViews() {
  return toResult(sharedRequest('/demo/views'));
}

export function createDemoView(payload = {}) {
  return toResult(sharedRequest('/demo/views', { method: 'POST', body: payload })).then((result) => {
    if (result.ok && result.view) setActiveDemoView(result.view)
    return result
  });
}

export function getDemoView(viewId) {
  return toResult(sharedRequest(`/demo/views/${encodeURIComponent(viewId)}`));
}

export function switchDemoView(viewId, payload = {}) {
  return toResult(sharedRequest(`/demo/views/${encodeURIComponent(viewId)}`, { method: 'PUT', body: payload })).then((result) => {
    if (result.ok && result.view) setActiveDemoView(result.view)
    return result
  });
}

export function closeDemoView(viewId) {
  return toResult(sharedRequest(`/demo/views/${encodeURIComponent(viewId)}`, { method: 'DELETE' }));
}

export function getSharedEngagement(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}`));
}

export function getSharedTasks(engagementId = SHARED_ENGAGEMENT_ID, assignee = '') {
  const query = assignee ? `?assignee=${encodeURIComponent(assignee)}` : '';
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/tasks${query}`));
}

export function getSharedTimeline(engagementId = SHARED_ENGAGEMENT_ID, limit = 30) {
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/timeline?limit=${Number(limit) || 30}`));
}

export function getSharedArtifacts(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/artifacts?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedOutbox(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/outbox?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedPbc(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/pbc?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getPortalMessages(engagementId = SHARED_ENGAGEMENT_ID, runId = '') {
  const runQuery = runId ? `&runId=${encodeURIComponent(runId)}` : ''
  return toResult(sharedRequest(`/portal/messages?engagementId=${encodeURIComponent(engagementId)}${runQuery}`));
}

export function sendPortalMessage(engagementId, payload = {}, runId = '') {
  return toResult(sharedRequest(`/portal/messages?engagementId=${encodeURIComponent(engagementId)}${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`, { method: 'POST', body: { ...payload, engagementId, ...(runId ? { runId } : {}) } }));
}

export function replyPortalMessage(messageId, payload = {}) {
  return toResult(sharedRequest(`/portal/messages/${encodeURIComponent(messageId)}/reply`, { method: 'POST', body: payload }));
}

export function markPortalMessageRead(messageId) {
  return toResult(sharedRequest(`/portal/messages/${encodeURIComponent(messageId)}/read`, { method: 'POST', body: {} }));
}

export async function uploadPortalEvidence({ engagementId, requestId: requestIdentifier, file, idempotencyKey: suppliedKey = '' } = {}) {
  if (!sharedEnabled()) return { ok: false, error: { message: 'Shared demo API is disabled; this walkthrough is browser-local.', code: 'SHARED_API_DISABLED', status: 0 } };
  if (!file) return { ok: false, error: { message: 'Choose a file first.', code: 'FILE_REQUIRED', status: 400 } };
  const id = requestId();
  const form = new FormData();
  form.append('file', file, file.name || 'evidence.pdf');
  form.append('engagementId', engagementId || SHARED_ENGAGEMENT_ID);
  form.append('requestId', requestIdentifier || '');
  const key = String(suppliedKey || idempotencyKey('upload'));
  form.append('idempotencyKey', key);
  const headers = {
    'X-AuditFlow-Request-Id': id,
    'Idempotency-Key': key,
    ...(activeViewDescriptor?.viewId ? {
      'X-AuditFlow-View': activeViewDescriptor.viewId,
      'X-AuditFlow-Context-Version': String(activeViewDescriptor.contextVersion || 1),
    } : {}),
  };
  try {
    const response = await fetch(`${apiBase()}/demo/uploads`, { method: 'POST', credentials: 'include', headers, body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw apiErrorFromResponse(response, payload, id);
    return payload;
  } catch (error) {
    return { ok: false, error: { message: error?.message || 'The upload could not be completed.', status: Number(error?.status || 0), code: error?.code || 'UPLOAD_FAILED', correlationId: error?.correlationId || id } };
  }
}

export async function downloadPortalEvidence(receiptId) {
  if (!sharedEnabled()) throw disabledError();
  const id = requestId();
  const headers = {
    'X-AuditFlow-Request-Id': id,
    ...(activeViewDescriptor?.viewId ? {
      'X-AuditFlow-View': activeViewDescriptor.viewId,
      'X-AuditFlow-Context-Version': String(activeViewDescriptor.contextVersion || 1),
    } : {}),
  };
  const response = await fetch(`${apiBase()}/demo/uploads/${encodeURIComponent(receiptId)}`, { credentials: 'include', headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw apiErrorFromResponse(response, payload, id);
  }
  return { blob: await response.blob(), fileName: response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'evidence-file' };
}

export function getSharedWorkpapers(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/workpapers?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedReviews(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/reviews?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedDecisions(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/decisions?engagementId=${encodeURIComponent(engagementId)}`));
}

// Phase B — server-derived workflow progress and process validity. The Worker
// derives the stage from actual D1 records; current_stage is only a cached
// projection and is reported as such.
export function getEngagementProgress(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/progress`));
}

export function getSharedWorkspace(engagementId = SHARED_ENGAGEMENT_ID, { viewId = '', contextVersion = null } = {}) {
  const headers = viewId ? {
    'X-AuditFlow-View': viewId,
    ...(contextVersion == null ? {} : { 'X-AuditFlow-Context-Version': String(contextVersion) }),
  } : {};
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/workspace`, { headers }));
}

export function getApprovalCenter(engagementId = SHARED_ENGAGEMENT_ID, tab = 'my-decisions', { viewId = '', contextVersion = null } = {}) {
  const params = new URLSearchParams({ engagementId, tab });
  const headers = viewId ? {
    'X-AuditFlow-View': viewId,
    ...(contextVersion == null ? {} : { 'X-AuditFlow-Context-Version': String(contextVersion) }),
  } : {};
  return toResult(sharedRequest(`/approval-center?${params.toString()}`, { headers }));
}

// Phase D — operational views are generated by the Worker from the canonical
// D1 snapshot. Components must not derive a competing "next action" locally.
export function getSharedPortfolio() {
  return toResult(sharedRequest('/portfolio'));
}

export function getProcessHealth(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/process-health?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getScenarioPresets(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/scenario-presets?engagementId=${encodeURIComponent(engagementId)}`));
}

export function applyScenarioPreset(engagementId, presetKey, payload = {}) {
  return runSharedAction(engagementId, 'APPLY_SCENARIO_PRESET', { ...payload, presetKey });
}

// Phase C — shared client evaluation on the canonical question bank, the
// accounting status tracker, and the completion-review chain.
export function getAssessmentSummary(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/assessments?engagementId=${encodeURIComponent(engagementId)}`));
}

export function recordAssessmentResponse(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'RECORD_ASSESSMENT_RESPONSE', payload);
}

export function getAccountingStatus(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/accounting-status?engagementId=${encodeURIComponent(engagementId)}`));
}

export function updateAccountingStatus(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'UPDATE_ACCOUNTING_STATUS', payload);
}

export function approveAccountingFs(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'APPROVE_ACCOUNTING_FS', payload);
}

export function evaluateAccountingInput(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'EVALUATE_ACCOUNTING_INPUT', payload);
}

export function recordManagerCompletion(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'RECORD_MANAGER_COMPLETION', payload);
}

export function recordPartnerReview(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'RECORD_PARTNER_REVIEW', payload);
}

export function recordFinalDiscussion(engagementId, payload = {}) {
  return runSharedAction(engagementId, 'RECORD_FINAL_DISCUSSION', payload);
}

/**
 * Run one versioned workflow action. Resolves { ok:true, ... } on commit or
 * { ok:false, error } on denial/conflict/offline. Never synthesizes success.
 */
export function runSharedAction(engagementId, action, payload = {}) {
  const cleanAction = String(action || '').trim().toUpperCase();
  const active = activeViewDescriptor && activeViewDescriptor.engagementId === engagementId
    && activeViewDescriptor.viewId && activeViewDescriptor.generationId
    && Number.isSafeInteger(Number(activeViewDescriptor.revision)) && Number(activeViewDescriptor.revision) >= 1;
  if (!active) {
    return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/actions`, {
      method: 'POST',
      body: { ...payload, action: cleanAction },
    }));
  }
  const { targetId: suppliedTarget, expectedGenerationId, expectedRevision, expectedContextVersion, action: _ignored, ...businessPayload } = payload || {};
  const idempotency = String(payload?.idempotencyKey || idempotencyKey(cleanAction.toLowerCase()));
  const envelope = {
    action: cleanAction,
    targetId: String(suppliedTarget || payload?.candidateId || payload?.workpaperId || payload?.requestId || engagementId),
    expectedGenerationId: String(expectedGenerationId || activeViewDescriptor.generationId),
    expectedRevision: Number(expectedRevision || activeViewDescriptor.revision),
    expectedContextVersion: Number(expectedContextVersion || activeViewDescriptor.contextVersion || 1),
    idempotencyKey: idempotency,
    payload: businessPayload,
  };
  return sendCommandEnvelope(engagementId, envelope);
}

// M7 APP-F06 — a lost response (network failure, timeout, non-JSON body or
// 5xx) is UNCERTAIN: not committed, not rejected. Only a parsed 4xx server
// denial is a REJECTED outcome.
function outcomeFromApiError(error) {
  const status = Number(error?.status || 0);
  const uncertain = !status || status >= 500 || error?.code === 'NETWORK_UNAVAILABLE';
  const detail = {
    message: error?.message || 'The shared demo request failed.',
    status,
    code: error?.code || 'API_ERROR',
    correlationId: error?.correlationId || '',
  };
  return uncertain
    ? { ok: false, outcome: 'UNCERTAIN', code: 'COMMIT_UNCONFIRMED', guidance: RETRY_GUIDANCE, error: detail }
    : { ok: false, outcome: 'REJECTED', error: detail };
}

// Strict v1 command send for one stable intent. A 2xx response without a
// valid command outcome (for example a parsed SPA fallback document) is
// UNCERTAIN — it is never treated as success.
async function sendCommandEnvelope(engagementId, envelope) {
  try {
    const payload = await sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/actions`, {
      method: 'POST',
      headers: { 'X-AuditFlow-Command': 'v1' },
      body: envelope,
    });
    if (!payload?.ok || normalizeOutcome(payload).outcome !== 'COMMITTED') {
      return {
        ok: false,
        outcome: 'UNCERTAIN',
        code: 'COMMIT_UNCONFIRMED',
        guidance: RETRY_GUIDANCE,
        error: { message: 'The server response was not a confirmed command outcome.', status: 0, code: 'COMMIT_UNCONFIRMED', correlationId: '' },
      };
    }
    syncViewFromCommandResult(payload);
    return { ok: true, outcome: 'COMMITTED', ...payload };
  } catch (error) {
    return outcomeFromApiError(error);
  }
}

// Confirmed workspace context for strict commands, or null when the client
// has no active view and must use the legacy unguarded action path.
export function activeCommandContext(engagementId) {
  const active = activeViewDescriptor && activeViewDescriptor.engagementId === engagementId
    && activeViewDescriptor.viewId && activeViewDescriptor.generationId
    && Number.isSafeInteger(Number(activeViewDescriptor.revision)) && Number(activeViewDescriptor.revision) >= 1;
  if (!active) return null;
  return {
    engagementId,
    generationId: String(activeViewDescriptor.generationId),
    viewId: activeViewDescriptor.viewId,
    revision: Number(activeViewDescriptor.revision),
    contextVersion: Number(activeViewDescriptor.contextVersion || 1),
    actorId: activeViewDescriptor.actorId || '',
  };
}

function stripIntentFields(payload = {}) {
  const { targetId: _t, expectedGenerationId: _g, expectedRevision: _r, expectedContextVersion: _c, action: _a, idempotencyKey: _k, __strictCommand: _s, ...business } = payload || {};
  return business;
}

// One stable intent per user action (M7 APPROVAL-03 / APP-F06): the
// idempotency key is minted once and reused across retries until the command
// commits or is explicitly rejected. An UNCERTAIN result keeps the intent
// retryable with the SAME key.
export function createSharedIntent(context, action, targetId, payload = {}) {
  const cleanAction = String(action || '').trim().toUpperCase();
  const operation = createOperation(context, cleanAction, String(targetId || context.engagementId), stripIntentFields(payload));
  const envelope = () => operationPayload(operation);
  const send = async () => {
    if (!canRetryOperation(operation)) return { ...(operation.result || {}) };
    const result = await sendCommandEnvelope(context.engagementId, envelope());
    if (result.ok) {
      operation.status = 'COMMITTED';
      operation.result = result;
    } else if (result.outcome === 'REJECTED') {
      operation.status = 'REJECTED';
      operation.result = result;
    } else {
      operation.status = 'UNCERTAIN';
      operation.result = result;
    }
    return result;
  };
  return {
    key: envelope().idempotencyKey,
    get status() { return operation.status; },
    get result() { return operation.result; },
    canRetry: () => canRetryOperation(operation),
    send,
  };
}

export function resetSharedDemo() {
  return toResult(sharedRequest('/demo/reset', { method: 'POST', body: {} }));
}
