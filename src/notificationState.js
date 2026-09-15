export const NOTIFICATION_STATE_KEY = 'auditflow-notification-state-v1'

function storageFor(storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

function scopeKey({ personaId = '', engagementId = '' } = {}) {
  return `${String(personaId || 'anonymous')}::${String(engagementId || 'all')}`
}

export function readNotificationState(scope, storage) {
  const target = storageFor(storage)
  if (!target) return new Set()
  try {
    const parsed = JSON.parse(target.getItem(NOTIFICATION_STATE_KEY) || '{}')
    return new Set(Array.isArray(parsed?.[scopeKey(scope)]) ? parsed[scopeKey(scope)] : [])
  } catch { return new Set() }
}

export function writeNotificationState(scope, ids, storage) {
  const target = storageFor(storage)
  if (!target) return false
  try {
    const parsed = JSON.parse(target.getItem(NOTIFICATION_STATE_KEY) || '{}')
    parsed[scopeKey(scope)] = [...new Set(ids)].slice(-200)
    target.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(parsed))
    return true
  } catch { return false }
}

export function markNotificationRead(scope, id, storage) {
  if (!id) return readNotificationState(scope, storage)
  const next = readNotificationState(scope, storage)
  next.add(String(id))
  writeNotificationState(scope, next, storage)
  return next
}

export function clearNotificationState(scope, storage) {
  const target = storageFor(storage)
  if (!target) return false
  try {
    const parsed = JSON.parse(target.getItem(NOTIFICATION_STATE_KEY) || '{}')
    delete parsed[scopeKey(scope)]
    target.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(parsed))
    return true
  } catch { return false }
}

export function notificationScopeKey(scope) { return scopeKey(scope) }
