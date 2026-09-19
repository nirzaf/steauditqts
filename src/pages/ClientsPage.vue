<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import SharedAssessmentPanel from '../components/SharedAssessmentPanel.vue'
import Icon from '../components/Icon.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { client, formatMoney, portfolioClients, workflowGuides } from '../data'
import { activeActor, actorById, assessmentSummary, clientGroupById, clientGroups, convertLeadToClient, createClientGroup, createLead, engagementById, importLeadFixtures, qualifyLead, recordAssessmentDecision, scenario, saveAssessmentResponse, selectEngagement } from '../domain/scenario.js'
import { createSharedLead, qualifySharedLead, convertSharedLeadToClient, createSharedClientGroup } from '../sharedDemo.js'
import { visibleResponses } from '../domain/assessments.js'
import { recordTargetFor } from '../navigation/recordTargets.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const search = ref('')
const filter = ref('All clients')
const groupFilter = ref('All groups')
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
const convertModalOpen = ref(false)
const convertWorking = ref(false)
const selectedLeadForConversion = ref(null)
const convertForm = ref({ clientName: '', registration: '', service: 'Financial-statement audit', period: 'FY2026', groupId: '', newGroupName: '' })
const leadForm = ref({ name: '', company: '', email: '', phone: '', value: '0.00', service: 'Financial-statement audit', source: 'Referral', assignedActorId: 'ACT-OMAR' })
const filters = ['All clients', 'Needs decision', 'In delivery', 'Low risk']
const leadFilters = ['All leads', 'Needs follow-up', 'Qualified']
const leadServices = ['Financial-statement audit', 'Accounting only', 'Internal audit', 'Review engagement']
const leadSources = ['Referral', 'Website', 'Existing client', 'Event']

const availableGroups = computed(() => clientGroups())

const leadRows = computed(() => (scenario.leads || []).filter((lead) => {
  const query = leadSearch.value.trim().toLowerCase()
  const matchesSearch = !query || `${lead.name} ${lead.company} ${lead.email} ${lead.id} ${lead.source}`.toLowerCase().includes(query)
  const matchesFilter = leadFilter.value === 'All leads' || (leadFilter.value === 'Needs follow-up' && lead.status === 'PENDING') || (leadFilter.value === 'Qualified' && lead.status === 'QUALIFIED')
  return matchesSearch && matchesFilter
}))
const leadOwnerName = (lead) => actorById(lead.assignedActorId)?.name || 'Unassigned'
const leadStatusTone = (status) => ['QUALIFIED', 'CONVERTED'].includes(status) ? 'good' : status === 'CLOSED' ? 'neutral' : 'warn'
const leadStatusLabel = (status) => status === 'QUALIFIED' ? 'Qualified' : status === 'CONVERTED' ? 'Converted' : status === 'CLOSED' ? 'Closed' : 'Pending'
const canManageLeads = computed(() => Boolean(activeActor()?.roles?.some((role) => ['system_admin', 'engagement_partner', 'compliance_reviewer', 'audit_manager'].includes(role))))
const activeClientCount = computed(() => scenario.clients.length)
const awaitingPartnerCount = computed(() => scenario.engagements.filter((engagement) => {
  const assessment = scenario.assessments.find((item) => item.engagementId === engagement.id && item.type === 'acceptance')
  return !assessment?.decision || assessmentSummary(engagement.id, 'acceptance').holds.length > 0
}).length)
const continuanceCount = computed(() => scenario.renewalCases.filter((item) => ['PENDING_ASSESSMENT', 'RENEWED_PENDING_TERMS'].includes(item.state)).length)

const clientList = computed(() => {
  const list = (scenario.clients || []).map((c) => {
    const group = (scenario.clientGroups || []).find((g) => g.id === c.groupId)
    const engagement = scenario.engagements.find((e) => e.clientId === c.id)
    return {
      id: c.id,
      name: c.name,
      groupId: c.groupId,
      groupName: group ? group.name : '',
      service: engagement?.serviceLabel || (c.services?.includes('accounting') ? 'Accounting only' : 'Financial-statement audit'),
      owner: (engagement?.team?.find((t) => t.role === 'engagement_partner')?.actorName) || 'Maya Rahman',
      risk: c.id === 'CLI-0018' ? 'Medium' : 'Low',
      status: engagement?.auditCommenced ? 'Fieldwork' : engagement?.evidence?.accepted ? 'Commercial / Planning' : 'Acceptance hold',
      next: '15 Sep 2026',
      tone: c.id === 'CLI-0018' ? 'blue' : 'green',
    }
  })
  return list.length ? list : portfolioClients
})

const filteredClients = computed(() => clientList.value.filter((item) => {
  const query = search.value.trim().toLowerCase()
  const matchesSearch = !query || `${item.name} ${item.id} ${item.service} ${item.groupName || ''}`.toLowerCase().includes(query)
  const matchesFilter = filter.value === 'All clients'
    || (filter.value === 'Needs decision' && (item.status === 'Acceptance hold' || item.risk === 'High'))
    || (filter.value === 'In delivery' && ['Fieldwork', 'Statements review', 'Planning'].includes(item.status))
    || (filter.value === 'Low risk' && item.risk === 'Low')
  const matchesGroup = groupFilter.value === 'All groups' || item.groupId === groupFilter.value
  return matchesSearch && matchesFilter && matchesGroup
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

async function saveLead() {
  if (leadWorking.value) return
  leadWorking.value = true
  try {
    if (sharedDemoEnabled) {
      const result = await createSharedLead({
        ...leadForm.value,
        idempotencyKey: `lead-create-${Date.now()}`,
      })
      if (result.ok) {
        leadModalOpen.value = false
        showLeadToast('Lead added to the shared lead register. Qualification stays separate from client acceptance.')
      } else {
        showLeadToast(`Error: ${result.error?.message || 'Failed to create lead'}`)
      }
    } else {
      const result = createLead({
        ...leadForm.value,
        actorPersonaId: activeActor()?.personaId,
        expectedSessionEpoch: activeActor()?.sessionEpoch,
        idempotencyKey: `lead-create-${Date.now()}`,
      })
      if (result.outcome === 'COMMITTED') {
        leadModalOpen.value = false
        showLeadToast(`${result.data.id} added to the synthetic lead register. Qualification stays separate from client acceptance.`)
      } else {
        showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
      }
    }
  } finally {
    leadWorking.value = false
  }
}

async function qualifyLeadAction(lead) {
  if (leadWorking.value) return
  leadWorking.value = true
  try {
    if (sharedDemoEnabled) {
      const result = await qualifySharedLead(lead.id, {
        rationale: 'Qualified via commercial intake review.',
        idempotencyKey: `lead-qualify-${lead.id}-${Date.now()}`,
      })
      if (result.ok) {
        showLeadToast(`Lead ${lead.id} qualified. Ready for conversion to client.`)
      } else {
        showLeadToast(`Error: ${result.error?.message || 'Failed to qualify lead'}`)
      }
    } else {
      const result = qualifyLead({
        leadId: lead.id,
        actorPersonaId: activeActor()?.personaId,
        expectedSessionEpoch: activeActor()?.sessionEpoch,
        idempotencyKey: `lead-qualify-${lead.id}-${Date.now()}`,
      })
      if (result.outcome === 'COMMITTED') {
        showLeadToast(`Lead ${lead.id} qualified. Ready for conversion to client.`)
      } else {
        showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
      }
    }
  } finally {
    leadWorking.value = false
  }
}

function openConvertModal(lead) {
  selectedLeadForConversion.value = lead
  convertForm.value = {
    clientName: lead.company || lead.name,
    registration: '',
    service: lead.service || 'Financial-statement audit',
    period: 'FY2026',
    groupId: '',
    newGroupName: '',
  }
  convertModalOpen.value = true
}

function closeConvertModal() {
  if (!convertWorking.value) {
    convertModalOpen.value = false
    selectedLeadForConversion.value = null
  }
}

async function convertLeadAction() {
  if (convertWorking.value || !selectedLeadForConversion.value) return
  convertWorking.value = true
  try {
    let targetGroupId = convertForm.value.groupId || null
    if (!targetGroupId && convertForm.value.newGroupName.trim()) {
      if (sharedDemoEnabled) {
        const groupRes = await createSharedClientGroup({
          name: convertForm.value.newGroupName.trim(),
          idempotencyKey: `group-create-${Date.now()}`,
        })
        if (groupRes.ok && groupRes.data?.id) {
          targetGroupId = groupRes.data.id
        }
      } else {
        const groupRes = createClientGroup({
          name: convertForm.value.newGroupName.trim(),
          actorPersonaId: activeActor()?.personaId,
          expectedSessionEpoch: activeActor()?.sessionEpoch,
          idempotencyKey: `group-create-${Date.now()}`,
        })
        if (groupRes.outcome === 'COMMITTED' && groupRes.data?.id) {
          targetGroupId = groupRes.data.id
        }
      }
    }

    if (sharedDemoEnabled) {
      const result = await convertSharedLeadToClient(selectedLeadForConversion.value.id, {
        clientName: convertForm.value.clientName,
        registration: convertForm.value.registration,
        groupId: targetGroupId,
        service: convertForm.value.service,
        period: convertForm.value.period,
        idempotencyKey: `lead-convert-${selectedLeadForConversion.value.id}-${Date.now()}`,
      })
      if (result.ok) {
        convertModalOpen.value = false
        selectedLeadForConversion.value = null
        showLeadToast('Lead converted to client. Acceptance assessment initialized (unaccepted) and draft engagement created.')
      } else {
        showLeadToast(`Error: ${result.error?.message || 'Failed to convert lead'}`)
      }
    } else {
      const result = convertLeadToClient({
        leadId: selectedLeadForConversion.value.id,
        clientName: convertForm.value.clientName,
        registration: convertForm.value.registration,
        groupId: targetGroupId,
        service: convertForm.value.service,
        period: convertForm.value.period,
        actorPersonaId: activeActor()?.personaId,
        expectedSessionEpoch: activeActor()?.sessionEpoch,
        idempotencyKey: `lead-convert-${selectedLeadForConversion.value.id}-${Date.now()}`,
      })
      if (result.outcome === 'COMMITTED') {
        convertModalOpen.value = false
        selectedLeadForConversion.value = null
        showLeadToast(`${result.data.clientId} created from lead. Client acceptance case initialized (unaccepted) and draft engagement created.`)
      } else {
        showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
      }
    }
  } finally {
    convertWorking.value = false
  }
}

async function importSampleLeads() {
  if (leadWorking.value) return
  leadWorking.value = true
  try {
    const samples = [
      { name: 'Gulf Horizon Services', company: 'Gulf Horizon Services W.L.L.', email: 'finance@gulfhorizon.demo', phone: '+974 4477 1190', value: '64000', service: 'Accounting only', source: 'Event', assignedActorId: 'ACT-LEILA' },
      { name: 'Pearl Gate Manufacturing', company: 'Pearl Gate Manufacturing W.L.L.', email: 'cfo@pearlgate.demo', phone: '+974 4488 6031', value: '112000', service: 'Financial-statement audit', source: 'Existing client', assignedActorId: 'ACT-MAYA' },
    ]
    if (sharedDemoEnabled) {
      for (const sample of samples) {
        await createSharedLead({ ...sample, idempotencyKey: `lead-import-${sample.email}-${Date.now()}` })
      }
      showLeadToast('Sample leads imported into shared demo.')
    } else {
      const result = importLeadFixtures({
        actorPersonaId: activeActor()?.personaId,
        expectedSessionEpoch: activeActor()?.sessionEpoch,
        idempotencyKey: `lead-import-demo-${Date.now()}`,
        rows: samples,
      })
      if (result.outcome === 'COMMITTED') showLeadToast(`${result.data.importedCount} lead(s) imported; ${result.data.skippedCount} duplicate(s) skipped. No external upload was performed.`)
      else showLeadToast(`${result.outcome}: ${result.code} — ${result.message}`)
    }
  } finally {
    leadWorking.value = false
  }
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
      <div class="panel-heading"><div><span class="eyebrow">Commercial intake · CRM-inspired</span><h2>Lead register</h2></div><div class="button-row"><button type="button" class="button secondary" :disabled="!canManageLeads || leadWorking" @click="importSampleLeads"><Icon name="upload" :size="16" />{{ leadWorking ? 'Working…' : 'Import demo leads' }}</button><button type="button" class="button primary" :disabled="!canManageLeads" @click="addClient"><Icon name="plus" :size="16" />New lead</button></div></div>
      <div class="lead-toolbar"><label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search leads</span><input v-model="leadSearch" name="lead-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search name, company, email or source…" /></label><div class="filter-row" aria-label="Lead filters"><button v-for="item in leadFilters" :key="item" type="button" :class="{ active: leadFilter === item }" @click="leadFilter = item">{{ item }}</button></div><div class="view-toggle" aria-label="Lead view"><button type="button" :class="{ active: leadView === 'list' }" aria-label="List view" :aria-pressed="leadView === 'list'" @click="leadView = 'list'"><Icon name="list" :size="16" /></button><button type="button" :class="{ active: leadView === 'grid' }" aria-label="Grid view" :aria-pressed="leadView === 'grid'" @click="leadView = 'grid'"><Icon name="grid" :size="16" /></button></div></div>
      <div v-if="leadView === 'list'" class="table-wrap responsive-table">
        <table class="lead-table">
          <thead><tr><th>Lead</th><th>Company</th><th>Value</th><th>Assigned</th><th>Status</th><th>Source</th><th>Last contact</th><th>Action</th></tr></thead>
          <tbody>
            <tr v-for="lead in leadRows" :key="lead.id">
              <td><div class="client-cell"><span class="avatar avatar-blue">{{ lead.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ lead.name }}</strong><small>{{ lead.id }} · {{ lead.email }}</small></span></div></td>
              <td>{{ lead.company }}</td><td class="num">{{ formatMoney(Number(lead.value)) }}</td><td>{{ leadOwnerName(lead) }}</td><td><StatusPill :label="leadStatusLabel(lead.status)" :tone="leadStatusTone(lead.status)" /></td><td>{{ lead.source }}</td><td>{{ lead.lastContact || 'Not contacted' }}</td>
              <td>
                <div class="button-row" style="gap: 6px;">
                  <button v-if="lead.status === 'PENDING'" type="button" class="button secondary" style="padding: 4px 10px; font-size: 0.75rem;" :disabled="!canManageLeads || leadWorking" @click="qualifyLeadAction(lead)">Qualify</button>
                  <button v-else-if="lead.status === 'QUALIFIED'" type="button" class="button primary" style="padding: 4px 10px; font-size: 0.75rem;" :disabled="!canManageLeads || leadWorking" @click="openConvertModal(lead)">Convert</button>
                  <span v-else-if="lead.status === 'CONVERTED'" class="text-muted" style="font-size: 0.75rem; color: var(--good);"><Icon name="check" :size="13" /> Converted</span>
                </div>
              </td>
            </tr>
            <tr v-if="!leadRows.length"><td colspan="8" class="empty-state"><strong>No leads match this view.</strong><span>Try another filter or add a new synthetic lead.</span></td></tr>
          </tbody>
        </table>
      </div>
      <div v-else class="lead-card-grid">
        <article v-for="lead in leadRows" :key="lead.id" class="lead-card">
          <div class="lead-card-top"><span class="avatar avatar-blue">{{ lead.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><StatusPill :label="leadStatusLabel(lead.status)" :tone="leadStatusTone(lead.status)" /></div>
          <h3>{{ lead.name }}</h3>
          <p>{{ lead.company }}</p>
          <dl><div><dt>Value</dt><dd>{{ formatMoney(Number(lead.value)) }}</dd></div><div><dt>Assigned</dt><dd>{{ leadOwnerName(lead) }}</dd></div><div><dt>Source</dt><dd>{{ lead.source }}</dd></div></dl>
          <small class="lead-card-id">{{ lead.id }} · Created {{ lead.createdAt.slice(0, 10) }}</small>
          <div class="card-footer" style="padding: 8px 0 0; margin-top: 6px; border-top: 1px solid var(--line);">
            <button v-if="lead.status === 'PENDING'" type="button" class="button secondary full-width" style="padding: 4px 8px; font-size: 0.75rem;" :disabled="!canManageLeads || leadWorking" @click="qualifyLeadAction(lead)">Qualify lead</button>
            <button v-else-if="lead.status === 'QUALIFIED'" type="button" class="button primary full-width" style="padding: 4px 8px; font-size: 0.75rem;" :disabled="!canManageLeads || leadWorking" @click="openConvertModal(lead)">Convert to client</button>
            <span v-else-if="lead.status === 'CONVERTED'" style="font-size: 0.75rem; color: var(--good); display: flex; align-items: center; justify-content: center; gap: 4px;"><Icon name="check" :size="13" /> Converted</span>
          </div>
        </article>
        <div v-if="!leadRows.length" class="empty-side"><Icon name="users" :size="28" /><h3>No leads match this view</h3><p>Try another filter or add a new synthetic lead.</p></div>
      </div>
      <div class="panel-footnote"><Icon name="info" :size="16" /><span><strong>CRM boundary:</strong> leads are intake records only. Converting a lead creates a client record, service-period scope, and an unaccepted acceptance assessment. Professional acceptance remains separate.</span></div>
    </section>

    <section class="panel client-register-panel">
      <div class="panel-heading"><div><span class="eyebrow">Practice client register</span><h2>Professional relationships</h2></div><button type="button" class="text-button" @click="filter = 'Needs decision'">Show decisions <Icon name="arrow-right" :size="15" /></button></div>
      <div class="toolbar">
        <label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search clients</span><input v-model="search" name="client-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search by name, ID, group or service…" /></label>
        <div class="filter-row" aria-label="Client filters"><button v-for="item in filters" :key="item" type="button" :class="{ active: filter === item }" @click="filter = item">{{ item }}</button></div>
        <select v-model="groupFilter" name="client-group-filter" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); font-size: 0.8rem; background: #fff;">
          <option value="All groups">All groups</option>
          <option v-for="group in availableGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
      </div>
      <div class="table-wrap responsive-table">
        <table>
          <thead><tr><th>Client</th><th>Group</th><th>Service route</th><th>Partner</th><th>Risk</th><th>Next review</th><th>Relationship state</th><th><span class="sr-only">Action</span></th></tr></thead>
          <tbody>
            <tr v-for="item in filteredClients" :key="item.id">
              <td><div class="client-cell"><span class="avatar" :class="`avatar-${item.tone}`">{{ item.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ item.name }}</strong><small>{{ item.id }}</small></span></div></td>
              <td>
                <span v-if="item.groupName" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; background: var(--soft-blue); color: var(--primary); font-size: 0.72rem; font-weight: 500;" :title="`Group ID: ${item.groupId}`">
                  <Icon name="folder" :size="12" /> {{ item.groupName }}
                </span>
                <span v-else style="color: var(--subtle); font-size: 0.75rem;">—</span>
              </td>
              <td>{{ item.service }}</td><td>{{ item.owner }}</td><td><span class="risk-label" :class="`risk-${item.tone}`">{{ item.risk }}</span></td><td><strong>{{ item.next }}</strong></td><td><StatusPill :label="item.status" :tone="item.tone === 'red' ? 'danger' : item.tone === 'amber' ? 'warn' : 'good'" /></td><td><button type="button" class="row-button" @click="openClient(item)">Open <Icon name="arrow-right" :size="15" /></button></td>
            </tr>
            <tr v-if="!filteredClients.length"><td colspan="8" class="empty-state"><strong>No clients match that filter.</strong><span>Try another search or clear the current filter.</span></td></tr>
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
        <dl class="detail-list">
          <div><dt>Relationship ID</dt><dd>{{ selected.id }}</dd></div>
          <div><dt>Client Group</dt><dd>{{ selected.groupName || 'Standalone (No group)' }}</dd></div>
          <div><dt>Route</dt><dd>{{ selected.service }}</dd></div>
          <div><dt>Engagement owner</dt><dd>{{ selected.owner }}</dd></div>
          <div><dt>Next review</dt><dd>{{ selected.next }}</dd></div>
          <div><dt>Evidence policy</dt><dd>Preserved snapshots + scoped portal access</dd></div>
        </dl>
        <div class="card-footer"><button type="button" class="button primary" @click="openEngagement">Open workspace <Icon name="arrow-right" :size="16" /></button></div>
      </article>
      <article class="panel empty-side" v-else><Icon name="users" :size="31" /><h3>Select a client to inspect the relationship</h3><p>Client facts, decisions, evidence and permissions remain scoped to the selected professional relationship.</p></article>
    </section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Acceptance boundary</strong> A customer record, quotation, deposit or portal login never implies professional acceptance. The partner decision is stored separately.</span></div>

    <div v-if="leadModalOpen" class="modal-backdrop" role="presentation" @click.self="closeLeadModal">
      <section class="modal-panel lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-title">
        <div class="modal-header"><div><span class="eyebrow">Synthetic commercial intake</span><h2 id="lead-title">Create a new lead</h2><p>Capture a relationship prospect first. Conversion to a client and acceptance assessment are separate controlled steps.</p></div><button type="button" class="icon-button" aria-label="Close new lead" title="Close new lead" @click="closeLeadModal"><Icon name="x" :size="17" /></button></div>
        <form class="form-grid lead-form" @submit.prevent="saveLead">
          <label>Contact name<input v-model="leadForm.name" name="lead-contact-name" required maxlength="160" autocomplete="name" placeholder="e.g. Aisha Rahman…" /></label>
          <label>Company<input v-model="leadForm.company" name="lead-company" required maxlength="180" autocomplete="organization" placeholder="e.g. Horizon W.L.L.…" /></label>
          <label>Company email<input v-model="leadForm.email" name="lead-company-email" required type="email" maxlength="254" autocomplete="email" placeholder="finance@company.demo…" /></label>
          <label>Phone<input v-model="leadForm.phone" name="lead-phone" maxlength="40" autocomplete="tel" placeholder="+974 4400 0000…" /></label>
          <label>Estimated value (QAR)<input v-model="leadForm.value" name="lead-value" type="text" inputmode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="50000.00…" /></label>
          <label>Service route<select v-model="leadForm.service" name="lead-service"><option v-for="service in leadServices" :key="service" :value="service">{{ service }}</option></select></label>
          <label>Source<select v-model="leadForm.source" name="lead-source"><option v-for="source in leadSources" :key="source" :value="source">{{ source }}</option></select></label>
          <label>Assigned owner<select v-model="leadForm.assignedActorId" name="lead-owner"><option v-for="actor in scenario.actors.filter((item) => item.active && !item.roles.some((role) => ['client_finance', 'management_approver'].includes(role)))" :key="actor.id" :value="actor.id">{{ actor.name }} · {{ actor.roles[0].replaceAll('_', ' ') }}</option></select></label>
          <div class="form-span-2 lead-form-callout"><Icon name="shield" :size="17" /><span><strong>What happens next</strong><small>The lead is stored in the lead register with a revision and event. No client, portal user, quote, deposit, or professional decision is created automatically.</small></span></div>
          <div class="form-span-2 modal-form-actions"><button type="button" class="button ghost" :disabled="leadWorking" @click="closeLeadModal">Cancel</button><button type="submit" class="button primary" :disabled="leadWorking">{{ leadWorking ? 'Saving…' : 'Save synthetic lead' }}</button></div>
        </form>
      </section>
    </div>

    <!-- Lead Conversion Modal -->
    <div v-if="convertModalOpen" class="modal-backdrop" role="presentation" @click.self="closeConvertModal">
      <section class="modal-panel lead-modal" role="dialog" aria-modal="true" aria-labelledby="convert-title">
        <div class="modal-header">
          <div>
            <span class="eyebrow">Commercial intake · Stage 2</span>
            <h2 id="convert-title">Convert Lead to Client</h2>
            <p>Convert {{ selectedLeadForConversion?.name }} ({{ selectedLeadForConversion?.id }}) into an official client record. Creates a draft engagement shell and initializes an unaccepted client acceptance assessment.</p>
          </div>
          <button type="button" class="icon-button" aria-label="Close conversion modal" title="Close conversion modal" @click="closeConvertModal">
            <Icon name="x" :size="17" />
          </button>
        </div>
        <form class="form-grid lead-form" @submit.prevent="convertLeadAction">
          <label>Legal client entity name
            <input v-model="convertForm.clientName" name="convert-client-name" required maxlength="180" placeholder="e.g. Gulf Horizon Services W.L.L.…" />
          </label>
          <label>Commercial Registration (CR)
            <input v-model="convertForm.registration" name="convert-cr" maxlength="60" placeholder="e.g. CR-90234-QA…" />
          </label>
          <label>Service route
            <select v-model="convertForm.service" name="convert-service">
              <option value="Financial-statement audit">Financial-statement audit</option>
              <option value="Accounting only">Accounting only</option>
              <option value="Internal audit">Internal audit</option>
              <option value="Review engagement">Review engagement</option>
            </select>
          </label>
          <label>Reporting period
            <input v-model="convertForm.period" name="convert-period" required maxlength="30" placeholder="e.g. FY2026…" />
          </label>
          <label>Assign to existing Client Group (optional)
            <select v-model="convertForm.groupId" name="convert-group">
              <option value="">No group (Standalone entity)</option>
              <option v-for="g in availableGroups" :key="g.id" :value="g.id">{{ g.name }} ({{ g.id }})</option>
            </select>
          </label>
          <label v-if="!convertForm.groupId">Or create new Client Group (optional)
            <input v-model="convertForm.newGroupName" name="convert-new-group" maxlength="120" placeholder="e.g. Gulf Horizon Holdings Group…" />
          </label>
          <div class="form-span-2 lead-form-callout">
            <Icon name="shield" :size="17" />
            <span>
              <strong>Professional boundary:</strong>
              Conversion creates a Client record, primary Client Contact, draft Engagement shell, and unaccepted Acceptance case. It does <strong>not</strong> grant professional acceptance or authorize audit fieldwork.
            </span>
          </div>
          <div class="form-span-2 modal-form-actions">
            <button type="button" class="button ghost" :disabled="convertWorking" @click="closeConvertModal">Cancel</button>
            <button type="submit" class="button primary" :disabled="convertWorking">{{ convertWorking ? 'Converting…' : 'Convert to client & initialize' }}</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="assessmentOpen" class="modal-backdrop" role="presentation" @click.self="closeAssessment">
      <section class="modal-panel assessment-modal" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
        <div class="modal-header"><div><span class="eyebrow">Versioned question bank · {{ currentAssessmentSummary.assessment?.templateVersion }}</span><h2 id="assessment-title">{{ assessmentType === 'continuance' ? 'Annual continuance · 30 questions' : 'Client evaluation · 62 questions' }}</h2><p>{{ assessmentEngagement?.id }} · {{ assessmentEngagement?.periodLabel }} · synthetic responses and holds</p></div><button type="button" class="icon-button" aria-label="Close assessment" title="Close assessment" @click="closeAssessment"><Icon name="x" :size="17" /></button></div>
        <div class="assessment-tabs"><button type="button" :class="{ active: assessmentType === 'acceptance' }" @click="assessmentType = 'acceptance'; focusedQuestion = null">Acceptance · 62</button><button type="button" :class="{ active: assessmentType === 'continuance' }" @click="assessmentType = 'continuance'; focusedQuestion = null">Continuance · 30</button><label class="search-field"><Icon name="search" :size="16" /><span class="sr-only">Search questions</span><input v-model="assessmentSearch" name="assessment-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search by ID or wording…" /></label></div>
        <div class="assessment-modal-grid"><div class="assessment-question-list"><button v-for="item in assessmentQuestions" :key="item.question.id" type="button" class="assessment-question-row" :class="{ selected: focusedQuestion?.question.id === item.question.id }" @click="inspectQuestion(item)"><span class="question-id">{{ item.question.id }}</span><span><strong>{{ item.question.question }}</strong><small>{{ item.question.category || item.question.trigger }} · {{ item.response.applicability === 'NOT_APPLICABLE' ? 'Not applicable' : item.response.answer }} · {{ item.response.verification }}</small></span><StatusPill :label="currentAssessmentSummary.holds.some((hold) => hold.questionId === item.question.id) ? 'Hold' : item.response.answer === 'UNKNOWN' ? 'Unknown' : 'Recorded'" :tone="currentAssessmentSummary.holds.some((hold) => hold.questionId === item.question.id) ? 'danger' : item.response.answer === 'UNKNOWN' ? 'warn' : 'good'" /></button><p v-if="!assessmentQuestions.length" class="empty-state"><strong>No questions match this view.</strong><span>Use the shared evaluation panel for the authoritative response.</span></p></div><aside class="assessment-editor panel" v-if="focusedQuestion"><div class="panel-heading"><div><span class="eyebrow">{{ focusedQuestion.question.id }}</span><h3>{{ focusedQuestion.question.question }}</h3></div></div><p class="assessment-evidence"><strong>Typical evidence:</strong> {{ focusedQuestion.question.evidence || focusedQuestion.question.trigger }}</p><label>Applicability<select v-model="responseApplicability" name="assessment-applicability-local" :disabled="sharedDemoEnabled"><option value="APPLICABLE">Applicable</option><option value="NOT_APPLICABLE">Not applicable</option></select></label><label>Answer<select v-model="responseAnswer" name="assessment-answer-local" :disabled="sharedDemoEnabled"><option>YES</option><option>NO</option><option>NO_MATCH</option><option>UNKNOWN</option><option>POSSIBLE_MATCH</option><option>CONFIRMED_PROHIBITION</option></select></label><label>Explanation / evidence reference<textarea v-model="responseExplanation" name="assessment-explanation-local" rows="5" :disabled="sharedDemoEnabled" placeholder="Add the supported reason or snapshot reference…"></textarea></label><p v-if="focusedQuestion.question.professionalOnly" class="form-safety-note"><Icon name="lock" :size="15" /> Internal professional response · hidden from client portal</p><button type="button" class="button primary full-width" :disabled="sharedDemoEnabled" @click="saveResponse">{{ sharedDemoEnabled ? 'Use shared evaluation' : 'Record response' }}</button></aside><aside v-else class="assessment-editor panel empty-side"><Icon name="list-check" :size="28" /><h3>Select a question</h3><p>Review the exact wording, applicability and evidence expectation before recording a synthetic response.</p></aside></div>
        <div class="modal-footer"><span><Icon name="info" :size="16" />Unknown or missing evidence remains a hold; Not applicable always needs a rationale. A favorable partner decision is not inferred from this screen.</span><button type="button" class="button secondary" @click="closeAssessment">Done reviewing</button></div>
      </section>
    </div>
  </div>
</template>
