<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { approvals, formatMoney, workflowGuides } from '../data'
import { activeActor, actorById, clearReviewPoint as clearReviewPointCommand, scenario } from '../domain/scenario.js'

const points = computed(() => scenario.reviews.map((point) => ({
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
const filteredPoints = computed(() => points.value.filter((point) => activeFilter.value === 'All points' || (activeFilter.value === 'Blocking' && point.blocks) || (activeFilter.value === 'My queue' && point.assignee === 'Omar Aziz')))
const openCount = computed(() => points.value.filter((point) => point.status !== 'Cleared').length)

function clearPoint(point) {
  if (point.status === 'Cleared') return
  const result = clearReviewPointCommand({ pointId: point.id, actorPersonaId: activeActor()?.personaId, expectedRevision: point.revision, response: 'Reviewed exact response and alternative-work reference.' })
  toast.value = result.outcome === 'COMMITTED' ? `${point.id} cleared with an appended reviewer decision.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createReviewPoint() {
  toast.value = 'Review-point draft opened. Link the exact version, evidence conflict, response owner, due date, and blocking impact.'
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Professional control" title="Reviews & approvals" description="Review points, applicability and signatures are separate records. A changed dependency keeps the historical approval intact but makes it stale for the current package." action-label="Create review point" @action="createReviewPoint" />
    <WorkflowGuide :guide="workflowGuides.reviews" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="stats-strip compact"><div><span>Open review points</span><strong>{{ openCount }}</strong><small>{{ openCount }} current synthetic points in this scope</small></div><div><span>Stale approvals</span><strong>3</strong><small>Created after a dependency changed</small></div><div><span>Reviewer queue</span><strong>6</strong><small>Across synthetic engagements</small></div><div><span>Dependency health</span><strong>SIMULATION</strong><small>Live provider evidence is not connected</small></div></section>

    <section class="review-layout"><article class="panel review-queue-panel"><div class="panel-heading"><div><span class="eyebrow">Review queue</span><h2>Items needing a response</h2></div><div class="filter-row"><button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}</button></div></div><div class="review-list"><div v-for="point in filteredPoints" :key="point.id" class="review-row"><span class="review-severity" :class="`tone-${point.tone}`"><Icon :name="point.severity === 'Significant' ? 'warning' : 'info'" :size="15" /></span><div><div class="review-title"><strong>{{ point.title }}</strong><span>{{ point.id }}</span></div><p>{{ point.detail }}</p><small>{{ point.area }} · {{ point.assignee }} · due {{ point.due }}</small></div><div class="review-actions"><StatusPill :label="point.status" :tone="point.tone" /><button type="button" class="row-button" :disabled="point.status === 'Cleared'" @click="clearPoint(point)">{{ point.status === 'Cleared' ? 'Cleared' : 'Clear' }}</button></div></div></div></article><aside class="panel applicability-panel"><div class="panel-heading"><div><span class="eyebrow">Applicability check</span><h2>FS v05 impact map</h2></div><StatusPill label="Re-review required" tone="warn" /></div><p class="panel-copy">AJ-002 changes the accounting package. Historical approvals remain preserved, but their applicability to the release candidate is re-evaluated.</p><div class="dependency-graph"><div class="dependency-node good"><span>TB v03</span><small>Validated source</small></div><span class="dependency-line"></span><div class="dependency-node good"><span>FS v05</span><small>New package</small></div><span class="dependency-line"></span><div class="dependency-node warn"><span>Approvals</span><small>3 stale</small></div><span class="dependency-line"></span><div class="dependency-node danger"><span>Release</span><small>Blocked</small></div></div><button type="button" class="button secondary full-width">Open dependency log <Icon name="arrow-right" :size="16" /></button></aside></section>

    <section class="panel approvals-panel"><div class="panel-heading"><div><span class="eyebrow">Approval ledger</span><h2>Who has approved what</h2></div><span class="muted-label">Exact snapshot + authority + date</span></div><div class="approval-table table-wrap responsive-table"><table><thead><tr><th>Role</th><th>Approver</th><th>Object</th><th>Status</th><th>Recorded</th><th><span class="sr-only">Action</span></th></tr></thead><tbody><tr v-for="approval in approvals" :key="approval.role"><td><strong>{{ approval.role }}</strong></td><td>{{ approval.person }}</td><td><code>{{ approval.object }}</code></td><td><StatusPill :label="approval.status" :tone="approval.tone" /></td><td>{{ approval.date }}</td><td><button type="button" class="row-button">Inspect <Icon name="arrow-right" :size="15" /></button></td></tr></tbody></table></div></section>

    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Review principle</span><h2>Clearance is not deletion</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Historical decision retained</strong><small>Who approved the earlier snapshot and why remains visible.</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Applicability can change</strong><small>New TB, package, risk or evidence revision triggers impact review.</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Responders cannot self-clear significant work</strong><small>Authority and reviewer role are checked at the action boundary.</small></span></li></ul></article><article class="panel stat-highlight"><span class="eyebrow">Current release impact</span><h2>{{ formatMoney(12500) }}</h2><p>Proposed receivables provision remains in management discussion. Until it is evaluated and the affected package is re-approved, G6 and G7 remain blocked.</p><button type="button" class="text-button">Open finding register <Icon name="arrow-right" :size="15" /></button></article></section>
  </div>
</template>
