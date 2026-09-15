<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import LocalFixtureNotice from '../components/LocalFixtureNotice.vue'
import { client, workflowGuides } from '../data'
import { activeActor, recordPbcUpload, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'

const emit = defineEmits(['navigate'])
const portalClient = computed(() => scenarioClient() || client)
const portalEngagement = computed(() => scenarioEngagement())
const openRequests = computed(() => (scenario.pbcRequests || []).filter((request) => request.engagementId === portalEngagement.value?.id && request.state !== 'ACCEPTED').map((request) => ({ ...request, area: request.classification === 'AUDIT_EVIDENCE' ? 'Audit evidence' : request.classification, owner: request.ownerActorId || 'Assigned team', status: request.state === 'CLARIFICATION_REQUIRED' ? 'Clarification required' : request.state === 'REPLACEMENT_RECEIVED' ? 'Replacement received' : request.state === 'RECEIVED' ? 'Received' : 'Open', tone: request.state === 'ACCEPTED' ? 'good' : request.state === 'CLARIFICATION_REQUIRED' ? 'danger' : 'warn', due: request.due || 'No due date' })))
const publishedCandidate = computed(() => (scenario.releaseCandidates || []).find((item) => item.engagementId === portalEngagement.value?.id && item.deliveryState === 'DELIVERED_SIMULATION') || null)
const uploadRequest = ref(null)
const uploadFileName = ref('')
const uploadStatus = ref('')
const uploading = ref(false)
const canUpload = computed(() => Boolean(activeActor()?.roles?.some((role) => ['client_contributor', 'client_finance'].includes(role))))

function navigate(route) {
  emit('navigate', route)
}

function chooseUpload(request) {
  if (sharedDemoEnabled) {
    uploadStatus.value = 'Local portal uploads are read-only in shared mode; use the shared command surface.'
    return
  }
  if (!canUpload.value) return
  uploadRequest.value = request
  uploadFileName.value = ''
  uploadStatus.value = ''
}

function selectUploadFile(event) {
  uploadFileName.value = event.target.files?.[0]?.name || ''
}

async function submitUpload() {
  if (sharedDemoEnabled) {
    uploadStatus.value = 'Local portal uploads are read-only in shared mode; use the shared command surface.'
    return
  }
  const request = uploadRequest.value
  const actor = activeActor()
  if (!request || !actor || !uploadFileName.value || uploading.value) return
  uploading.value = true
  const result = await recordPbcUpload({ requestId: request.id, actorPersonaId: actor.personaId, expectedRevision: request.revision, period: request.period, idempotencyKey: `portal-upload-${request.id}-${request.revision}`, content: `${request.id}|${portalClient.value.id}|${portalEngagement.value?.period}|${uploadFileName.value}` })
  uploadStatus.value = result.outcome === 'COMMITTED' ? `${uploadFileName.value} was received as ${result.data?.receiptId || 'a versioned receipt'}. The assigned reviewer can now inspect it.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') {
    uploadRequest.value = null
    uploadFileName.value = ''
  }
  uploading.value = false
}
</script>

<template>
  <div class="page client-portal-page">
    <PageHeader eyebrow="Client portal" title="Welcome back, Nadia" description="One clear place to submit your business details, respond to requests, and keep every question with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-home']" />
    <LocalFixtureNotice v-if="sharedDemoEnabled"
      title="Local client portal is read-only"
      description="The shared command surface is authoritative for uploads and handoffs. This portal projection remains a browser-local reference while shared mode is active." />

    <section class="portal-banner panel">
      <span class="portal-avatar avatar avatar-blue">NF</span>
      <div><span class="eyebrow">Your engagement</span><h2>{{ portalClient.name }}</h2><p>{{ portalEngagement?.periodLabel || portalClient.period }} · {{ portalEngagement?.serviceLabel || portalClient.services[0] }}</p></div>
      <StatusPill label="Portal connected" tone="good" />
      <span class="portal-banner-note">Last team reply <strong>13 Sep 2026 · 15:20</strong></span>
    </section>

    <div class="portal-kpi-grid">
      <article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><Icon name="file" :size="17" /></span><span><small>Details</small><strong>Submitted</strong><em>Reviewed 13 Sep</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><small>Open requests</small><strong>{{ openRequests.length }}</strong><em>Need your attention</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-green"><Icon name="message" :size="17" /></span><span><small>Messages</small><strong>2</strong><em>Team replies visible</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><Icon name="calendar" :size="17" /></span><span><small>Next due</small><strong>Today</strong><em>Receivables evidence</em></span></article>
    </div>

    <div class="portal-content-grid">
      <section class="panel portal-request-panel">
        <div class="panel-heading"><div><span class="eyebrow">Action needed</span><h2>Requests from the team</h2></div><button type="button" class="text-button" @click="navigate('client-communications')">Ask a question <Icon name="arrow-right" :size="15" /></button></div>
        <div class="portal-request-list">
          <button v-for="request in openRequests" :key="request.id" type="button" class="portal-request-row" @click="navigate('client-communications')">
            <span class="portal-request-status" :class="`tone-${request.tone}`"></span><span><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · Owner {{ request.owner }}</small></span><span class="portal-request-due">{{ request.due }}<StatusPill :label="request.status" :tone="request.tone" /></span><Icon class="portal-row-arrow" name="arrow-right" :size="16" />
          </button>
        </div>
        <div class="portal-panel-footer"><span>Accepted requests stay visible for your record.</span><div class="button-row"><button v-if="canUpload && openRequests.length" type="button" class="button primary" @click="chooseUpload(openRequests[0])">Upload evidence</button><button type="button" class="button secondary" @click="navigate('client-details')">Review my details</button></div></div>
        <form v-if="uploadRequest" class="portal-upload-form" @submit.prevent="submitUpload"><div><span class="eyebrow">Upload to {{ uploadRequest.id }}</span><h3>{{ uploadRequest.title }}</h3><p>Choose the reporting-period file for this request. The browser records a receipt and keeps the request revision visible to the assigned reviewer.</p></div><label>Evidence file<input type="file" required @change="selectUploadFile" /></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Only the selected request, period, and file name are recorded in this walkthrough.</span><button type="submit" class="button primary" :disabled="uploading || !uploadFileName">{{ uploading ? 'Receiving…' : 'Submit evidence' }}<Icon name="arrow-right" :size="17" /></button></div></form>
        <p v-if="uploadStatus" class="portal-status" role="status" aria-live="polite">{{ uploadStatus }}</p>
      </section>

      <section class="panel portal-next-panel">
        <div class="panel-heading"><div><span class="eyebrow">Your shortcuts</span><h2>Continue in the portal</h2></div></div>
        <div class="portal-shortcuts">
          <button type="button" class="portal-shortcut" @click="navigate('client-details')"><span class="shortcut-icon tone-blue"><Icon name="user" :size="17" /></span><span><strong>Client details</strong><small>Submit or confirm entity facts</small></span><Icon name="arrow-right" :size="16" /></button>
          <button type="button" class="portal-shortcut" @click="navigate('client-communications')"><span class="shortcut-icon tone-green"><Icon name="message" :size="17" /></span><span><strong>Communications</strong><small>Ask, clarify, and confirm next steps</small></span><Icon name="arrow-right" :size="16" /></button>
          <button type="button" class="portal-shortcut" @click="navigate('client-architecture')"><span class="shortcut-icon tone-navy"><Icon name="workflow" :size="17" /></span><span><strong>How the platform works</strong><small>See where your facts, files, and questions go</small></span><Icon name="arrow-right" :size="16" /></button>
          <div class="portal-boundary-note"><Icon name="shield" :size="17" /><span><strong>What stays private</strong> Internal risk notes, review points, and approvals remain with the engagement team.</span></div>
        </div>
      </section>
    </div>

    <section class="panel portal-deliverables-panel"><div class="panel-heading"><div><span class="eyebrow">Published deliverables</span><h2>{{ publishedCandidate ? 'Your final report package' : 'No final package published yet' }}</h2></div><StatusPill :label="publishedCandidate ? 'Available' : 'Pending release'" :tone="publishedCandidate ? 'good' : 'warn'" /></div><p class="panel-copy">{{ publishedCandidate ? 'The report and final financial statements are released as one matched, versioned package. You can inspect the synthetic artifact records before downloading or printing.' : 'When the partner, EQR and records controls are complete, this panel will show the matched final report and financial statements for this engagement.' }}</p><div class="portal-deliverable-actions"><button type="button" class="button secondary" @click="navigate('artifacts')">Open document center <Icon name="arrow-right" :size="16" /></button><span v-if="publishedCandidate" class="deliverable-version">Candidate {{ publishedCandidate.id }} · revision {{ publishedCandidate.revision }}</span></div></section>
  </div>
</template>
