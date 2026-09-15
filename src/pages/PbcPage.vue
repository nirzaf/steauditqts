<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import LocalFixtureNotice from '../components/LocalFixtureNotice.vue'
import { client, formatMoney, workflowGuides } from '../data'
import { activeActor, actorById, createPbcRequest, recordHardCopyReadiness, recordPbcUpload, requestPbcClarification, reviewPbcReceipt, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'

const selectedId = ref('PBC-019')
const toast = ref('')
const working = ref(false)
const requestDraftOpen = ref(false)
const requestDraft = ref({ title: '', classification: 'AUDIT_EVIDENCE', due: '', ownerActorId: 'ACT-NADIA', acceptanceCriteria: '' })
const selectedEngagement = computed(() => scenarioEngagement())
const selectedClient = computed(() => scenarioClient())
const requests = computed(() => scenario.pbcRequests.filter((item) => item.engagementId === selectedEngagement.value?.id).map((item) => ({
  ...item,
  title: item.title,
  area: item.classification === 'AUDIT_EVIDENCE' ? 'Audit evidence' : item.classification,
  owner: actorById(item.ownerActorId)?.name || item.ownerActorId,
  due: item.due,
  status: item.state === 'RECEIVED' ? 'Received' : item.state === 'REPLACEMENT_RECEIVED' ? 'Replacement received' : item.state === 'CLARIFICATION_REQUIRED' ? 'Clarification required' : item.state === 'ACCEPTED' ? 'Accepted' : 'Under review',
  tone: item.state === 'ACCEPTED' ? 'good' : item.state === 'CLARIFICATION_REQUIRED' ? 'danger' : 'warn',
  files: item.receipts.length,
  progress: item.receipts.length ? 82 : 0,
  hardCopyState: item.hardCopyState || 'NOT_DECLARED',
  note: item.state === 'RECEIVED' ? 'Receipt logged; reviewer still needs to assess suitability.' : item.state === 'REPLACEMENT_RECEIVED' ? `Replacement receipt logged; earlier receipt ${item.supersedesReceiptId || 'remains'} is preserved and suitability is reopened.` : item.state === 'CLARIFICATION_REQUIRED' ? 'Period or completeness mismatch needs a new scoped submission.' : 'Select the request to inspect its acceptance criteria.',
})))
const selectedRequest = computed(() => requests.value.find((item) => item.id === selectedId.value) || requests.value[0] || { id: '—', title: 'No scoped requests', status: 'Not available', tone: 'neutral', area: '—', due: '—', owner: '—', files: 0, progress: 0, note: 'This selected engagement has no PBC request in the synthetic fixture.' })
const openCount = computed(() => requests.value.filter((item) => item.tone !== 'good').length)
const receivedCount = computed(() => requests.value.reduce((total, request) => total + request.files, 0))
const hardCopyReadyCount = computed(() => requests.value.filter((request) => ['READY_FOR_COLLECTION', 'RECEIVED_PHYSICAL'].includes(request.hardCopyState)).length)
const selectedSnapshot = computed(() => scenario.snapshots.find((snapshot) => snapshot.receiptId === selectedRequest.value.receipts?.at(-1)) || null)
const canReview = computed(() => activeActor()?.roles?.some((role) => ['independent_reviewer', 'accounting_reviewer', 'engagement_partner'].includes(role)))
const canCreateRequest = computed(() => activeActor()?.roles?.some((role) => ['audit_senior', 'audit_manager', 'engagement_partner'].includes(role)))

function selectRequest(id) { selectedId.value = id }
async function markReceived() {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  if (working.value) return
  const request = selectedRequest.value
  if (!selectedClient.value || !selectedEngagement.value || request.id === '—') return
  if (!request || request.status === 'Accepted') return
  working.value = true
  const result = await recordPbcUpload({ requestId: request.id, actorPersonaId: activeActor()?.personaId, expectedRevision: request.revision, period: request.period, idempotencyKey: `pbc-${request.id}-${request.revision}`, content: `${request.id}|${selectedClient.value.id}|${selectedEngagement.value.period}|synthetic-fixture` })
  working.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${request.id} receipt ${result.data.receiptId} preserved with ${result.data.snapshotHash}. It is RECEIVED, not accepted.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

async function reviewReceipt(decision = 'ACCEPT') {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  if (working.value) return
  const request = selectedRequest.value
  if (!request?.receipts?.length) {
    toast.value = 'BLOCKED: RECEIPT_NOT_FOUND — log a stable receipt before reviewing suitability.'
    window.setTimeout(() => { toast.value = '' }, 3500)
    return
  }
  working.value = true
  const result = reviewPbcReceipt({ requestId: request.id, receiptId: request.receipts.at(-1), actorPersonaId: activeActor()?.personaId, expectedRevision: request.revision, idempotencyKey: `pbc-review-${request.id}-${request.revision}-${decision}`, decision, response: decision === 'ACCEPT' ? 'Synthetic reviewer matched entity, period, completeness, and stored snapshot.' : 'Synthetic clarification requested for the current receipt.' })
  working.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${request.id} suitability is ${decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION_REQUIRED'} for receipt ${request.receipts.at(-1)}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function askClarification() {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  if (working.value) return
  const request = selectedRequest.value
  const result = requestPbcClarification({ requestId: request.id, actorPersonaId: activeActor()?.personaId, expectedRevision: request.revision, idempotencyKey: `pbc-clarification-${request.id}-${request.revision}`, message: 'Please confirm the requested entity, FY2026 period, and complete supporting file set.' })
  toast.value = result.outcome === 'COMMITTED' ? `Clarification requested for ${request.id}. Existing receipts remain preserved.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function markHardCopyReady() {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  if (working.value) return
  const request = selectedRequest.value
  const result = recordHardCopyReadiness({ requestId: request.id, actorPersonaId: activeActor()?.personaId, expectedRevision: request.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `hard-copy-${request.id}-${request.revision}`, state: request.hardCopyState === 'READY_FOR_COLLECTION' ? 'RECEIVED_PHYSICAL' : 'READY_FOR_COLLECTION', note: 'Synthetic client declaration from the portal.' })
  toast.value = result.outcome === 'COMMITTED' ? `${request.id} hard-copy state is now ${result.data.hardCopyState}. Physical custody remains a separate firm receipt.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function createRequest() {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  requestDraft.value = { title: '', classification: 'AUDIT_EVIDENCE', due: '', ownerActorId: 'ACT-NADIA', acceptanceCriteria: '' }
  requestDraftOpen.value = true
}

function saveRequestDraft() {
  if (sharedDemoEnabled) {
    toast.value = 'Local PBC fixtures are read-only in shared mode; use the shared workflow command surface.'
    return
  }
  if (working.value || !requestDraft.value.title.trim()) return
  working.value = true
  const result = createPbcRequest({ engagementId: selectedEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `pbc-create-${selectedEngagement.value?.id}-${requestDraft.value.title.trim().toLowerCase()}`, ...requestDraft.value })
  working.value = false
  requestDraftOpen.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${result.data.id} request draft created for ${selectedEngagement.value?.periodLabel || 'the selected period'}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Restricted client surface" title="PBC portal" description="Track requests, bounded uploads, clarifications and accepted evidence without exposing internal review notes or unrestricted SharePoint access." :action-label="canCreateRequest ? 'New request' : ''" @action="createRequest" />
    <WorkflowGuide :guide="workflowGuides.pbc" />
    <LocalFixtureNotice v-if="sharedDemoEnabled"
      title="Local PBC fixture is read-only"
      description="Use the shared command surface for authoritative evidence requests, receipts and review decisions. This PBC page remains a browser-local reference while shared mode is active." />

    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section v-if="requestDraftOpen" class="panel request-draft-panel" aria-labelledby="request-draft-title"><div class="panel-heading"><div><span class="eyebrow">Scoped request workspace</span><h2 id="request-draft-title">Create a PBC request draft</h2></div><button type="button" class="icon-button" aria-label="Close request draft" title="Close request draft" @click="requestDraftOpen = false"><Icon name="x" :size="17" /></button></div><p class="panel-copy">The request is saved only for the selected engagement. Sending to a client remains a separate, disabled external action in this prototype.</p><form class="portal-form" @submit.prevent="saveRequestDraft"><div class="form-grid"><label>Request title<input v-model="requestDraft.title" required maxlength="140" placeholder="e.g. Bank reconciliation pack" /></label><label>Classification<select v-model="requestDraft.classification"><option value="AUDIT_EVIDENCE">Audit evidence</option><option value="ACCOUNTING_INPUT">Accounting input</option><option value="CLIENT_INFORMATION">Client information</option></select></label><label>Client owner<select v-model="requestDraft.ownerActorId"><option value="ACT-NADIA">Nadia Faris · client</option></select></label><label>Due date<input v-model="requestDraft.due" type="date" /></label><label class="form-span-2">Acceptance criteria<textarea v-model="requestDraft.acceptanceCriteria" rows="3" maxlength="400" placeholder="Entity, period, completeness, usability and expected totals"></textarea></label></div><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Browser-local synthetic record · no message or upload is sent.</span><button type="submit" class="button primary" :disabled="working || !requestDraft.title.trim()">{{ working ? 'Saving…' : 'Save request draft' }}<Icon name="arrow-right" :size="17" /></button></div></form></section>

    <section class="portal-banner"><div class="portal-banner-icon"><Icon name="inbox" :size="20" /></div><div><strong>{{ selectedClient?.name || 'No assigned client' }} · {{ selectedEngagement?.periodLabel || 'No assigned period' }}</strong><span>Client-facing view is limited to assigned requests and published deliverables.</span></div><StatusPill label="Synthetic portal projection" tone="neutral" /></section>

    <section class="stats-strip compact"><div><span>Open requests</span><strong>{{ openCount }}</strong><small>Require client or firm action</small></div><div><span>Electronic receipts</span><strong>{{ receivedCount }}</strong><small>{{ hardCopyReadyCount }} hard-copy item(s) marked ready</small></div><div><span>Clarification needed</span><strong>{{ requests.filter((request) => request.status === 'Clarification required').length }}</strong><small>Period or completeness follow-up</small></div><div><span>Latest upload</span><strong>{{ selectedRequest.receipts?.at(-1) || '—' }}</strong><small>Exact receipt reference in this scope</small></div></section>

    <section class="pbc-layout">
      <article class="panel request-list-panel"><div class="panel-heading"><div><span class="eyebrow">Request inbox</span><h2>Client requests</h2></div><span class="muted-label">{{ requests.length }} requests</span></div><div class="request-list"><button v-for="request in requests" :key="request.id" type="button" class="request-row" :class="{ active: selectedId === request.id }" @click="selectRequest(request.id)"><span class="request-state" :class="`tone-${request.tone}`"></span><span class="request-main"><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · due {{ request.due }}</small><span class="mini-progress"><i :style="{ width: `${request.progress}%` }"></i></span></span><span class="request-meta"><StatusPill :label="request.status" :tone="request.tone" /><small>{{ request.files }} files</small></span></button></div></article>

      <article class="panel request-detail-panel"><div class="panel-heading"><div><span class="eyebrow">Request detail</span><h2>{{ selectedRequest.title }}</h2></div><StatusPill :label="selectedRequest.status" :tone="selectedRequest.tone" /></div><dl class="detail-list"><div><dt>Request ID</dt><dd>{{ selectedRequest.id }}</dd></div><div><dt>Entity and period</dt><dd>{{ selectedClient?.shortName || selectedClient?.name || 'No client' }} · {{ selectedEngagement?.periodLabel || 'No period' }}</dd></div><div><dt>Client owner</dt><dd>{{ selectedRequest.owner }}</dd></div><div><dt>Firm reviewer</dt><dd>Omar Aziz</dd></div><div><dt>Acceptance criteria</dt><dd>Entity, period, completeness, usability and expected totals</dd></div><div><dt>Latest receipt</dt><dd>{{ selectedRequest.receipts?.at(-1) || 'No receipt yet' }} · {{ selectedSnapshot?.snapshotHash || 'Awaiting stable snapshot' }}</dd></div><div><dt>Suitability</dt><dd>{{ selectedRequest.suitability?.decision || 'Not reviewed' }} · receipt is not acceptance until an assigned reviewer records it</dd></div><div><dt>Hard-copy state</dt><dd>{{ selectedRequest.hardCopyState }} · declaration and firm custody are separate records</dd></div></dl><div class="request-note"><span class="eyebrow">Reviewer note</span><p>{{ selectedRequest.note }}</p></div><div class="card-footer"><button type="button" class="button secondary" :disabled="working || selectedRequest.id === '—' || selectedRequest.status === 'Accepted'" @click="markReceived">{{ working ? 'Working…' : 'Log synthetic receipt' }}</button><button type="button" class="button secondary" :disabled="working || selectedRequest.id === '—' || selectedRequest.hardCopyState === 'RECEIVED_PHYSICAL'" @click="markHardCopyReady">{{ selectedRequest.hardCopyState === 'READY_FOR_COLLECTION' ? 'Record physical handover' : 'Mark hard copy ready' }}</button><button v-if="canReview" type="button" class="button secondary" :disabled="working || selectedRequest.id === '—' || !selectedRequest.receipts?.length" @click="reviewReceipt('ACCEPT')">Accept receipt</button><button v-if="canReview" type="button" class="button secondary" :disabled="working || selectedRequest.id === '—' || !selectedRequest.receipts?.length" @click="reviewReceipt('CLARIFICATION_REQUIRED')">Request clarification</button><button v-else type="button" class="button primary" :disabled="working || selectedRequest.id === '—'" @click="askClarification">Ask for clarification</button></div></article>
    </section>

    <section class="split-grid"><article class="panel portal-preview"><div class="panel-heading"><div><span class="eyebrow">Portal preview</span><h2>What the client can see</h2></div><span class="muted-label">Read-only mock</span></div><div class="preview-window"><div class="preview-top"><span class="preview-logo">AuditFlow</span><span class="preview-user">Nadia Faris <i></i></span></div><div class="preview-body"><span class="eyebrow">My requests</span><h3>Good afternoon, Nadia</h3><div class="preview-request"><span class="preview-check"><Icon name="check-circle" :size="16" /></span><span><strong>Bank statements and reconciliations</strong><small>Accepted · 6 files</small></span></div><div class="preview-request"><span class="preview-alert"><Icon name="warning" :size="16" /></span><span><strong>Receivables ageing and subsequent receipts</strong><small>Action needed · upload clarification</small></span><button type="button" class="preview-action">Upload <Icon name="upload" :size="14" /></button></div></div></div></article><article class="panel visibility-panel"><div class="panel-heading"><div><span class="eyebrow">Visibility rules</span><h2>Internal fields stay internal</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Assigned request, due date and upload state</strong><small>Visible to the client contact for their engagement</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Internal risk scores and acceptance reasoning</strong><small>Never returned by portal list, search or notifications</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Review points, EQR deliberations and audit-file exports</strong><small>Restricted to authorized firm roles</small></span></li></ul></article></section>
  </div>
</template>
