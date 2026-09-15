<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import { getProcessHealth, isSharedDemoEnabled } from '../sharedDemo.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ engagementId: { type: String, required: true } })
const health = ref(null)
const loading = ref(false)
const error = ref(null)
const lastChecked = ref('')

const tone = computed(() => ({ ON_TRACK: 'good', AT_RISK: 'warn', ATTENTION: 'warn', BLOCKED: 'danger' })[health.value?.status] || 'neutral')
const nextAction = computed(() => health.value?.nextBestAction || null)

async function refresh() {
  if (!props.engagementId || !isSharedDemoEnabled) return
  loading.value = true
  const result = await getProcessHealth(props.engagementId)
  loading.value = false
  if (result.ok) {
    health.value = result.health || null
    error.value = null
    lastChecked.value = new Date().toISOString()
  } else error.value = result.error || { message: 'Process health could not be loaded.' }
}

watch(() => props.engagementId, () => { void refresh() }, { immediate: true })
function openNextAction() {
  if (nextAction.value?.route) emit('navigate', {
    routeKey: nextAction.value.route,
    engagementId: props.engagementId || undefined,
    recordId: nextAction.value.targetId || nextAction.value.recordId || nextAction.value.sourceIds?.[0] || undefined,
  })
}
</script>

<template>
  <section class="panel process-health" aria-labelledby="process-health-title">
    <div class="panel-heading">
      <div><span class="eyebrow">Operational control · server-derived</span><h2 id="process-health-title">Process health</h2></div>
      <div class="process-health-actions"><StatusPill :label="health?.status || (isSharedDemoEnabled ? 'Refreshing' : 'Shared mode required')" :tone="tone" /><button type="button" class="text-button" :disabled="loading || !isSharedDemoEnabled" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button></div>
    </div>
    <p v-if="!isSharedDemoEnabled" class="process-health-note"><Icon name="info" :size="16" />Connect the shared D1 demo to inspect server-derived health.</p>
    <p v-else-if="error" class="process-health-error" role="status"><Icon name="warning" :size="16" />{{ error.message }} The last confirmed health snapshot is retained where available.</p>
    <template v-else-if="health">
      <div class="process-health-grid">
        <div><span>Validity</span><strong>{{ health.validity?.valid ? 'Valid' : 'Needs attention' }}</strong><small>{{ health.validity?.blockers || 0 }} blocker(s) · {{ health.validity?.warnings || 0 }} warning(s)</small></div>
        <div><span>Data generation</span><strong>{{ health.dataGeneration?.state }}</strong><small>Input g{{ health.dataGeneration?.inputGeneration }} · evaluated g{{ health.dataGeneration?.evaluatedGeneration }}</small></div>
        <div><span>Tasks</span><strong>{{ health.tasks?.open || 0 }} open</strong><small>{{ health.tasks?.overdue || 0 }} overdue</small></div>
        <div><span>Evidence issues</span><strong>{{ health.significantIssues?.length || 0 }} significant</strong><small>{{ health.staleApprovals?.length || 0 }} stale approval(s)</small></div>
        <div><span>Outputs</span><strong>{{ health.documents?.created || 0 }} / {{ health.documents?.required || 26 }}</strong><small>{{ health.documents?.missing || 0 }} not started</small></div>
      </div>
      <div v-if="nextAction" class="process-health-next"><div><span class="eyebrow">Next best action from D1</span><strong>{{ nextAction.title }}</strong><small>{{ nextAction.ownerLabel || 'Assigned owner' }} · {{ nextAction.gateId || 'workflow handoff' }}</small></div><button type="button" class="button secondary" @click="openNextAction">Open action <Icon name="arrow-right" :size="15" /></button></div>
      <p class="process-health-footnote"><Icon name="shield" :size="15" />Checked {{ lastChecked ? new Date(lastChecked).toLocaleTimeString('en-QA') : 'now' }}. This panel reads D1 records and does not set a workflow gate.</p>
    </template>
  </section>
</template>

<style scoped>
.process-health { border-top: 3px solid #334e7d; }
.process-health-actions { display: flex; align-items: center; gap: 10px; }
.process-health-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid #e5eaf2; border-radius: 12px; overflow: hidden; }
.process-health-grid > div { padding: 13px; border-right: 1px solid #e5eaf2; min-width: 0; }
.process-health-grid > div:last-child { border-right: 0; }
.process-health-grid span, .process-health-grid small { display: block; color: #67748a; font-size: .78rem; }
.process-health-grid strong { display: block; margin: 4px 0; color: #16213a; }
.process-health-next { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 13px; border-radius: 10px; background: #f6f9fd; }
.process-health-next strong, .process-health-next small { display: block; }
.process-health-next small { margin-top: 3px; color: #67748a; }
.process-health-note, .process-health-error, .process-health-footnote { display: flex; gap: 8px; align-items: center; color: #67748a; font-size: .88rem; }
.process-health-error { color: #9a3412; }
.process-health-footnote { margin: 12px 0 0; }
@media (max-width: 980px) { .process-health-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .process-health-grid > div:nth-child(3) { border-right: 0; } }
@media (max-width: 620px) { .process-health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .process-health-grid > div { border-bottom: 1px solid #e5eaf2; } .process-health-grid > div:nth-child(2n) { border-right: 0; } .process-health-next { align-items: stretch; flex-direction: column; } .process-health-next button { width: 100%; justify-content: center; } }
</style>
