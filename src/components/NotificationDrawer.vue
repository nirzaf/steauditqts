<script setup>
import { nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import { isEscapeEvent } from '../demoContext.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  notifications: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  mode: { type: String, default: 'local' },
  lastSync: { type: String, default: '' },
})

const emit = defineEmits(['close', 'navigate'])
const closeButtonRef = ref(null)
let restoreFocusTo = null

// Opening moves focus into the dialog; closing (including via Escape)
// returns focus to the control that opened it.
watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    restoreFocusTo = typeof document !== 'undefined' ? document.activeElement : null
    await nextTick()
    closeButtonRef.value?.focus()
  } else if (restoreFocusTo && typeof document !== 'undefined') {
    const target = restoreFocusTo
    restoreFocusTo = null
    target.focus?.()
  }
})

function onKeydown(event) {
  if (isEscapeEvent(event)) {
    event.stopPropagation()
    emit('close')
  }
}

function toneFor(item) {
  if (item.kind === 'task') return 'warn'
  if (item.kind === 'message') return 'good'
  return 'neutral'
}
</script>

<template>
  <div v-if="open" class="drawer-backdrop" role="presentation" @click.self="emit('close')" @keydown="onKeydown">
    <section class="drawer" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
      <div class="drawer-header">
        <div>
          <span class="eyebrow">{{ mode === 'shared' ? 'Live from D1 · polls every 5s' : 'Local simulation' }}</span>
          <h2 id="notifications-title">Notifications</h2>
        </div>
        <button ref="closeButtonRef" type="button" class="icon-button" aria-label="Close notifications" title="Close notifications" @click="emit('close')">
          <Icon name="x" :size="17" />
        </button>
      </div>
      <p v-if="loading" class="guide-status-message" role="status">Syncing shared queue…</p>
      <p v-else-if="error" class="guide-status-message" role="status">Notifications unavailable ({{ error.code }}). Showing the last synced queue.</p>
      <p v-else-if="!notifications.length" class="guide-empty-state">Nothing assigned to this persona right now. Actions from other browsers appear here within seconds.</p>
      <ul v-else class="drawer-list">
        <li v-for="item in notifications" :key="item.id" class="drawer-row">
          <span class="drawer-main">
            <strong>{{ item.title }}</strong>
            <small>{{ item.detail }}</small>
          </span>
          <StatusPill :label="item.kind" :tone="toneFor(item)" />
          <button type="button" class="text-button" @click="emit('navigate', { routeKey: item.route || 'role-workspace', engagementId: item.engagementId || undefined, recordId: item.recordId || undefined })">Open <Icon name="arrow-right" :size="14" /></button>
        </li>
      </ul>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>{{ mode === 'shared' ? `Derived from D1 tasks, timeline and outbox${lastSync ? ` · synced ${new Date(lastSync).toLocaleTimeString('en-QA')}` : ''}.` : 'Shared notifications need the D1 demo session; this is the browser-local queue.' }}</span></p>
    </section>
  </div>
</template>

<style scoped>
.drawer-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.38); z-index: 60; display: flex; justify-content: flex-end; }
.drawer { width: min(430px, 94vw); height: 100%; overflow: auto; background: var(--surface, #fff); border-left: 1px solid var(--border, #e5e7eb); padding: 16px; }
.drawer-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.drawer-header h2 { margin: 2px 0 0; font-size: 20px; }
.drawer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.drawer-row { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; }
.drawer-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.drawer-main strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer-main small { font-size: 11px; opacity: 0.72; }
</style>
