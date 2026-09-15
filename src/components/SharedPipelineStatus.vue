<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import StatusPill from './StatusPill.vue';
import { pipelineStages } from '../pipelineData';
import { useDemoContext } from '../demoContext.js';
import { loadDemoSession } from '../auth.js';

const props = defineProps({
  engagementId: { type: String, required: true },
});
const emit = defineEmits(['navigate']);

const context = useDemoContext();
const engagement = computed(() => context.activeEngagementId.value === props.engagementId ? context.engagement.value : null);
const progress = computed(() => context.activeEngagementId.value === props.engagementId ? context.progress.value : null);
const loading = computed(() => context.loading.value);
const error = computed(() => context.syncError.value);
const lastSync = computed(() => context.lastSync.value);
const generationChanged = computed(() => context.syncStatus?.value === 'RESET_REQUIRED');
const refresh = () => context.refresh();

const STAGE_ORDER = ['intake', 'commercial', 'activation', 'planning', 'evidence', 'draft-response', 'review', 'release'];
const currentIndex = computed(() => {
  const match = String(progress.value?.currentStage || engagement.value?.currentStage || '').match(/STAGE-(\d{2})/);
  const n = match ? Number(match[1]) : 0;
  return Math.min(Math.max(n - 1, -1), STAGE_ORDER.length - 1);
});
const liveStages = computed(() => STAGE_ORDER.map((id, index) => {
  const meta = pipelineStages.find((stage) => stage.id === id) || { title: id, route: 'pipeline' };
  const serverStage = progress.value?.stages?.find((stage) => stage.id === `STAGE-${String(index + 1).padStart(2, '0')}`);
  const rawState = String(serverStage?.state || '').toUpperCase();
  const state = rawState === 'COMPLETE' ? 'COMPLETE'
    : ['BLOCKED', 'REJECTED', 'ESCALATED'].includes(rawState) ? 'BLOCKED'
      : ['READY', 'OVERDUE', 'WAITING_FOR_CLIENT', 'WAITING_FOR_FINANCE', 'WAITING_FOR_SENIOR', 'WAITING_FOR_MANAGER', 'WAITING_FOR_EQR', 'WAITING_FOR_PARTNER'].includes(rawState)
        ? (index === currentIndex.value ? 'IN PROGRESS' : 'NOT STARTED')
        : index < currentIndex.value ? 'COMPLETE' : index === currentIndex.value ? 'IN PROGRESS' : 'NOT STARTED';
  const gate = progress.value?.gateDetails?.find((entry) => entry.stage === serverStage?.id && entry.state !== 'APPROVED') || progress.value?.gateDetails?.find((entry) => entry.stage === serverStage?.id);
  return { ...meta, liveState: state, tone: state === 'COMPLETE' ? 'good' : state === 'BLOCKED' ? 'danger' : state === 'IN PROGRESS' ? 'warn' : 'neutral', recordId: gate?.sourceIds?.[0] || undefined };
}));
const indicators = computed(() => {
  const p = progress.value;
  if (!p) return [
    { label: 'Work progress', value: '—', detail: 'Waiting for shared snapshot', tone: 'neutral' },
    { label: 'Approval readiness', value: '—', detail: 'Waiting for shared snapshot', tone: 'neutral' },
    { label: 'Process integrity', value: '—', detail: 'Waiting for shared snapshot', tone: 'neutral' },
  ];
  const approval = p.approvalSummary || {};
  const integrity = p.valid && !p.stageDrift && !(p.contradictions || []).length;
  return [
    { label: 'Work progress', value: `${p.completionPercent || 0}%`, detail: `${p.tasks?.open || 0} open task(s) · ${p.documents?.published || 0} published output(s)`, tone: p.completionPercent >= 75 ? 'good' : 'warn' },
    { label: 'Approval readiness', value: `${approval.complete || 0}/${approval.required || 0}`, detail: `${p.gates?.ready || 0} ready · ${p.gates?.blocked || 0} blocked`, tone: (p.gates?.blocked || 0) ? 'danger' : 'good' },
    { label: 'Process integrity', value: integrity ? 'VALID' : 'ATTENTION', detail: `${(p.contradictions || []).length} contradiction(s) · ${p.stageDrift ? 'stage drift' : 'no stage drift'}`, tone: integrity ? 'good' : 'danger' },
  ];
});
const destinationPersona = computed(() => loadDemoSession()?.role || 'admin');
function openStage(stage) {
  const role = destinationPersona.value;
  const destinationKey = ['client'].includes(role) || role === 'client-management' ? 'client'
    : ['accountant', 'accounting-reviewer', 'preparer'].includes(role) ? 'accountant' : 'admin';
  const destination = stage.destinations?.[destinationKey] || stage.destinations?.admin;
  emit('navigate', { routeKey: destination?.route || stage.route || 'pipeline', engagementId: props.engagementId, recordId: stage.recordId });
}
function formatSync(value) {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-QA', { timeStyle: 'medium' }).format(date);
}
</script>

<template>
  <section class="panel shared-live-panel" aria-labelledby="shared-live-title">
    <div class="panel-heading">
      <div><span class="eyebrow">Live shared state · D1</span><h2 id="shared-live-title">Pipeline status</h2></div>
      <button type="button" class="text-button" :disabled="loading" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button>
    </div>
    <p v-if="generationChanged" class="permission-notice" role="status">The walkthrough was restarted from another browser. <button type="button" class="text-button" @click="$emit('navigate', 'readiness')">Open readiness</button> or refresh to continue.</p>
    <p v-else-if="error" class="guide-status-message" role="status">Shared state unavailable ({{ error.code }}). Showing the explanatory walkthrough below.</p>
    <div class="shared-indicators" aria-label="Shared workflow indicators">
      <div v-for="indicator in indicators" :key="indicator.label" class="shared-indicator">
        <span>{{ indicator.label }}</span><strong :class="`indicator-${indicator.tone}`">{{ indicator.value }}</strong><small>{{ indicator.detail }}</small>
      </div>
    </div>
    <ol class="shared-stage-list">
      <li v-for="stage in liveStages" :key="stage.id" class="shared-stage-row">
        <span class="shared-stage-number">{{ stage.number || '' }}</span>
        <span class="shared-stage-main"><strong>{{ stage.title }}</strong><small>Stage {{ STAGE_ORDER.indexOf(stage.id) + 1 }} of 8</small></span>
        <StatusPill :label="stage.liveState" :tone="stage.tone" />
        <button type="button" class="text-button" @click="openStage(stage)">Open <Icon name="arrow-right" :size="15" /></button>
      </li>
    </ol>
    <p class="panel-footnote"><Icon name="info" :size="16" /><span>Read from the shared engagement record{{ engagement?.revision ? ` · revision ${engagement.revision}` : '' }} · synced {{ formatSync(lastSync) }} · polls every 5s while visible.</span></p>
  </section>
</template>

<style scoped>
.shared-stage-list { list-style: none; margin: 0; padding: 0; }
.shared-stage-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border, #e5e7eb); }
.shared-stage-number { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: 8px; background: #e8eef8; color: #1e3a5f; font: 700 12px/1 ui-monospace, monospace; }
.shared-stage-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.shared-stage-main strong { color: var(--ink, #172033); }
.shared-stage-main small { color: var(--muted, #667085); font-size: 11px; }
.shared-indicators { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0 8px; }
.shared-indicator { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; background: var(--surface-muted, #f8fafc); }
.shared-indicator span, .shared-indicator small { color: var(--muted, #667085); font-size: 11px; }
.shared-indicator strong { font-size: 18px; letter-spacing: .02em; }
.indicator-good { color: #15803d; }
.indicator-warn { color: #b45309; }
.indicator-danger { color: #b91c1c; }
.indicator-neutral { color: #475569; }
.shared-stage-row:last-child { border-bottom: 0; }
@media (max-width: 720px) {
  .shared-indicators { grid-template-columns: 1fr; }
  .shared-stage-row { grid-template-columns: 28px minmax(0, 1fr) auto; }
  .shared-stage-row > .text-button { grid-column: 2 / -1; justify-self: start; }
}
</style>
