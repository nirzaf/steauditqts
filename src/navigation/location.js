// M7 NAV-03 — hash locations are a transport for selection, never authority.
// These helpers keep the existing hash router while making record/context
// identity explicit and safe to use from menu links, task links and reloads.

const ID = /^[A-Za-z0-9_-]{1,80}$/
const TAB = /^[A-Za-z0-9_-]{1,40}$/

export function decodeLocation(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  let url
  try {
    url = new URL(raw, 'https://auditflow.invalid/')
  } catch {
    url = new URL('/role-workspace', 'https://auditflow.invalid/')
  }
  const routeKey = url.pathname.replace(/^\//, '').split('/')[0] || 'role-workspace'
  const safe = (name, pattern) => {
    const value = url.searchParams.get(name)
    return value && pattern.test(value) ? value : null
  }
  return {
    routeKey,
    engagementId: safe('engagement', ID),
    recordId: safe('record', ID),
    tab: safe('tab', TAB),
  }
}

export function encodeLocation({ routeKey, engagementId, recordId, tab } = {}) {
  if (!ID.test(String(routeKey || ''))) throw new TypeError('Invalid route key.')
  const query = new URLSearchParams()
  for (const [name, value, pattern] of [
    ['engagement', engagementId, ID],
    ['record', recordId, ID],
    ['tab', tab, TAB],
  ]) {
    if (value == null || value === '') continue
    if (!pattern.test(String(value))) throw new TypeError(`Invalid ${name}.`)
    query.set(name, String(value))
  }
  return `#/${routeKey}${query.size ? `?${query.toString()}` : ''}`
}

export function resolveLocation(requested = {}, view = {}, registry = {}) {
  const contexts = Array.isArray(view.contexts) ? view.contexts : []
  const selected = contexts.find((context) => context?.engagementId === requested.engagementId)
    || contexts.find((context) => context?.engagementId === view.engagementId)
    || contexts[0]
  if (!selected) return { routeKey: 'no-access', engagementId: null, recordId: null, tab: null }

  const allowed = new Set(Array.isArray(selected.allowedRouteKeys) ? selected.allowedRouteKeys : [])
  const requestedRoute = String(requested.routeKey || 'role-workspace')
  const routeKey = registry[requestedRoute] && allowed.has(requestedRoute)
    ? requestedRoute
    : 'role-workspace'
  if (!registry[routeKey] || !allowed.has(routeKey)) {
    return { routeKey: 'no-access', engagementId: null, recordId: null, tab: null }
  }

  // A record is only retained when both the engagement and route are unchanged.
  const sameScope = requested.engagementId === selected.engagementId && routeKey === requestedRoute
  return {
    routeKey,
    engagementId: selected.engagementId,
    recordId: sameScope ? requested.recordId || null : null,
    tab: sameScope ? requested.tab || null : null,
  }
}

export function locationToHash(location = {}) {
  return encodeLocation(location)
}

