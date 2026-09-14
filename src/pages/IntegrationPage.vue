<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { integrationOperations, workflowGuides } from '../data'

const operations = ref(integrationOperations.map((item) => ({ ...item })))
const running = ref(false)
const toast = ref('')
const lastRun = ref('09:42')
const healthySystems = computed(() => 3)

function reconcile() {
  if (running.value) return
  running.value = true
  toast.value = 'Reconciliation queued. The durable operation will report each step.'
  window.setTimeout(() => {
    running.value = false
    lastRun.value = 'Just now'
    operations.value.unshift({ id: 'OP-885', name: 'Scheduled reconciliation', system: 'Graph + SharePoint', started: 'Just now', duration: '14 sec', status: 'Succeeded', tone: 'good', detail: '41 items reconciled; no missing snapshots.' })
    toast.value = 'Reconciliation succeeded. No missing snapshots found.'
    window.setTimeout(() => { toast.value = '' }, 3500)
  }, 900)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Operations and observability" title="Integration health" description="Monitor the boundaries between Frappe, Microsoft Graph, SharePoint, Entra and Purview. Reconciliation is the baseline control; notifications are acceleration only." action-label="Run reconciliation" @action="reconcile" />
    <WorkflowGuide :guide="workflowGuides.integration" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="health-grid"><article class="health-card healthy"><div class="health-card-top"><span class="health-icon"><Icon name="check-circle" :size="18" /></span><StatusPill label="Healthy" tone="good" /></div><h2>Microsoft Graph</h2><p>Selected-resource permissions and credential check</p><strong>Last checked {{ lastRun }}</strong></article><article class="health-card healthy"><div class="health-card-top"><span class="health-icon"><Icon name="folder" :size="18" /></span><StatusPill label="Healthy" tone="good" /></div><h2>SharePoint</h2><p>Repository binding, versioning and item reconciliation</p><strong>41 items in latest delta</strong></article><article class="health-card warn"><div class="health-card-top"><span class="health-icon"><Icon name="warning" :size="18" /></span><StatusPill label="Action needed" tone="warn" /></div><h2>Purview</h2><p>Retention label observation is awaiting records admin</p><strong>1 pending verification</strong></article><article class="health-card healthy"><div class="health-card-top"><span class="health-icon"><Icon name="bell" :size="18" /></span><StatusPill label="Healthy" tone="good" /></div><h2>Entra ID</h2><p>Staff and portal identity mappings</p><strong>16 active identities</strong></article></section>

    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Durable outbox</span><h2>Recent operations</h2></div><span class="muted-label">{{ operations.length }} records</span></div><div class="operation-list"><div v-for="operation in operations.slice(0, 5)" :key="operation.id" class="operation-row"><span class="operation-icon" :class="`tone-${operation.tone}`"><Icon name="database" :size="16" /></span><div><div class="operation-title"><strong>{{ operation.name }}</strong><code>{{ operation.id }}</code></div><small>{{ operation.system }} · {{ operation.started }} · {{ operation.duration }}</small><p>{{ operation.detail }}</p></div><StatusPill :label="operation.status" :tone="operation.tone" /></div></div></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Control boundaries</span><h2>What health means</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Database intent is durable</strong><small>Each external write has an operation ID and retry state.</small></span></li><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Poll / delta is the baseline</strong><small>Notifications can be lost without bypassing reconciliation.</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Purview is a separate control plane</strong><small>Desired labels are not reported as enforced until observed.</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Tokens never enter download URLs</strong><small>Portal routes re-check scope for every delivery request.</small></span></li></ul></article></section>

    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Recovery posture</span><h2>Environment boundaries</h2></div><StatusPill label="Staging and production separated" tone="good" /></div><div class="environment-grid"><div><span class="environment-label">Development</span><strong>Synthetic client records</strong><small>Test Graph app · no production identities</small></div><div><span class="environment-label">Staging</span><strong>Production-like, sanitized</strong><small>Separate secrets, site and SharePoint storage</small></div><div><span class="environment-label">Production</span><strong>Restricted deployment rights</strong><small>Backups, monitoring and administrator evidence</small></div></div></section>
  </div>
</template>
