// M7 STATE-02 — single-flight, epoch-aware workspace refresh.
// This module is framework-independent so races can be tested without a
// mounted Vue tree. One controller belongs to the application shell, not to
// each dashboard widget.

export function createRefreshController({
  loadSnapshot,
  publish,
  intervalMs = 5000,
  isVisible = () => true,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof loadSnapshot !== 'function') throw new TypeError('loadSnapshot is required.')
  if (typeof publish !== 'function') throw new TypeError('publish is required.')

  let context = null
  let contextKey = ''
  let epoch = 0
  let stopped = true
  let pending = null
  let timer = null
  let state = { data: null, status: 'IDLE', lastSuccess: null, error: null }

  const emit = (patch) => {
    state = { ...state, ...patch }
    publish({ ...state })
  }
  const keyOf = (value) => JSON.stringify([
    value?.viewId,
    value?.contextVersion,
    value?.engagementId,
    value?.generationId,
  ])
  const identityMatches = (data, value) => Boolean(data)
    && data.viewId === value.viewId
    && data.contextVersion === value.contextVersion
    && data.engagementId === value.engagementId
    && data.actorId === value.actorId

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending?.controller) pending.controller.abort()
    pending = null
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!stopped && intervalMs > 0) {
      timer = setTimeout(() => {
        if (isVisible()) void refresh()
        else schedule()
      }, intervalMs)
    }
  }

  async function refresh() {
    if (stopped || !context) return undefined
    if (pending) return pending.promise
    if (timer) clearTimeout(timer)
    timer = null

    const token = epoch
    const captured = { ...context }
    const controller = new AbortController()
    emit({ status: state.data ? 'REFRESHING' : 'LOADING', error: null })
    const flight = { controller, promise: null }
    pending = flight

    const promise = (async () => {
      try {
        const data = await loadSnapshot(captured, controller.signal)
        if (token !== epoch) return
        if (!identityMatches(data, captured)) throw new Error('Workspace identity changed; reload context.')
        if (data.generationId !== captured.generationId) {
          stopped = true
          emit({ data: null, status: 'RESET_REQUIRED', lastSuccess: null, error: 'The demo generation changed. Reopen the workspace before acting.' })
          return
        }
        // A command response is authoritative for the active context. A
        // delayed poll from the previous revision may never roll it back.
        if (state.data && Number(data.revision) < Number(state.data.revision)) return
        emit({ data, status: 'READY', error: null, lastSuccess: now() })
      } catch (error) {
        if (token !== epoch || error?.name === 'AbortError') return
        emit({ status: state.data ? 'STALE' : 'ERROR', error: error?.message || 'Workspace refresh failed.' })
      } finally {
        if (token === epoch) {
          pending = null
          schedule()
        }
      }
    })()
    flight.promise = promise
    return promise
  }

  function setContext(next) {
    const nextKey = next ? keyOf(next) : ''
    if (nextKey === contextKey && !stopped) return
    epoch += 1
    cancel()
    context = next ? { ...next } : null
    contextKey = nextKey
    stopped = !next
    emit({ data: null, status: next ? 'LOADING' : 'IDLE', lastSuccess: null, error: null })
    if (next) void refresh()
  }

  function acceptCommittedSnapshot(data) {
    if (!context || !identityMatches(data, context) || data.generationId !== context.generationId) return false
    if (state.data && Number(data.revision) < Number(state.data.revision)) return false
    emit({ data, status: 'READY', lastSuccess: now(), error: null })
    return true
  }

  function stop() {
    stopped = true
    epoch += 1
    cancel()
    context = null
    contextKey = ''
    emit({ data: null, status: 'IDLE', lastSuccess: null, error: null })
  }

  return { refresh, setContext, acceptCommittedSnapshot, stop }
}

