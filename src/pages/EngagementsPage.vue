<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import NextBestActionCard from '../components/NextBestActionCard.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import SharedTimeline from '../components/SharedTimeline.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { client, timeline, workflowGuides } from '../data'
import { activateEngagement, activationBlockers, activationFor, activeActor, assignEngagementTeam, auditCommencementBlockers, auditCommencementWarnings, createContinuanceShell, eligibleActorsFor, gateSummary, renewalCaseFor, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement, selectEngagement, startAudit, termsAcceptedFor, termsFor } from '../domain/scenario.js'
import { assignSharedEngagementTeam, startSharedAudit } from '../sharedDemo.js'
import { recordTargetFor } from '../navigation/recordTargets.js'
import { useDemoContext } from '../demoContext.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const sharedEnabled = sharedDemoEnabled
const activeTab = ref('Summary')
const tabs = ['Summary', 'Timeline', 'Team & scope']
const selectedGate = ref(4)
const targetNotice = ref('')
const actionWorking = ref(false)
const toast = ref('')
const teamModalOpen = ref(false)
const teamWorking = ref(false)
const commencementWorking = ref(false)
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
const commencementBlockers = computed(() => auditCommencementBlockers(selectedEngagement.value?.id))
const commencementWarnings = computed(() => auditCommencementWarnings(selectedEngagement.value?.id))
const renewal = computed(() => renewalCaseFor(selectedEngagement.value?.id))
const canActivate = computed(() => Boolean(activeActor()?.roles?.includes('engagement_partner')))
const canCommenceAudit = computed(() => Boolean(activeActor()?.roles?.some((r) => ['engagement_partner', 'audit_manager', 'audit_senior', 'system_admin'].includes(r))))
const canManageTeam = computed(() => Boolean(activeActor()?.roles?.some((r) => ['engagement_partner', 'audit_manager', 'system_admin'].includes(r))))
const isAuditCommenced = computed(() => Boolean(selectedEngagement.value?.auditCommenced))

// Who can legitimately fill each staffing slot. The list comes from the same
// role matrix the assignment command enforces, so the form can no longer offer
// (or default to) an actor the command would reject.
const staffOptionsFor = (role) => eligibleActorsFor(role, selectedEngagement.value?.id)
const defaultActorFor = (role, currentActorId) => currentActorId || staffOptionsFor(role)[0]?.id || ''

const teamMembers = computed(() => {
  const team = selectedEngagement.value?.team
  if (team && team.length) {
    return team.map((m) => ({
      name: m.actorName,
      role: m.role.replaceAll('_', ' '),
      roleKey: m.role,
      actorId: m.actorId,
      initials: (m.actorName || m.actorId).split(' ').map((p) => p[0]).slice(0, 2).join(''),
      color: m.role === 'engagement_partner' ? 'purple' : m.role === 'audit_manager' ? 'blue' : m.role === 'eqr_reviewer' ? 'red' : 'green',
      plannedHours: m.plannedHours,
      startDate: m.startDate,
      endDate: m.endDate,
      responsibility: m.responsibility,
    }))
  }
  return client.team
})

const teamForm = ref({
  preparer: { actorId: '', plannedHours: '40', startDate: '2026-09-01', endDate: '2026-09-20', responsibility: 'Fieldwork workpaper preparation & testing' },
  audit_senior: { actorId: '', plannedHours: '30', startDate: '2026-09-01', endDate: '2026-09-22', responsibility: 'Detailed workpaper review and senior sign-off' },
  audit_manager: { actorId: '', plannedHours: '20', startDate: '2026-09-05', endDate: '2026-09-24', responsibility: 'Audit completion, consultation and file readiness' },
  engagement_partner: { actorId: '', plannedHours: '10', startDate: '2026-09-10', endDate: '2026-09-25', responsibility: 'Overall engagement leadership and audit opinion sign-off' },
  eqr_reviewer: { actorId: '', plannedHours: '8', startDate: '2026-09-18', endDate: '2026-09-25', responsibility: 'Independent engagement quality review (EQR)' },
  accounting_reviewer: { actorId: '', plannedHours: '12', startDate: '2026-09-01', endDate: '2026-09-15', responsibility: 'Accounting package and financial statement preparation review' },
})

const { mode: demoMode, events: projectedEvents } = useDemoContext()
const engagementTimeline = computed(() => {
  const projected = (projectedEvents.value || []).map((event) => ({
    title: String(event.action || event.type || 'Workflow update').replaceAll('_', ' '),
    detail: event.objectId ? `${event.actor || 'Workspace'} · ${event.objectId}` : (event.actor || 'Workspace update'),
    date: event.createdAt ? new Date(event.createdAt).toLocaleDateString('en-QA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Current',
    tone: 'blue',
  }))
  return demoMode.value === 'local' && projected.length ? projected : timeline
})

watch(() => props.navigationTarget?.recordId, (recordId) => {
  const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
  if (!recordId || (target.targetType !== 'engagements' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'engagements'))) return
  const index = gates.value.findIndex((gate) => gate.id === recordId)
  if (index >= 0) { selectedGate.value = index; targetNotice.value = '' }
  else targetNotice.value = `${recordId} is not in the selected engagement scope.`
}, { immediate: true })

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

function openTeamModal() {
  const existingTeam = selectedEngagement.value?.team || []
  const findRole = (r) => existingTeam.find((m) => m.role === r)
  
  teamForm.value = {
    preparer: {
      actorId: defaultActorFor('preparer', findRole('preparer')?.actorId),
      plannedHours: findRole('preparer')?.plannedHours || '40',
      startDate: findRole('preparer')?.startDate || '2026-09-01',
      endDate: findRole('preparer')?.endDate || '2026-09-20',
      responsibility: findRole('preparer')?.responsibility || 'Fieldwork workpaper preparation & testing',
    },
    audit_senior: {
      actorId: defaultActorFor('audit_senior', findRole('audit_senior')?.actorId),
      plannedHours: findRole('audit_senior')?.plannedHours || '30',
      startDate: findRole('audit_senior')?.startDate || '2026-09-01',
      endDate: findRole('audit_senior')?.endDate || '2026-09-22',
      responsibility: findRole('audit_senior')?.responsibility || 'Detailed workpaper review and senior sign-off',
    },
    audit_manager: {
      actorId: defaultActorFor('audit_manager', findRole('audit_manager')?.actorId),
      plannedHours: findRole('audit_manager')?.plannedHours || '20',
      startDate: findRole('audit_manager')?.startDate || '2026-09-05',
      endDate: findRole('audit_manager')?.endDate || '2026-09-24',
      responsibility: findRole('audit_manager')?.responsibility || 'Audit completion, consultation and file readiness',
    },
    engagement_partner: {
      actorId: defaultActorFor('engagement_partner', findRole('engagement_partner')?.actorId),
      plannedHours: findRole('engagement_partner')?.plannedHours || '10',
      startDate: findRole('engagement_partner')?.startDate || '2026-09-10',
      endDate: findRole('engagement_partner')?.endDate || '2026-09-25',
      responsibility: findRole('engagement_partner')?.responsibility || 'Overall engagement leadership and audit opinion sign-off',
    },
    eqr_reviewer: {
      actorId: findRole('eqr_reviewer')?.actorId || (selectedEngagement.value?.evidence?.eqrRequired ? defaultActorFor('eqr_reviewer', '') : ''),
      plannedHours: findRole('eqr_reviewer')?.plannedHours || '8',
      startDate: findRole('eqr_reviewer')?.startDate || '2026-09-18',
      endDate: findRole('eqr_reviewer')?.endDate || '2026-09-25',
      responsibility: findRole('eqr_reviewer')?.responsibility || 'Independent engagement quality review (EQR)',
    },
    accounting_reviewer: {
      actorId: defaultActorFor('accounting_reviewer', findRole('accounting_reviewer')?.actorId),
      plannedHours: findRole('accounting_reviewer')?.plannedHours || '12',
      startDate: findRole('accounting_reviewer')?.startDate || '2026-09-01',
      endDate: findRole('accounting_reviewer')?.endDate || '2026-09-15',
      responsibility: findRole('accounting_reviewer')?.responsibility || 'Accounting package and financial statement preparation review',
    },
  }
  teamModalOpen.value = true
}

function closeTeamModal() {
  if (!teamWorking.value) teamModalOpen.value = false
}

async function saveTeamAssignments() {
  if (teamWorking.value || !selectedEngagement.value) return
  teamWorking.value = true
  try {
    const assignments = []
    for (const [role, data] of Object.entries(teamForm.value)) {
      if (data.actorId) {
        assignments.push({
          role,
          actorId: data.actorId,
          plannedHours: data.plannedHours,
          startDate: data.startDate,
          endDate: data.endDate,
          responsibility: data.responsibility,
        })
      }
    }

    if (sharedEnabled) {
      const result = await assignSharedEngagementTeam(selectedEngagement.value.id, {
        assignments,
        idempotencyKey: `team-assign-${selectedEngagement.value.id}-${Date.now()}`,
      })
      if (result.ok) {
        teamModalOpen.value = false
        toast.value = 'Engagement team assignments saved to shared demo.'
      } else {
        toast.value = `Error: ${result.error?.message || 'Failed to assign team'}`
      }
    } else {
      const result = assignEngagementTeam({
        engagementId: selectedEngagement.value.id,
        actorPersonaId: activeActor()?.personaId,
        expectedSessionEpoch: activeActor()?.sessionEpoch,
        idempotencyKey: `team-assign-${selectedEngagement.value.id}-${Date.now()}`,
        assignments,
      })
      if (result.outcome === 'COMMITTED') {
        teamModalOpen.value = false
        toast.value = 'Engagement team assignments committed. Actor permissions updated.'
      } else {
        toast.value = `${result.outcome}: ${result.code} — ${result.message}`
      }
    }
  } finally {
    teamWorking.value = false
    window.setTimeout(() => { toast.value = '' }, 4500)
  }
}

async function commenceAuditAction() {
  if (commencementWorking.value || !selectedEngagement.value) return
  commencementWorking.value = true
  try {
    if (sharedEnabled) {
      const result = await startSharedAudit(selectedEngagement.value.id, {
        idempotencyKey: `start-audit-${selectedEngagement.value.id}-${Date.now()}`,
      })
      if (result.ok) {
        toast.value = 'Audit commenced! Status transitioned to Fieldwork in progress.'
      } else {
        toast.value = `Error: ${result.error?.message || 'Failed to commence audit'}`
      }
    } else {
      const result = startAudit({
        engagementId: selectedEngagement.value.id,
        actorPersonaId: activeActor()?.personaId,
        expectedRevision: selectedEngagement.value.revision,
        idempotencyKey: `start-audit-${selectedEngagement.value.id}-${Date.now()}`,
      })
      if (result.outcome === 'COMMITTED') {
        toast.value = 'Audit commenced! Status transitioned to Fieldwork in progress.'
      } else {
        toast.value = `${result.outcome}: ${result.code} — ${result.message}`
      }
    }
  } finally {
    commencementWorking.value = false
    window.setTimeout(() => { toast.value = '' }, 4500)
  }
}
</script>

<template>
  <div class="page">
    <PageHeader :eyebrow="`Engagement workspace · ${selectedEngagement.id}`" :title="selectedClient.name" :description="`${selectedEngagement.serviceLabel} · ${selectedEngagement.periodLabel} · ${selectedEngagement.currency}. Planning and PBC work can continue only within this selected scope.`" action-label="Open PBC workspace" @action="navigate('pbc')" />
    <WorkflowGuide :guide="workflowGuides.engagements" />
    <NextBestActionCard v-if="sharedEnabled" title="Next best action for the shared engagement" @navigate="navigate" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>
    <div v-if="targetNotice" class="guide-status-message" role="status"><Icon name="info" :size="16" />{{ targetNotice }}</div>

    <section class="panel engagement-selector"><div><span class="eyebrow">Selected service-period scope</span><strong>Every command is revision-bound to one engagement</strong><small>{{ sharedEnabled ? 'Use the global shared context selector to change the authoritative engagement.' : 'Use the selector to demonstrate how accounting-only and audit routes keep separate gates and authorities.' }}</small></div><label>Engagement<select name="engagement-scope" :value="selectedEngagement.id" :disabled="sharedEnabled" @change="changeEngagement"><option v-for="item in engagementOptions" :key="item.id" :value="item.id">{{ item.id }} · {{ item.serviceLabel }} · {{ item.period }}</option></select></label></section>

    <section class="engagement-hero panel">
      <div class="engagement-identity"><div class="large-avatar">{{ selectedClient.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</div><div><div class="title-line"><h2>{{ selectedEngagement.periodLabel }}</h2><StatusPill :label="isAuditCommenced ? 'Fieldwork in progress' : selectedEngagement.service === 'audit' ? 'Audit planning / uncommenced' : 'Preparation in progress'" :tone="isAuditCommenced ? 'good' : 'warn'" /></div><p>{{ selectedEngagement.serviceLabel }} · {{ selectedEngagement.currency }} · {{ selectedClient.name }}</p><div class="tag-row"><span class="tag">{{ selectedEngagement.service === 'audit' ? 'Independent auditor route' : 'Accounting-only route' }}</span><span class="tag">{{ selectedEngagement.evidence.eqrRequired ? 'EQR required' : 'EQR not applicable' }}</span><span class="tag">Client {{ selectedClient.id }} · explicit scope</span><span v-if="isAuditCommenced" class="tag" style="background: #e6f9ed; color: #0b7a35;">✓ Fieldwork commenced</span></div></div></div>
      <div class="engagement-kpis"><div><span>Current gates ready</span><strong>{{ readyCount }} / {{ gateState.currentDenominator }}</strong><small>G10 is shown separately as next-period permission</small></div><div><span>Input generation</span><strong>g{{ selectedEngagement.inputGeneration }}</strong><small>Revision {{ selectedEngagement.revision }} · policy g{{ selectedEngagement.policyGeneration }}</small></div><div><span>Next deadline</span><strong>15 Sep</strong><small>Scoped to {{ selectedClient.name }}</small></div></div>
    </section>

    <section class="split-grid engagement-controls">
      <!-- Commencement & Activation Control -->
      <article class="panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Commencement & fieldwork control</span>
            <h2>{{ isAuditCommenced ? 'Fieldwork in progress' : 'Audit commencement readiness' }}</h2>
          </div>
          <StatusPill :label="isAuditCommenced ? 'Fieldwork commenced' : commencementBlockers.length ? 'Prerequisites pending' : 'Ready to commence'" :tone="isAuditCommenced ? 'good' : commencementBlockers.length ? 'danger' : 'warn'" />
        </div>
        <p class="panel-copy">Audit fieldwork commencement (START_AUDIT) is enforced by the shared staffing profile in both demo modes: partner acceptance, client EL acceptance, advance verification, an Engagement Partner, an Audit Senior, an Audit Manager (unless approved small-firm), at least one Preparer, and an Accounting Reviewer where a package is linked.</p>
        
        <div v-if="isAuditCommenced" class="prototype-note" style="background: #f0fdf4; border-color: #bbf7d0;">
          <Icon name="check-circle" :size="16" />
          <span><strong>Audit fieldwork commenced</strong> on {{ selectedEngagement.commencedAt ? selectedEngagement.commencedAt.slice(0, 10) : '2026-09-01' }} by {{ selectedEngagement.commencedBy || 'Maya Rahman' }}. Audit workpapers and substantive testing are active.</span>
        </div>
        
        <ul v-else-if="commencementBlockers.length" class="check-list">
          <li v-for="blocker in commencementBlockers" :key="`${blocker.code}-${blocker.message}`">
            <span class="list-icon danger"><Icon name="lock" :size="14" /></span>
            <span><strong>{{ blocker.code }}</strong><small>{{ blocker.message }}</small></span>
          </li>
        </ul>
        <div v-else class="prototype-note">
          <Icon name="check-circle" :size="16" />
          <span>Every commencement prerequisite is satisfied. Ready to transition to AUDIT_IN_PROGRESS.</span>
        </div>
        <ul v-if="!isAuditCommenced && commencementWarnings.length" class="check-list">
          <li v-for="warning in commencementWarnings" :key="`${warning.code}-${warning.message}`">
            <span class="list-icon"><Icon name="info" :size="14" /></span>
            <span><strong>{{ warning.code }}</strong><small>{{ warning.message }}</small></span>
          </li>
        </ul>

        <div class="card-footer">
          <span>{{ isAuditCommenced ? 'Fieldwork active · revision ' + selectedEngagement.revision : commencementBlockers.length ? commencementBlockers.length + ' blocker(s) remaining' : 'Ready for commencement' }}</span>
          <div class="button-row" style="gap: 8px;">
            <button v-if="!isAuditCommenced && canCommenceAudit" type="button" class="button primary" :disabled="commencementBlockers.length > 0 || commencementWorking" @click="commenceAuditAction">
              {{ commencementWorking ? 'Commencing…' : 'Commence audit (START_AUDIT)' }}
            </button>
            <button v-if="canActivate && activation?.state !== 'ACTIVE'" type="button" class="button secondary" :disabled="sharedEnabled || actionWorking" @click="activate">
              {{ actionWorking ? 'Working…' : 'Activate engagement' }}
            </button>
            <StatusPill v-if="!canCommenceAudit && !isAuditCommenced" label="Partner / Manager action required" tone="neutral" />
          </div>
        </div>
      </article>

      <!-- Next-Period Continuity -->
      <article class="panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Next-period continuity</span><h2>{{ renewal ? 'Renewal case in progress' : 'Create a fresh shell' }}</h2></div>
          <StatusPill :label="renewal?.state || 'Not started'" :tone="renewal?.state === 'NON_RENEWED' ? 'warn' : renewal ? 'good' : 'neutral'" />
        </div>
        <p class="panel-copy">Continuance copies prior facts for context, then resets current answers to UNKNOWN. The next-period shell cannot inherit acceptance, terms, or evidence silently.</p>
        <div v-if="renewal" class="detail-list compact-details">
          <div><dt>Shell</dt><dd>{{ renewal.shellEngagementId }}</dd></div>
          <div><dt>Copied facts</dt><dd>{{ renewal.copiedFacts?.length || 0 }} responses retained as prior context</dd></div>
          <div><dt>Decision</dt><dd>{{ renewal.decision?.decision || 'Pending partner decision' }}</dd></div>
        </div>
        <div class="card-footer">
          <span>{{ selectedEngagement.nextPeriodEngagementId ? `Shell ${selectedEngagement.nextPeriodEngagementId} linked` : 'No next-period shell linked' }}</span>
          <button v-if="canActivate && !selectedEngagement.nextPeriodEngagementId" type="button" class="button secondary" :disabled="sharedEnabled || actionWorking" @click="createShell">Create FY2027 shell</button>
          <StatusPill v-else-if="selectedEngagement.nextPeriodEngagementId" label="Linked shell" tone="good" />
          <StatusPill v-else label="Partner action required" tone="neutral" />
        </div>
      </article>
    </section>

    <nav class="sub-tabs" aria-label="Engagement views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Summary'">
      <section class="engagement-layout">
        <article class="panel gate-map-panel">
          <div class="panel-heading"><div><span class="eyebrow">Operational gates</span><h2>Where the engagement stands</h2></div><span class="muted-label">Click a gate for its owner and next action</span></div>
          <div class="gate-map">
            <button v-for="(gate, index) in gates" :key="gate.id" :data-record-id="gate.id" type="button" class="gate-map-item" :class="[`gate-${gate.status}`, { selected: selectedGate === index }, { 'gate-next-period': gate.period === 'next' }, { 'gate-not-applicable': !gate.applicable }]" @click="selectedGate = index"><span class="gate-node"><Icon :name="!gate.applicable ? 'minus' : gate.status === 'good' ? 'check' : gate.status === 'warn' ? 'warning' : gate.status === 'danger' ? 'lock' : 'clock'" :size="14" /></span><span><strong>{{ gate.id }} · {{ gate.title }}</strong><small>{{ gate.applicable ? gate.detail : 'Not applicable for this service route' }}{{ gate.period === 'next' ? ' · next period' : '' }}</small></span></button>
          </div>
          <div class="selected-gate"><div><span class="eyebrow">Selected gate</span><h3>{{ selectedGateInfo.id }} · {{ selectedGateInfo.title }}</h3><p>{{ selectedGateInfo.applicable ? selectedGateInfo.detail : 'This gate is not applicable to the selected service route.' }}{{ selectedGateInfo.nextPeriodNote ? ` ${selectedGateInfo.nextPeriodNote}` : '' }}</p></div><StatusPill :label="selectedGateInfo.applicable ? statusLabels[selectedGateInfo.status] : 'Not applicable'" :tone="selectedGateInfo.applicable ? selectedGateInfo.status : 'neutral'" /></div>
        </article>

        <aside class="panel track-panel"><div class="panel-heading"><div><span class="eyebrow">Service routing</span><h2>Two accountable tracks</h2></div></div><div class="track-card accounting-track"><div class="track-icon"><Icon name="calculator" :size="17" /></div><div><strong>Accounting package</strong><small>Leila Noor · management owns decisions</small><span>TB v03 validated · FS v05 in review</span></div><button type="button" class="text-button" @click="navigate('accounting')">Open <Icon name="arrow-right" :size="15" /></button></div><div class="track-card audit-track"><div class="track-icon"><Icon name="clipboard" :size="17" /></div><div><strong>Audit file</strong><small>Omar Aziz · partner Maya Rahman</small><span>Plan approved · AR-019 follow-up open</span></div><button type="button" class="text-button" @click="navigate('audit')">Open <Icon name="arrow-right" :size="15" /></button></div><div class="handoff-note"><Icon name="arrow-right" :size="17" /><span><strong>Controlled handoff</strong> The accounting package is a versioned input to audit; it is not the auditor’s ledger.</span></div></aside>
      </section>
      <section class="split-grid">
        <article class="panel">
          <div class="panel-heading">
            <div><span class="eyebrow">People and authority</span><h2>Assigned team</h2></div>
            <div class="button-row" style="gap: 8px;">
              <button v-if="canManageTeam" type="button" class="button small secondary" @click="openTeamModal">
                <Icon name="users" :size="14" /> Assign / Edit team
              </button>
              <button type="button" class="text-button" @click="navigate('admin-console')">Manage access <Icon name="arrow-right" :size="15" /></button>
            </div>
          </div>
          <div class="team-list">
            <div v-for="member in teamMembers" :key="member.roleKey || member.name" class="team-row">
              <span class="avatar" :class="`avatar-${member.color}`">{{ member.initials }}</span>
              <span style="min-width: 0; flex: 1;">
                <strong>{{ member.name }}</strong>
                <small>{{ member.role }} · {{ member.plannedHours ? member.plannedHours + 'h planned' : 'Active' }}</small>
                <small v-if="member.responsibility" style="color: var(--subtle); font-size: 0.65rem; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ member.responsibility }}</small>
              </span>
              <StatusPill :label="member.roleKey === 'engagement_partner' ? 'Decision owner' : member.roleKey === 'eqr_reviewer' ? 'Quality reviewer' : 'Assigned'" :tone="member.roleKey === 'engagement_partner' ? 'warn' : member.roleKey === 'eqr_reviewer' ? 'danger' : 'neutral'" />
            </div>
          </div>
        </article>
        <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Dates and commitments</span><h2>Milestone calendar</h2></div><button type="button" class="text-button" @click="navigate('reviews')">Review queue <Icon name="arrow-right" :size="15" /></button></div><div class="mini-calendar"><div class="calendar-item"><span class="calendar-date">15<span>SEP</span></span><span><strong>AR conclusion and AJ-002 response</strong><small>Partner decision · blocks G6</small></span><StatusPill label="Due soon" tone="danger" /></div><div class="calendar-item"><span class="calendar-date">18<span>SEP</span></span><span><strong>Management representation draft</strong><small>Client portal request</small></span><StatusPill label="Planned" tone="neutral" /></div><div class="calendar-item"><span class="calendar-date">25<span>SEP</span></span><span><strong>Target report date</strong><small>EQR must complete first</small></span><StatusPill label="Target" tone="good" /></div></div></article>
      </section>
    </template>

    <template v-else-if="activeTab === 'Timeline'">
      <SharedTimeline v-if="sharedEnabled" :engagement-id="selectedEngagement?.id || ''" title="Shared activity (all browsers)" />
      <section class="panel timeline-full"><div class="panel-heading"><div><span class="eyebrow">Immutable activity ledger</span><h2>Engagement timeline</h2></div><StatusPill label="Version history preserved" tone="good" /></div><div class="timeline-list detailed"> <div v-for="(event, index) in engagementTimeline" :key="`${event.title}-${event.date}-${index}`" class="timeline-item"><span class="timeline-dot" :class="`tone-${event.tone}`"></span><div><div class="timeline-title"><strong>{{ event.title }}</strong><span>{{ event.date }}</span></div><p>{{ event.detail }}</p><small>Actor recorded · Northstar Trading · revision-bound event</small></div></div></div></section>
    </template>

    <template v-else>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Scope boundary</span><h2>What this engagement includes</h2></div></div><ul class="check-list"><li><span class="list-icon good">✓</span><span><strong>Statutory financial-statement audit</strong><small>Opinion and governance communication gate</small></span></li><li><span class="list-icon good">✓</span><span><strong>Accounting-package review</strong><small>Versioned TB, mappings, adjustments and notes</small></span></li><li><span class="list-icon good">✓</span><span><strong>SharePoint evidence repository</strong><small>Frappe stores references, versions and approvals</small></span></li><li><span class="list-icon warn">!</span><span><strong>Client bookkeeping</strong><small>Excluded — no journals post to the firm’s own ledger</small></span></li></ul></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Permission boundary</span><h2>Access checks</h2></div><StatusPill label="Scoped" tone="good" /></div><div class="permission-grid"><div><strong>Firm staff</strong><span>Desk access based on team role</span></div><div><strong>Northstar contacts</strong><span>Portal-only assigned requests</span></div><div><strong>SharePoint worker</strong><span>Selected repository grant</span></div><div><strong>Other clients</strong><span>Denied by client_id + engagement_id</span></div></div></article></section>
    </template>

    <!-- Team Assignment Modal -->
    <div v-if="teamModalOpen" class="modal-backdrop" role="presentation" @click.self="closeTeamModal">
      <section class="modal-panel lead-modal" role="dialog" aria-modal="true" aria-labelledby="team-title" style="width: min(840px, 100%);">
        <div class="modal-header">
          <div>
            <span class="eyebrow">Staffing & authority allocation</span>
            <h2 id="team-title">Assign Engagement Team</h2>
            <p>{{ selectedEngagement.id }} · {{ selectedClient.name }} · Explicit role assignments enforce desk permissions.</p>
          </div>
          <button type="button" class="icon-button" aria-label="Close team modal" title="Close team modal" @click="closeTeamModal">
            <Icon name="x" :size="17" />
          </button>
        </div>
        <form class="form-grid lead-form" @submit.prevent="saveTeamAssignments">
          <!-- Preparer / Junior -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
            <label>Preparer / Junior
              <select v-model="teamForm.preparer.actorId" name="preparer-actor">
                <option value="">Unassigned</option>
                <option v-for="actor in staffOptionsFor('preparer')" :key="actor.id" :value="actor.id">{{ actor.name }} ({{ actor.roles[0] }})</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.preparer.plannedHours" type="number" min="0" placeholder="40" />
            </label>
            <label>Start date
              <input v-model="teamForm.preparer.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.preparer.endDate" type="date" />
            </label>
          </div>

          <!-- Audit Senior -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
            <label>Audit Senior
              <select v-model="teamForm.audit_senior.actorId" name="senior-actor" required>
                <option value="">Select Audit Senior</option>
                <option v-for="actor in staffOptionsFor('audit_senior')" :key="actor.id" :value="actor.id">{{ actor.name }} ({{ actor.roles[0] }})</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.audit_senior.plannedHours" type="number" min="0" placeholder="30" />
            </label>
            <label>Start date
              <input v-model="teamForm.audit_senior.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.audit_senior.endDate" type="date" />
            </label>
          </div>

          <!-- Audit Manager -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
            <label>Audit Manager
              <select v-model="teamForm.audit_manager.actorId" name="manager-actor" required>
                <option value="">Select Audit Manager</option>
                <option v-for="actor in staffOptionsFor('audit_manager')" :key="actor.id" :value="actor.id">{{ actor.name }} ({{ actor.roles[0] }})</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.audit_manager.plannedHours" type="number" min="0" placeholder="20" />
            </label>
            <label>Start date
              <input v-model="teamForm.audit_manager.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.audit_manager.endDate" type="date" />
            </label>
          </div>

          <!-- Engagement Partner -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
            <label>Engagement Partner
              <select v-model="teamForm.engagement_partner.actorId" name="partner-actor" required>
                <option value="">Select Partner</option>
                <option v-for="actor in staffOptionsFor('engagement_partner')" :key="actor.id" :value="actor.id">{{ actor.name }}</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.engagement_partner.plannedHours" type="number" min="0" placeholder="10" />
            </label>
            <label>Start date
              <input v-model="teamForm.engagement_partner.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.engagement_partner.endDate" type="date" />
            </label>
          </div>

          <!-- EQR Reviewer -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
            <label>EQR Reviewer (if required)
              <select v-model="teamForm.eqr_reviewer.actorId" name="eqr-actor">
                <option value="">No EQR required</option>
                <option v-for="actor in staffOptionsFor('eqr_reviewer')" :key="actor.id" :value="actor.id">{{ actor.name }} ({{ actor.roles[0] }})</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.eqr_reviewer.plannedHours" type="number" min="0" placeholder="8" />
            </label>
            <label>Start date
              <input v-model="teamForm.eqr_reviewer.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.eqr_reviewer.endDate" type="date" />
            </label>
          </div>

          <!-- Accounting Reviewer -->
          <div class="form-span-2" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: end; padding-bottom: 8px;">
            <label>Accounting Reviewer
              <select v-model="teamForm.accounting_reviewer.actorId" name="accounting-reviewer-actor">
                <option value="">Unassigned</option>
                <option v-for="actor in staffOptionsFor('accounting_reviewer')" :key="actor.id" :value="actor.id">{{ actor.name }} ({{ actor.roles[0] }})</option>
              </select>
            </label>
            <label>Planned hours
              <input v-model="teamForm.accounting_reviewer.plannedHours" type="number" min="0" placeholder="12" />
            </label>
            <label>Start date
              <input v-model="teamForm.accounting_reviewer.startDate" type="date" />
            </label>
            <label>End date
              <input v-model="teamForm.accounting_reviewer.endDate" type="date" />
            </label>
          </div>

          <div class="form-span-2 lead-form-callout">
            <Icon name="shield" :size="17" />
            <span>
              <strong>Desk isolation rule:</strong>
              Assigning a staff member grants access strictly to this engagement ({{ selectedEngagement.id }}). Membership in a Client Group does not grant access across client entities.
            </span>
          </div>

          <div class="form-span-2 modal-form-actions">
            <button type="button" class="button ghost" :disabled="teamWorking" @click="closeTeamModal">Cancel</button>
            <button type="submit" class="button primary" :disabled="teamWorking">{{ teamWorking ? 'Saving team…' : 'Save team assignments' }}</button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
