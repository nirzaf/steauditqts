<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { approvals, formatMoney, workflowGuides } from '../data'
import { activeActor, actorById, clearReviewPoint as clearReviewPointCommand, createReviewPoint as createReviewPointCommand, recordCompletionRecommendation, scenario, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'

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
  if (point.status === 'Cleared') return
  const result = clearReviewPointCommand({ pointId: point.id, actorPersonaId: activeActor()?.personaId, expectedRevision: point.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `review-clear-${point.id}-${point.revision}`, response: 'Reviewed exact response and alternative-work reference.' })
  toast.value = result.outcome === 'COMMITTED' ? `${point.id} cleared with an appended reviewer decision.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createReviewPoint() {
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

function recordCompletion() {
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

    <section class="review-layout"><article class="panel review-queue-panel"><div class="panel-heading"><div><span class="eyebrow">Review queue</span><h2>Items needing a response</h2></div><div class="filter-row"><button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}</button></div></div><div class="review-list"><div v-for="point in filteredPoints" :key="point.id" class="review-row"><span class="review-severity" :class="`tone-${point.tone}`"><Icon :name="point.severity === 'Significant' ? 'warning' : 'info'" :size="15" /></span><div><div class="review-title"><strong>{{ point.title }}</strong><span>{{ point.id }}</span></div><p>{{ point.detail }}</p><small>{{ point.area }} · {{ point.assignee }} · due {{ point.due }}</small></div><div class="review-actions"><StatusPill :label="point.status" :tone="point.tone" /><button type="button" class="row-button" :disabled="point.status === 'Cleared'" @click="clearPoint(point)">{{ point.status === 'Cleared' ? 'Cleared' : 'Clear' }}</button></div></div></div></article><aside class="panel applicability-panel"><div class="panel-heading"><div><span class="eyebrow">Applicability check</span><h2>FS v05 impact map</h2></div><StatusPill label="Re-review required" tone="warn" /></div><p class="panel-copy">AJ-002 changes the accounting package. Historical approvals remain preserved, but their applicability to the release candidate is re-evaluated.</p><div class="dependency-graph"><div class="dependency-node good"><span>TB v03</span><small>Validated source</small></div><span class="dependency-line"></span><div class="dependency-node good"><span>FS v05</span><small>New package</small></div><span class="dependency-line"></span><div class="dependency-node warn"><span>Approvals</span><small>3 stale</small></div><span class="dependency-line"></span><div class="dependency-node danger"><span>Release</span><small>Blocked</small></div></div><button type="button" class="button secondary full-width" @click="dependencyLogOpen = !dependencyLogOpen">{{ dependencyLogOpen ? 'Hide dependency log' : 'Open dependency log' }} <Icon name="arrow-right" :size="16" /></button><div v-if="dependencyLogOpen" class="dependency-log"><div><code>TB-REPLACEMENT-001</code><span>Source revision changed</span><StatusPill label="Current" tone="good" /></div><div><code>AJ-002-R1</code><span>Proposed journal is management-authorized</span><StatusPill label="Re-review" tone="warn" /></div><div><code>FS-0018-ACC-2026-V05</code><span>Historical approval kept; current applicability must be recorded</span><StatusPill label="Stale" tone="danger" /></div></div></aside></section>

    <section class="panel completion-recommendation-panel">
      <div class="panel-heading"><div><span class="eyebrow">G7 · manager handoff</span><h2>Completion recommendation</h2></div><StatusPill :label="completionRecommendation?.status || 'Not recorded'" :tone="completionRecommendation?.status === 'READY' ? 'good' : completionRecommendation ? 'warn' : 'neutral'" /></div>
      <div class="completion-recommendation-body">
        <div class="completion-recommendation-summary"><span class="eyebrow">What this does</span><p>The audit manager records whether the current file is ready for partner and EQR completion review. It never signs the opinion or authorizes release.</p><dl class="detail-list compact-details"><div><dt>Current decision</dt><dd>{{ completionRecommendation?.decision || 'NOT RECORDED' }}</dd></div><div><dt>Recorded by</dt><dd>{{ completionRecommendation?.actorId || '—' }}</dd></div><div><dt>Bound revision</dt><dd>{{ completionRecommendation?.engagementRevision || selectedEngagement?.revision || '—' }}</dd></div></dl></div>
        <div class="completion-recommendation-form"><label>Recommendation<select v-model="completionDecision"><option value="RECOMMEND">Recommend completion</option><option value="HOLD">Keep on hold</option><option value="RETURN_FOR_CORRECTION">Return for correction</option></select></label><label>Rationale<textarea v-model="completionRationale" rows="4" maxlength="500" placeholder="Summarize the review performed and remaining partner/EQR blockers"></textarea></label><button v-if="canRecommendCompletion" type="button" class="button primary" :disabled="completionWorking || completionRationale.trim().length < 8" @click="recordCompletion">{{ completionWorking ? 'Recording…' : 'Record recommendation' }} <Icon name="check-circle" :size="16" /></button><p v-else class="form-safety-note"><Icon name="lock" :size="15" />Only the assigned audit manager can record this handoff.</p></div>
      </div>
      <div v-if="completionBlockers.length" class="completion-recommendation-blockers"><span class="eyebrow">Still visible for the next authority</span><ul class="check-list compact"><li v-for="blocker in completionBlockers" :key="`${blocker.code}-${blocker.message}`"><span class="list-icon danger"><Icon name="lock" :size="13" /></span><span><strong>{{ blocker.code }}</strong><small>{{ blocker.message }}</small></span></li></ul></div>
    </section>

    <section class="panel approvals-panel"><div class="panel-heading"><div><span class="eyebrow">Approval ledger</span><h2>Who has approved what</h2></div><span class="muted-label">Exact snapshot + authority + date</span></div><div class="approval-table table-wrap responsive-table"><table><thead><tr><th>Role</th><th>Approver</th><th>Object</th><th>Status</th><th>Recorded</th><th><span class="sr-only">Action</span></th></tr></thead><tbody><tr v-for="approval in approvals" :key="approval.role"><td><strong>{{ approval.role }}</strong></td><td>{{ approval.person }}</td><td><code>{{ approval.object }}</code></td><td><StatusPill :label="approval.status" :tone="approval.tone" /></td><td>{{ approval.date }}</td><td><button type="button" class="row-button" @click="inspectApproval(approval)">{{ selectedApproval?.role === approval.role ? 'Close' : 'Inspect' }} <Icon name="arrow-right" :size="15" /></button></td></tr></tbody></table></div><div v-if="selectedApproval" class="approval-inspection"><span class="eyebrow">Selected approval</span><h3>{{ selectedApproval.role }} · {{ selectedApproval.status }}</h3><dl class="detail-list compact-details"><div><dt>Approver</dt><dd>{{ selectedApproval.person }}</dd></div><div><dt>Bound object</dt><dd><code>{{ selectedApproval.object }}</code></dd></div><div><dt>Recorded</dt><dd>{{ selectedApproval.date }}</dd></div><div><dt>Evidence</dt><dd>Exact revision and authority are retained in the synthetic event ledger.</dd></div></dl></div></section>

    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Review principle</span><h2>Clearance is not deletion</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Historical decision retained</strong><small>Who approved the earlier snapshot and why remains visible.</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Applicability can change</strong><small>New TB, package, risk or evidence revision triggers impact review.</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Responders cannot self-clear significant work</strong><small>Authority and reviewer role are checked at the action boundary.</small></span></li></ul></article><article class="panel stat-highlight"><span class="eyebrow">Current release impact</span><h2>{{ formatMoney(12500) }}</h2><p>Proposed receivables provision remains in management discussion. Until it is evaluated and the affected package is re-approved, G6 and G7 remain blocked.</p><button type="button" class="text-button" @click="openFindingRegister">Open finding register <Icon name="arrow-right" :size="15" /></button></article></section>

    <div v-if="reviewDraftOpen" class="modal-backdrop" role="presentation" @click.self="reviewDraftOpen = false"><section class="modal-panel review-draft-modal" role="dialog" aria-modal="true" aria-labelledby="review-draft-title"><div class="modal-header"><div><span class="eyebrow">P15 review control</span><h2 id="review-draft-title">Create review point</h2><p>Assign a supported response to the exact scoped engagement revision.</p></div><button type="button" class="icon-button" aria-label="Close review point form" title="Close review point form" @click="reviewDraftOpen = false"><Icon name="x" :size="17" /></button></div><div class="form-grid"><label>Title<input v-model="reviewDraft.title" type="text" maxlength="120" placeholder="e.g. Disclosure support missing" /></label><label>Severity<select v-model="reviewDraft.severity"><option value="ROUTINE">Routine</option><option value="SIGNIFICANT">Significant</option></select></label><label>Response owner<select v-model="reviewDraft.assigneeActorId"><option v-for="reviewer in scopedReviewers" :key="reviewer.id" :value="reviewer.id">{{ reviewer.name }} · {{ reviewer.roles.join(' / ') }}</option></select></label><label>Due date<input v-model="reviewDraft.due" type="date" /></label><label class="form-span-2">Detail / evidence expectation<textarea v-model="reviewDraft.detail" rows="5" maxlength="500" placeholder="Describe the conflict, exact version, and response needed."></textarea></label></div><div class="modal-footer"><span><Icon name="lock" :size="16" />Creating a point never clears it; an independent reviewer must record the later response.</span><button type="button" class="button primary" :disabled="reviewDraftWorking || !reviewDraft.title.trim() || !reviewDraft.detail.trim()" @click="saveReviewDraft">{{ reviewDraftWorking ? 'Saving…' : 'Create review point' }}</button></div></section></div>
  </div>
</template>
