<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import SharedAssessmentPanel from '../components/SharedAssessmentPanel.vue'
import Icon from '../components/Icon.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { client, formatMoney, portfolioClients, workflowGuides } from '../data'
import { activeActor, actorById, assessmentSummary, createLead, engagementById, importLeadFixtures, recordAssessmentDecision, scenario, saveAssessmentResponse, selectEngagement } from '../domain/scenario.js'
import { visibleResponses } from '../domain/assessments.js'
import { recordTargetFor } from '../navigation/recordTargets.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const search = ref('')
const filter = ref('All clients')
const selected = ref(null)
const targetNotice = ref('')
const toast = ref('')
const assessmentOpen = ref(false)
const assessmentType = ref('acceptance')
const assessmentSearch = ref('')
const focusedQuestion = ref(null)
const responseAnswer = ref('YES')
const responseApplicability = ref('APPLICABLE')
const responseExplanation = ref('')
const decisionWorking = ref(false)
const leadSearch = ref('')
const leadFilter = ref('All leads')
const leadView = ref('list')
const leadModalOpen = ref(false)
const leadWorking = ref(false)
const leadForm = ref({ name: '', company: '', email: '', phone: '', value: '0.00', service: 'Financial-statement audit', source: 'Referral', assignedActorId: 'ACT-OMAR' })
const filters = ['All clients', 'Needs decision', 'In delivery', 'Low risk']
const leadFilters = ['All leads', 'Needs follow-up', 'Qualified']
const leadServices = ['Financial-statement audit', 'Accounting only', 'Internal audit', 'Review engagement']
const leadSources = ['Referral', 'Website', 'Existing client', 'Event']

const leadRows = computed(() => (scenario.leads || []).filter((lead) => {
  const query = leadSearch.value.trim().toLowerCase()
  const matchesSearch = !query || `${lead.name} ${lead.company} ${lead.email} ${lead.id} ${lead.source}`.toLowerCase().includes(query)
  const matchesFilter = leadFilter.value === 'All leads' || (leadFilter.value === 'Needs follow-up' && lead.status === 'PENDING') || (leadFilter.value === 'Qualified' && lead.status === 'QUALIFIED')
  return matchesSearch && matchesFilter
}))
const leadOwnerName = (lead) => actorById(lead.assignedActorId)?.name || 'Unassigned'
const leadStatusTone = (status) => ['QUALIFIED', 'CONVERTED'].includes(status) ? 'good' : status === 'CLOSED' ? 'neutral' : 'warn'
const leadStatusLabel = (status) => status === 'QUALIFIED' ? 'Qualified' : status === 'CONVERTED' ? 'Converted' : status === 'CLOSED' ? 'Closed' : 'Pending'
const canManageLeads = computed(() => Boolean(activeActor()?.roles?.some((role) => ['system_admin', 'engagement_partner', 'compliance_reviewer'].includes(role))))
const activeClientCount = computed(() => scenario.clients.length)
const awaitingPartnerCount = computed(() => scenario.engagements.filter((engagement) => {
  const assessment = scenario.assessments.find((item) => item.engagementId === engagement.id && item.type === 'acceptance')
  return !assessment?.decision || assessmentSummary(engagement.id, 'acceptance').holds.length > 0
}).length)
const continuanceCount = computed(() => scenario.renewalCases.filter((item) => ['PENDING_ASSESSMENT', 'RENEWED_PENDING_TERMS'].includes(item.state)).length)

const filteredClients = computed(() => portfolioClients.filter((item) => {
  const query = search.value.trim().toLowerCase()
  const matchesSearch = !query || `${item.name} ${item.id} ${item.service}`.toLowerCase().includes(query)
  const matchesFilter = filter.value === 'All clients'
    || (filter.value === 'Needs decision' && (item.status === 'Acceptance hold' || item.risk === 'High'))
    || (filter.value === 'In delivery' && ['Fieldwork', 'Statements review', 'Planning'].includes(item.status))
    || (filter.value === 'Low risk' && item.risk === 'Low')
  return matchesSearch && matchesFilter
}))

function engagementForPortfolioClient(item) {
  if (!item) return null
  const candidates = scenario.engagements.filter((engagement) => engagement.clientId === item.id)
  return candidates.find((engagement) => engagement.service === 'audit') || candidates[0] || null
}

const assessmentEngagement = computed(() => engagementForPortfolioClient(selected.value) || engagementById(scenario.selectedEngagementId) || scenario.engagements[0])
const currentAssessmentSummary = computed(() => assessmentSummary(assessmentEngagement.value?.id, assessmentType.value))
const assessmentDecision = computed(() => currentAssessmentSummary.value.assessment?.decision?.decision || 'PENDING')
const canDecide = computed(() => Boolean(activeActor()?.roles?.includes('engagement_partner')))
const assessmentQuestions = computed(() => {
  const query = assessmentSearch.value.trim().toLowerCase()
  return visibleResponses(currentAssessmentSummary.value.assessment, activeActor()).filter(({ question }) => !query || `${question.id} ${question.question} ${question.category || ''}`.toLowerCase().includes(query))
})

watch(() => props.navigationTarget?.recordId, (recordId) => {
  const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
  if (!recordId || (target.targetType !== 'clients' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'clients'))) return
  const clientItem = filteredClients.value.find((item) => item.id === recordId) || portfolioClients.find((item) => item.id === recordId)
  if (clientItem) { selected.value = clientItem; targetNotice.value = '' }
  else if (leadRows.value.some((lead) => lead.id === recordId)) { leadSearch.value = recordId; leadView.value = 'list'; targetNotice.value = '' }
  else if (/^CE-/.test(recordId)) { openAssessment('acceptance'); targetNotice.value = ''; }
  else targetNotice.value = `${recordId} is not visible in the selected client scope.`
}, { immediate: true })

function openAssessment(type = 'acceptance') {
  assessmentType.value = type
  assessmentSearch.value = ''
  focusedQuestion.value = null
  assessmentOpen.value = true
}

function recordDecision(decision) {
  if (sharedDemoEnabled) {
    toast.value = 'Use the shared evaluation panel above; the local assessment is read-only in shared mode.'
    return
  }
  if (decisionWorking.value || !canDecide.value || !currentAssessmentSummary.value.assessment) return
  decisionWorking.value = true
  const assessment = currentAssessmentSummary.value.assessment
  const result = recordAssessmentDecision({
    engagementId: assessmentEngagement.value.id,
    type: assessmentType.value,
    actorPersonaId: activeActor()?.personaId,
    expectedRevision: assessment.revision,
    expectedSessionEpoch: activeActor()?.sessionEpoch,
    idempotencyKey: `decision-${assessment.id}-${assessment.revision}-${decision}`,
    decision,
    rationale: decision === 'ACCEPT' ? 'Synthetic partner decision recorded after reviewing the scoped assessment.' : decision === 'CONTINUE' ? 'Synthetic continuance decision recorded for the scoped period.' : 'Synthetic decision recorded for demonstration; follow-up remains in the event history.',
  })
  decisionWorking.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${assessment.id}: ${decision} recorded by ${activeActor()?.name}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function inspectQuestion(item) {
  focusedQuestion.value = item
  responseAnswer.value = item.response.answer || 'UNKNOWN'
  responseApplicability.value = item.response.applicability || 'APPLICABLE'
  responseExplanation.value = item.response.explanation || ''
}

function closeAssessment() {
  assessmentOpen.value = false
  focusedQuestion.value = null
}

async function saveResponse() {
  if (sharedDemoEnabled) {
    toast.value = 'Use the shared evaluation panel above; the local assessment is read-only in shared mode.'
    return
  }
  if (!focusedQuestion.value) return
  const result = saveAssessmentResponse({
    engagementId: assessmentEngagement.value.id,
    type: assessmentType.value,
    questionId: focusedQuestion.value.question.id,
    actorPersonaId: activeActor()?.personaId,
    expectedRevision: currentAssessmentSummary.value.assessment.revision,
    expectedSessionEpoch: activeActor()?.sessionEpoch,
    idempotencyKey: `assessment-${assessmentType.value}-${focusedQuestion.value.question.id}-${currentAssessmentSummary.value.assessment.revision}`,
    answer: responseAnswer.value,
    applicability: responseApplicability.value,
    explanation: responseExplanation.value,
  })
  toast.value = result.outcome === 'COMMITTED' ? `${focusedQuestion.value.question.id} response recorded in the synthetic assessment.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') focusedQuestion.value = null
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function openClient(item) {
  selected.value = item
  const engagement = engagementForPortfolioClient(item)
  if (engagement) selectEngagement(engagement.id, { actorPersonaId: activeActor()?.personaId })
}

function openEngagement(item = selected.value) {
  const engagement = engagementForPortfolioClient(item) || engagementById(scenario.selectedEngagementId)
  if (engagement) selectEngagement(engagement.id, { actorPersonaId: activeActor()?.personaId })
  emit('navigate', 'engagements')
}

function addClient() {
  if (sharedDemoEnabled) {
    showLeadToast('Lead intake is a local reference in shared mode; use the server-authorized workflow panels instead.')
    return
  }
  leadForm.value = { name: '', company: '', email: '', phone: '', value: '0.00', service: 'Financial-statement audit', source: 'Referral', assignedActorId: activeActor()?.id || 'ACT-OMAR' }
  leadModalOpen.value = true
}

function closeLeadModal() {
  if (!leadWorking.value) leadModalOpen.value = false
}

function showLeadToast(message) {
  toast.value = message
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function saveLead() {
  if (sharedDemoEnabled) {
    showLeadToast('Lead intake is read-only in shared mode.')
    return
  }
  if (leadWorking.value) return
  leadWorking.value = true
  const result = createLead({
    ...leadForm.value,
    actorPersonaId: activeActor()?.personaId,
    expectedSessionEpoch: activeActor()?.sessionEpoch,
    idempotencyKey: `lead-create-${Date.now()}`,
  })
  leadWorking.value = false
  if (result.outcome === 'COMMITTED') {
    leadModalOpen.value = false
    showLeadToast(`${result.data.id} added to the synthetic lead register. Qualification stays separate from client acceptance.`)
  } else showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
}

function importSampleLeads() {
  if (sharedDemoEnabled) {
    showLeadToast('Lead intake is read-only in shared mode.')
    return
  }
  if (leadWorking.value) return
  leadWorking.value = true
  const result = importLeadFixtures({
    actorPersonaId: activeActor()?.personaId,
    expectedSessionEpoch: activeActor()?.sessionEpoch,
    idempotencyKey: `lead-import-demo-${Date.now()}`,
    rows: [
      { name: 'Gulf Horizon Services', company: 'Gulf Horizon Services W.L.L.', email: 'finance@gulfhorizon.demo', phone: '+974 4477 1190', value: '64000', service: 'Accounting only', source: 'Event', assignedActorId: 'ACT-LEILA' },
      { name: 'Pearl Gate Manufacturing', company: 'Pearl Gate Manufacturing W.L.L.', email: 'cfo@pearlgate.demo', phone: '+974 4488 6031', value: '112000', service: 'Financial-statement audit', source: 'Existing client', assignedActorId: 'ACT-MAYA' },
    ],
  })
  leadWorking.value = false
  if (result.outcome === 'COMMITTED') showLeadToast(`${result.data.importedCount} lead(s) imported; ${result.data.skippedCount} duplicate(s) skipped. No external upload was performed.`)
  else showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Relationships and decisions" title="Clients & acceptance" description="Keep the commercial relationship separate from the professional acceptance decision. Every service and reporting period gets its own assessment." action-label="New lead" @action="addClient" />
    <WorkflowGuide :guide="workflowGuides.clients" />
    <SharedAssessmentPanel v-if="sharedDemoEnabled" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>
    <div v-if="targetNotice" class="guide-status-message" role="status"><Icon name="info" :size="16" />{{ targetNotice }}</div>

    <section class="stats-strip">
      <div><span>Active clients</span><strong>{{ activeClientCount }}</strong><small>Scenario relationships with explicit IDs</small></div>
      <div><span>Awaiting partner decision</span><strong>{{ awaitingPartnerCount }}</strong><small>Holds remain visible until cleared</small></div>
      <div><span>Continuance shells</span><strong>{{ continuanceCount }}</strong><small>Next-period decisions in progress</small></div>
      <div><span>Question bank</span><strong>62 + 30</strong><small>Acceptance and annual review</small></div>
    </section>

    <section class="panel lead-register-panel">
      <div class="panel-heading"><div><span class="eyebrow">Commercial intake · CRM-inspired</span><h2>Lead register</h2></div><div class="button-row"><button type="button" class="button secondary" :disabled="sharedDemoEnabled || !canManageLeads || leadWorking" @click="importSampleLeads"><Icon name="upload" :size="16" />{{ leadWorking ? 'Working…' : 'Import demo leads' }}</button><button type="button" class="button primary" :disabled="sharedDemoEnabled || !canManageLeads" @click="addClient"><Icon name="plus" :size="16" />New lead</button></div></div>
      <div class="lead-toolbar"><label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search leads</span><input v-model="leadSearch" type="search" placeholder="Search name, company, email or source" /></label><div class="filter-row" aria-label="Lead filters"><button v-for="item in leadFilters" :key="item" type="button" :class="{ active: leadFilter === item }" @click="leadFilter = item">{{ item }}</button></div><div class="view-toggle" aria-label="Lead view"><button type="button" :class="{ active: leadView === 'list' }" aria-label="List view" :aria-pressed="leadView === 'list'" @click="leadView = 'list'"><Icon name="list" :size="16" /></button><button type="button" :class="{ active: leadView === 'grid' }" aria-label="Grid view" :aria-pressed="leadView === 'grid'" @click="leadView = 'grid'"><Icon name="grid" :size="16" /></button></div></div>
      <div v-if="leadView === 'list'" class="table-wrap responsive-table">
        <table class="lead-table">
          <thead><tr><th>Lead</th><th>Company</th><th>Value</th><th>Assigned</th><th>Status</th><th>Source</th><th>Last contact</th></tr></thead>
          <tbody>
            <tr v-for="lead in leadRows" :key="lead.id">
              <td><div class="client-cell"><span class="avatar avatar-blue">{{ lead.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ lead.name }}</strong><small>{{ lead.id }} · {{ lead.email }}</small></span></div></td>
              <td>{{ lead.company }}</td><td class="num">{{ formatMoney(Number(lead.value)) }}</td><td>{{ leadOwnerName(lead) }}</td><td><StatusPill :label="leadStatusLabel(lead.status)" :tone="leadStatusTone(lead.status)" /></td><td>{{ lead.source }}</td><td>{{ lead.lastContact || 'Not contacted' }}</td>
            </tr>
            <tr v-if="!leadRows.length"><td colspan="7" class="empty-state"><strong>No leads match this view.</strong><span>Try another filter or add a new synthetic lead.</span></td></tr>
          </tbody>
        </table>
      </div>
      <div v-else class="lead-card-grid">
        <article v-for="lead in leadRows" :key="lead.id" class="lead-card"><div class="lead-card-top"><span class="avatar avatar-blue">{{ lead.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><StatusPill :label="leadStatusLabel(lead.status)" :tone="leadStatusTone(lead.status)" /></div><h3>{{ lead.name }}</h3><p>{{ lead.company }}</p><dl><div><dt>Value</dt><dd>{{ formatMoney(Number(lead.value)) }}</dd></div><div><dt>Assigned</dt><dd>{{ leadOwnerName(lead) }}</dd></div><div><dt>Source</dt><dd>{{ lead.source }}</dd></div></dl><small class="lead-card-id">{{ lead.id }} · Created {{ lead.createdAt.slice(0, 10) }}</small></article>
        <div v-if="!leadRows.length" class="empty-side"><Icon name="users" :size="28" /><h3>No leads match this view</h3><p>Try another filter or add a new synthetic lead.</p></div>
      </div>
      <div class="panel-footnote"><Icon name="info" :size="16" /><span><strong>CRM boundary:</strong> leads are intake records only. Converting a lead still requires a client record, service-period scope, and a separate professional acceptance decision.</span></div>
    </section>

    <section class="panel client-register-panel">
      <div class="panel-heading"><div><span class="eyebrow">Practice client register</span><h2>Professional relationships</h2></div><button type="button" class="text-button" @click="filter = 'Needs decision'">Show decisions <Icon name="arrow-right" :size="15" /></button></div>
      <div class="toolbar"><label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search clients</span><input v-model="search" type="search" placeholder="Search by name, ID or service" /></label><div class="filter-row" aria-label="Client filters"><button v-for="item in filters" :key="item" type="button" :class="{ active: filter === item }" @click="filter = item">{{ item }}</button></div></div>
      <div class="table-wrap responsive-table">
        <table>
          <thead><tr><th>Client</th><th>Service route</th><th>Partner</th><th>Risk</th><th>Next review</th><th>Relationship state</th><th><span class="sr-only">Action</span></th></tr></thead>
          <tbody>
            <tr v-for="item in filteredClients" :key="item.id">
              <td><div class="client-cell"><span class="avatar" :class="`avatar-${item.tone}`">{{ item.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ item.name }}</strong><small>{{ item.id }}</small></span></div></td>
              <td>{{ item.service }}</td><td>{{ item.owner }}</td><td><span class="risk-label" :class="`risk-${item.tone}`">{{ item.risk }}</span></td><td><strong>{{ item.next }}</strong></td><td><StatusPill :label="item.status" :tone="item.tone === 'red' ? 'danger' : item.tone === 'amber' ? 'warn' : 'good'" /></td><td><button type="button" class="row-button" @click="openClient(item)">Open <Icon name="arrow-right" :size="15" /></button></td>
            </tr>
            <tr v-if="!filteredClients.length"><td colspan="7" class="empty-state"><strong>No clients match that filter.</strong><span>Try another search or clear the current filter.</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="split-grid">
      <article class="panel assessment-card">
        <div class="panel-heading"><div><span class="eyebrow">Selected assessment · {{ assessmentEngagement?.id }}</span><h2>{{ assessmentType === 'continuance' ? 'Annual continuance' : 'Client evaluation' }}</h2></div><StatusPill :label="currentAssessmentSummary.holds.length ? 'Holds present' : 'Ready for decision'" :tone="currentAssessmentSummary.holds.length ? 'warn' : 'good'" /></div>
        <div class="assessment-summary"><div class="assessment-avatar">{{ (assessmentEngagement ? scenario.clients.find((item) => item.id === assessmentEngagement.clientId)?.name : client.name)?.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</div><div><strong>{{ scenario.clients.find((item) => item.id === assessmentEngagement?.clientId)?.name || client.name }}</strong><span>{{ assessmentEngagement?.periodLabel || client.period }} · {{ assessmentEngagement?.currency || client.currency }}</span><span>Template {{ currentAssessmentSummary.assessment?.templateVersion || '—' }} · revision {{ currentAssessmentSummary.assessment?.revision || '—' }}</span></div></div>
        <div class="assessment-bar"><div><span>Responses verified</span><strong>{{ currentAssessmentSummary.verified }} / {{ currentAssessmentSummary.applicable }}</strong></div><div class="progress-line"><span :style="{ width: `${currentAssessmentSummary.completion}%` }"></span></div></div>
        <div class="hold-list"><div v-for="hold in currentAssessmentSummary.holds.slice(0, 3)" :key="`${hold.questionId}-${hold.code}`"><span class="hold-icon" :class="hold.code === 'CONFIRMED_PROHIBITION' ? 'danger' : 'warn'"><Icon name="warning" :size="15" /></span><span><strong>{{ hold.questionId }} · {{ hold.code }}</strong><small>{{ hold.message }}</small></span><StatusPill :label="hold.code === 'CONFIRMED_PROHIBITION' ? 'Non-overridable' : 'Blocking'" :tone="hold.code === 'CONFIRMED_PROHIBITION' ? 'danger' : 'warn'" /></div><div v-if="!currentAssessmentSummary.holds.length"><span class="hold-icon good"><Icon name="check" :size="15" /></span><span><strong>No current holds</strong><small>All applicable responses have a supported answer and evidence state.</small></span><StatusPill label="Clear" tone="good" /></div></div>
        <div class="decision-strip"><div><span class="eyebrow">Partner decision</span><strong>{{ assessmentDecision === 'PENDING' ? 'Not recorded' : assessmentDecision }}</strong><small>{{ sharedDemoEnabled ? 'Shared evaluation above is authoritative in this view.' : canDecide ? 'Your scoped partner authority is active.' : 'Switch to the engagement partner demo to record this decision.' }}</small></div><div class="button-row"><button v-if="canDecide" type="button" class="button secondary" :disabled="sharedDemoEnabled || decisionWorking || assessmentDecision === 'ACCEPT'" @click="recordDecision('ACCEPT')">Accept</button><button v-if="canDecide" type="button" class="button secondary" :disabled="sharedDemoEnabled || decisionWorking || assessmentDecision === 'CONTINUE'" @click="recordDecision('CONTINUE')">Continue</button><button v-if="canDecide" type="button" class="button ghost" :disabled="sharedDemoEnabled || decisionWorking || assessmentDecision === 'DECLINE'" @click="recordDecision('DECLINE')">Decline</button><StatusPill v-if="!canDecide || sharedDemoEnabled" :label="sharedDemoEnabled ? 'Use shared evaluation' : 'Decision owner: partner'" tone="neutral" /></div></div>
        <div class="card-footer"><span>Partner decision remains human-owned</span><div class="button-row"><button type="button" class="button secondary" @click="openAssessment('acceptance')">Open 62-question bank <Icon name="arrow-right" :size="16" /></button><button type="button" class="button secondary" @click="openAssessment('continuance')">Open 30-question review <Icon name="arrow-right" :size="16" /></button><button type="button" class="button primary" @click="openEngagement">Open engagement <Icon name="arrow-right" :size="16" /></button></div></div>
      </article>
      <article class="panel selected-client" v-if="selected">
        <div class="panel-heading"><div><span class="eyebrow">Client profile</span><h2>{{ selected.name }}</h2></div><button type="button" class="icon-button" aria-label="Close client profile" title="Close client profile" @click="selected = null"><Icon name="x" :size="17" /></button></div>
        <dl class="detail-list"><div><dt>Relationship ID</dt><dd>{{ selected.id }}</dd></div><div><dt>Route</dt><dd>{{ selected.service }}</dd></div><div><dt>Engagement owner</dt><dd>{{ selected.owner }}</dd></div><div><dt>Next review</dt><dd>{{ selected.next }}</dd></div><div><dt>Evidence policy</dt><dd>Preserved snapshots + scoped portal access</dd></div></dl>
        <div class="card-footer"><button type="button" class="button primary" @click="openEngagement">Open workspace <Icon name="arrow-right" :size="16" /></button></div>
      </article>
      <article class="panel empty-side" v-else><Icon name="users" :size="31" /><h3>Select a client to inspect the relationship</h3><p>Client facts, decisions, evidence and permissions remain scoped to the selected professional relationship.</p></article>
    </section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Acceptance boundary</strong> A customer record, quotation, deposit or portal login never implies professional acceptance. The partner decision is stored separately.</span></div>

    <div v-if="leadModalOpen" class="modal-backdrop" role="presentation" @click.self="closeLeadModal">
      <section class="modal-panel lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-title">
        <div class="modal-header"><div><span class="eyebrow">Synthetic commercial intake</span><h2 id="lead-title">Create a new lead</h2><p>Capture a relationship prospect first. Conversion to a client and acceptance assessment are separate controlled steps.</p></div><button type="button" class="icon-button" aria-label="Close new lead" title="Close new lead" @click="closeLeadModal"><Icon name="x" :size="17" /></button></div>
        <form class="form-grid lead-form" @submit.prevent="saveLead">
          <label>Contact name<input v-model="leadForm.name" required maxlength="160" autocomplete="off" placeholder="e.g. Aisha Rahman" /></label>
          <label>Company<input v-model="leadForm.company" required maxlength="180" autocomplete="organization" placeholder="e.g. Horizon W.L.L." /></label>
          <label>Company email<input v-model="leadForm.email" required type="email" maxlength="254" autocomplete="email" placeholder="finance@company.demo" /></label>
          <label>Phone<input v-model="leadForm.phone" maxlength="40" autocomplete="tel" placeholder="+974 4400 0000" /></label>
          <label>Estimated value (QAR)<input v-model="leadForm.value" inputmode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="50000.00" /></label>
          <label>Service route<select v-model="leadForm.service"><option v-for="service in leadServices" :key="service" :value="service">{{ service }}</option></select></label>
          <label>Source<select v-model="leadForm.source"><option v-for="source in leadSources" :key="source" :value="source">{{ source }}</option></select></label>
          <label>Assigned owner<select v-model="leadForm.assignedActorId"><option v-for="actor in scenario.actors.filter((item) => item.active && !item.roles.some((role) => ['client_finance', 'management_approver'].includes(role)))" :key="actor.id" :value="actor.id">{{ actor.name }} · {{ actor.roles[0].replaceAll('_', ' ') }}</option></select></label>
          <div class="form-span-2 lead-form-callout"><Icon name="shield" :size="17" /><span><strong>What happens next</strong><small>The lead is stored in the local synthetic register with a revision and event. No client, portal user, quote, deposit, or professional decision is created automatically.</small></span></div>
          <div class="form-span-2 modal-form-actions"><button type="button" class="button ghost" :disabled="leadWorking" @click="closeLeadModal">Cancel</button><button type="submit" class="button primary" :disabled="leadWorking">{{ leadWorking ? 'Saving…' : 'Save synthetic lead' }}</button></div>
        </form>
      </section>
    </div>

    <div v-if="assessmentOpen" class="modal-backdrop" role="presentation" @click.self="closeAssessment">
      <section class="modal-panel assessment-modal" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
        <div class="modal-header"><div><span class="eyebrow">Versioned question bank · {{ currentAssessmentSummary.assessment?.templateVersion }}</span><h2 id="assessment-title">{{ assessmentType === 'continuance' ? 'Annual continuance · 30 questions' : 'Client evaluation · 62 questions' }}</h2><p>{{ assessmentEngagement?.id }} · {{ assessmentEngagement?.periodLabel }} · synthetic responses and holds</p></div><button type="button" class="icon-button" aria-label="Close assessment" title="Close assessment" @click="closeAssessment"><Icon name="x" :size="17" /></button></div>
        <div class="assessment-tabs"><button type="button" :class="{ active: assessmentType === 'acceptance' }" @click="assessmentType = 'acceptance'; focusedQuestion = null">Acceptance · 62</button><button type="button" :class="{ active: assessmentType === 'continuance' }" @click="assessmentType = 'continuance'; focusedQuestion = null">Continuance · 30</button><label class="search-field"><Icon name="search" :size="16" /><span class="sr-only">Search questions</span><input v-model="assessmentSearch" type="search" placeholder="Search by ID or wording" /></label></div>
        <div class="assessment-modal-grid"><div class="assessment-question-list"><button v-for="item in assessmentQuestions" :key="item.question.id" type="button" class="assessment-question-row" :class="{ selected: focusedQuestion?.question.id === item.question.id }" @click="inspectQuestion(item)"><span class="question-id">{{ item.question.id }}</span><span><strong>{{ item.question.question }}</strong><small>{{ item.question.category || item.question.trigger }} · {{ item.response.applicability === 'NOT_APPLICABLE' ? 'Not applicable' : item.response.answer }} · {{ item.response.verification }}</small></span><StatusPill :label="currentAssessmentSummary.holds.some((hold) => hold.questionId === item.question.id) ? 'Hold' : item.response.answer === 'UNKNOWN' ? 'Unknown' : 'Recorded'" :tone="currentAssessmentSummary.holds.some((hold) => hold.questionId === item.question.id) ? 'danger' : item.response.answer === 'UNKNOWN' ? 'warn' : 'good'" /></button><p v-if="!assessmentQuestions.length" class="empty-state"><strong>No questions match this view.</strong><span>Use the shared evaluation panel for the authoritative response.</span></p></div><aside class="assessment-editor panel" v-if="focusedQuestion"><div class="panel-heading"><div><span class="eyebrow">{{ focusedQuestion.question.id }}</span><h3>{{ focusedQuestion.question.question }}</h3></div></div><p class="assessment-evidence"><strong>Typical evidence:</strong> {{ focusedQuestion.question.evidence || focusedQuestion.question.trigger }}</p><label>Applicability<select v-model="responseApplicability" :disabled="sharedDemoEnabled"><option value="APPLICABLE">Applicable</option><option value="NOT_APPLICABLE">Not applicable</option></select></label><label>Answer<select v-model="responseAnswer" :disabled="sharedDemoEnabled"><option>YES</option><option>NO</option><option>NO_MATCH</option><option>UNKNOWN</option><option>POSSIBLE_MATCH</option><option>CONFIRMED_PROHIBITION</option></select></label><label>Explanation / evidence reference<textarea v-model="responseExplanation" rows="5" :disabled="sharedDemoEnabled" placeholder="Add the supported reason or snapshot reference"></textarea></label><p v-if="focusedQuestion.question.professionalOnly" class="form-safety-note"><Icon name="lock" :size="15" /> Internal professional response · hidden from client portal</p><button type="button" class="button primary full-width" :disabled="sharedDemoEnabled" @click="saveResponse">{{ sharedDemoEnabled ? 'Use shared evaluation' : 'Record response' }}</button></aside><aside v-else class="assessment-editor panel empty-side"><Icon name="list-check" :size="28" /><h3>Select a question</h3><p>Review the exact wording, applicability and evidence expectation before recording a synthetic response.</p></aside></div>
        <div class="modal-footer"><span><Icon name="info" :size="16" />Unknown or missing evidence remains a hold; Not applicable always needs a rationale. A favorable partner decision is not inferred from this screen.</span><button type="button" class="button secondary" @click="closeAssessment">Done reviewing</button></div>
      </section>
    </div>
  </div>
</template>
