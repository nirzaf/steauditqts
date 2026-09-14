// Shared-engagement polling (story section 19): refresh after every action,
// poll about every 5s, pause while the tab is hidden, refresh on visible.
// Detects a new demo generation (shared reset from another browser) and
// exposes it instead of silently showing stale state.
import { onMounted, onUnmounted, ref, watch } from 'vue';
import {
  SHARED_POLL_MS,
  getSharedEngagement,
  getSharedTasks,
  getSharedTimeline,
  isSharedDemoEnabled,
  runSharedAction,
} from '../sharedDemo.js';

export const sharedDemoEnabled = isSharedDemoEnabled;

export function useSharedEngagement(getEngagementId, options = {}) {
  const { pollMs = SHARED_POLL_MS, assignee = '', autoStart = true } = options;
  const enabled = isSharedDemoEnabled;
  const engagement = ref(null);
  const tasks = ref([]);
  const events = ref([]);
  const generationId = ref('');
  const generationChanged = ref(false);
  const loading = ref(false);
  const error = ref(null);
  const lastSync = ref('');
  let timer = null;

  async function refresh() {
    if (!enabled) return;
    const id = typeof getEngagementId === 'function' ? getEngagementId() : getEngagementId;
    if (!id) return;
    loading.value = true;
    error.value = null;
    try {
      const [engRes, taskRes, timeRes] = await Promise.all([
        getSharedEngagement(id),
        getSharedTasks(id, typeof assignee === 'function' ? assignee() : assignee),
        getSharedTimeline(id),
      ]);
      if (engRes.ok) {
        if (generationId.value && engRes.engagement?.generationId && engRes.engagement.generationId !== generationId.value) {
          generationChanged.value = true;
        }
        engagement.value = engRes.engagement || null;
        generationId.value = engRes.engagement?.generationId || generationId.value;
      } else if (!engagement.value) {
        error.value = engRes.error;
      }
      if (taskRes.ok) tasks.value = taskRes.tasks || [];
      if (timeRes.ok) events.value = timeRes.events || [];
      lastSync.value = new Date().toISOString();
    } finally {
      loading.value = false;
    }
  }

  async function runAction(action, payload = {}) {
    const id = typeof getEngagementId === 'function' ? getEngagementId() : getEngagementId;
    const result = await runSharedAction(id, action, payload);
    await refresh();
    return result;
  }

  function onVisibility() {
    if (typeof document !== 'undefined' && !document.hidden) refresh();
  }

  function start() {
    refresh();
    if (pollMs > 0 && typeof window !== 'undefined') {
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refresh();
      }, pollMs);
      document?.addEventListener?.('visibilitychange', onVisibility);
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (typeof document !== 'undefined') document?.removeEventListener?.('visibilitychange', onVisibility);
  }

  if (autoStart) {
    onMounted(start);
    onUnmounted(stop);
    if (typeof getEngagementId === 'function') watch(getEngagementId, () => refresh());
    else if (typeof getEngagementId === 'object') watch(getEngagementId, () => refresh());
  }

  return { enabled, engagement, tasks, events, generationId, generationChanged, loading, error, lastSync, refresh, runAction, start, stop };
}
