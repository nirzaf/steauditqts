<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'local' },
  currentUser: { type: Object, default: null },
  context: { type: Object, default: null },
  syncError: { type: Object, default: null },
  lastSync: { type: String, default: '' },
  buildCommit: { type: String, default: 'local' },
  canRestart: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'restart'])
const checks = computed(() => [
  { id: 'application', label: 'Application loaded', ok: true, detail: 'The workspace shell and route registry are available.' },
  { id: 'storage', label: 'Browser storage', ok: storageAvailable(), detail: storageAvailable() ? 'Local scenario and preferences can be restored.' : 'Storage is unavailable; changes will not persist in this tab.' },
  { id: 'persona', label: 'Persona selected', ok: Boolean(props.currentUser?.id), detail: props.currentUser?.roleLabel || 'Choose a role to continue.' },
  { id: 'engagement', label: 'Engagement selected', ok: Boolean(props.context?.engagementId), detail: props.context?.engagementId || 'Choose a client and period.' },
  { id: 'projection', label: 'Workflow projection', ok: Boolean(props.context), detail: props.context ? 'Tasks and next actions are ready.' : 'Waiting for the selected workspace.' },
  { id: 'reset', label: 'Scenario reset available', ok: true, detail: props.canRestart ? 'Presenter can restore the clean starting workflow.' : 'Reset controls stay hidden for this persona.' },
  { id: 'stale', label: 'Local selection is current', ok: !staleLocalState(), detail: staleLocalState() ? 'Stored context differs from the selected engagement; restore the clean demo if needed.' : 'No stale engagement selection was detected.' },
  { id: 'build', label: 'Build metadata', ok: Boolean(props.buildCommit && props.buildCommit !== 'local'), detail: props.buildCommit && props.buildCommit !== 'local' ? `Build ${props.buildCommit} is attached to this walkthrough.` : 'Local build metadata will appear after CI deployment.' },
  ...(props.mode === 'shared' ? [{ id: 'shared', label: 'Shared workspace sync', ok: !props.syncError, detail: props.syncError?.message || (props.lastSync ? `Last synced ${new Date(props.lastSync).toLocaleTimeString('en-QA')}.` : 'Waiting for the first sync.') }] : []),
])
const passed = computed(() => checks.value.filter((item) => item.ok).length)
function storageAvailable() {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try { const key = '__auditflow_preflight__'; window.localStorage.setItem(key, '1'); window.localStorage.removeItem(key); return true } catch { return false }
}
function staleLocalState() {
  if (props.mode !== 'local' || typeof window === 'undefined' || !props.context?.engagementId) return false
  try {
    const stored = window.localStorage.getItem('auditflow-demo-context-v1')
    return Boolean(stored && stored !== props.context.engagementId)
  } catch { return false }
}
</script>

<template>
  <div v-if="open" class="preflight-backdrop" role="presentation" @click.self="emit('close')">
    <section class="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title">
      <header class="preflight-header"><div><span class="eyebrow">Demo status</span><h2 id="preflight-title">Ready to walk through</h2><p>{{ passed }} of {{ checks.length }} checks passed · build {{ buildCommit }}</p></div><button type="button" class="icon-button" aria-label="Close demo status" @click="emit('close')"><Icon name="x" :size="17" /></button></header>
      <ul class="preflight-list"><li v-for="check in checks" :key="check.id"><span class="preflight-icon" :class="check.ok ? 'good' : 'warn'"><Icon :name="check.ok ? 'check' : 'warning'" :size="15" /></span><span><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></span><span class="preflight-state">{{ check.ok ? 'Ready' : 'Review' }}</span></li></ul>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>These checks are informational. You can keep exploring while a shared connection retries.</span></p>
      <div class="preflight-actions"><button v-if="canRestart" type="button" class="button secondary" @click="emit('restart')">Restore clean demo <Icon name="refresh" :size="15" /></button><button type="button" class="button primary" @click="emit('close')">Continue walkthrough <Icon name="arrow-right" :size="15" /></button></div>
    </section>
  </div>
</template>

<style scoped>
.preflight-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: start center; padding: 10vh 16px 24px; background: rgba(15, 23, 42, .38); }
.preflight { width: min(560px, 100%); max-height: 80vh; overflow: auto; padding: 18px; border: 1px solid var(--border, #e5e7eb); border-radius: 16px; background: var(--surface, #fff); box-shadow: 0 24px 70px rgba(15, 23, 42, .22); }
.preflight-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.preflight-header h2 { margin: 4px 0; font-size: 22px; }
.preflight-header p { margin: 0; color: var(--muted, #667085); font-size: 13px; }
.preflight-list { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
.preflight-list li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border, #e5e7eb); border-radius: 11px; }
.preflight-icon { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: 50%; }
.preflight-icon.good { color: #166534; background: #dcfce7; } .preflight-icon.warn { color: #92400e; background: #fef3c7; }
.preflight-list li > span:nth-child(2) { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.preflight-list strong { color: var(--ink, #172033); font-size: 13px; } .preflight-list small { color: var(--muted, #667085); font-size: 11px; }
.preflight-state { color: var(--muted, #667085); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.preflight-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 16px; }
@media (max-width: 560px) { .preflight-actions { flex-direction: column-reverse; } .preflight-actions .button { width: 100%; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .preflight, .preflight-backdrop { transition: none; } }
</style>
