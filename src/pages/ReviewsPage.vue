<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import ApprovalChain from '../components/ApprovalChain.vue'
import Icon from '../components/Icon.vue'
import { approvals, formatMoney, workflowGuides } from '../data'
import { loadDemoSession } from '../auth.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { useDemoContext } from '../demoContext.js'
import { activeCommandContext, createSharedIntent, getApprovalCenter, getSharedDecisions, idempotencyKey, recordManagerCompletion, recordPartnerReview, runSharedAction } from '../sharedDemo.js'
import { useDraftForms } from '../composables/useDraftForms.js'
import { activeActor, actorById, clearReviewPoint as clearReviewPointCommand, createReviewPoint as createReviewPointCommand, recordCompletionRecommendation, scenario, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'
import LocalFixtureNotice from '../components/LocalFixtureNotice.vue'

const emit = defineEmits(['navigate'])

const selectedEngagement = computed(() => scenarioEngagement())
const points = computed(() => scenario.reviews.filter((point) => point.engagementId === selectedEngagement.value?.id).map((point) => ({
  ...point,
  status: point.status === 'CLEARED' ? 'Cleared' : 'Open',
  severity: point.severity === 'SIGNIFICANT' ? 'Significant' : 'Routine',
  assignee: actorById(point.assigneeActorId)?.name || point.assigneeActorId,
  blocks: point.status !== 'CLEARED',
  tone: point.status === 'CLEARED' ? 'good' : point.severity === 'SIGNIFICANT' ? 'danger' : 'warn',
})))
const toast = ref('')
const activeFilter = ref('All points')
const filters = ['All points', 'Blocking', 'My queue']
const filteredPoints = computed(() => points.value.filter((point) => activeFilter.value === 'All points' || (activeFilter.value === 'Blocking' && point.blocks) || (activeFilter.value === 'My queue' && point.assigneeActorId === activeActor()?.id)))
const openCount = computed(() => points.value.filter((point) => point.status !== 'Cleared').length)
const selectedApproval = ref(null)
const dependencyLogOpen = ref(false)
const reviewDraftOpen = ref(false)
const reviewDraft = ref({ title: '', detail: '', severity: 'ROUTINE', assigneeActorId: 'ACT-OMAR', due: '2026-09-20' })
const reviewDraftWorking = ref(false)
const completionDecision = ref('RECOMMEND')
const completionRationale = ref('')
const completionWorking = ref(false)
const scopedReviewers = computed(() => scenario.actors.filter((actor) => actor.active && actor.assignments.includes(selectedEngagement.value?.id) && actor.roles.some((role) => ['independent_reviewer', 'accounting_reviewer', 'engagement_partner'].includes(role))))
const completionRecommendation = computed(() => selectedEngagement.value?.evidence?.completionRecommendation || null)
const canRecommendCompletion = computed(() => Boolean(activeActor()?.roles?.includes('audit_manager')))
const completionBlockers = computed(() => completionRecommendation.value?.blockers || [])

function clearPoint(point) {
  if (sharedDemoEnabled) {
    toast.value = 'Local review points are read-only in shared mode; use the shared approval center above.'
    return
  }
  if (point.status === 'Cleared') return
  const result = clearReviewPointCommand({ pointId: point.id, actorPersonaId: activeActor()?.personaId, expectedRevision: point.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `review-clear-${point.id}-${point.revision}`, response: 'Reviewed exact response and alternative-work reference.' })
  toast.value = result.outcome === 'COMMITTED' ? `${point.id} cleared with an appended reviewer decision.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createReviewPoint() {
  if (sharedDemoEnabled) {
    toast.value = 'Local review points are read-only in shared mode; use the shared approval center above.'
    return
  }
  reviewDraft.value = { title: '', detail: '', severity: 'ROUTINE', assigneeActorId: scopedReviewers.value[0]?.id || 'ACT-OMAR', due: '2026-09-20' }
  reviewDraftOpen.value = true
}

function inspectApproval(approval) {
  selectedApproval.value = selectedApproval.value?.role === approval.role ? null : approval
}

function openFindingRegister() {
  emit('navigate', 'audit')
}

function saveReviewDraft() {
  if (sharedDemoEnabled) {
    toast.value = 'Local review points are read-only in shared mode; use the shared approval center above.'
    return
  }
  if (reviewDraftWorking.value) return
  const actor = activeActor()
  reviewDraftWorking.value = true
  const engagement = scenarioEngagement()
  const result = createReviewPointCommand({
    engagementId: engagement?.id,
    actorPersonaId: actor?.personaId,
    expectedSessionEpoch: actor?.sessionEpoch,
    expectedRevision: engagement?.revision,
    idempotencyKey: `review-create-${engagement?.id}-${engagement?.revision}-${reviewDraft.value.title}`,
    ...reviewDraft.value,
  })
  reviewDraftWorking.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${result.data.id} created and assigned to ${actorById(result.data.assigneeActorId)?.name || result.data.assigneeActorId}.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') reviewDraftOpen.value = false
  window.setTimeout(() => { toast.value = '' }, 4500)
}

// Phase C — shared completion chain (D1 authority). The local queue above
// stays browser-local; everything below reads and writes the Worker.
const {
  mode: sharedMode,
  activeEngagementId: sharedEngagementId,
  engagement: sharedEngagement,
  progress: sharedProgress,
  loading: sharedLoading,
  progressError: sharedProgressError,
  refresh: refreshSharedContext,
  artifacts: sharedArtifacts,
} = useDemoContext()
const sharedDecisions = ref([])
const sharedDecisionsLoading = ref(false)
const sharedBusy = ref('')
const sharedMessage = ref('')
const managerDecision = ref('RECOMMEND_COMPLETE')
const managerRationale = ref('')
const partnerDecision = ref('APPROVE_FOR_OPINION')
const partnerRationale = ref('')
const eqrDecision = ref('APPROVE')
const eqrCandidate = ref('')
const eqrNote = ref('')
const approvalTab = ref('my-decisions')
const approvalItems = ref([])
const approvalCounts = ref({ all: 0, mine: 0, returned: 0, stale: 0 })
const approvalLoading = ref(false)
const approvalError = ref(null)
const approvalTabs = [
  { key: 'my-decisions', label: 'My decisions' },
  { key: 'all-stages', label: 'All stages' },
  { key: 'returned-work', label: 'Returned work' },
  { key: 'stale-approvals', label: 'Stale approvals' },
]

const sharedRole = computed(() => loadDemoSession()?.role || '')
const canSharedManager = computed(() => ['audit-manager', 'admin'].includes(sharedRole.value))
const canSharedPartner = computed(() => ['partner', 'admin'].includes(sharedRole.value))
const canSharedEqr = computed(() => ['eqr', 'admin'].includes(sharedRole.value))
const sharedGate = (id) => (sharedProgress.value?.gateDetails || []).find((gate) => gate.id === id) || null

// M7 APPROVAL-03 / APP-F06 — one stable intent per shared command. The
// idempotency key is minted once per form and reused across retries until
// the command commits or is explicitly rejected; an edited payload mints a
// new intent because it is a different command.
const pendingIntents = new Map()

function intentFor(key, action, payload) {
  const context = activeCommandContext(sharedEngagementId.value)
  if (!context) return null
  const signature = JSON.stringify([action, payload])
  const existing = pendingIntents.get(key)
  if (existing && existing.signature === signature && existing.intent.canRetry()) return existing.intent
  const intent = createSharedIntent(context, action, payload.targetId || context.engagementId, payload)
  pendingIntents.set(key, { intent, signature })
  return intent
}

async function sendSharedIntent(key, action, payload, fallback) {
  const intent = intentFor(key, action, payload)
  if (intent) return intent.send()
  // No confirmed view context: fall back to the legacy unguarded action path.
  return fallback()
}

// M7 STATE-03 — form-scoped local drafts. Only the free-text rationale/note
// fields are allow-listed; decision selects, candidates and gate state are
// never persisted.
const sharedDraftForms = useDraftForms({
  'shared-manager': ['rationale'],
  'shared-partner': ['rationale'],
  'shared-eqr': ['note'],
})
const draftStatus = ref({})
const draftErrors = ref({})
const draftPrompt = ref(null)
let draftSaveTimer = null
const sharedDraftFieldByForm = { 'shared-manager': 'rationale', 'shared-partner': 'rationale', 'shared-eqr': 'note' }

function sharedDraftScope(formId) {
  const engagementRow = sharedEngagement.value
  if (!engagementRow?.engagementId || !engagementRow?.generationId) return null
  const actorId = loadDemoSession()?.id || activeCommandContext(engagementRow.engagementId)?.actorId || ''
  if (!actorId) return null
  return { runId: 'm7-demo', generationId: String(engagementRow.generationId), actorId: String(actorId), engagementId: String(engagementRow.engagementId), formId }
}

function clearSharedDraft(formId) {
  if (!sharedDraftForms) return
  const scope = sharedDraftScope(formId)
  if (scope) sharedDraftForms.clear(scope)
  const status = { ...draftStatus.value }
  delete status[formId]
  draftStatus.value = status
}

function saveSharedDrafts() {
  if (!sharedDraftForms) return
  const valuesByForm = {
    'shared-manager': managerRationale.value,
    'shared-partner': partnerRationale.value,
    'shared-eqr': eqrNote.value,
  }
  for (const [formId, value] of Object.entries(valuesByForm)) {
    const scope = sharedDraftScope(formId)
    if (!scope) continue
    if (!String(value || '').trim()) {
      sharedDraftForms.clear(scope)
      continue
    }
    const saved = sharedDraftForms.save(scope, { [sharedDraftFieldByForm[formId]]: value }, Number(sharedEngagement.value?.revision || 0))
    if (saved.ok && saved.outcome === 'SAVED_LOCAL_DRAFT') {
      draftStatus.value = { ...draftStatus.value, [formId]: 'SAVED_LOCAL_DRAFT' }
      const errors = { ...draftErrors.value }
      delete errors[formId]
      draftErrors.value = errors
    } else if (saved.code !== 'DRAFT_SCOPE_INVALID') {
      draftErrors.value = { ...draftErrors.value, [formId]: saved.message || 'The local draft could not be saved.' }
    }
  }
}

function applySharedDraft(formId, values) {
  if (!values) return
  if (formId === 'shared-manager' && !managerRationale.value) managerRationale.value = String(values.rationale || '')
  if (formId === 'shared-partner' && !partnerRationale.value) partnerRationale.value = String(values.rationale || '')
  if (formId === 'shared-eqr' && !eqrNote.value) eqrNote.value = String(values.note || '')
}

function restoreSharedDrafts() {
  if (!sharedDraftForms) return
  for (const formId of Object.keys(sharedDraftFieldByForm)) {
    const scope = sharedDraftScope(formId)
    if (!scope) continue
    const loaded = sharedDraftForms.restore(scope, Number(sharedEngagement.value?.revision || 0))
    if (!loaded.ok || loaded.outcome !== 'DRAFT_LOADED' || !loaded.draft) continue
    if (loaded.stale) {
      draftPrompt.value = { formId, values: loaded.draft.values, baseRevision: loaded.draft.baseRevision, currentRevision: Number(sharedEngagement.value?.revision || 0) }
      continue
    }
    applySharedDraft(formId, loaded.draft.values)
  }
}

function keepSharedDraft() {
  const prompt = draftPrompt.value
  draftPrompt.value = null
  if (prompt) applySharedDraft(prompt.formId, prompt.values)
}

function discardSharedDraft() {
  const prompt = draftPrompt.value
  draftPrompt.value = null
  const scope = prompt && sharedDraftScope(prompt.formId)
  if (scope && sharedDraftForms) sharedDraftForms.clear(scope)
}

// M7 §5.2 — the EQR candidate is an action on a published Draft-FS version,
// not a typed string. The picker is populated from the workspace projection.
const eqrCandidates = computed(() => {
  const seen = new Set()
  const rows = []
  for (const row of sharedArtifacts.value || []) {
    if (String(row.documentType || '').toUpperCase() !== 'DRAFT_FS') continue
    const version = String(row.version || '')
    if (!version || seen.has(version)) continue
    seen.add(version)
    rows.push({ version, label: `${version} · ${row.title || 'Draft financial statements'}` })
  }
  return rows
})
watch(eqrCandidates, (list) => {
  if (!list.some((item) => item.version === eqrCandidate.value)) eqrCandidate.value = list[0]?.version || ''
}, { immediate: true })

async function refreshSharedDecisions() {
  const id = sharedEngagementId.value
  if (!sharedDemoEnabled || !id) return
  sharedDecisionsLoading.value = true
  try {
    const result = await getSharedDecisions(id)
    if (result.ok) sharedDecisions.value = result.decisions || []
  } finally {
    sharedDecisionsLoading.value = false
  }
}

async function refreshApprovalCenter() {
  const id = sharedEngagementId.value
  if (!sharedDemoEnabled || !id) return
  approvalLoading.value = true
  const result = await getApprovalCenter(id, approvalTab.value)
  approvalLoading.value = false
  if (result.ok) {
    approvalItems.value = Array.isArray(result.items) ? result.items : []
    approvalCounts.value = result.counts || approvalCounts.value
    approvalError.value = null
  } else {
    approvalError.value = result.error || { code: 'APPROVAL_CENTER_UNAVAILABLE', message: 'Approval center unavailable.' }
  }
}

function sharedResult(message, result) {
  const outcome = String(result?.outcome || '').toUpperCase()
  if (result?.ok) {
    sharedMessage.value = message
    refreshSharedContext()
    refreshSharedDecisions()
  } else if (outcome === 'UNCERTAIN' || result?.error?.code === 'COMMIT_UNCONFIRMED') {
    // M7 APPROVAL-03 — an unconfirmed commit keeps its intent retryable; the
    // user retries the identical request instead of re-entering a new one.
    sharedMessage.value = 'The server did not confirm this commit. Retry the same request with the same button; do not re-enter or duplicate the decision.'
  } else {
    sharedMessage.value = 'Not committed (' + (result?.error?.code || 'ERROR') + '): ' + (result?.error?.message || '')
  }
  window.setTimeout(() => { sharedMessage.value = '' }, 6000)
}

async function submitSharedManager() {
  if (sharedBusy.value) return
  sharedBusy.value = 'manager'
  const payload = { decision: managerDecision.value, rationale: managerRationale.value }
  const result = await sendSharedIntent('manager', 'RECORD_MANAGER_COMPLETION', payload, () => recordManagerCompletion(sharedEngagementId.value, { ...payload, idempotencyKey: idempotencyKey('manager-completion') }))
  sharedBusy.value = ''
  if (result.ok) {
    managerRationale.value = ''
    clearSharedDraft('shared-manager')
  }
  sharedResult('Manager ' + managerDecision.value + ' committed at input g' + (result.decision?.inputGeneration ?? '?') + '.', result)
}

async function submitSharedPartner() {
  if (sharedBusy.value) return
  sharedBusy.value = 'partner'
  const payload = { decision: partnerDecision.value, rationale: partnerRationale.value }
  const result = await sendSharedIntent('partner', 'RECORD_PARTNER_REVIEW', payload, () => recordPartnerReview(sharedEngagementId.value, { ...payload, idempotencyKey: idempotencyKey('partner-review') }))
  sharedBusy.value = ''
  if (result.ok) {
    partnerRationale.value = ''
    clearSharedDraft('shared-partner')
  }
  sharedResult('Partner ' + partnerDecision.value + ' committed.', result)
}

async function submitSharedEqr() {
  if (sharedBusy.value) return
  if (!eqrCandidate.value) {
    sharedMessage.value = 'Select a published Draft FS candidate before recording the EQR decision.'
    window.setTimeout(() => { sharedMessage.value = '' }, 6000)
    return
  }
  sharedBusy.value = 'eqr'
  const payload = { decision: eqrDecision.value, candidateId: eqrCandidate.value, note: eqrNote.value }
  const result = await sendSharedIntent('eqr', 'COMPLETE_EQR', payload, () => runSharedAction(sharedEngagementId.value, 'COMPLETE_EQR', { ...payload, idempotencyKey: idempotencyKey('eqr') }))
  sharedBusy.value = ''
  if (result.ok) {
    eqrNote.value = ''
    clearSharedDraft('shared-eqr')
  }
  sharedResult('EQR ' + eqrDecision.value + ' committed.', result)
}

watch(sharedEngagementId, () => {
  refreshSharedDecisions()
  refreshApprovalCenter()
  restoreSharedDrafts()
})
watch(sharedLoading, (now, previous) => {
  if (previous && !now) {
    refreshSharedDecisions()
    refreshApprovalCenter()
    restoreSharedDrafts()
  }
})
onMounted(() => {
  refreshSharedDecisions()
  refreshApprovalCenter()
  restoreSharedDrafts()
})
watch(approvalTab, () => refreshApprovalCenter())
watch([managerRationale, partnerRationale, eqrNote], () => {
  if (!sharedDraftForms) return
  if (draftSaveTimer) window.clearTimeout(draftSaveTimer)
  draftSaveTimer = window.setTimeout(saveSharedDrafts, 500)
})

function recordCompletion() {
  if (sharedDemoEnabled) {
    toast.value = 'Local completion recommendations are read-only in shared mode; use the shared approval center above.'
    return
  }
  if (completionWorking.value) return
  const actor = activeActor()
  const engagement = selectedEngagement.value
  completionWorking.value = true
  const result = recordCompletionRecommendation({
    engagementId: engagement?.id,
    actorPersonaId: actor?.personaId,
    expectedRevision: engagement?.revision,
    expectedSessionEpoch: actor?.sessionEpoch,
    idempotencyKey: `completion-${engagement?.id}-${engagement?.revision}-${completionDecision.value}`,
    decision: completionDecision.value,
    rationale: completionRationale.value,
  })
  completionWorking.value = false
  toast.value = result.outcome === 'COMMITTED'
    ? `${completionDecision.value === 'RECOMMEND' ? 'Completion recommendation' : 'Completion status'} recorded with ${result.data?.blockers?.length || 0} visible blocker(s).`
    : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') completionRationale.value = ''
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Professional control" title="Reviews & approvals" description="Review points, applicability and signatures are separate records. A changed dependency keeps the historical approval intact but makes it stale for the current package." action-label="Create review point" @action="createReviewPoint" />
    <WorkflowGuide :guide="workflowGuides.reviews" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="stats-strip compact"><div><span>Open review points</span><strong>{{ openCount }}</strong><small>{{ openCount }} current synthetic points in this scope</small></div><div><span>Stale approvals</span><strong>3</strong><small>Created after a dependency changed</small></div><div><span>Reviewer queue</span><strong>6</strong><small>Across synthetic engagements</small></div><div><span>Dependency health</span><strong>SIMULATION</strong><small>Live provider evidence is not connected</small></div></section>

    <ApprovalChain v-if="sharedDemoEnabled" :decisions="sharedDecisions" :progress="sharedProgress" :loading="sharedLoading || sharedDecisionsLoading" :error="sharedProgressError" :mode="sharedMode" @navigate="emit('navigate', $event)" />

    <section v-if="sharedDemoEnabled" class="panel approval-center-panel" aria-labelledby="approval-center-title">
      <div class="panel-heading">
        <div><span class="eyebrow">M7 · role-filtered approval center</span><h2 id="approval-center-title">One queue for every handoff</h2></div>
        <span class="muted-label">{{ approvalCounts.all || 0 }} visible records</span>
      </div>
      <p class="panel-copy">This queue is filtered by the server for the active tab persona. It combines actionable tasks, prior decisions, returned work, and approvals that became stale after a dependency changed.</p>
      <div class="approval-center-tabs" role="tablist" aria-label="Approval center views">
        <button v-for="tab in approvalTabs" :key="tab.key" type="button" role="tab" :aria-selected="approvalTab === tab.key" :class="{ active: approvalTab === tab.key }" @click="approvalTab = tab.key">{{ tab.label }}<span v-if="tab.key === 'my-decisions'"> · {{ approvalCounts.mine || 0 }}</span><span v-else-if="tab.key === 'returned-work'"> · {{ approvalCounts.returned || 0 }}</span><span v-else-if="tab.key === 'stale-approvals'"> · {{ approvalCounts.stale || 0 }}</span></button>
      </div>
      <p v-if="approvalError" class="guide-status-message" role="status">Approval center unavailable ({{ approvalError.code }}). The last confirmed queue is retained.</p>
      <div v-if="approvalLoading && !approvalItems.length" class="guide-empty-state">Loading the role-filtered approval queue…</div>
      <div v-else-if="!approvalItems.length" class="guide-empty-state">No records in this view. Change tabs or complete the preceding handoff.</div>
      <ul v-else class="approval-center-list">
        <li v-for="item in approvalItems" :key="`${item.kind}-${item.id}`" class="approval-center-row">
          <div class="approval-center-main"><strong>{{ item.title }}</strong><small>{{ item.owner || 'Unassigned' }} · {{ item.kind }} · {{ item.targetId || 'engagement scope' }}</small><small v-if="item.rationale">{{ item.rationale }}</small></div>
          <StatusPill :label="item.stale ? 'STALE' : item.state" :tone="item.stale ? 'warn' : item.state === 'BLOCKED' || item.state === 'REJECTED' ? 'danger' : item.state === 'APPROVED' || item.state === 'COMPLETE' ? 'good' : 'neutral'" />
          <button type="button" class="text-button" @click="emit('navigate', { routeKey: item.route || 'role-workspace', engagementId: sharedEngagementId, recordId: item.targetId || item.id })">Open <Icon name="arrow-right" :size="14" /></button>
        </li>
      </ul>
      <p class="panel-footnote"><Icon name="shield" :size="15" /><span>Approval authority is checked again at command time; a tab selection never grants access to another role's private deliberation.</span></p>
    </section>

    <section v-if="sharedDemoEnabled" class="panel shared-completion-panel" aria-labelledby="shared-completion-title">
      <div class="panel-heading"><div><span class="eyebrow">Shared D1 completion chain</span><h2 id="shared-completion-title">Manager, partner and EQR handoffs</h2></div><StatusPill :label="sharedGate('manager-completion')?.state || 'WAITING'" :tone="sharedGate('manager-completion')?.state === 'APPROVED' ? 'good' : 'neutral'" /></div>
      <p v-if="sharedMessage" class="guide-status-message" role="status">{{ sharedMessage }}</p>
      <div v-if="draftPrompt" class="draft-prompt" role="alert">
        <span>Local draft saved against revision {{ draftPrompt.baseRevision }}; the shared workspace is now at revision {{ draftPrompt.currentRevision }}.</span>
        <span class="draft-prompt-actions"><button type="button" class="row-button" @click="keepSharedDraft">Keep draft</button><button type="button" class="row-button" @click="discardSharedDraft">Discard draft</button></span>
      </div>
      <div class="split-grid">
        <form class="shared-completion-form" @submit.prevent="submitSharedManager">
          <span class="eyebrow">Manager completion ({{ sharedGate('manager-completion')?.state || '—' }})</span>
          <label>Decision<select v-model="managerDecision"><option>RECOMMEND_COMPLETE</option><option>RETURN_TO_TEAM</option><option>HOLD</option></select></label>
          <label>Rationale<input v-model="managerRationale" type="text" placeholder="Basis for the decision (required)" /></label>
          <button type="submit" class="button secondary" :disabled="!canSharedManager || sharedBusy === 'manager'">{{ sharedBusy === 'manager' ? 'Recording…' : 'Record manager decision' }}</button>
          <small v-if="draftStatus['shared-manager']" class="muted-label">{{ draftStatus['shared-manager'] }}</small>
          <small v-else-if="draftErrors['shared-manager']" class="draft-error">{{ draftErrors['shared-manager'] }}</small>
          <small v-if="!canSharedManager">Needs the Audit Manager demo persona.</small>
        </form>
        <form class="shared-completion-form" @submit.prevent="submitSharedPartner">
          <span class="eyebrow">Partner completion review ({{ sharedGate('partner-review')?.state || '—' }})</span>
          <label>Decision<select v-model="partnerDecision"><option>APPROVE_FOR_OPINION</option><option>RETURN_TO_MANAGER</option><option>HOLD</option></select></label>
          <label>Rationale<input v-model="partnerRationale" type="text" placeholder="Basis for the review (required)" /></label>
          <button type="submit" class="button secondary" :disabled="!canSharedPartner || sharedBusy === 'partner'">{{ sharedBusy === 'partner' ? 'Recording…' : 'Record partner review' }}</button>
          <small v-if="draftStatus['shared-partner']" class="muted-label">{{ draftStatus['shared-partner'] }}</small>
          <small v-else-if="draftErrors['shared-partner']" class="draft-error">{{ draftErrors['shared-partner'] }}</small>
          <small v-if="!canSharedPartner">Needs the Partner demo persona.</small>
        </form>
        <form class="shared-completion-form" @submit.prevent="submitSharedEqr">
          <span class="eyebrow">Independent EQR ({{ sharedGate('eqr')?.state || '—' }})</span>
          <label>Decision<select v-model="eqrDecision"><option>APPROVE</option><option>RETURN</option><option>HOLD</option></select></label>
          <label>Candidate<select v-model="eqrCandidate" aria-label="Published Draft FS candidate"><option v-for="item in eqrCandidates" :key="item.version" :value="item.version">{{ item.label }}</option></select></label>
          <small v-if="!eqrCandidates.length">No published Draft FS candidate yet — the partner must publish one first.</small>
          <label>Note<input v-model="eqrNote" type="text" placeholder="Required when returning or holding" /></label>
          <button type="submit" class="button secondary" :disabled="!canSharedEqr || sharedBusy === 'eqr' || !eqrCandidate">{{ sharedBusy === 'eqr' ? 'Recording…' : 'Record EQR' }}</button>
          <small v-if="draftStatus['shared-eqr']" class="muted-label">{{ draftStatus['shared-eqr'] }}</small>
          <small v-else-if="draftErrors['shared-eqr']" class="draft-error">{{ draftErrors['shared-eqr'] }}</small>
          <small v-if="!canSharedEqr">Needs the EQR demo persona.</small>
        </form>
      </div>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>Each record carries the accounting input generation it evaluated; a later TB visibly stales it.</span></p>
    </section>

    <section v-if="!sharedDemoEnabled" class="review-layout"><article class="panel review-queue-panel"><div class="panel-heading"><div><span class="eyebrow">Review queue</span><h2>Items needing a response</h2></div><div class="filter-row"><button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}</button></div></div><div class="review-list"><div v-for="point in filteredPoints" :key="point.id" class="review-row"><span class="review-severity" :class="`tone-${point.tone}`"><Icon :name="point.severity === 'Significant' ? 'warning' : 'info'" :size="15" /></span><div><div class="review-title"><strong>{{ point.title }}</strong><span>{{ point.id }}</span></div><p>{{ point.detail }}</p><small>{{ point.area }} · {{ point.assignee }} · due {{ point.due }}</small></div><div class="review-actions"><StatusPill :label="point.status" :tone="point.tone" /><button type="button" class="row-button" :disabled="point.status === 'Cleared'" @click="clearPoint(point)">{{ point.status === 'Cleared' ? 'Cleared' : 'Clear' }}</button></div></div></div></article><aside class="panel applicability-panel"><div class="panel-heading"><div><span class="eyebrow">Applicability check</span><h2>FS v05 impact map</h2></div><StatusPill label="Re-review required" tone="warn" /></div><p class="panel-copy">AJ-002 changes the accounting package. Historical approvals remain preserved, but their applicability to the release candidate is re-evaluated.</p><div class="dependency-graph"><div class="dependency-node good"><span>TB v03</span><small>Validated source</small></div><span class="dependency-line"></span><div class="dependency-node good"><span>FS v05</span><small>New package</small></div><span class="dependency-line"></span><div class="dependency-node warn"><span>Approvals</span><small>3 stale</small></div><span class="dependency-line"></span><div class="dependency-node danger"><span>Release</span><small>Blocked</small></div></div><button type="button" class="button secondary full-width" @click="dependencyLogOpen = !dependencyLogOpen">{{ dependencyLogOpen ? 'Hide dependency log' : 'Open dependency log' }} <Icon name="arrow-right" :size="16" /></button><div v-if="dependencyLogOpen" class="dependency-log"><div><code>TB-REPLACEMENT-001</code><span>Source revision changed</span><StatusPill label="Current" tone="good" /></div><div><code>AJ-002-R1</code><span>Proposed journal is management-authorized</span><StatusPill label="Re-review" tone="warn" /></div><div><code>FS-0018-ACC-2026-V05</code><span>Historical approval kept; current applicability must be recorded</span><StatusPill label="Stale" tone="danger" /></div></div></aside></section>

    <LocalFixtureNotice v-if="sharedDemoEnabled"
      title="Local review fixtures are hidden in shared mode"
      description="The shared approval center and completion chain above are authoritative in shared mode, so the local review queue and the static approval ledger are hidden here. They remain available when shared mode is off." />

    <section class="panel completion-recommendation-panel">
      <div class="panel-heading"><div><span class="eyebrow">G7 · manager handoff</span><h2>Completion recommendation</h2></div><StatusPill :label="completionRecommendation?.status || 'Not recorded'" :tone="completionRecommendation?.status === 'READY' ? 'good' : completionRecommendation ? 'warn' : 'neutral'" /></div>
      <div class="completion-recommendation-body">
        <div class="completion-recommendation-summary"><span class="eyebrow">What this does</span><p>The audit manager records whether the current file is ready for partner and EQR completion review. It never signs the opinion or authorizes release.</p><dl class="detail-list compact-details"><div><dt>Current decision</dt><dd>{{ completionRecommendation?.decision || 'NOT RECORDED' }}</dd></div><div><dt>Recorded by</dt><dd>{{ completionRecommendation?.actorId || '—' }}</dd></div><div><dt>Bound revision</dt><dd>{{ completionRecommendation?.engagementRevision || selectedEngagement?.revision || '—' }}</dd></div></dl></div>
        <div class="completion-recommendation-form"><label>Recommendation<select v-model="completionDecision"><option value="RECOMMEND">Recommend completion</option><option value="HOLD">Keep on hold</option><option value="RETURN_FOR_CORRECTION">Return for correction</option></select></label><label>Rationale<textarea v-model="completionRationale" rows="4" maxlength="500" placeholder="Summarize the review performed and remaining partner/EQR blockers"></textarea></label><button v-if="canRecommendCompletion" type="button" class="button primary" :disabled="completionWorking || completionRationale.trim().length < 8" @click="recordCompletion">{{ completionWorking ? 'Recording…' : 'Record recommendation' }} <Icon name="check-circle" :size="16" /></button><p v-else class="form-safety-note"><Icon name="lock" :size="15" />Only the assigned audit manager can record this handoff.</p></div>
      </div>
      <div v-if="completionBlockers.length" class="completion-recommendation-blockers"><span class="eyebrow">Still visible for the next authority</span><ul class="check-list compact"><li v-for="blocker in completionBlockers" :key="`${blocker.code}-${blocker.message}`"><span class="list-icon danger"><Icon name="lock" :size="13" /></span><span><strong>{{ blocker.code }}</strong><small>{{ blocker.message }}</small></span></li></ul></div>
    </section>

    <section v-if="!sharedDemoEnabled" class="panel approvals-panel"><div class="panel-heading"><div><span class="eyebrow">Approval ledger</span><h2>Who has approved what</h2></div><span class="muted-label">Exact snapshot + authority + date</span></div><div class="approval-table table-wrap responsive-table"><table><thead><tr><th>Role</th><th>Approver</th><th>Object</th><th>Status</th><th>Recorded</th><th><span class="sr-only">Action</span></th></tr></thead><tbody><tr v-for="approval in approvals" :key="approval.role"><td><strong>{{ approval.role }}</strong></td><td>{{ approval.person }}</td><td><code>{{ approval.object }}</code></td><td><StatusPill :label="approval.status" :tone="approval.tone" /></td><td>{{ approval.date }}</td><td><button type="button" class="row-button" @click="inspectApproval(approval)">{{ selectedApproval?.role === approval.role ? 'Close' : 'Inspect' }} <Icon name="arrow-right" :size="15" /></button></td></tr></tbody></table></div><div v-if="selectedApproval" class="approval-inspection"><span class="eyebrow">Selected approval</span><h3>{{ selectedApproval.role }} · {{ selectedApproval.status }}</h3><dl class="detail-list compact-details"><div><dt>Approver</dt><dd>{{ selectedApproval.person }}</dd></div><div><dt>Bound object</dt><dd><code>{{ selectedApproval.object }}</code></dd></div><div><dt>Recorded</dt><dd>{{ selectedApproval.date }}</dd></div><div><dt>Evidence</dt><dd>Exact revision and authority are retained in the synthetic event ledger.</dd></div></dl></div></section>

    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Review principle</span><h2>Clearance is not deletion</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Historical decision retained</strong><small>Who approved the earlier snapshot and why remains visible.</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Applicability can change</strong><small>New TB, package, risk or evidence revision triggers impact review.</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Responders cannot self-clear significant work</strong><small>Authority and reviewer role are checked at the action boundary.</small></span></li></ul></article><article class="panel stat-highlight"><span class="eyebrow">Current release impact</span><h2>{{ formatMoney(12500) }}</h2><p>Proposed receivables provision remains in management discussion. Until it is evaluated and the affected package is re-approved, G6 and G7 remain blocked.</p><button type="button" class="text-button" @click="openFindingRegister">Open finding register <Icon name="arrow-right" :size="15" /></button></article></section>

    <div v-if="reviewDraftOpen" class="modal-backdrop" role="presentation" @click.self="reviewDraftOpen = false"><section class="modal-panel review-draft-modal" role="dialog" aria-modal="true" aria-labelledby="review-draft-title"><div class="modal-header"><div><span class="eyebrow">P15 review control</span><h2 id="review-draft-title">Create review point</h2><p>Assign a supported response to the exact scoped engagement revision.</p></div><button type="button" class="icon-button" aria-label="Close review point form" title="Close review point form" @click="reviewDraftOpen = false"><Icon name="x" :size="17" /></button></div><div class="form-grid"><label>Title<input v-model="reviewDraft.title" type="text" maxlength="120" placeholder="e.g. Disclosure support missing" /></label><label>Severity<select v-model="reviewDraft.severity"><option value="ROUTINE">Routine</option><option value="SIGNIFICANT">Significant</option></select></label><label>Response owner<select v-model="reviewDraft.assigneeActorId"><option v-for="reviewer in scopedReviewers" :key="reviewer.id" :value="reviewer.id">{{ reviewer.name }} · {{ reviewer.roles.join(' / ') }}</option></select></label><label>Due date<input v-model="reviewDraft.due" type="date" /></label><label class="form-span-2">Detail / evidence expectation<textarea v-model="reviewDraft.detail" rows="5" maxlength="500" placeholder="Describe the conflict, exact version, and response needed."></textarea></label></div><div class="modal-footer"><span><Icon name="lock" :size="16" />Creating a point never clears it; an independent reviewer must record the later response.</span><button type="button" class="button primary" :disabled="reviewDraftWorking || !reviewDraft.title.trim() || !reviewDraft.detail.trim()" @click="saveReviewDraft">{{ reviewDraftWorking ? 'Saving…' : 'Create review point' }}</button></div></section></div>
  </div>
</template>

<style scoped>
.approval-center-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.approval-center-tabs button { border: 1px solid var(--border, #dbe3ef); border-radius: 999px; padding: 7px 11px; background: var(--surface, #fff); color: var(--muted, #667085); font: inherit; font-size: 12px; cursor: pointer; }
.approval-center-tabs button.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 700; }
.approval-center-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border, #e5e7eb); }
.approval-center-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border, #e5e7eb); }
.approval-center-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.approval-center-main strong { color: var(--ink, #172033); }
.approval-center-main small { color: var(--muted, #667085); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 680px) {
  .approval-center-row { grid-template-columns: minmax(0, 1fr) auto; }
  .approval-center-row > .text-button { grid-column: 1 / -1; justify-self: start; }
}
.draft-prompt { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border: 1px solid #f0c36d; background: #fff8e6; border-radius: 10px; padding: 10px 12px; margin: 10px 0; color: #7a4d00; font-size: 13px; }
.draft-prompt-actions { display: flex; gap: 8px; }
.draft-error { color: #b42318; }
</style>
