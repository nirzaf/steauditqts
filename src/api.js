import {
  commentsFor,
  DEFAULT_ENGAGEMENT_ID,
  LocalStateError,
  preferencesFor,
  profileFor,
  readLocalState,
  writeLocalState,
} from './localState.js'

export const DEMO_ENGAGEMENT_ID = DEFAULT_ENGAGEMENT_ID

// Vite exposes build-time values to the browser. None of these values are a
// secret or an authentication mechanism; they are only an explicit opt-in
// switch for a separately protected, non-production shared demo. The normal
// build is always browser-local and never calls /api.
const buildEnv = import.meta.env || {}
const apiBase = String(buildEnv.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const sharedApiEnabled = String(buildEnv.VITE_SHARED_DEMO_ENABLED || '').toLowerCase() === 'true'
  && ['cloudflare-access-verified', 'public-synthetic'].includes(buildEnv.VITE_SHARED_DEMO_IDENTITY)
  && buildEnv.VITE_SHARED_DEMO_BINDING === 'isolated-non-production'

export const demoStorageMode = sharedApiEnabled ? 'SHARED_DEMO_OPT_IN' : 'LOCAL_ONLY'
export const evidenceLevel = 'SIMULATION'
export const isSharedDemoEnabled = sharedApiEnabled

export class AuditFlowApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', correlationId = '', retryAfter = null, cause } = {}) {
    super(message)
    this.name = 'AuditFlowApiError'
    this.status = status
    this.code = code
    this.correlationId = correlationId
    this.retryAfter = retryAfter
    this.cause = cause
  }
}

function correlationId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through to a non-security identifier */ }
  return `af-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function publicError(error) {
  if (!error) return null
  return {
    message: error.message || 'AuditFlow could not complete that request.',
    status: Number(error.status || 0),
    code: error.code || 'API_ERROR',
    correlationId: error.correlationId || '',
    retryAfter: error.retryAfter ?? null,
  }
}

export function apiErrorFromResponse(response, payload = {}, requestId = correlationId()) {
  const responseCorrelationId = response?.headers?.get?.('X-Correlation-Id') || requestId
  const status = Number(response?.status || 0)
  // The worker's unconfirmed-commit contract (503 UNCERTAIN) carries a
  // top-level code/message instead of an error envelope; keep it explicit so
  // the UI can distinguish "not committed" from an unknown failure.
  return new AuditFlowApiError(payload?.error?.message || payload?.message || `AuditFlow API returned ${status}.`, {
    status,
    code: payload?.error?.code || payload?.code || (status === 403 ? 'ACCESS_DENIED' : status === 409 ? 'REVISION_CONFLICT' : 'API_ERROR'),
    correlationId: responseCorrelationId,
    retryAfter: response?.headers?.get?.('Retry-After') || null,
  })
}

function localResultBase(snapshot, extra = {}) {
  return {
    source: 'local',
    syncState: 'LOCAL_ONLY',
    evidenceLevel,
    storageError: snapshot?.error ? publicError(snapshot.error) : null,
    ...extra,
  }
}

function localRead() {
  return readLocalState()
}

function localWrite(snapshot, mutate) {
  // A malformed or unreadable state must be surfaced, not replaced by a new
  // empty object that looks like a successful save.
  if (snapshot.error) return { ok: false, error: snapshot.error }
  try {
    const next = mutate(snapshot.state)
    writeLocalState(next)
    return { ok: true, state: next }
  } catch (error) {
    return { ok: false, error: error instanceof LocalStateError ? error : new LocalStateError('The synthetic state could not be saved.', 'LOCAL_STORAGE_WRITE_FAILED', error) }
  }
}

function localComment(payload, { offline = false, error = null } = {}) {
  const snapshot = localRead()
  const result = localWrite(snapshot, (state) => {
    state.comments.push({
      id: `local-${correlationId()}`,
      ...payload,
      body: String(payload.body || '').trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return state
  })
  if (!result.ok) return localResultBase(snapshot, { outcome: 'UNAVAILABLE', error: publicError(result.error), comment: null })
  const comment = result.state.comments[result.state.comments.length - 1]
  return localResultBase(snapshot, {
    outcome: 'SAVED_LOCAL_DRAFT',
    syncState: offline ? 'LOCAL_ONLY_FALLBACK' : 'LOCAL_ONLY',
    comment,
    error: error ? publicError(error) : null,
  })
}

function localPreference(payload, { offline = false, error = null } = {}) {
  const snapshot = localRead()
  const result = localWrite(snapshot, (state) => {
    const preference = {
      ...payload,
      isOptional: Boolean(payload.isOptional),
      updatedAt: new Date().toISOString(),
    }
    const existing = state.preferences.findIndex((item) => item.engagementId === payload.engagementId && item.stepKey === payload.stepKey)
    if (existing >= 0) state.preferences.splice(existing, 1, preference)
    else state.preferences.push(preference)
    return state
  })
  if (!result.ok) return localResultBase(snapshot, { outcome: 'UNAVAILABLE', error: publicError(result.error), preference: null })
  const preference = result.state.preferences.find((item) => item.engagementId === payload.engagementId && item.stepKey === payload.stepKey)
  return localResultBase(snapshot, {
    outcome: 'SAVED_LOCAL_DRAFT',
    syncState: offline ? 'LOCAL_ONLY_FALLBACK' : 'LOCAL_ONLY',
    preference,
    error: error ? publicError(error) : null,
  })
}

function localProfile(payload, { offline = false, error = null } = {}) {
  const snapshot = localRead()
  const result = localWrite(snapshot, (state) => {
    const engagementId = String(payload.engagementId || DEMO_ENGAGEMENT_ID)
    const previous = profileFor(state, engagementId)
    const profile = {
      ...payload,
      engagementId,
      updatedAt: new Date().toISOString(),
      // The first submitted timestamp is historical evidence and must not move
      // just because a later comment/preference/profile save occurred.
      submittedAt: previous?.submittedAt || payload.submittedAt || new Date().toISOString(),
    }
    state.profiles[engagementId] = profile
    return state
  })
  if (!result.ok) return localResultBase(snapshot, { outcome: 'UNAVAILABLE', error: publicError(result.error), profile: null })
  const profile = profileFor(result.state, payload.engagementId)
  return localResultBase(snapshot, {
    outcome: 'SAVED_LOCAL_DRAFT',
    syncState: offline ? 'LOCAL_ONLY_FALLBACK' : 'LOCAL_ONLY',
    profile,
    error: error ? publicError(error) : null,
  })
}

async function request(path, options = {}) {
  if (!sharedApiEnabled) {
    throw new AuditFlowApiError('Shared demo API is disabled; this walkthrough is browser-local.', {
      code: 'SHARED_API_DISABLED',
      correlationId: correlationId(),
    })
  }

  const requestId = correlationId()
  let response
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-AuditFlow-Request-Id': requestId,
        ...(options.headers || {}),
      },
    })
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError'
    throw new AuditFlowApiError(timedOut ? 'The shared demo API did not respond within 8 seconds. Keep an editable note locally if needed.' : 'The shared demo API is unavailable. Keep an editable note locally if needed.', {
      code: 'NETWORK_UNAVAILABLE',
      correlationId: requestId,
      cause,
    })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    throw apiErrorFromResponse(response, payload, requestId)
  }
  return payload
}

function isOfflineError(error) {
  return error?.code === 'NETWORK_UNAVAILABLE' || error?.name === 'TypeError'
}

export async function loadWorkflowState({ engagementId = DEMO_ENGAGEMENT_ID, pageKey } = {}) {
  if (!sharedApiEnabled) {
    const snapshot = localRead()
    return localResultBase(snapshot, {
      outcome: snapshot.error ? 'UNAVAILABLE' : 'COMMITTED',
      comments: commentsFor(snapshot.state, engagementId, pageKey),
      preferences: preferencesFor(snapshot.state, engagementId),
      error: snapshot.error ? publicError(snapshot.error) : null,
    })
  }

  try {
    const [commentPayload, preferencePayload] = await Promise.all([
      request(`/comments?engagementId=${encodeURIComponent(engagementId)}&pageKey=${encodeURIComponent(pageKey)}`),
      request(`/step-preferences?engagementId=${encodeURIComponent(engagementId)}`),
    ])
    return {
      source: 'd1',
      syncState: 'SYNCED',
      evidenceLevel,
      outcome: 'COMMITTED',
      comments: commentPayload.comments || [],
      preferences: preferencePayload.preferences || [],
      error: null,
    }
  } catch (error) {
    if (isOfflineError(error)) {
      const snapshot = localRead()
      return localResultBase(snapshot, {
        outcome: snapshot.error ? 'UNAVAILABLE' : 'SAVED_LOCAL_DRAFT',
        syncState: 'LOCAL_ONLY_FALLBACK',
        comments: commentsFor(snapshot.state, engagementId, pageKey),
        preferences: preferencesFor(snapshot.state, engagementId),
        error: publicError(error),
      })
    }
    return {
      source: 'none',
      syncState: 'DENIED',
      evidenceLevel,
      outcome: error.status === 409 ? 'CONFLICT' : 'DENIED',
      comments: [],
      preferences: [],
      error: publicError(error),
    }
  }
}

export async function addWorkflowComment(payload) {
  if (!sharedApiEnabled) return localComment(payload)
  try {
    const result = await request('/comments', { method: 'POST', body: JSON.stringify(payload) })
    return { source: 'd1', syncState: 'SYNCED', evidenceLevel, outcome: 'COMMITTED', comment: result.comment, error: null }
  } catch (error) {
    if (isOfflineError(error)) return localComment(payload, { offline: true, error })
    return { source: 'none', syncState: 'DENIED', evidenceLevel, outcome: error.status === 409 ? 'CONFLICT' : 'DENIED', comment: null, error: publicError(error) }
  }
}

export async function saveWorkflowPreference(payload) {
  if (!sharedApiEnabled) return localPreference(payload)
  try {
    const result = await request('/step-preferences', { method: 'PUT', body: JSON.stringify(payload) })
    return { source: 'd1', syncState: 'SYNCED', evidenceLevel, outcome: 'COMMITTED', preference: result.preference, error: null }
  } catch (error) {
    if (isOfflineError(error)) return localPreference(payload, { offline: true, error })
    return { source: 'none', syncState: 'DENIED', evidenceLevel, outcome: error.status === 409 ? 'CONFLICT' : 'DENIED', preference: null, error: publicError(error) }
  }
}

export async function loadClientProfile(engagementId = DEMO_ENGAGEMENT_ID) {
  if (!sharedApiEnabled) {
    const snapshot = localRead()
    return localResultBase(snapshot, {
      outcome: snapshot.error ? 'UNAVAILABLE' : 'COMMITTED',
      profile: profileFor(snapshot.state, engagementId),
      error: snapshot.error ? publicError(snapshot.error) : null,
    })
  }
  try {
    const result = await request(`/client-profile?engagementId=${encodeURIComponent(engagementId)}`)
    return { source: 'd1', syncState: 'SYNCED', evidenceLevel, outcome: 'COMMITTED', profile: result.profile, error: null }
  } catch (error) {
    if (isOfflineError(error)) {
      const snapshot = localRead()
      return localResultBase(snapshot, {
        outcome: snapshot.error ? 'UNAVAILABLE' : 'SAVED_LOCAL_DRAFT',
        syncState: 'LOCAL_ONLY_FALLBACK',
        profile: profileFor(snapshot.state, engagementId),
        error: publicError(error),
      })
    }
    return { source: 'none', syncState: 'DENIED', evidenceLevel, outcome: error.status === 409 ? 'CONFLICT' : 'DENIED', profile: null, error: publicError(error) }
  }
}

export async function saveClientProfile(payload) {
  if (!sharedApiEnabled) return localProfile(payload)
  try {
    const result = await request('/client-profile', { method: 'PUT', body: JSON.stringify(payload) })
    return { source: 'd1', syncState: 'SYNCED', evidenceLevel, outcome: 'COMMITTED', profile: result.profile, error: null }
  } catch (error) {
    if (isOfflineError(error)) return localProfile(payload, { offline: true, error })
    return { source: 'none', syncState: 'DENIED', evidenceLevel, outcome: error.status === 409 ? 'CONFLICT' : 'DENIED', profile: null, error: publicError(error) }
  }
}
