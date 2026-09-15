<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import NextBestActionCard from '../components/NextBestActionCard.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import SharedTimeline from '../components/SharedTimeline.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { client, timeline, workflowGuides } from '../data'
import { activateEngagement, activationBlockers, activationFor, activeActor, createContinuanceShell, gateSummary, renewalCaseFor, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement, selectEngagement, termsFor } from '../domain/scenario.js'

const emit = defineEmits(['navigate'])
const sharedEnabled = sharedDemoEnabled
const activeTab = ref('Summary')
const tabs = ['Summary', 'Timeline', 'Team & scope']
const selectedGate = ref(4)
const actionWorking = ref(false)
const toast = ref('')
const statusLabels = { good: 'Satisfied', warn: 'In review', danger: 'Blocked', neutral: 'Planned' }

const selectedEngagement = computed(() => scenarioEngagement())
const selectedClient = computed(() => scenarioClient())
const gateState = computed(() => gateSummary(selectedEngagement.value?.id))
const gates = computed(() => gateState.value.gates)
const readyCount = computed(() => gateState.value.currentReady)
const selectedGateInfo = computed(() => gates.value[selectedGate.value] || gates.value[0])
const engagementOptions = computed(() => scenario.engagements.filter((item) => activeActor()?.assignments?.includes(item.id)))
const terms = computed(() => termsFor(selectedEngagement.value?.id))
const activation = computed(() => activationFor(selectedEngagement.value?.id))
const blockers = computed(() => activationBlockers(selectedEngagement.value?.id))
const renewal = computed(() => renewalCaseFor(selectedEngagement.value?.id))
const canActivate = computed(() => Boolean(activeActor()?.roles?.includes('engagement_partner')))
function navigate(route) { emit('navigate', route) }

function changeEngagement(event) {
  if (sharedEnabled) {
    event.target.value = selectedEngagement.value?.id || ''
    toast.value = 'Use the global shared context selector to change the authoritative engagement.'
    return
  }
  const engagementId = event.target.value
  selectEngagement(engagementId, { actorPersonaId: activeActor()?.personaId })
  selectedGate.value = 0
}

function showResult(result, successMessage) {
  toast.value = result.outcome === 'COMMITTED' ? successMessage : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function activate() {
  if (sharedEnabled) {
    toast.value = 'Commencement controls are read-only here; use a server-authorized shared handoff.'
    return
  }
  if (actionWorking.value || !selectedEngagement.value) return
  actionWorking.value = true
  const result = activateEngagement({ engagementId: selectedEngagement.value.id, actorPersonaId: activeActor()?.personaId, expectedRevision: selectedEngagement.value.revision, idempotencyKey: `activate-${selectedEngagement.value.id}-${selectedEngagement.value.revision}` })
  actionWorking.value = false
  showResult(result, `${selectedEngagement.value.id} is now active for the synthetic walkthrough.`)
}

function createShell() {
  if (sharedEnabled) {
    toast.value = 'Continuance shells are read-only here; use the shared workflow owner action.'
    return
  }
  if (actionWorking.value || !selectedEngagement.value) return
  actionWorking.value = true
  const result = createContinuanceShell({ sourceEngagementId: selectedEngagement.value.id, actorPersonaId: activeActor()?.personaId, expectedRevision: selectedEngagement.value.revision, idempotencyKey: `shell-${selectedEngagement.value.id}-${selectedEngagement.value.revision}` })
  actionWorking.value = false
  showResult(result, `${result.data?.shellEngagementId || 'Next-period shell'} created with copied facts and fresh continuance responses.`)
}
</script>

<template>
  <div class="page">
    <PageHeader :eyebrow="`Engagement workspace · ${selectedEngagement.id}`" :title="selectedClient.name" :description="`${selectedEngagement.serviceLabel} · ${selectedEngagement.periodLabel} · ${selectedEngagement.currency}. Planning and PBC work can continue only within this selected scope.`" action-label="Open PBC workspace" @action="navigate('pbc')" />
    <WorkflowGuide :guide="workflowGuides.engagements" />
    <NextBestActionCard v-if="sharedEnabled" title="Next best action for the shared engagement" @navigate="navigate" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="panel engagement-selector"><div><span class="eyebrow">Selected service-period scope</span><strong>Every command is revision-bound to one engagement</strong><small>{{ sharedEnabled ? 'Use the global shared context selector to change the authoritative engagement.' : 'Use the selector to demonstrate how accounting-only and audit routes keep separate gates and authorities.' }}</small></div><label>Engagement<select :value="selectedEngagement.id" :disabled="sharedEnabled" @change="changeEngagement"><option v-for="item in engagementOptions" :key="item.id" :value="item.id">{{ item.id }} · {{ item.serviceLabel }} · {{ item.period }}</option></select></label></section>

    <section class="engagement-hero panel">
      <div class="engagement-identity"><div class="large-avatar">{{ selectedClient.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</div><div><div class="title-line"><h2>{{ selectedEngagement.periodLabel }}</h2><StatusPill :label="selectedEngagement.service === 'audit' ? 'Fieldwork in progress' : 'Preparation in progress'" tone="warn" /></div><p>{{ selectedEngagement.serviceLabel }} · {{ selectedEngagement.currency }} · {{ selectedClient.name }}</p><div class="tag-row"><span class="tag">{{ selectedEngagement.service === 'audit' ? 'Independent auditor route' : 'Accounting-only route' }}</span><span class="tag">{{ selectedEngagement.evidence.eqrRequired ? 'EQR required' : 'EQR not applicable' }}</span><span class="tag">Client {{ selectedClient.id }} · explicit scope</span></div></div></div>
      <div class="engagement-kpis"><div><span>Current gates ready</span><strong>{{ readyCount }} / {{ gateState.currentDenominator }}</strong><small>G10 is shown separately as next-period permission</small></div><div><span>Input generation</span><strong>g{{ selectedEngagement.inputGeneration }}</strong><small>Revision {{ selectedEngagement.revision }} · policy g{{ selectedEngagement.policyGeneration }}</small></div><div><span>Next deadline</span><strong>15 Sep</strong><small>Scoped to {{ selectedClient.name }}</small></div></div>
    </section>

    <section class="split-grid engagement-controls">
      <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Commencement control</span><h2>{{ activation?.state === 'ACTIVE' ? 'Engagement active' : 'Activation readiness' }}</h2></div><StatusPill :label="activation?.state || 'PENDING'" :tone="activation?.state === 'ACTIVE' ? 'good' : blockers.length ? 'danger' : 'warn'" /></div><p class="panel-copy">Activation requires a favorable acceptance or continuance decision, signed terms, eligible assignments, a verified workspace, and a ready firm profile. A green gate is evidence—not an automatic command.</p><ul v-if="blockers.length" class="check-list"><li v-for="blocker in blockers.slice(0, 4)" :key="`${blocker.code}-${blocker.message}`"><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>{{ blocker.code }}</strong><small>{{ blocker.message }}</small></span></li></ul><div v-else class="prototype-note"><Icon name="check-circle" :size="16" /><span>All commencement prerequisites are satisfied for this local reference scope.</span></div><div class="card-footer"><span>Terms: {{ terms?.state || 'Not recorded' }} · revision {{ selectedEngagement.revision }}</span><button v-if="canActivate" type="button" class="button primary" :disabled="sharedEnabled || actionWorking || activation?.state === 'ACTIVE'" @click="activate">{{ actionWorking ? 'Working…' : activation?.state === 'ACTIVE' ? 'Active' : 'Activate engagement' }}</button><StatusPill v-else label="Partner action required" tone="neutral" /></div></article>
      <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Next-period continuity</span><h2>{{ renewal ? 'Renewal case in progress' : 'Create a fresh shell' }}</h2></div><StatusPill :label="renewal?.state || 'Not started'" :tone="renewal?.state === 'NON_RENEWED' ? 'warn' : renewal ? 'good' : 'neutral'" /></div><p class="panel-copy">Continuance copies prior facts for context, then resets current answers to UNKNOWN. The next-period shell cannot inherit acceptance, terms, or evidence silently.</p><div v-if="renewal" class="detail-list compact-details"><div><dt>Shell</dt><dd>{{ renewal.shellEngagementId }}</dd></div><div><dt>Copied facts</dt><dd>{{ renewal.copiedFacts?.length || 0 }} responses retained as prior context</dd></div><div><dt>Decision</dt><dd>{{ renewal.decision?.decision || 'Pending partner decision' }}</dd></div></div><div class="card-footer"><span>{{ selectedEngagement.nextPeriodEngagementId ? `Shell ${selectedEngagement.nextPeriodEngagementId} linked` : 'No next-period shell linked' }}</span><button v-if="canActivate && !selectedEngagement.nextPeriodEngagementId" type="button" class="button secondary" :disabled="sharedEnabled || actionWorking" @click="createShell">Create FY2027 shell</button><StatusPill v-else-if="selectedEngagement.nextPeriodEngagementId" label="Linked shell" tone="good" /><StatusPill v-else label="Partner action required" tone="neutral" /></div></article>
    </section>

    <nav class="sub-tabs" aria-label="Engagement views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Summary'">
      <section class="engagement-layout">
        <article class="panel gate-map-panel">
          <div class="panel-heading"><div><span class="eyebrow">Operational gates</span><h2>Where the engagement stands</h2></div><span class="muted-label">Click a gate for its owner and next action</span></div>
          <div class="gate-map">
            <button v-for="(gate, index) in gates" :key="gate.id" type="button" class="gate-map-item" :class="[`gate-${gate.status}`, { selected: selectedGate === index }, { 'gate-next-period': gate.period === 'next' }, { 'gate-not-applicable': !gate.applicable }]" @click="selectedGate = index"><span class="gate-node"><Icon :name="!gate.applicable ? 'minus' : gate.status === 'good' ? 'check' : gate.status === 'warn' ? 'warning' : gate.status === 'danger' ? 'lock' : 'clock'" :size="14" /></span><span><strong>{{ gate.id }} · {{ gate.title }}</strong><small>{{ gate.applicable ? gate.detail : 'Not applicable for this service route' }}{{ gate.period === 'next' ? ' · next period' : '' }}</small></span></button>
          </div>
          <div class="selected-gate"><div><span class="eyebrow">Selected gate</span><h3>{{ selectedGateInfo.id }} · {{ selectedGateInfo.title }}</h3><p>{{ selectedGateInfo.applicable ? selectedGateInfo.detail : 'This gate is not applicable to the selected service route.' }}{{ selectedGateInfo.nextPeriodNote ? ` ${selectedGateInfo.nextPeriodNote}` : '' }}</p></div><StatusPill :label="selectedGateInfo.applicable ? statusLabels[selectedGateInfo.status] : 'Not applicable'" :tone="selectedGateInfo.applicable ? selectedGateInfo.status : 'neutral'" /></div>
        </article>

        <aside class="panel track-panel"><div class="panel-heading"><div><span class="eyebrow">Service routing</span><h2>Two accountable tracks</h2></div></div><div class="track-card accounting-track"><div class="track-icon"><Icon name="calculator" :size="17" /></div><div><strong>Accounting package</strong><small>Leila Noor · management owns decisions</small><span>TB v03 validated · FS v05 in review</span></div><button type="button" class="text-button" @click="navigate('accounting')">Open <Icon name="arrow-right" :size="15" /></button></div><div class="track-card audit-track"><div class="track-icon"><Icon name="clipboard" :size="17" /></div><div><strong>Audit file</strong><small>Omar Aziz · partner Maya Rahman</small><span>Plan approved · AR-019 follow-up open</span></div><button type="button" class="text-button" @click="navigate('audit')">Open <Icon name="arrow-right" :size="15" /></button></div><div class="handoff-note"><Icon name="arrow-right" :size="17" /><span><strong>Controlled handoff</strong> The accounting package is a versioned input to audit; it is not the auditor’s ledger.</span></div></aside>
      </section>
      <section class="split-grid">
        <article class="panel"><div class="panel-heading"><div><span class="eyebrow">People and authority</span><h2>Assigned team</h2></div><button type="button" class="text-button" @click="navigate('admin-console')">Manage access <Icon name="arrow-right" :size="15" /></button></div><div class="team-list"><div v-for="member in client.team" :key="member.name" class="team-row"><span class="avatar" :class="`avatar-${member.color}`">{{ member.initials }}</span><span><strong>{{ member.name }}</strong><small>{{ member.role }}</small></span><StatusPill :label="member.role === 'Engagement partner' ? 'Decision owner' : 'Assigned'" :tone="member.role === 'Engagement partner' ? 'warn' : 'neutral'" /></div></div></article>
        <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Dates and commitments</span><h2>Milestone calendar</h2></div><button type="button" class="text-button" @click="navigate('reviews')">Review queue <Icon name="arrow-right" :size="15" /></button></div><div class="mini-calendar"><div class="calendar-item"><span class="calendar-date">15<span>SEP</span></span><span><strong>AR conclusion and AJ-002 response</strong><small>Partner decision · blocks G6</small></span><StatusPill label="Due soon" tone="danger" /></div><div class="calendar-item"><span class="calendar-date">18<span>SEP</span></span><span><strong>Management representation draft</strong><small>Client portal request</small></span><StatusPill label="Planned" tone="neutral" /></div><div class="calendar-item"><span class="calendar-date">25<span>SEP</span></span><span><strong>Target report date</strong><small>EQR must complete first</small></span><StatusPill label="Target" tone="good" /></div></div></article>
      </section>
    </template>

    <template v-else-if="activeTab === 'Timeline'">
      <SharedTimeline v-if="sharedEnabled" :engagement-id="selectedEngagement?.id || ''" title="Shared activity (all browsers)" />
      <section class="panel timeline-full"><div class="panel-heading"><div><span class="eyebrow">Immutable activity ledger</span><h2>Engagement timeline</h2></div><StatusPill label="Version history preserved" tone="good" /></div><div class="timeline-list detailed"> <div v-for="event in timeline" :key="event.title" class="timeline-item"><span class="timeline-dot" :class="`tone-${event.tone}`"></span><div><div class="timeline-title"><strong>{{ event.title }}</strong><span>{{ event.date }} 2026</span></div><p>{{ event.detail }}</p><small>Actor recorded · Northstar Trading · revision-bound event</small></div></div></div></section>
    </template>

    <template v-else>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Scope boundary</span><h2>What this engagement includes</h2></div></div><ul class="check-list"><li><span class="list-icon good">✓</span><span><strong>Statutory financial-statement audit</strong><small>Opinion and governance communication gate</small></span></li><li><span class="list-icon good">✓</span><span><strong>Accounting-package review</strong><small>Versioned TB, mappings, adjustments and notes</small></span></li><li><span class="list-icon good">✓</span><span><strong>SharePoint evidence repository</strong><small>Frappe stores references, versions and approvals</small></span></li><li><span class="list-icon warn">!</span><span><strong>Client bookkeeping</strong><small>Excluded — no journals post to the firm’s own ledger</small></span></li></ul></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Permission boundary</span><h2>Access checks</h2></div><StatusPill label="Scoped" tone="good" /></div><div class="permission-grid"><div><strong>Firm staff</strong><span>Desk access based on team role</span></div><div><strong>Northstar contacts</strong><span>Portal-only assigned requests</span></div><div><strong>SharePoint worker</strong><span>Selected repository grant</span></div><div><strong>Other clients</strong><span>Denied by client_id + engagement_id</span></div></div></article></section>
    </template>
  </div>
</template>
