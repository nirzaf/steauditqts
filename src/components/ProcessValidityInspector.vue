<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'

const props = defineProps({
  progress: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  mode: { type: String, default: 'local' },
  lastSync: { type: String, default: '' },
})

const emit = defineEmits(['navigate'])

const isShared = computed(() => props.mode === 'shared')
const statusLabel = computed(() => {
  if (!isShared.value) return 'LOCAL PROJECTION'
  if (!props.progress) return 'UNAVAILABLE'
  return props.progress.valid ? 'VALID' : 'INVALID'
})
const statusTone = computed(() => {
  if (!isShared.value || !props.progress) return 'neutral'
  return props.progress.valid ? 'good' : 'danger'
})
const authoritativeGates = computed(() => (props.progress?.gateDetails || []).filter((gate) => !gate.advisory))
const advisoryGates = computed(() => (props.progress?.gateDetails || []).filter((gate) => gate.advisory))
const completedGates = computed(() => authoritativeGates.value.filter((gate) => gate.state === 'APPROVED'))
const pendingGates = computed(() => authoritativeGates.value.filter((gate) => gate.state === 'READY' || gate.state === 'WAITING' || gate.state === 'OVERDUE'))
const blockedGates = computed(() => authoritativeGates.value.filter((gate) => gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED'))
const nextValidActions = computed(() => authoritativeGates.value.filter((gate) => gate.state === 'READY' || gate.state === 'OVERDUE' || gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED').slice(0, 3))

function markerFor(state) {
  if (state === 'APPROVED') return { symbol: '✓', tone: 'good', word: 'Done' }
  if (state === 'READY' || state === 'OVERDUE') return { symbol: '!', tone: 'warn', word: state === 'OVERDUE' ? 'Overdue' : 'Ready' }
  if (state === 'BLOCKED' || state === 'REJECTED' || state === 'ESCALATED') return { symbol: '✕', tone: 'danger', word: state === 'REJECTED' ? 'Rejected' : state === 'ESCALATED' ? 'Escalated' : 'Blocked' }
  return { symbol: '·', tone: 'neutral', word: 'Pending' }
}

function syncedLabel() {
  if (!props.lastSync) return ''
  try {
    return new Date(props.lastSync).toLocaleTimeString('en-QA')
  } catch {
    return props.lastSync
  }
}
</script>

<template>
  <section class="panel validity-panel" aria-labelledby="validity-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">{{ isShared ? 'Derived from D1 records · polls every 5s' : 'Local projection · not D1 authority' }}</span>
        <h2 id="validity-title">Process Validity</h2>
      </div>
      <StatusPill :label="statusLabel" :tone="statusTone" />
    </div>

    <div v-if="!isShared" class="validity-local-note">
      <Icon name="info" :size="16" />
      <span>Validity is derived from shared D1 records. This browser-local walkthrough cannot validate the shared pipeline; sign in with the shared demo enabled to see the derived projection.</span>
    </div>

    <template v-else>
      <p v-if="loading && !progress" class="guide-status-message" role="status">Deriving pipeline validity from D1…</p>
      <p v-else-if="error && !progress" class="guide-status-message" role="status">Validity unavailable ({{ error.code }}). No derived snapshot has synced yet.</p>

      <template v-if="progress">
        <p v-if="error" class="guide-status-message" role="status">Showing the last synced derivation ({{ error.code }}). Live values will resume automatically.</p>

        <p class="validity-summary" role="status">
          <strong>{{ progress.stage?.id }} · {{ progress.stage?.title }}</strong>
          <span>{{ progress.completionPercent }}% of {{ progress.gates?.total }} gates · {{ progress.gates?.approved }} approved · {{ progress.gates?.blocked }} blocked · {{ progress.gates?.waiting }} waiting</span>
          <span v-if="progress.stageDrift" class="validity-drift">Cached {{ progress.cachedStage }} is a projection; derived {{ progress.currentStage }} is authoritative.</span>
        </p>

        <div v-if="!progress.valid" class="validity-blocked" role="alert">
          <strong>BLOCKED — the recorded sequence is not internally consistent:</strong>
          <ul>
            <li v-for="blocker in progress.blockers" :key="blocker.code">{{ blocker.message }}</li>
          </ul>
        </div>

        <div v-if="nextValidActions.length" class="validity-next">
          <span class="eyebrow">Next valid actions</span>
          <ul>
            <li v-for="gate in nextValidActions" :key="gate.id">
              <span><strong>{{ gate.ownerLabel }}</strong> — {{ gate.action }}</span>
              <button type="button" class="text-button" @click="emit('navigate', gate.route || 'role-workspace')">Open <Icon name="arrow-right" :size="14" /></button>
            </li>
          </ul>
        </div>

        <ul class="validity-checks">
          <li v-for="gate in completedGates" :key="gate.id" class="validity-row tone-good">
            <span class="validity-marker" aria-hidden="true">✓</span>
            <span class="validity-main"><strong>{{ gate.label }}</strong><small>{{ gate.reason }}</small></span>
            <StatusPill label="Done" tone="good" />
          </li>
          <li v-for="gate in pendingGates" :key="gate.id" class="validity-row tone-warn">
            <span class="validity-marker" aria-hidden="true">{{ gate.state === 'OVERDUE' ? '!' : '·' }}</span>
            <span class="validity-main"><strong>{{ gate.label }}</strong><small>{{ gate.reason }}</small></span>
            <StatusPill :label="markerFor(gate.state).word" tone="warn" />
          </li>
          <li v-for="gate in blockedGates" :key="gate.id" class="validity-row tone-danger">
            <span class="validity-marker" aria-hidden="true">✕</span>
            <span class="validity-main"><strong>{{ gate.label }}</strong><small>{{ gate.reason }}</small></span>
            <StatusPill :label="markerFor(gate.state).word" tone="danger" />
          </li>
        </ul>

        <div v-if="progress.contradictions?.length" class="validity-section">
          <span class="eyebrow">Contradictions ({{ progress.contradictions.length }})</span>
          <ul>
            <li v-for="entry in progress.contradictions" :key="entry.code">
              <strong>{{ entry.code }}</strong><span>{{ entry.message }}</span>
              <small v-if="entry.sourceIds?.length" class="mono">{{ entry.sourceIds.join(', ') }}</small>
            </li>
          </ul>
        </div>

        <div v-if="progress.skippedStages?.length" class="validity-section">
          <span class="eyebrow">Skipped stages</span>
          <ul>
            <li v-for="entry in progress.skippedStages" :key="entry.stage">
              <strong>{{ entry.stage }} · {{ entry.title }}</strong><span>Later evidence exists while {{ entry.missingGateIds.join(', ') }} remain incomplete.</span>
            </li>
          </ul>
        </div>

        <div v-if="progress.warnings?.length" class="validity-section">
          <span class="eyebrow">Warnings ({{ progress.warnings.length }})</span>
          <ul>
            <li v-for="entry in progress.warnings" :key="entry.code">
              <strong>{{ entry.code }}</strong><span>{{ entry.message }}</span>
            </li>
          </ul>
        </div>

        <details v-if="advisoryGates.length" class="validity-advisory">
          <summary>Later-phase records ({{ advisoryGates.length }}) — visible, not D1 authority yet</summary>
          <ul>
            <li v-for="gate in advisoryGates" :key="gate.id"><strong>{{ gate.label }}</strong><span>{{ gate.reason }}</span></li>
          </ul>
        </details>

        <p class="panel-footnote"><Icon name="info" :size="15" /><span>Derived from D1, not from cached current_stage{{ progress.revision ? ' · revision ' + progress.revision : '' }}{{ lastSync ? ' · synced ' + syncedLabel() : '' }}.</span></p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.validity-panel { margin-bottom: 16px; }
.validity-local-note { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; opacity: 0.85; }
.validity-summary { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.validity-summary span { opacity: 0.8; }
.validity-drift { font-weight: 700; }
.validity-blocked { border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 10px 12px; margin: 10px 0; font-size: 13px; }
.validity-blocked ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.validity-next ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.validity-next li { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
.validity-checks { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.validity-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; }
.validity-marker { width: 20px; text-align: center; font-weight: 800; }
.tone-good .validity-marker { color: var(--success, #15803d); }
.tone-warn .validity-marker { color: var(--warning, #b45309); }
.tone-danger .validity-marker { color: var(--danger, #b91c1c); }
.validity-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.validity-main strong { font-size: 13px; }
.validity-main small { font-size: 11px; opacity: 0.75; }
.validity-section { margin-top: 12px; font-size: 13px; }
.validity-section ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.validity-section li { display: flex; flex-direction: column; gap: 2px; border-left: 3px solid var(--border, #e5e7eb); padding-left: 8px; }
.validity-section .mono { font-family: ui-monospace, monospace; font-size: 11px; opacity: 0.7; }
.validity-advisory { margin-top: 12px; font-size: 13px; }
.validity-advisory ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
</style>
