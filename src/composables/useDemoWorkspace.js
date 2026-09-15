// M7 NAV-01/02 + STATE-01 — app-scoped server view and workspace store.
// App.vue should call provideDemoWorkspace once. Components consume
// useDemoWorkspace and never create their own session cookie or poller.

import { inject, onBeforeUnmount, onMounted, provide, reactive, readonly, watch } from 'vue'
import { createRefreshController } from './refreshController.js'
import { resolveLocation } from '../navigation/location.js'
import { apiErrorFromResponse } from '../api.js'
import { createDemoView, getActiveDemoView, getDemoView, isSharedDemoEnabled, setActiveDemoView, switchDemoView } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'

const WORKSPACE = Symbol('auditflow-workspace')

async function defaultRequest(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) throw apiErrorFromResponse(response, payload)
  return payload
}

export function provideDemoWorkspace({
  request = defaultRequest,
  registry = {},
  readLocation = () => ({ routeKey: 'role-workspace' }),
  navigate = () => {},
  confirmLeave = async () => true,
  autoStart = true,
  useSharedStore = false,
} = {}) {
  // App.vue uses this branch to expose the existing application-scoped store
  // through provide/inject without creating a second poller. The standalone
  // controller below remains available for focused tests and future isolated
  // views.
  if (useSharedStore) {
    const context = useDemoContext()
    const state = reactive({
      view: getActiveDemoView(),
      switching: false,
      contextError: null,
      data: null,
      status: context.syncStatus?.value || (isSharedDemoEnabled ? 'IDLE' : 'LOCAL_ONLY'),
      lastSuccess: context.lastSync?.value || null,
      error: null,
    })
    const syncState = () => {
      const view = getActiveDemoView()
      state.view = view
      state.data = context.activeEngagementId.value === view?.engagementId ? {
        viewId: view?.viewId || null,
        contextVersion: Number(view?.contextVersion || 1),
        actorId: view?.actorId || null,
        engagementId: context.activeEngagementId.value,
        generationId: context.engagement.value?.generationId || view?.generationId || null,
        revision: Number(context.engagement.value?.revision || view?.revision || 0),
        progress: context.progress.value,
        tasks: context.tasks.value,
        approvalSummary: context.progress.value?.approvalSummary || {},
        allowedActions: context.allowedActions?.value || [],
        notifications: [],
        recentEvents: context.events.value,
        outbox: context.outbox.value,
        accounting: context.accountingStatus.value,
        accountingSteps: context.accountingSteps.value,
      } : null
      state.status = context.syncStatus?.value || state.status
      state.lastSuccess = context.lastSync?.value || state.lastSuccess
      state.error = context.syncError?.value?.message || null
    }
    watch(() => [context.activeEngagementId.value, context.engagement.value, context.progress.value, context.tasks.value, context.events.value, context.outbox.value, context.allowedActions?.value, context.syncStatus?.value, getActiveDemoView()?.viewId], syncState, { immediate: true })
    const api = {
      state: readonly(state),
      switchContext: async ({ personaId, engagementId } = {}) => {
        if (state.switching) return false
        state.switching = true
        state.contextError = null
        const active = getActiveDemoView()
        try {
          if (active?.viewId && (personaId || engagementId)) {
            const result = await switchDemoView(active.viewId, { personaId, engagementId, expectedContextVersion: active.contextVersion })
            if (!result.ok) throw new Error(result.error?.message || 'The context switch was rejected.')
            if (result.view) setActiveDemoView(result.view)
          }
          if (engagementId && engagementId !== context.activeEngagementId.value) context.switchEngagement(engagementId)
          syncState()
          return true
        } catch (error) {
          state.contextError = error?.message || 'The context switch was rejected.'
          if (active?.viewId) {
            const actual = await getDemoView(active.viewId).catch(() => null)
            if (actual?.ok && actual.view) setActiveDemoView(actual.view)
          }
          syncState()
          return false
        } finally { state.switching = false }
      },
      refresh: context.refresh,
      acceptCommittedSnapshot: () => false,
      reconnect: context.refresh,
    }
    provide(WORKSPACE, api)
    return api
  }
  const state = reactive({
    view: null,
    switching: false,
    contextError: null,
    data: null,
    status: isSharedDemoEnabled ? 'IDLE' : 'LOCAL_ONLY',
    lastSuccess: null,
    error: null,
  })
  let mounted = true

  const refresher = createRefreshController({
    loadSnapshot: (context, signal) => request(`/api/engagements/${encodeURIComponent(context.engagementId)}/workspace`, {
      signal,
      headers: {
        'X-AuditFlow-View': context.viewId,
        'X-AuditFlow-Context-Version': String(context.contextVersion),
      },
    }).then((response) => response.workspace || response),
    publish: (patch) => { if (mounted) Object.assign(state, patch) },
    isVisible: () => typeof document === 'undefined' || !document.hidden,
  })

  function installView(view) {
    if (!view?.viewId || !view.actorId || !Array.isArray(view.contexts) || !Number.isSafeInteger(Number(view.contextVersion))) throw new Error('Invalid server view descriptor.')
    state.view = view
    const current = readLocation()
    const requested = { ...current, engagementId: view.engagementId }
    if (current.engagementId !== view.engagementId) { requested.recordId = null; requested.tab = null }
    const resolved = resolveLocation(requested, view, registry)
    navigate(resolved)
    refresher.setContext(view)
  }

  async function bootstrap() {
    if (!isSharedDemoEnabled || state.view || !mounted) return false
    try {
      const response = await createDemoView({})
      if (!mounted || !response.ok) return false
      installView(response.view)
      return true
    } catch (error) {
      state.error = error?.message || 'The workspace could not be connected.'
      state.status = 'ERROR'
      return false
    }
  }

  async function switchContext({ personaId, engagementId } = {}) {
    if (state.switching || !(await confirmLeave())) return false
    state.switching = true
    state.contextError = null
    refresher.stop()
    const previous = state.view
    try {
      const response = previous
        ? await switchDemoView(previous.viewId, { personaId, engagementId, expectedContextVersion: previous.contextVersion })
        : await createDemoView({ personaId, engagementId })
      if (!mounted || !response.ok) throw new Error(response.error?.message || 'The context switch was rejected.')
      installView(response.view)
      return true
    } catch (error) {
      state.contextError = error?.message || 'The context switch was rejected.'
      state.view = null
      // A lost switch response may have committed. Reconcile the old view
      // before enabling commands; never assume the old actor is still active.
      if (previous && mounted) {
        try {
          const actual = await getDemoView(previous.viewId)
          if (actual?.ok) installView(actual.view)
        } catch { /* remain non-editable until the next explicit reconnect */ }
      }
      return false
    } finally {
      if (mounted) state.switching = false
    }
  }

  const onVisibility = () => { if (!document.hidden && state.view && !state.switching) void refresher.refresh() }
  onMounted(() => {
    if (!autoStart) return
    document?.addEventListener?.('visibilitychange', onVisibility)
    void bootstrap()
  })
  onBeforeUnmount(() => {
    mounted = false
    refresher.stop()
    document?.removeEventListener?.('visibilitychange', onVisibility)
  })

  const api = {
    state: readonly(state),
    switchContext,
    refresh: refresher.refresh,
    acceptCommittedSnapshot: refresher.acceptCommittedSnapshot,
    reconnect: bootstrap,
  }
  provide(WORKSPACE, api)
  return api
}

export function useDemoWorkspace() {
  const workspace = inject(WORKSPACE)
  if (!workspace) throw new Error('App.vue must provide the shared demo workspace.')
  return workspace
}

export { WORKSPACE }
