<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'

const props = defineProps({
  decisions: { type: Array, default: () => [] },
  progress: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  mode: { type: String, default: 'local' },
})

const emit = defineEmits(['navigate'])

const CHAIN = [
  { key: 'acceptance', label: 'Client acceptance', owner: 'Partner', gateId: 'acceptance', decisionType: 'ACCEPTANCE' },
  { key: 'fee', label: 'Fee approval', owner: 'Partner / Finance', gateId: 'fee-approval', decisionType: null },
  { key: 'el', label: 'Engagement Letter', owner: 'Client Management', gateId: 'el-decision', decisionType: 'ENGAGEMENT_LETTER' },
  { key: 'advance', label: 'Advance verification', owner: 'Finance', gateId: 'advance', decisionType: null },
  { key: 'activation', label: 'Portal activation', owner: 'Client', gateId: 'portal-activation', decisionType: null },
  { key: 'announcement', label: 'Audit announcement', owner: 'Audit Senior', gateId: 'announcement', decisionType: null },
  { key: 'pbc', label: 'PBC evidence', owner: 'Senior', gateId: 'pbc-readiness', decisionType: null },
  { key: 'accounting', label: 'Accounting package', owner: 'Accounting Reviewer', gateId: 'accounting-package', decisionType: null },
  { key: 'draft', label: 'Draft FS', owner: 'Client Management', gateId: 'draft-fs', decisionType: 'DRAFT_FS' },
  { key: 'manager', label: 'Manager completion', owner: 'Audit Manager', gateId: 'manager-completion', decisionType: 'MANAGER_COMPLETION' },
  { key: 'partner-review', label: 'Partner file review', owner: 'Partner', gateId: 'partner-review', decisionType: 'PARTNER_COMPLETION_REVIEW' },
  { key: 'eqr', label: 'EQR', owner: 'EQR', gateId: 'eqr', decisionType: 'EQR' },
  { key: 'opinion', label: 'Audit opinion', owner: 'Partner', gateId: 'opinion', decisionType: 'AUDIT_OPINION' },
  { key: 'discussion', label: 'Final client discussion', owner: 'Partner', gateId: 'final-discussion', decisionType: 'FINAL_CLIENT_DISCUSSION' },
  { key: 'release', label: 'Release', owner: 'Partner', gateId: 'release', decisionType: 'RELEASE' },
  { key: 'invoice-close', label: 'Invoice & close', owner: 'Finance', gateId: 'invoice', decisionType: null },
]

const isShared = computed(() => props.mode === 'shared')
const gatesById = computed(() => Object.fromEntries((props.progress?.gateDetails || []).map((gate) => [gate.id, gate])))
const latestByType = computed(() => {
  const map = {}
  for (const row of props.decisions || []) {
    if (row && row.decision_type && !map[row.decision_type]) map[row.decision_type] = row
  }
  return map
})
const inputGeneration = computed(() => Number(props.progress?.inputGeneration || 1))

const rows = computed(() => CHAIN.map((entry) => {
  const gate = gatesById.value[entry.gateId] || null
  const decision = entry.decisionType ? (latestByType.value[entry.decisionType] || null) : null
  const stale = Boolean(decision && Number(decision.input_generation || 1) < inputGeneration.value)
  return {
    ...entry,
    state: gate ? gate.state : 'WAITING',
    reason: gate ? gate.reason : 'Not yet derived.',
    route: gate ? gate.route : 'role-workspace',
    version: decision ? (decision.object_version || '—') : (gate?.sourceIds?.[0] || '—'),
    actor: decision ? (decision.decided_by || '—') : '—',
    at: decision ? (decision.decided_at || '') : '',
    rationale: decision ? (decision.rationale || '') : '',
    decision: decision ? decision.decision : '',
    stale,
  }
}))

function toneFor(state) {
  if (state === 'APPROVED') return 'good'
  if (state === 'READY' || state === 'OVERDUE') return 'warn'
  if (state === 'BLOCKED' || state === 'REJECTED' || state === 'ESCALATED') return 'danger'
  return 'neutral'
}
</script>

<template>
  <section class="panel approval-chain-panel" aria-labelledby="approval-chain-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">{{ isShared ? 'Shared D1 approval chain' : 'Local projection' }}</span>
        <h2 id="approval-chain-title">Approvals &amp; Decisions</h2>
      </div>
      <span v-if="loading" class="muted-label">Syncing…</span>
    </div>

    <p v-if="!isShared" class="guide-status-message">The shared approval chain needs the D1 demo session; local review state below stays browser-local.</p>
    <p v-else-if="error && !rows.length" class="guide-status-message" role="status">Approvals unavailable ({{ error.code }}).</p>

    <div v-else class="approval-table-wrap">
      <table class="approval-table">
        <thead>
          <tr><th scope="col">Stage</th><th scope="col">Decision</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Version · Actor · Time</th><th scope="col">Rationale</th><th scope="col"><span class="sr-only">Open</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <td><strong>{{ row.label }}</strong></td>
            <td>{{ row.decision || '—' }}</td>
            <td>{{ row.owner }}</td>
            <td><StatusPill :label="row.stale ? 'STALE' : row.state" :tone="row.stale ? 'warn' : toneFor(row.state)" /></td>
            <td class="approval-version"><span class="mono">{{ row.version }}</span><small>{{ row.actor }}<template v-if="row.at"> · {{ row.at }}</template></small></td>
            <td class="approval-rationale" :title="row.rationale">{{ row.rationale || row.reason }}</td>
            <td><button type="button" class="text-button" @click="emit('navigate', { routeKey: row.route, engagementId: progress?.engagementId || undefined, recordId: row.version !== '—' ? row.version : (row.sourceIds?.[0] || undefined) })">Open <Icon name="arrow-right" :size="14" /></button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="panel-footnote"><Icon name="info" :size="15" /><span>STALE means the record evaluated an older accounting input generation; re-record it against g{{ inputGeneration }}.</span></p>
  </section>
</template>

<style scoped>
.approval-table-wrap { overflow-x: auto; }
.approval-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.approval-table th, .approval-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border, #e5e7eb); vertical-align: top; }
.approval-table th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
.approval-version { display: flex; flex-direction: column; gap: 2px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.approval-table small { font-size: 11px; opacity: 0.7; }
.approval-rationale { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; opacity: 0.85; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
</style>
