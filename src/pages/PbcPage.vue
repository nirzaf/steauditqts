<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, formatMoney, pbcRequests, workflowGuides } from '../data'

const requests = ref(pbcRequests.map((item) => ({ ...item })))
const selectedId = ref('PBC-019')
const toast = ref('')
const selectedRequest = computed(() => requests.value.find((item) => item.id === selectedId.value) || requests.value[0])
const openCount = computed(() => requests.value.filter((item) => item.tone !== 'good').length)

function selectRequest(id) { selectedId.value = id }
function markReceived() {
  const request = selectedRequest.value
  if (!request || request.status === 'Accepted') return
  request.status = 'Received'
  request.tone = 'warn'
  request.progress = Math.max(request.progress, 86)
  request.note = 'Receipt logged; reviewer still needs to assess suitability.'
  toast.value = `${request.id} receipt logged for firm review.`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createRequest() {
  toast.value = 'New request draft opened. Define the entity, period, acceptance criteria, owner, and due date before sending.'
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Restricted client surface" title="PBC portal" description="Track requests, bounded uploads, clarifications and accepted evidence without exposing internal review notes or unrestricted SharePoint access." action-label="New request" @action="createRequest" />
    <WorkflowGuide :guide="workflowGuides.pbc" />

    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="portal-banner"><div class="portal-banner-icon"><Icon name="inbox" :size="20" /></div><div><strong>{{ client.name }} · {{ client.period }}</strong><span>Client-facing view is limited to assigned requests and published deliverables.</span></div><StatusPill label="Portal connected" tone="good" /></section>

    <section class="stats-strip compact"><div><span>Open requests</span><strong>{{ openCount }}</strong><small>Require client or firm action</small></div><div><span>Files received</span><strong>11</strong><small>9 accepted · 2 in review</small></div><div><span>Overdue</span><strong>1</strong><small>Inventory count clarification</small></div><div><span>Latest upload</span><strong>09 Sep</strong><small>Bank statements · 6 files</small></div></section>

    <section class="pbc-layout">
      <article class="panel request-list-panel"><div class="panel-heading"><div><span class="eyebrow">Request inbox</span><h2>Client requests</h2></div><span class="muted-label">{{ requests.length }} requests</span></div><div class="request-list"><button v-for="request in requests" :key="request.id" type="button" class="request-row" :class="{ active: selectedId === request.id }" @click="selectRequest(request.id)"><span class="request-state" :class="`tone-${request.tone}`"></span><span class="request-main"><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · due {{ request.due }}</small><span class="mini-progress"><i :style="{ width: `${request.progress}%` }"></i></span></span><span class="request-meta"><StatusPill :label="request.status" :tone="request.tone" /><small>{{ request.files }} files</small></span></button></div></article>

      <article class="panel request-detail-panel"><div class="panel-heading"><div><span class="eyebrow">Request detail</span><h2>{{ selectedRequest.title }}</h2></div><StatusPill :label="selectedRequest.status" :tone="selectedRequest.tone" /></div><dl class="detail-list"><div><dt>Request ID</dt><dd>{{ selectedRequest.id }}</dd></div><div><dt>Entity and period</dt><dd>{{ client.shortName }} · 31 Dec 2026</dd></div><div><dt>Client owner</dt><dd>{{ selectedRequest.owner }}</dd></div><div><dt>Firm reviewer</dt><dd>Omar Aziz</dd></div><div><dt>Acceptance criteria</dt><dd>Entity, period, completeness, usability and expected totals</dd></div></dl><div class="request-note"><span class="eyebrow">Reviewer note</span><p>{{ selectedRequest.note }}</p></div><div class="card-footer"><button type="button" class="button secondary" @click="markReceived">Log receipt</button><button type="button" class="button primary">Ask for clarification</button></div></article>
    </section>

    <section class="split-grid"><article class="panel portal-preview"><div class="panel-heading"><div><span class="eyebrow">Portal preview</span><h2>What the client can see</h2></div><span class="muted-label">Read-only mock</span></div><div class="preview-window"><div class="preview-top"><span class="preview-logo">AuditFlow</span><span class="preview-user">Nadia Faris <i></i></span></div><div class="preview-body"><span class="eyebrow">My requests</span><h3>Good afternoon, Nadia</h3><div class="preview-request"><span class="preview-check"><Icon name="check-circle" :size="16" /></span><span><strong>Bank statements and reconciliations</strong><small>Accepted · 6 files</small></span></div><div class="preview-request"><span class="preview-alert"><Icon name="warning" :size="16" /></span><span><strong>Receivables ageing and subsequent receipts</strong><small>Action needed · upload clarification</small></span><button type="button" class="preview-action">Upload <Icon name="upload" :size="14" /></button></div></div></div></article><article class="panel visibility-panel"><div class="panel-heading"><div><span class="eyebrow">Visibility rules</span><h2>Internal fields stay internal</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Assigned request, due date and upload state</strong><small>Visible to the client contact for their engagement</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Internal risk scores and acceptance reasoning</strong><small>Never returned by portal list, search or notifications</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Review points, EQR deliberations and audit-file exports</strong><small>Restricted to authorized firm roles</small></span></li></ul></article></section>
  </div>
</template>
