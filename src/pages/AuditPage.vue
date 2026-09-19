<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, formatMoney, workpapers as templateWorkpapers, workflowGuides } from '../data'
import { activeActor, actorById, auditChainSummary, auditFindingFor, auditPopulationFor, auditSampleFor, createWorkpaperDraft, recordAlternativeWork, recordFindingDisposition, recordMaterialitySelection, recordSeniorReview, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement, submitWorkpaper } from '../domain/scenario.js'
import { loadDemoSession } from '../auth.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { useDemoContext } from '../demoContext.js'
import { evaluateAccountingInput, idempotencyKey, recordSharedSeniorReview } from '../sharedDemo.js'
import { recordTargetFor } from '../navigation/recordTargets.js'

const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const activeTab = ref('Planning')
const selectedRiskId = ref('RISK-AR-019')
const targetNotice = ref('')
const tabs = ['Planning', 'Fieldwork', 'Populations & samples']
const showEvidence = ref(false)
const toast = ref('')
const workpaperDraftOpen = ref(false)
const workpaperDraft = ref({ title: '', procedureId: '', reviewerActorId: 'ACT-OMAR', detail: '' })
const workpaperDraftWorking = ref(false)
const seniorReviewWorking = ref(false)
// Phase C — accounting → audit invalidation. When the shared input
// generation advances, audit evaluates it back before release.
const {
  activeEngagementId: sharedEngagementId,
  accountingStatus: sharedAcctStatus,
  refresh: refreshSharedContext,
} = useDemoContext()
const sharedNotice = ref('')
const sharedBusy = ref(false)
const auditGenerations = computed(() => {
  const status = sharedAcctStatus.value
  if (!sharedDemoEnabled || !status) return null
  return { input: status.inputGeneration, evaluated: status.auditEvaluatedGeneration, stale: status.inputGeneration !== status.auditEvaluatedGeneration }
})
const canEvaluateInput = computed(() => ['audit-senior', 'audit-manager', 'admin'].includes(loadDemoSession()?.role || ''))
const canSeniorReview = computed(() => Boolean(activeActor()?.roles?.some((r) => ['audit_senior', 'audit_manager', 'engagement_partner', 'system_admin'].includes(r))))

function presentationText(value) {
  return String(value || '').replace(/\bsynthetic\s*/gi, '').replace(/\s{2,}/g, ' ').trim()
}

async function submitEvaluateInput() {
  if (sharedBusy.value) return
  sharedBusy.value = true
  const result = await evaluateAccountingInput(sharedEngagementId.value, { idempotencyKey: idempotencyKey('evaluate-input') })
  sharedBusy.value = false
  sharedNotice.value = result.ok
    ? (result.duplicate ? 'Input already current — nothing to re-evaluate.' : 'Input g' + result.inputGeneration + ' evaluated. Re-confirm impacted work before release.')
    : ('Not committed (' + (result.error?.code || 'ERROR') + '): ' + (result.error?.message || ''))
  if (result.ok) refreshSharedContext()
  window.setTimeout(() => { sharedNotice.value = '' }, 6000)
}

const selectedEngagement = computed(() => scenarioEngagement())
const selectedClient = computed(() => scenarioClient())
const liveWorkpapers = computed(() => {
  const scoped = (scenario.workpapers || []).filter((item) => item.engagementId === selectedEngagement.value?.id)
  return scoped.length ? scoped.map((item) => ({
    ...item,
    area: item.id.includes('AR') ? 'Receivables' : 'Inventory',
    evidence: item.submittedSnapshotId ? 1 : 0,
    status: item.reviewState === 'CLEARED' ? 'Reviewed' : item.seniorReviewed ? 'Senior cleared' : item.state === 'SUBMITTED' ? 'In review' : 'Not submitted',
    tone: item.reviewState === 'CLEARED' ? 'good' : item.seniorReviewed ? 'good' : item.state === 'SUBMITTED' ? 'warn' : 'neutral',
    stage: item.seniorReviewed ? `Senior reviewed by ${item.seniorReviewedBy || 'Senior'}` : item.submittedSnapshotId ? `Submitted snapshot ${item.submittedSnapshotId}` : 'Working draft',
    reviewer: item.reviewerActorId,
  })) : templateWorkpapers
})

async function recordSeniorReviewAction(workpaper) {
  if (seniorReviewWorking.value || !selectedEngagement.value) return
  seniorReviewWorking.value = true
  try {
    if (sharedDemoEnabled) {
      const result = await recordSharedSeniorReview(selectedEngagement.value.id, {
        workpaperId: workpaper.id,
        decision: 'PASSED',
        notes: 'Senior review completed. Workpaper methodology and sample testing verified.',
        idempotencyKey: `senior-review-${workpaper.id}-${Date.now()}`,
      })
      if (result.ok) {
        toast.value = `Senior review recorded for ${workpaper.id}. Ready for Manager completion.`
      } else {
        toast.value = `Error: ${result.error?.message || 'Failed to record senior review'}`
      }
    } else {
      const result = recordSeniorReview({
        engagementId: selectedEngagement.value.id,
        workpaperId: workpaper.id,
        actorPersonaId: activeActor()?.personaId,
        expectedRevision: workpaper.revision,
        decision: 'PASSED',
        notes: 'Senior review completed. Workpaper methodology and sample testing verified.',
        idempotencyKey: `senior-review-${workpaper.id}-${Date.now()}`,
      })
      if (result.outcome === 'COMMITTED') {
        toast.value = `Senior review recorded for ${workpaper.id}. Ready for Manager completion.`
      } else {
        toast.value = `${result.outcome}: ${result.code} — ${result.message}`
      }
    }
  } finally {
    seniorReviewWorking.value = false
    window.setTimeout(() => { toast.value = '' }, 4000)
  }
}

const chain = computed(() => auditChainSummary(selectedEngagement.value?.id))
const risks = computed(() => chain.value.risks.map((risk) => ({
  ...risk,
  rating: risk.rating === 'HIGH' ? 'High' : risk.rating === 'SIGNIFICANT' ? 'Significant' : risk.rating,
  tone: risk.rating === 'HIGH' ? 'danger' : risk.rating === 'SIGNIFICANT' ? 'warn' : 'neutral',
  status: risk.conclusionState === 'OPEN_EXCEPTION' ? 'Exception open' : risk.conclusionState === 'IN_PROGRESS' ? 'In progress' : 'Supported',
  owner: actorById(risk.ownerActorId)?.name || risk.ownerActorId,
})))
const selectedRisk = computed(() => risks.value.find((risk) => risk.id === selectedRiskId.value) || risks.value[0] || { id: '—', area: 'No risk', assertion: '—', driver: 'No selected audit risk', response: '—', owner: '—', tone: 'neutral', rating: 'Not available', status: 'Not available' })
const selectedPopulation = computed(() => auditPopulationFor(selectedRisk.value?.populationId) || null)
const selectedPlanSamples = computed(() => (scenario.audit?.samples || []).filter((item) => item.populationId === selectedRisk.value?.populationId && (!selectedRisk.value?.samplePlanId || item.id.startsWith(`${selectedRisk.value.samplePlanId}-`))))
const selectedSample = computed(() => selectedRisk.value?.id === 'RISK-AR-019'
  ? auditSampleFor('SMP-AR-03-019')
  : selectedPlanSamples.value[0] || null)
const selectedFinding = computed(() => (scenario.audit?.findings || []).find((item) => item.engagementId === selectedEngagement.value?.id && item.riskId === selectedRisk.value?.id) || null)
const highRisks = computed(() => risks.value.filter((risk) => ['High', 'Significant'].includes(risk.rating)).length)
const linkedRiskCount = computed(() => risks.value.filter((risk) => risk.procedureId && risk.workpaperId && risk.populationId && risk.samplePlanId).length)
const riskCoverage = computed(() => risks.value.length ? Math.round((linkedRiskCount.value / risks.value.length) * 100) : 0)
const testedSampleCount = computed(() => selectedPlanSamples.value.filter((item) => item.status === 'COMPLETE' || item.status === 'ALTERNATIVE_WORK_RECORDED').length)
const canPerformIndependentWork = computed(() => Boolean(activeActor()?.roles?.some((role) => ['independent_reviewer', 'engagement_partner'].includes(role))))

watch([
  () => props.navigationTarget?.recordId,
  () => risks.value.map((risk) => risk.id).join('|'),
  () => liveWorkpapers.value.map((item) => item.id).join('|'),
], async ([recordId]) => {
  const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
  if (!recordId || (target.targetType !== 'audit' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'audit'))) return
  const risk = risks.value.find((item) => item.id === recordId)
  const workpaper = liveWorkpapers.value.find((item) => item.id === recordId)
  const population = (scenario.audit?.populations || []).find((item) => item.id === recordId)
  const sample = (scenario.audit?.samples || []).find((item) => item.id === recordId || item.samplePlanId === recordId || item.planId === recordId)
  const finding = (scenario.audit?.findings || []).find((item) => item.id === recordId)
  const linkedRiskId = workpaper?.riskId || population?.riskId || sample?.riskId || finding?.riskId
    || risks.value.find((item) => item.workpaperId === workpaper?.id || item.populationId === population?.id || item.samplePlanId === (sample?.samplePlanId || sample?.planId))?.id
  if (risk || workpaper || population || sample || finding || linkedRiskId) {
    selectedRiskId.value = risk?.id || linkedRiskId || selectedRiskId.value
    if (workpaper) activeTab.value = 'Fieldwork'
    if (population || sample) activeTab.value = 'Populations & samples'
    targetNotice.value = ''
    await nextTick()
    if (typeof document !== 'undefined') document.querySelector(`[data-record-id="${recordId}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  } else targetNotice.value = `${recordId} is not in the selected audit scope.`
}, { immediate: true })

function addWorkpaper() {
  if (sharedDemoEnabled) {
    toast.value = 'Local workpaper fixtures are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  workpaperDraft.value = { title: '', procedureId: selectedRisk.value?.procedureId || '', reviewerActorId: 'ACT-OMAR', detail: '' }
  workpaperDraftOpen.value = true
}

function saveWorkpaperDraft() {
  if (sharedDemoEnabled) {
    toast.value = 'Local workpaper fixtures are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  if (workpaperDraftWorking.value || !workpaperDraft.value.title.trim()) return
  workpaperDraftWorking.value = true
  const actor = activeActor()
  const result = createWorkpaperDraft({ engagementId: selectedEngagement.value?.id, actorPersonaId: actor?.personaId, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `workpaper-create-${selectedEngagement.value?.id}-${workpaperDraft.value.title.trim().toLowerCase()}`, ...workpaperDraft.value })
  workpaperDraftWorking.value = false
  workpaperDraftOpen.value = false
  toast.value = result.outcome === 'COMMITTED' ? `${result.data.id} draft created. Submit an exact snapshot from Fieldwork when evidence is ready.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

async function submitSnapshot(workpaper) {
  if (sharedDemoEnabled) {
    toast.value = 'Local evidence snapshots are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  const result = await submitWorkpaper({ workpaperId: workpaper.id, actorPersonaId: activeActor()?.personaId, expectedRevision: workpaper.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `workpaper-${workpaper.id}-${workpaper.revision}`, content: `${workpaper.id}|${selectedClient.value?.id}|${selectedEngagement.value?.period}|synthetic-snapshot` })
  toast.value = result.outcome === 'COMMITTED' ? `${workpaper.id} submitted as an exact snapshot ${result.data.snapshot.id}. Reviewer sees this snapshot, not a mutable “latest” file.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function recordAlternative() {
  if (sharedDemoEnabled) {
    toast.value = 'Local evidence fixtures are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  const sample = selectedSample.value
  if (!sample) return
  const evidence = selectedRisk.value.id === 'RISK-AR-019' ? 'Independent customer confirmation SNAP-AR-019-AW' : 'Independent inventory count observation SNAP-INV-001-AW'
  const conclusion = selectedRisk.value.id === 'RISK-AR-019' ? 'Alternative work supports the selected receivable balance; no further replacement of the original item.' : 'Alternative work supports the selected inventory quantity and cut-off treatment.'
  const result = recordAlternativeWork({ engagementId: selectedEngagement.value.id, sampleId: sample.id, actorPersonaId: activeActor()?.personaId, expectedRevision: sample.revision, idempotencyKey: `alternative-${sample.id}-${sample.revision}`, evidence, conclusion })
  toast.value = result.outcome === 'COMMITTED' ? `${sample.rowId} alternative work recorded against sample revision ${result.revision}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function disposeFinding() {
  if (sharedDemoEnabled) {
    toast.value = 'Local finding fixtures are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  const finding = selectedFinding.value
  if (!finding) return
  const result = recordFindingDisposition({ engagementId: selectedEngagement.value.id, findingId: finding.id, actorPersonaId: activeActor()?.personaId, expectedRevision: finding.revision, idempotencyKey: `finding-${finding.id}-${finding.revision}`, decision: 'ACCEPT_EXCEPTION', rationale: 'Synthetic partner disposition after alternative work is documented.' })
  toast.value = result.outcome === 'COMMITTED' ? `${finding.id} disposition recorded; historical evidence remains preserved.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function recordMateriality() {
  if (sharedDemoEnabled) {
    toast.value = 'Local materiality fixtures are read-only in shared mode; use the shared audit workflow above.'
    return
  }
  const result = recordMaterialitySelection({ engagementId: selectedEngagement.value.id, actorPersonaId: activeActor()?.personaId, expectedRevision: chain.value.materialityRecord?.revision, idempotencyKey: `materiality-${selectedEngagement.value.id}-${chain.value.materialityRecord?.revision}`, normalizedBenchmark: chain.value.materialityRecord?.normalizedBenchmark, selectedRate: chain.value.materialityRecord?.selectedRate, performanceRate: chain.value.materialityRecord?.performanceRate, trivialRate: chain.value.materialityRecord?.trivialRate, rationale: chain.value.materialityRecord?.rationale })
  toast.value = result.outcome === 'COMMITTED' ? 'Materiality selection recorded as a new revision with computed thresholds.' : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Audit execution" title="Audit & fieldwork" description="Move from approved materiality and risk responses to populations, selected items, evidence and supported conclusions. The platform records the chain; professionals evaluate it." action-label="Add workpaper" @action="addWorkpaper" />
    <WorkflowGuide :guide="workflowGuides.audit" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <div v-if="auditGenerations?.stale" class="permission-notice" role="alert">
      <Icon name="warning" :size="17" />
      <span><strong>AUDIT INPUT CHANGED</strong> — accounting is at g{{ auditGenerations.input }}, audit evaluated g{{ auditGenerations.evaluated }}. Reviews, draft response, manager recommendation and opinion against the older input are stale. Re-evaluate impacted work before release.</span>
      <button type="button" class="button secondary" :disabled="!canEvaluateInput || sharedBusy" @click="submitEvaluateInput">{{ sharedBusy ? 'Evaluating…' : 'Evaluate input g' + auditGenerations.input }}</button>
    </div>
    <p v-if="sharedNotice" class="guide-status-message" role="status">{{ sharedNotice }}</p>
    <p v-if="targetNotice" class="guide-status-message" role="status"><Icon name="warning" :size="16" />{{ targetNotice }}</p>


    <section v-if="workpaperDraftOpen" class="panel workpaper-draft-panel" aria-labelledby="workpaper-draft-title"><div class="panel-heading"><div><span class="eyebrow">Scoped workpaper workspace</span><h2 id="workpaper-draft-title">Open a working-paper draft</h2></div><button type="button" class="icon-button" aria-label="Close workpaper draft" title="Close workpaper draft" @click="workpaperDraftOpen = false"><Icon name="x" :size="17" /></button></div><p class="panel-copy">Create the draft record first, then submit an exact evidence snapshot from Fieldwork. A draft does not clear a review point or imply a conclusion.</p><form class="portal-form" @submit.prevent="saveWorkpaperDraft"><div class="form-grid"><label>Workpaper title<input v-model="workpaperDraft.title" name="workpaper-title" required maxlength="140" placeholder="e.g. Payroll completeness testing…" /></label><label>Procedure ID<input v-model="workpaperDraft.procedureId" name="procedure-id" maxlength="60" autocomplete="off" placeholder="PROC-PAY-01…" /></label><label>Reviewer<select v-model="workpaperDraft.reviewerActorId" name="workpaper-reviewer"><option value="ACT-OMAR">Omar Aziz · manager</option><option value="ACT-FATIMA">Fatima Saleh · independent reviewer</option></select></label><label class="form-span-2">Evidence plan<textarea v-model="workpaperDraft.detail" name="evidence-plan" rows="3" maxlength="500" placeholder="Describe the evidence and expected conclusion support…"></textarea></label></div><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Draft is scoped to {{ selectedEngagement?.id || 'the selected engagement' }}.</span><button type="submit" class="button primary" :disabled="workpaperDraftWorking || !workpaperDraft.title.trim()">{{ workpaperDraftWorking ? 'Saving…' : 'Create draft record' }}<Icon name="arrow-right" :size="17" /></button></div></form></section>

    <section class="audit-hero panel"><div><span class="eyebrow">{{ selectedEngagement?.id || 'ENG-0018-AUD-2026' }} · {{ selectedClient?.name || client.name }}</span><h2>Risk-based audit plan</h2><p>Audit plan revision {{ chain.materialityRecord?.revision || '—' }} · source revision {{ chain.materialityRecord?.sourceRevision || '—' }} · preliminary information pinned to the selected accounting source</p></div><div class="audit-hero-meta"><StatusPill :label="selectedEngagement?.service === 'audit' ? 'Plan approved' : 'Audit route preview'" tone="good" /><span>{{ highRisks }} significant risks · {{ risks.length }} linked responses · {{ selectedEngagement?.period || 'FY2026' }}</span></div></section>

    <section class="stats-strip compact"><div><span>Overall materiality</span><strong>{{ formatMoney(chain.materiality.overall) }}</strong><small>{{ chain.materialityRecord?.id || 'Materiality record' }} · professional selection</small></div><div><span>Performance materiality</span><strong>{{ formatMoney(chain.materiality.performance) }}</strong><small>{{ Number(chain.materiality.performanceRate) * 100 }}% of overall · derived threshold</small></div><div><span>Clearly trivial</span><strong>{{ formatMoney(chain.materiality.trivial) }}</strong><small>{{ Number(chain.materiality.trivialRate) * 100 }}% of overall · derived threshold</small></div><div><span>Risk coverage</span><strong>{{ riskCoverage }}%</strong><small>{{ linkedRiskCount }} of {{ risks.length }} planned responses linked</small></div></section>

    <nav class="sub-tabs" aria-label="Audit views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Planning'">
      <section class="audit-layout"><article class="panel risk-panel"><div class="panel-heading"><div><span class="eyebrow">Risk and assertion register</span><h2>What the plan responds to</h2></div><button type="button" class="text-button" @click="toast = `${risks.length} synthetic risks are linked to procedures, populations, samples and findings.`">Coverage query <Icon name="arrow-right" :size="15" /></button></div><div class="risk-table"><button v-for="risk in risks" :key="risk.id" :data-record-id="risk.id" type="button" class="risk-row" :class="{ active: selectedRisk.id === risk.id }" @click="selectedRiskId = risk.id"><span class="risk-code">{{ risk.id }}</span><span><strong>{{ risk.area }}</strong><small>{{ risk.assertion }} · {{ risk.driver }}</small></span><span class="risk-rating" :class="`tone-${risk.tone}`">{{ risk.rating }}</span><span class="risk-status">{{ risk.status }}</span><Icon class="risk-arrow" name="arrow-right" :size="16" /></button></div></article><aside class="panel selected-risk-panel"><div class="panel-heading"><div><span class="eyebrow">Selected risk</span><h2>{{ selectedRisk.area }}</h2></div><StatusPill :label="selectedRisk.rating + ' risk'" :tone="selectedRisk.tone" /></div><dl class="detail-list"><div><dt>Assertion</dt><dd>{{ selectedRisk.assertion }}</dd></div><div><dt>Risk driver</dt><dd>{{ selectedRisk.driver }}</dd></div><div><dt>Approved response</dt><dd>{{ selectedRisk.response }}</dd></div><div><dt>Owner</dt><dd>{{ selectedRisk.owner }}</dd></div><div><dt>Procedure / workpaper</dt><dd>{{ selectedRisk.procedureId || '—' }} · {{ selectedRisk.workpaperId || '—' }}</dd></div><div><dt>Population / sample</dt><dd>{{ selectedRisk.populationId || '—' }} · {{ selectedRisk.samplePlanId || '—' }}</dd></div></dl><button type="button" class="button secondary full-width" @click="showEvidence = !showEvidence">{{ showEvidence ? 'Hide linked work' : 'Show linked work' }} <Icon name="arrow-right" :size="16" /></button><div v-if="showEvidence" class="linked-work"><span class="eyebrow">Linked procedures</span><p>{{ selectedRisk.procedureId }} · {{ selectedRisk.workpaperId }} · {{ selectedRisk.populationId }} · {{ selectedRisk.samplePlanId }}</p><StatusPill :label="selectedRisk.status" :tone="selectedRisk.tone" /></div></aside></section>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Materiality rationale</span><h2>Professional selection, automated maths</h2></div><StatusPill :label="chain.materialityRecord?.reviewedBy ? 'Reviewed' : 'Needs review'" :tone="chain.materialityRecord?.reviewedBy ? 'good' : 'warn'" /></div><div class="rationale"><div class="rationale-number">{{ formatMoney(chain.materiality.overall) }}</div><p>{{ presentationText(chain.materialityRecord?.rationale || 'The benchmark, selected rate, normalization and qualitative considerations are preserved with the assessment revision.') }} The application calculates dependent thresholds but does not choose the methodology for the partner.</p></div><div class="threshold-row"><div><span>Benchmark</span><strong>{{ chain.materialityRecord?.benchmark || '—' }}</strong></div><div><span>Selected rate</span><strong>{{ Number(chain.materiality.selectedRate) * 100 }}%</strong></div><div><span>Performance / trivial</span><strong>{{ formatMoney(chain.materiality.performance) }} · {{ formatMoney(chain.materiality.trivial) }}</strong></div></div><div class="card-footer"><span>Source {{ chain.materialityRecord?.sourceId || '—' }} · revision {{ chain.materialityRecord?.revision || '—' }}</span><button v-if="selectedEngagement?.service === 'audit' && activeActor()?.roles?.includes('engagement_partner')" type="button" class="row-button" @click="recordMateriality">Record selection</button></div></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Program governance</span><h2>Procedures are tailored copies</h2></div><button type="button" class="text-button" @click="toast = 'Audit program links are controlled records; each procedure points to a named workpaper and population.'">Open program <Icon name="arrow-right" :size="15" /></button></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Audit program FS-AUD-2026 v2</strong><small>Approved methodology owner: Technical committee</small></span></li><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>{{ selectedRisk.procedureId || 'Procedure' }} linked</strong><small>{{ selectedRisk.workpaperId || 'Workpaper' }} · {{ selectedRisk.populationId || 'Population' }}</small></span></li><li><span class="list-icon" :class="selectedSample?.evidenceState === 'CONTRADICTORY' && !selectedSample?.alternativeWork ? 'warn' : 'good'"><Icon :name="selectedSample?.alternativeWork || selectedSample?.status === 'COMPLETE' ? 'check' : 'warning'" :size="14" /></span><span><strong>{{ selectedRisk.id }} evidence</strong><small>{{ selectedSample?.alternativeWork ? 'Alternative work recorded; historical item retained' : selectedSample?.evidenceState === 'CONTRADICTORY' ? 'Open exception prevents area conclusion' : 'Selected evidence is supported or in progress' }}</small></span></li></ul></article></section>
    </template>

    <template v-else-if="activeTab === 'Fieldwork'">
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Working papers</span><h2>Evidence-to-conclusion workspace</h2></div><span class="muted-label">{{ liveWorkpapers.length }} workpapers · exact snapshots</span></div><div class="workpaper-grid"><article v-for="workpaper in liveWorkpapers" :key="workpaper.id" class="workpaper-card"><div class="workpaper-top"><span class="workpaper-id">{{ workpaper.id }}</span><StatusPill :label="workpaper.status" :tone="workpaper.tone" /></div><h3>{{ workpaper.title }}</h3><p>{{ workpaper.area }} · {{ workpaper.evidence }} evidence snapshots</p><div class="workpaper-stage"><span>{{ workpaper.stage }}</span><i><b :style="{ width: workpaper.status === 'Reviewed' || workpaper.seniorReviewed ? '100%' : workpaper.status === 'In review' ? '68%' : workpaper.status === 'Open' ? '48%' : '18%' }"></b></i></div><div class="card-footer"><span>Reviewer · {{ workpaper.reviewer }}</span><div class="button-row" style="gap: 6px;"><button v-if="workpaper.state === 'SUBMITTED' && !workpaper.seniorReviewed && canSeniorReview" type="button" class="button small secondary" style="padding: 4px 8px; font-size: 0.72rem;" :disabled="seniorReviewWorking" @click="recordSeniorReviewAction(workpaper)">{{ seniorReviewWorking ? 'Reviewing…' : 'Senior review' }}</button><button type="button" class="row-button" :disabled="!workpaper.revision" @click="submitSnapshot(workpaper)">{{ workpaper.status === 'Not submitted' ? 'Submit snapshot' : 'New revision' }} <Icon name="arrow-right" :size="15" /></button></div></div></article></div></section>
      <section class="fieldwork-chain panel"><div class="panel-heading"><div><span class="eyebrow">Selected evidence path</span><h2>{{ selectedRisk.id }} · {{ selectedSample?.evidenceState || 'no sample selected' }}</h2></div><StatusPill :label="selectedFinding?.state === 'DISPOSED' || selectedSample?.alternativeWork ? 'Disposition recorded' : selectedSample?.evidenceState === 'CONTRADICTORY' ? 'Blocks area conclusion' : 'In progress'" :tone="selectedFinding?.state === 'DISPOSED' || selectedSample?.alternativeWork ? 'good' : selectedSample?.evidenceState === 'CONTRADICTORY' ? 'danger' : 'warn'" /></div><div class="chain"><div><span class="chain-number">1</span><strong>Population</strong><small>{{ selectedRisk.populationId || '—' }} · {{ formatMoney(selectedPopulation?.controlTotal || '0.00') }} {{ selectedPopulation?.reconciliationState === 'RECONCILED' ? 'reconciled' : 'review required' }}</small></div><span class="chain-arrow" aria-hidden="true">→</span><div><span class="chain-number">2</span><strong>Selected item</strong><small>{{ selectedSample?.rowId || 'No item' }} · original selection preserved</small></div><span class="chain-arrow" aria-hidden="true">→</span><div><span class="chain-number">3</span><strong>Evidence state</strong><small>{{ selectedSample?.evidenceState || 'NOT_RECORDED' }} · {{ selectedSample?.evidenceState === 'CONTRADICTORY' ? 'conflict requires disposition' : 'supported sample evidence' }}</small></div><span class="chain-arrow" aria-hidden="true">→</span><div><span class="chain-number">4</span><strong>Next action</strong><small>{{ selectedSample?.alternativeWork ? 'Supported alternative work recorded' : selectedSample?.evidenceState === 'CONTRADICTORY' ? 'Alternative work or supported conclusion' : 'Complete the documented procedure' }}</small></div></div><div class="card-footer"><span>Sample revision {{ selectedSample?.revision || '—' }} · finding {{ selectedFinding?.state || 'NOT_REQUIRED' }}</span><div class="button-row"><button v-if="canPerformIndependentWork && selectedSample && !selectedSample?.alternativeWork" type="button" class="button secondary" @click="recordAlternative">Record alternative work</button><button v-if="selectedFinding && activeActor()?.roles?.includes('engagement_partner') && selectedFinding?.state !== 'DISPOSED'" type="button" class="button primary" :disabled="!selectedSample?.alternativeWork" @click="disposeFinding">Record partner disposition</button></div></div></section>
    </template>

    <template v-else>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Population version</span><h2>{{ selectedRisk.area }} population</h2></div><StatusPill :label="selectedPopulation?.reconciliationState === 'RECONCILED' ? 'Reconciled' : 'Review required'" :tone="selectedPopulation?.reconciliationState === 'RECONCILED' ? 'good' : 'warn'" /></div><dl class="detail-list"><div><dt>Population ID</dt><dd>{{ selectedPopulation?.id || '—' }}</dd></div><div><dt>Source</dt><dd>{{ selectedPopulation?.sourceId || '—' }} · revision {{ selectedPopulation?.sourceRevision || '—' }}</dd></div><div><dt>Rows / control total</dt><dd>{{ selectedPopulation?.rowCount || 0 }} rows · {{ formatMoney(selectedPopulation?.controlTotal || '0.00') }}</dd></div><div><dt>Selection basis</dt><dd>{{ selectedPopulation?.selectionMethod || '—' }}</dd></div><div><dt>Fingerprint</dt><dd><code>{{ selectedPopulation?.fingerprint || '—' }}</code></dd></div><div v-if="selectedPopulation?.assumption"><dt>Fixture note</dt><dd>{{ selectedPopulation.assumption }}</dd></div></dl><button type="button" class="button primary full-width" @click="toast = 'Population view is a read-only synthetic projection; a new source creates a new population revision.'">Open population <Icon name="arrow-right" :size="16" /></button></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Sample plan</span><h2>{{ selectedRisk.samplePlanId || 'Sample plan' }}</h2></div><StatusPill :label="selectedSample?.status === 'COMPLETE' ? 'Complete' : selectedSample?.alternativeWork ? 'Alternative work recorded' : selectedPlanSamples.length ? 'In progress' : 'Not started'" :tone="selectedSample?.status === 'COMPLETE' || selectedSample?.alternativeWork ? 'good' : selectedPlanSamples.length ? 'warn' : 'neutral'" /></div><div class="sample-summary"><div><span>Selected items</span><strong>{{ selectedPlanSamples.length }}</strong><small>{{ selectedPopulation?.selectionMethod || 'Explicit method' }}</small></div><div><span>Tested</span><strong>{{ testedSampleCount }} / {{ selectedPlanSamples.length }}</strong><small>{{ selectedSample?.alternativeWork ? 'Alternative work attached' : selectedPlanSamples.length ? 'Evidence state remains visible' : 'No selections yet' }}</small></div><div><span>Potential impact</span><strong>{{ formatMoney(selectedSample?.amount || '0.00') }}</strong><small>Not a conclusion by threshold alone</small></div></div><div class="sample-list"><div v-for="sample in selectedPlanSamples" :key="sample.id"><span class="sample-state" :class="sample.alternativeWork || sample.status === 'COMPLETE' ? 'good' : sample.evidenceState === 'CONTRADICTORY' ? 'danger' : 'warn'"><Icon :name="sample.alternativeWork || sample.status === 'COMPLETE' ? 'check' : sample.evidenceState === 'CONTRADICTORY' ? 'warning' : 'info'" :size="14" /></span><span><strong>{{ sample.rowId }}</strong><small>{{ sample.evidenceState }} · {{ sample.alternativeWork ? 'Alternative work recorded' : sample.conclusion || sample.status }}</small></span></div><div v-if="!selectedPlanSamples.length" class="empty-state"><strong>No sample items selected.</strong><span>Record a population revision before selecting sample evidence.</span></div></div></article></section>
    </template>
  </div>
</template>
