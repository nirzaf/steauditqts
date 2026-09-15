// M7 STATE-01/02 compatibility wrapper.
// Historical widgets still call useSharedEngagement, but they now consume the
// one app-scoped projection owned by demoContext instead of starting a poller
// of their own. This keeps the existing component API while coalescing reads.

import { computed } from 'vue'
import { isSharedDemoEnabled, runSharedAction } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'

export const sharedDemoEnabled = isSharedDemoEnabled

export function useSharedEngagement(getEngagementId, options = {}) {
  const context = useDemoContext()
  const assignee = options.assignee
  const requestedId = computed(() => typeof getEngagementId === 'function' ? getEngagementId() : getEngagementId)
  const engagement = computed(() => context.activeEngagementId.value === requestedId.value ? context.engagement.value : null)
  const tasks = computed(() => {
    const list = context.activeEngagementId.value === requestedId.value ? context.tasks.value : []
    const wanted = typeof assignee === 'function' ? assignee() : assignee
    if (!wanted) return list
    return list.filter((task) => task.assigneePersona === wanted || task.assigneeRole === wanted)
  })
  const events = computed(() => context.activeEngagementId.value === requestedId.value ? context.events.value : [])
  const generationId = computed(() => engagement.value?.generationId || '')
  const generationChanged = computed(() => Boolean(
    context.syncStatus?.value === 'RESET_REQUIRED'
      || context.progress.value?.generationChanged
      || context.progress.value?.resetRequired,
  ))
  const loading = computed(() => context.loading.value)
  const error = computed(() => context.syncError.value)
  const lastSync = computed(() => context.lastSync.value)

  async function refresh() {
    await context.refresh()
  }

  async function runAction(action, payload = {}) {
    const result = await runSharedAction(requestedId.value, action, payload)
    if (result.ok) await context.refresh()
    return result
  }

  return { enabled: isSharedDemoEnabled, engagement, tasks, events, generationId, generationChanged, loading, error, lastSync, refresh, runAction, start: refresh, stop: () => {} }
}
