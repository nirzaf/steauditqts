<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, workflowGuides } from '../data'
import { activeActor, recordPbcUpload, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'
import { activeDemoSession, downloadPortalEvidence, getActiveDemoView, getPortalMessages, getSharedPbc, uploadPortalEvidence } from '../sharedDemo.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'

const emit = defineEmits(['navigate'])
const fileInput = ref(null)
const uploadRequest = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const uploadStatus = ref('')
const uploadStatusTone = ref('neutral')
const uploading = ref(false)
const sharedRequests = ref([])
const sharedReceipts = ref([])
const sharedMessages = ref([])
const sharedLoadError = ref('')
const scopedView = ref(getActiveDemoView())
const invitationSession = computed(() => activeDemoSession.value?.invitationId ? activeDemoSession.value : null)
const isSharedInvitation = computed(() => Boolean(sharedDemoEnabled && invitationSession.value))
const activeEngagementId = computed(() => scopedView.value?.engagementId || scenarioEngagement()?.id || '')
const portalClient = computed(() => {
  const scope = scopedView.value?.scope
  return scope?.clientName ? { ...client, id: scope.clientId, name: scope.clientName } : (scenarioClient() || client)
})
const portalEngagement = computed(() => {
  const scope = scopedView.value?.scope
  const local = scenarioEngagement()
  return scope ? { id: activeEngagementId.value, periodLabel: scope.period, serviceLabel: scope.service, period: scope.period } : local
})
const openRequests = computed(() => {
  if (isSharedInvitation.value) {
    return sharedRequests.value.filter((row) => !['ACCEPTED', 'CANCELLED'].includes(String(row.state || '').toUpperCase())).map((row) => ({
      id: row.request_id, title: row.title, area: row.category || 'Audit evidence', owner: row.client_owner || 'Assigned team',
      status: row.state === 'CLARIFICATION' ? 'Clarification required' : row.state === 'RECEIVED' ? 'Received' : 'Open',
      tone: row.state === 'CLARIFICATION' ? 'danger' : row.state === 'RECEIVED' ? 'good' : 'warn', due: row.due_date || 'No due date',
      period: row.period || portalEngagement.value?.period || 'FY2026', revision: Number(row.revision || 1), raw: row,
    }))
  }
  return (scenario.pbcRequests || []).filter((request) => request.engagementId === portalEngagement.value?.id && request.state !== 'ACCEPTED').map((request) => ({
    ...request, id: request.id, area: request.classification === 'AUDIT_EVIDENCE' ? 'Audit evidence' : request.classification,
    owner: request.ownerActorId || 'Assigned team',
    status: request.state === 'CLARIFICATION_REQUIRED' ? 'Clarification required' : request.state === 'REPLACEMENT_RECEIVED' ? 'Replacement received' : request.state === 'RECEIVED' ? 'Received' : 'Open',
    tone: request.state === 'CLARIFICATION_REQUIRED' ? 'danger' : request.state === 'RECEIVED' ? 'good' : 'warn', due: request.due || 'No due date',
  }))
})
const publishedCandidate = computed(() => (scenario.releaseCandidates || []).find((item) => item.engagementId === portalEngagement.value?.id && item.deliveryState === 'DELIVERED_SIMULATION') || null)
const canUpload = computed(() => isSharedInvitation.value || Boolean(activeActor()?.roles?.some((role) => ['client_contributor', 'client_finance'].includes(role))))
const messageCount = computed(() => isSharedInvitation.value ? sharedMessages.value.length : 0)
const lastTeamReply = computed(() => {
  if (!isSharedInvitation.value) return 'Invitation required'
  const latest = [...sharedMessages.value].reverse().find((message) => !['client_contributor', 'client_finance', 'management_approver'].includes(message.senderRole))
  return latest?.createdAt ? new Date(latest.createdAt.replace(' ', 'T') + (latest.createdAt.includes('Z') ? '' : 'Z')).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No team reply yet'
})

function navigate(route) { emit('navigate', route) }

async function loadSharedPortal() {
  if (!sharedDemoEnabled || !activeEngagementId.value) return
  scopedView.value = getActiveDemoView() || scopedView.value
  const [pbc, messages] = await Promise.all([getSharedPbc(activeEngagementId.value), getPortalMessages(activeEngagementId.value)])
  if (pbc.ok) {
    sharedRequests.value = Array.isArray(pbc.requests) ? pbc.requests : []
    sharedReceipts.value = Array.isArray(pbc.receipts) ? pbc.receipts.filter((receipt) => receipt.storage_state === 'RECEIVED' || receipt.storageState === 'RECEIVED') : []
  } else if (pbc.error) sharedLoadError.value = pbc.error.message
  if (messages.ok) sharedMessages.value = Array.isArray(messages.messages) ? messages.messages : []
  else if (messages.error) sharedLoadError.value = sharedLoadError.value || messages.error.message
}

function chooseUpload(request) {
  uploadRequest.value = request; uploadFile.value = null; uploadFileName.value = ''; uploadStatus.value = ''; uploadStatusTone.value = 'neutral'
  nextTick(() => fileInput.value?.click())
}
function selectUploadFile(event) {
  uploadFile.value = event.target.files?.[0] || null; uploadFileName.value = uploadFile.value?.name || ''
  if (uploadFile.value) uploadStatus.value = `${uploadFileName.value} selected. Submit when you are ready.`
}
async function submitUpload() {
  const request = uploadRequest.value
  if (!request || !uploadFile.value || uploading.value) return
  uploading.value = true; uploadStatus.value = 'Checking the file and storing it securely…'; uploadStatusTone.value = 'neutral'
  if (isSharedInvitation.value) {
    const result = await uploadPortalEvidence({ engagementId: activeEngagementId.value, requestId: request.id, file: uploadFile.value, idempotencyKey: `portal-upload-${request.id}-${uploadFile.value.name}-${uploadFile.value.size}` })
    if (result.ok) {
      uploadStatus.value = `${uploadFileName.value} received. It is available for 24 hours and now has a versioned receipt.`; uploadStatusTone.value = 'good'
      uploadRequest.value = null; uploadFile.value = null; uploadFileName.value = ''; await loadSharedPortal()
    } else { uploadStatus.value = result.error?.message || 'The upload was not stored. Retry the same file.'; uploadStatusTone.value = 'danger' }
  } else {
    const actor = activeActor()
    const result = recordPbcUpload({ requestId: request.id, actorPersonaId: actor?.personaId, expectedRevision: request.revision, period: request.period, idempotencyKey: `portal-upload-${request.id}-${request.revision}`, content: `${request.id}|${portalClient.value.id}|${portalEngagement.value?.period}|${uploadFileName.value}` })
    uploadStatus.value = result.outcome === 'COMMITTED' ? `${uploadFileName.value} was received as ${result.data?.receiptId || 'a versioned receipt'}.` : `${result.outcome}: ${result.code} — ${result.message}`
    uploadStatusTone.value = result.outcome === 'COMMITTED' ? 'good' : 'danger'; if (result.outcome === 'COMMITTED') uploadRequest.value = null
  }
  if (fileInput.value) fileInput.value.value = ''; uploading.value = false
}
async function downloadReceipt(receipt) {
  uploadStatus.value = `Preparing ${receipt.file_name || receipt.fileName}…`
  try {
    const result = await downloadPortalEvidence(receipt.receipt_id || receipt.receiptId); const url = URL.createObjectURL(result.blob); const link = document.createElement('a'); link.href = url; link.download = result.fileName; link.click(); URL.revokeObjectURL(url)
    uploadStatus.value = 'Download ready. Temporary evidence remains available until its expiry time.'; uploadStatusTone.value = 'good'
  } catch (error) { uploadStatus.value = error.code === 'FILE_EXPIRED' ? 'This evidence expired after 24 hours and can no longer be downloaded.' : error.message; uploadStatusTone.value = 'danger' }
}
function downloadSampleFile(kind) {
  const filename = kind === 'csv' ? 'northstar-trial-balance-sample.csv' : 'northstar-evidence-readme.pdf'
  const body = kind === 'csv' ? 'Account,Debit,Credit,Period\n1000,12500.00,0,FY2026\n4000,0,12500.00,FY2026\n' : 'AuditFlow evidence sample\nNorthstar Trading W.L.L. · FY2026\nUse this file to explore the upload step.'
  const blob = new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/pdf' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}
onMounted(loadSharedPortal)
</script>

<template>
  <div class="page client-portal-page">
    <PageHeader eyebrow="Client portal" title="Welcome back, Nadia" description="One clear place to submit your business details, respond to requests, and keep every question with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-home']" />
    <section class="portal-banner panel"><span class="portal-avatar avatar avatar-blue">NF</span><div><span class="eyebrow">Your engagement</span><h2>{{ portalClient.name }}</h2><p>{{ portalEngagement?.periodLabel || portalClient.period }} · {{ portalEngagement?.serviceLabel || portalClient.services?.[0] }}</p></div><StatusPill label="Portal connected" tone="good" /><span class="portal-banner-note">Last team reply <strong>{{ lastTeamReply }}</strong></span></section>
    <div class="portal-kpi-grid"><article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><Icon name="file" :size="17" /></span><span><small>Details</small><strong>Submitted</strong><em>Client profile</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><small>Open requests</small><strong>{{ openRequests.length }}</strong><em>Need your attention</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-green"><Icon name="message" :size="17" /></span><span><small>Messages</small><strong>{{ messageCount }}</strong><em>{{ isSharedInvitation ? 'Team conversation' : 'Open invitation to message' }}</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><Icon name="calendar" :size="17" /></span><span><small>Next due</small><strong>{{ openRequests[0]?.due || '—' }}</strong><em>{{ openRequests[0]?.title || 'No open request' }}</em></span></article></div>
    <div class="portal-content-grid">
      <section class="panel portal-request-panel"><div class="panel-heading"><div><span class="eyebrow">Action needed</span><h2>Requests from the team</h2></div><button type="button" class="text-button" @click="navigate('client-communications')">Ask a question <Icon name="arrow-right" :size="15" /></button></div><p v-if="sharedLoadError" class="portal-status danger" role="status">{{ sharedLoadError }} <button type="button" class="text-button" @click="loadSharedPortal">Retry</button></p><div v-if="!openRequests.length" class="portal-empty-state"><Icon name="check-circle" :size="21" /><div><strong>Nothing needs your attention</strong><p>The team has no open evidence requests in this engagement.</p></div></div><div v-else class="portal-request-list"><button v-for="request in openRequests" :key="request.id" type="button" class="portal-request-row" @click="navigate('client-communications')"><span class="portal-request-status" :class="`tone-${request.tone}`"></span><span><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · Owner {{ request.owner }}</small></span><span class="portal-request-due">{{ request.due }}<StatusPill :label="request.status" :tone="request.tone" /></span><Icon class="portal-row-arrow" name="arrow-right" :size="16" /></button></div><div class="portal-panel-footer"><span>Accepted requests stay visible for your record.</span><div class="button-row"><button v-if="canUpload && openRequests.length" type="button" class="button primary" @click="chooseUpload(openRequests[0])">Upload evidence</button><button type="button" class="button secondary" @click="navigate('client-details')">Review my details</button></div></div><form v-if="uploadRequest" class="portal-upload-form" @submit.prevent="submitUpload"><div><span class="eyebrow">Upload to {{ uploadRequest.id }}</span><h3>{{ uploadRequest.title }}</h3><p>PDF, CSV, XLS or XLSX · maximum 10 MB. Files are available for 24 hours, then the receipt expires.</p></div><label>Evidence file<input ref="fileInput" type="file" accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required @change="selectUploadFile" /></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Files are stored as a hash and receipt for this engagement.</span><button type="submit" class="button primary" :disabled="uploading || !uploadFile">{{ uploading ? 'Receiving…' : 'Submit evidence' }}<Icon name="arrow-right" :size="17" /></button></div></form><p v-if="uploadStatus" class="portal-status" :class="uploadStatusTone" role="status" aria-live="polite">{{ uploadStatus }}</p><div v-if="isSharedInvitation" class="sample-file-row"><span><strong>Need a sample file?</strong><small>Download one, then upload it to this request.</small></span><button type="button" class="text-button" @click="downloadSampleFile('csv')">Sample CSV</button><button type="button" class="text-button" @click="downloadSampleFile('pdf')">Sample PDF</button></div><div v-if="isSharedInvitation && sharedReceipts.length" class="portal-receipts"><div class="eyebrow">Recent temporary receipts</div><div v-for="receipt in sharedReceipts" :key="receipt.receipt_id || receipt.receiptId" class="portal-receipt-row"><span><strong>{{ receipt.file_name || receipt.fileName }}</strong><small>Available until {{ receipt.expires_at || receipt.expiresAt }}</small></span><button type="button" class="text-button" @click="downloadReceipt(receipt)">Download</button></div></div></section>
      <section class="panel portal-next-panel"><div class="panel-heading"><div><span class="eyebrow">Your shortcuts</span><h2>Continue in the portal</h2></div></div><div class="portal-shortcuts"><button type="button" class="portal-shortcut" @click="navigate('client-details')"><span class="shortcut-icon tone-blue"><Icon name="user" :size="17" /></span><span><strong>Client details</strong><small>Submit or confirm entity facts</small></span><Icon name="arrow-right" :size="16" /></button><button type="button" class="portal-shortcut" @click="navigate('client-communications')"><span class="shortcut-icon tone-green"><Icon name="message" :size="17" /></span><span><strong>Communications</strong><small>Ask, clarify, and confirm next steps</small></span><Icon name="arrow-right" :size="16" /></button><button type="button" class="portal-shortcut" @click="navigate('client-architecture')"><span class="shortcut-icon tone-navy"><Icon name="workflow" :size="17" /></span><span><strong>How the platform works</strong><small>See where your facts, files, and questions go</small></span><Icon name="arrow-right" :size="16" /></button><div class="portal-boundary-note"><Icon name="shield" :size="17" /><span><strong>What stays private</strong> Internal risk notes, review points, and approvals remain with the engagement team.</span></div></div></section>
    </div>
    <section class="panel portal-deliverables-panel"><div class="panel-heading"><div><span class="eyebrow">Published deliverables</span><h2>{{ publishedCandidate ? 'Your final report package' : 'No final package published yet' }}</h2></div><StatusPill :label="publishedCandidate ? 'Available' : 'Pending release'" :tone="publishedCandidate ? 'good' : 'warn'" /></div><p class="panel-copy">{{ publishedCandidate ? 'The report and final financial statements are released as one matched, versioned package. You can inspect the document records before downloading or printing.' : 'When the partner, EQR and records controls are complete, this panel will show the matched final report and financial statements for this engagement.' }}</p><div class="portal-deliverable-actions"><button type="button" class="button secondary" @click="navigate('artifacts')">Open document center <Icon name="arrow-right" :size="16" /></button><span v-if="publishedCandidate" class="deliverable-version">Candidate {{ publishedCandidate.id }} · revision {{ publishedCandidate.revision }}</span></div></section>
  </div>
</template>
