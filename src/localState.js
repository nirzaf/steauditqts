/**
 * Browser-local synthetic state for the prototype.
 *
 * This module intentionally has no network behaviour. It keeps the small
 * editable pieces of the walkthrough (comments, presentation preferences and
 * client submissions) scoped by engagement so a demo persona cannot
 * accidentally inherit another engagement's draft.
 */

export const LOCAL_STATE_VERSION = 2
export const LOCAL_STATE_KEY = 'auditflow-demo-state-v2'
export const LEGACY_LOCAL_STATE_KEY = 'auditflow-demo-state-v1'
// Keep the browser-local profile on the same scoped identity as the shared
// synthetic scenario. The older v1 key is still read additively during
// migration, so existing drafts are not silently discarded.
export const DEFAULT_ENGAGEMENT_ID = 'ENG-0018-AUD-2026'

export class LocalStateError extends Error {
  constructor(message, code = 'LOCAL_STATE_UNAVAILABLE', cause) {
    super(message)
    this.name = 'LocalStateError'
    this.code = code
    this.cause = cause
  }
}

export function emptyLocalState() {
  return {
    version: LOCAL_STATE_VERSION,
    profiles: {},
    comments: [],
    preferences: [],
    drafts: [],
  }
}

function storageFor(storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProfiles(value) {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, profile]) => Boolean(key) && isObject(profile)))
}

function normalizeState(parsed) {
  const state = { ...emptyLocalState(), ...parsed, version: LOCAL_STATE_VERSION }
  state.profiles = normalizeProfiles(parsed.profiles)
  state.comments = Array.isArray(parsed.comments) ? parsed.comments : []
  state.preferences = Array.isArray(parsed.preferences) ? parsed.preferences : []
  state.drafts = Array.isArray(parsed.drafts) ? parsed.drafts : []

  // v1 stored one unscoped profile. Keep it under its explicit engagement (or
  // the original demo engagement) rather than dropping it during migration.
  if (isObject(parsed.profile)) {
    const engagementId = String(parsed.profile.engagementId || DEFAULT_ENGAGEMENT_ID)
    if (!state.profiles[engagementId]) state.profiles[engagementId] = { ...parsed.profile, engagementId }
  }
  return state
}

function parseStored(raw, key) {
  try {
    const parsed = JSON.parse(raw)
    if (!isObject(parsed)) throw new LocalStateError(`${key} must contain a JSON object.`, 'LOCAL_STATE_MALFORMED')
    return { state: normalizeState(parsed), migrated: key === LEGACY_LOCAL_STATE_KEY }
  } catch (error) {
    if (error instanceof LocalStateError) throw error
    throw new LocalStateError(`Could not read ${key}; the saved demo state is malformed.`, 'LOCAL_STATE_MALFORMED', error)
  }
}

/**
 * Read and migrate state without deleting the original legacy value. The
 * returned diagnostic is intentionally visible to callers so a malformed or
 * unavailable store cannot look like a successful empty state.
 */
export function readLocalState(storage) {
  const target = storageFor(storage)
  if (!target) return { state: emptyLocalState(), error: new LocalStateError('Browser storage is unavailable.', 'LOCAL_STORAGE_UNAVAILABLE'), migrated: false }

  let raw
  let key = LOCAL_STATE_KEY
  try {
    raw = target.getItem(LOCAL_STATE_KEY)
    if (raw == null) {
      key = LEGACY_LOCAL_STATE_KEY
      raw = target.getItem(LEGACY_LOCAL_STATE_KEY)
    }
  } catch (error) {
    return { state: emptyLocalState(), error: new LocalStateError('Browser storage could not be read.', 'LOCAL_STORAGE_READ_FAILED', error), migrated: false }
  }

  if (raw == null) return { state: emptyLocalState(), error: null, migrated: false }
  try {
    const result = parseStored(raw, key)
    if (result.migrated) {
      try { target.setItem(LOCAL_STATE_KEY, JSON.stringify(result.state)) } catch (error) {
        return { ...result, error: new LocalStateError('The older demo state was read but could not be migrated.', 'LOCAL_STATE_MIGRATION_FAILED', error) }
      }
    }
    return { ...result, error: null }
  } catch (error) {
    return { state: emptyLocalState(), error, migrated: false }
  }
}

export function writeLocalState(state, storage) {
  const target = storageFor(storage)
  if (!target) throw new LocalStateError('Browser storage is unavailable; nothing was saved.', 'LOCAL_STORAGE_UNAVAILABLE')
  const next = normalizeState(isObject(state) ? state : {})
  try {
    target.setItem(LOCAL_STATE_KEY, JSON.stringify(next))
  } catch (error) {
    throw new LocalStateError('Browser storage rejected the synthetic save (it may be full or blocked).', 'LOCAL_STORAGE_WRITE_FAILED', error)
  }
  return next
}

export function profileFor(state, engagementId) {
  const key = String(engagementId || DEFAULT_ENGAGEMENT_ID)
  return state?.profiles?.[key] || null
}

export function commentsFor(state, engagementId, pageKey) {
  return (state?.comments || [])
    .filter((comment) => comment.engagementId === engagementId && comment.pageKey === pageKey)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function preferencesFor(state, engagementId) {
  return (state?.preferences || []).filter((preference) => preference.engagementId === engagementId)
}
