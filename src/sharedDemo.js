// Shared synthetic demo client (DEMO-INTERACTIVE-001).
// Talks to the Cloudflare Worker D1 backend when the build explicitly opts
// into the shared demo (VITE_SHARED_DEMO_* triple flag). Unlike comments /
// preferences, WORKFLOW actions here never fall back to local success: a
// failed shared write is always surfaced as { ok: false, error } so the UI
// can say "was not committed" instead of pretending.
import { AuditFlowApiError, apiErrorFromResponse, isSharedDemoEnabled } from './api.js';

export { isSharedDemoEnabled };
export const SHARED_ENGAGEMENT_ID = 'ENG-0018-AUD-2026';
export const SHARED_POLL_MS = 5000;

const testOverrides = { baseUrl: null, enabled: null };
/** Test-only hook: force the client on/off with a mock fetch base. */
export function __setSharedDemoConfigForTests(config = {}) {
  testOverrides.baseUrl = config.baseUrl ?? null;
  testOverrides.enabled = config.enabled ?? null;
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

function disabledError() {
  return new AuditFlowApiError('Shared demo API is disabled; this walkthrough is browser-local.', {
    code: 'SHARED_API_DISABLED',
    correlationId: requestId(),
  });
}

async function sharedRequest(path, { method = 'GET', body } = {}) {
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
      headers: { 'Content-Type': 'application/json', 'X-AuditFlow-Request-Id': id },
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

function toResult(promise) {
  return promise.then(
    (data) => ({ ok: true, ...data }),
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

export function createDemoSession(personaId) {
  return toResult(sharedRequest('/demo/session', { method: 'POST', body: { personaId } }));
}

export function getDemoMe() {
  return toResult(sharedRequest('/demo/me'));
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

export function getSharedWorkpapers(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/workpapers?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedReviews(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/reviews?engagementId=${encodeURIComponent(engagementId)}`));
}

export function getSharedDecisions(engagementId = SHARED_ENGAGEMENT_ID) {
  return toResult(sharedRequest(`/decisions?engagementId=${encodeURIComponent(engagementId)}`));
}

/**
 * Run one versioned workflow action. Resolves { ok:true, ... } on commit or
 * { ok:false, error } on denial/conflict/offline. Never synthesizes success.
 */
export function runSharedAction(engagementId, action, payload = {}) {
  return toResult(sharedRequest(`/engagements/${encodeURIComponent(engagementId)}/actions`, {
    method: 'POST',
    body: { ...payload, action },
  }));
}

export function resetSharedDemo() {
  return toResult(sharedRequest('/demo/reset', { method: 'POST', body: {} }));
}
