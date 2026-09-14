export const DEMO_ENGAGEMENT_ID = 'ENG-2026-0018'

const apiBase = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const localStorageKey = 'auditflow-demo-state-v1'

function readLocalState() {
  if (typeof window === 'undefined') return { comments: [], preferences: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localStorageKey) || '{}')
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    }
  } catch {
    return { comments: [], preferences: [] }
  }
}

function writeLocalState(state) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(localStorageKey, JSON.stringify(state)) } catch { /* storage is optional */ }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    throw new Error(payload?.error?.message || `AuditFlow API returned ${response.status}.`)
  }
  return payload
}

function localCommentsFor(engagementId, pageKey) {
  return readLocalState().comments
    .filter((comment) => comment.engagementId === engagementId && comment.pageKey === pageKey)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function loadWorkflowState({ engagementId = DEMO_ENGAGEMENT_ID, pageKey }) {
  try {
    const [commentPayload, preferencePayload] = await Promise.all([
      request(`/comments?engagementId=${encodeURIComponent(engagementId)}&pageKey=${encodeURIComponent(pageKey)}`),
      request(`/step-preferences?engagementId=${encodeURIComponent(engagementId)}`),
    ])
    return { source: 'd1', comments: commentPayload.comments || [], preferences: preferencePayload.preferences || [] }
  } catch {
    const local = readLocalState()
    return {
      source: 'local',
      comments: localCommentsFor(engagementId, pageKey),
      preferences: local.preferences.filter((preference) => preference.engagementId === engagementId),
    }
  }
}

export async function addWorkflowComment(payload) {
  try {
    const result = await request('/comments', { method: 'POST', body: JSON.stringify(payload) })
    return { source: 'd1', comment: result.comment }
  } catch (error) {
    const state = readLocalState()
    const comment = {
      id: `local-${Date.now()}`,
      ...payload,
      body: String(payload.body || '').trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    state.comments.push(comment)
    writeLocalState(state)
    return { source: 'local', comment, error }
  }
}

export async function saveWorkflowPreference(payload) {
  try {
    const result = await request('/step-preferences', { method: 'PUT', body: JSON.stringify(payload) })
    return { source: 'd1', preference: result.preference }
  } catch (error) {
    const state = readLocalState()
    const preference = {
      ...payload,
      isOptional: Boolean(payload.isOptional),
      updatedAt: new Date().toISOString(),
    }
    const existing = state.preferences.findIndex((item) => item.engagementId === payload.engagementId && item.stepKey === payload.stepKey)
    if (existing >= 0) state.preferences.splice(existing, 1, preference)
    else state.preferences.push(preference)
    writeLocalState(state)
    return { source: 'local', preference, error }
  }
}

export async function loadClientProfile(engagementId = DEMO_ENGAGEMENT_ID) {
  try {
    const result = await request(`/client-profile?engagementId=${encodeURIComponent(engagementId)}`)
    return { source: 'd1', profile: result.profile }
  } catch {
    const state = readLocalState()
    return { source: 'local', profile: state.profile?.engagementId === engagementId ? state.profile : null }
  }
}

export async function saveClientProfile(payload) {
  try {
    const result = await request('/client-profile', { method: 'PUT', body: JSON.stringify(payload) })
    return { source: 'd1', profile: result.profile }
  } catch (error) {
    const state = readLocalState()
    const profile = { ...payload, updatedAt: new Date().toISOString(), submittedAt: state.profile?.submittedAt || new Date().toISOString() }
    state.profile = profile
    writeLocalState(state)
    return { source: 'local', profile, error }
  }
}
