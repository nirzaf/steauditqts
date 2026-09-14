<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { feasibilityCards, phase0Experiments, phase0Stages, phase0Tracks, verticalSliceSteps, workflowGuides } from '../data'
import { accountingPackageFor, activeActor, auditChainSummary, gateSummary, scenario, selectEngagement, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'
import { latestSyntheticCycle, runSyntheticCycle } from '../domain/cycle.js'
import { traceabilityGroups } from '../domain/traceability.js'

const emit = defineEmits(['navigate'])
const activeFilter = ref('All experiments')
const selectedId = ref('P0-03')
const cycleWorking = ref(false)
const cycleToast = ref('')
const filters = ['All experiments', 'Needs evidence', 'Blocked', 'Fixture ready']
const selectedEngagement = computed(() => scenarioEngagement())
const engagementOptions = computed(() => scenario.engagements.filter((item) => activeActor()?.assignments?.includes(item.id)))
const liveGates = computed(() => gateSummary(selectedEngagement.value?.id))
const liveAudit = computed(() => selectedEngagement.value?.service === 'audit' ? auditChainSummary(selectedEngagement.value.id) : null)
const liveAccounting = computed(() => accountingPackageFor(selectedEngagement.value?.id))
const releaseCandidate = computed(() => scenario.releaseCandidates.find((candidate) => candidate.engagementId === selectedEngagement.value?.id && candidate.state !== 'ARCHIVED') || null)
const scopedOperation = computed(() => scenario.operations?.find((item) => item.engagementId === selectedEngagement.value?.id) || null)
const scopedRecovery = computed(() => scenario.recovery?.backup?.engagementId === selectedEngagement.value?.id || scenario.recovery?.case?.engagementId === selectedEngagement.value?.id ? scenario.recovery : null)
const evidenceRegister = computed(() => {
  const gates = liveGates.value.gates
  const gate = (id) => gates.find((item) => item.id === id)
  const readyCount = liveGates.value.currentReady
  const denominator = liveGates.value.currentDenominator
  const submitted = (scenario.workpapers || []).filter((item) => item.engagementId === selectedEngagement.value?.id && item.submittedSnapshotId).length
  const reviewOpen = (scenario.reviews || []).filter((item) => item.engagementId === selectedEngagement.value?.id && item.status !== 'CLEARED').length
  const operation = scopedOperation.value
  const state = (value) => value === 'good' ? 'READY' : value === 'neutral' ? 'NOT APPLICABLE' : 'HELD'
  return [
    { id: 'M0', label: 'Synthetic boundary', status: 'SIMULATION', tone: 'good', detail: `${activeActor()?.name || 'Demo actor'} · browser-local state · no external effects` },
    { id: 'M1', label: 'G0–G2 access and authority', status: `${readyCount}/${denominator} gates`, tone: readyCount === denominator ? 'good' : 'warn', detail: `${state(gate('G2')?.status)} · terms, assignment and workspace checks` },
    { id: 'M2', label: 'G3–G4 accounting package', status: liveAccounting.value ? (liveAccounting.value.statement.state === 'APPROVED' ? 'APPROVED' : 'IN PROGRESS') : 'NOT APPLICABLE', tone: liveAccounting.value?.statement.state === 'APPROVED' ? 'good' : liveAccounting.value ? 'warn' : 'neutral', detail: liveAccounting.value ? `${liveAccounting.value.source.sourceId} · ${liveAccounting.value.source.rows.length} rows · ${liveAccounting.value.mappings.state}` : 'Audit-only view has no standalone package.' },
    { id: 'P14', label: 'Audit chain', status: liveAudit.value ? (liveAudit.value.blockers.length ? `${liveAudit.value.blockers.length} blockers` : 'READY') : 'NOT APPLICABLE', tone: liveAudit.value ? (liveAudit.value.blockers.length ? 'warn' : 'good') : 'neutral', detail: liveAudit.value ? `${liveAudit.value.risks.length} risks · ${liveAudit.value.populations.length} populations · ${liveAudit.value.samples.length} sample items` : 'Select an audit engagement to inspect materiality and evidence.' },
    { id: 'P15', label: 'Exact workpaper review', status: `${submitted} submitted`, tone: submitted && !reviewOpen ? 'good' : 'warn', detail: `${reviewOpen} open review point${reviewOpen === 1 ? '' : 's'} · submitted snapshots remain immutable` },
    { id: 'P17', label: 'Release candidate', status: releaseCandidate.value ? (releaseCandidate.value.archiveState === 'VERIFIED' ? 'ARCHIVE READY' : releaseCandidate.value.stepIndex >= 9 ? 'ARCHIVE ASSEMBLY REQUIRED' : `${releaseCandidate.value.stepIndex}/9`) : 'NOT FOUND', tone: releaseCandidate.value?.archiveState === 'VERIFIED' ? 'good' : releaseCandidate.value ? 'warn' : 'neutral', detail: releaseCandidate.value ? `${releaseCandidate.value.id} · ${releaseCandidate.value.manifestDigest}` : 'No candidate is scoped to this engagement.' },
    { id: 'P18', label: 'Records and amendments', status: scenario.archivePackages?.some((item) => item.engagementId === selectedEngagement.value?.id) ? 'ARCHIVE VERIFIED' : 'PENDING', tone: scenario.archivePackages?.some((item) => item.engagementId === selectedEngagement.value?.id) ? 'good' : 'warn', detail: `${(scenario.legalHolds || []).filter((item) => item.engagementId === selectedEngagement.value?.id && item.state === 'ACTIVE').length} active legal hold(s) · original releases are append-only` },
    { id: 'P19', label: 'Provider operations', status: operation?.state || 'NOT RUN', tone: operation?.state === 'SUCCEEDED' ? 'good' : operation ? 'warn' : 'neutral', detail: operation ? `${operation.id} · ${operation.code || 'synthetic result'} · same-target retry semantics` : 'Run the local fault matrix from Integration health.' },
    { id: 'P20', label: 'Recovery rehearsal', status: scopedRecovery.value?.state || 'NOT RUN', tone: scopedRecovery.value?.state === 'RESUMED_SIMULATION' ? 'good' : !scopedRecovery.value || scopedRecovery.value.state === 'NOT_RUN' ? 'neutral' : 'warn', detail: scopedRecovery.value?.outwardEffectsEnabled ? 'Outward effects enabled' : 'Independent checkpoint required; outward effects disabled' },
    { id: 'G10', label: 'Next-period permission', status: gate('G10')?.status === 'good' ? 'READY' : 'FRESH FACTS REQUIRED', tone: 'neutral', detail: gate('G10')?.nextPeriodNote || 'A new continuance shell must be assessed for the next period.' },
  ]
})

const filteredExperiments = computed(() => phase0Experiments.filter((experiment) => {
  if (activeFilter.value === 'All experiments') return true
  if (activeFilter.value === 'Needs evidence') return ['Needs evidence', 'In progress', 'Owner workshop'].includes(experiment.state)
  if (activeFilter.value === 'Blocked') return experiment.tone === 'danger'
  return experiment.state === 'Fixture ready'
}))

const selectedExperiment = computed(() => phase0Experiments.find((experiment) => experiment.id === selectedId.value) || phase0Experiments[0])
const latestCycle = computed(() => latestSyntheticCycle())

function navigate(route) {
  emit('navigate', route)
}

function selectExperiment(id) {
  selectedId.value = id
}

function changeEngagement(event) {
  const result = selectEngagement(event.target.value, { actorPersonaId: activeActor()?.personaId })
  if (result.outcome !== 'COMMITTED') event.target.value = selectedEngagement.value?.id || ''
}

async function runCycle() {
  if (cycleWorking.value) return
  cycleWorking.value = true
  try {
    const run = await runSyntheticCycle({ reset: true })
    cycleToast.value = `${run.state === 'PASSED_SIMULATION' ? 'Synthetic cycle completed' : 'Synthetic cycle needs attention'} · ${run.summary.passed}/${run.summary.total} evidence steps passed.`
  } catch (error) {
    cycleToast.value = `Synthetic cycle could not complete: ${error.message || 'unknown error'}`
  } finally {
    cycleWorking.value = false
    window.setTimeout(() => { cycleToast.value = '' }, 6000)
  }
}
</script>

<template>
  <div class="page readiness-page">
    <PageHeader
      eyebrow="V5 decision evidence · synthetic only"
      title="Phase 0 readiness"
      description="A sponsor-friendly proof register for the architecture: run one complete synthetic slice, inject failure boundaries, and decide what can be enabled before any live client work."
      action-label="View architecture map"
      @action="navigate('architecture')"
    />
    <WorkflowGuide :guide="workflowGuides.readiness" />

    <section class="panel engagement-selector readiness-scope-selector"><div><span class="eyebrow">Evidence register scope</span><strong>Switch between the linked audit and accounting-only synthetic engagements</strong><small>The register recalculates gates, package applicability, audit chain, operations, and recovery for the selected service-period scope.</small></div><label>Engagement<select :value="selectedEngagement?.id" @change="changeEngagement"><option v-for="item in engagementOptions" :key="item.id" :value="item.id">{{ item.id }} · {{ item.serviceLabel }} · {{ item.period }}</option></select></label></section>

    <section class="readiness-metrics" aria-label="Phase 0 metrics">
      <article v-for="track in phase0Tracks" :key="track.label" class="readiness-metric panel" :class="`readiness-${track.tone}`">
        <span class="readiness-metric-icon"><Icon :name="track.icon" :size="18" /></span>
        <span><small>{{ track.label }}</small><strong>{{ track.value }}</strong><em>{{ track.note }}</em></span>
      </article>
    </section>

    <section class="panel readiness-stage-panel">
      <div class="panel-heading"><div><span class="eyebrow">Decision sequence</span><h2>From assumptions to an authorized next step</h2></div><span class="muted-label">No production consent is implied</span></div>
      <div class="readiness-stage-rail">
        <template v-for="(stage, index) in phase0Stages" :key="stage.label">
          <div class="readiness-stage" :class="`stage-${stage.tone}`"><span class="readiness-stage-icon"><Icon :name="stage.icon" :size="17" /></span><span><strong>{{ stage.label }}</strong><small>{{ stage.detail }}</small><em>{{ stage.state }}</em></span></div>
          <Icon v-if="index < phase0Stages.length - 1" class="readiness-stage-arrow" name="arrow-right" :size="17" aria-hidden="true" />
        </template>
      </div>
    </section>

    <section class="panel evidence-register-panel">
      <div class="panel-heading"><div><span class="eyebrow">V5 evidence register</span><h2>What the prototype can prove now</h2></div><span class="muted-label">Selected scope · {{ selectedEngagement?.id }}</span></div>
      <p class="evidence-register-intro">This register turns the walkthrough into an auditable conversation. Each row points to a real synthetic record or an explicit missing proof; it never treats a green screen as evidence of a live integration.</p>
      <div class="evidence-register-list" role="list">
        <div v-for="item in evidenceRegister" :key="item.id" class="evidence-register-row" role="listitem">
          <span class="evidence-register-id">{{ item.id }}</span><div class="evidence-register-copy"><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></div><StatusPill :label="item.status" :tone="item.tone === 'good' ? 'good' : item.tone === 'warn' ? 'warn' : 'neutral'" />
        </div>
      </div>
      <div class="evidence-register-foot"><Icon name="info" :size="16" /><span><strong>How to read this:</strong> READY means the synthetic command and fixture are present; HELD means the page shows the blocker to resolve; NOT RUN / NOT APPLICABLE means no claim is being made.</span></div>
    </section>

    <section class="readiness-layout">
      <article class="panel experiment-panel">
        <div class="panel-heading"><div><span class="eyebrow">Experiment register</span><h2>What must be proven</h2></div><span class="muted-label">{{ filteredExperiments.length }} of {{ phase0Experiments.length }}</span></div>
        <div class="filter-row readiness-filter" aria-label="Filter experiments"><button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}</button></div>
        <div class="experiment-list">
          <button v-for="experiment in filteredExperiments" :key="experiment.id" type="button" class="experiment-row" :class="{ selected: selectedId === experiment.id }" :aria-pressed="selectedId === experiment.id" @click="selectExperiment(experiment.id)">
            <span class="experiment-icon" :class="`tone-${experiment.tone}`"><Icon :name="experiment.icon" :size="17" /></span>
            <span class="experiment-copy"><span class="experiment-id">{{ experiment.id }} · {{ experiment.phase }}</span><strong>{{ experiment.title }}</strong><small>{{ experiment.action }}</small></span>
            <StatusPill :label="experiment.state" :tone="experiment.tone === 'danger' ? 'danger' : experiment.tone === 'warn' ? 'warn' : experiment.tone === 'good' ? 'good' : 'neutral'" />
            <Icon class="experiment-arrow" name="chevron-right" :size="16" aria-hidden="true" />
          </button>
        </div>
      </article>

      <aside class="panel experiment-detail-panel" aria-live="polite">
        <div class="panel-heading"><div><span class="eyebrow">Selected experiment</span><h2>{{ selectedExperiment.id }} · {{ selectedExperiment.title }}</h2></div><StatusPill :label="selectedExperiment.state" :tone="selectedExperiment.tone === 'danger' ? 'danger' : selectedExperiment.tone === 'warn' ? 'warn' : selectedExperiment.tone === 'good' ? 'good' : 'neutral'" /></div>
        <div class="experiment-detail-meta"><span class="experiment-detail-icon" :class="`tone-${selectedExperiment.tone}`"><Icon :name="selectedExperiment.icon" :size="20" /></span><div><strong>{{ selectedExperiment.owner }}</strong><small>{{ selectedExperiment.phase }} · evidence owner</small></div></div>
        <div class="experiment-detail-section"><span class="eyebrow">Setup and action</span><p>{{ selectedExperiment.action }}</p></div>
        <div class="experiment-detail-section experiment-pass"><span class="eyebrow">Pass criterion</span><p><Icon name="check-circle" :size="16" />{{ selectedExperiment.pass }}</p></div>
        <div class="experiment-detail-callout"><Icon name="info" :size="16" /><span>Capture the build/configuration version, synthetic inputs, expected and actual result, logs without secrets, defects, retest, and accountable approval. A screen that looks green is not sufficient.</span></div>
        <button type="button" class="button secondary full-width" @click="navigate(selectedExperiment.id === 'P0-07' ? 'accounting' : selectedExperiment.id === 'P0-05' ? 'integration' : 'architecture')">Open related prototype view <Icon name="arrow-right" :size="16" /></button>
      </aside>
    </section>

    <section class="panel vertical-slice-panel">
      <div class="panel-heading"><div><span class="eyebrow">Small complete vertical slice</span><h2>Run the workflow end to end</h2></div><span class="muted-label">Two synthetic clients · separated roles</span></div>
      <div class="vertical-slice-grid">
        <article v-for="step in verticalSliceSteps" :key="step.gate" class="vertical-slice-step"><span class="vertical-slice-gate">{{ step.gate }}</span><span class="vertical-slice-icon"><Icon :name="step.icon" :size="16" /></span><div><h3>{{ step.title }}</h3><p>{{ step.detail }}</p></div></article>
      </div>
      <div class="vertical-slice-footer"><Icon name="shield" :size="16" /><span><strong>Test both paths:</strong> an accepted accounting correction and a separately scoped audit/release case, plus confirmed-prohibition and non-renewal branches.</span><button type="button" class="button primary" :disabled="cycleWorking" @click="runCycle">{{ cycleWorking ? 'Running rehearsal…' : 'Run clean synthetic rehearsal' }} <Icon name="arrow-right" :size="16" /></button></div>
    </section>

    <div v-if="cycleToast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ cycleToast }}</div>

    <section v-if="latestCycle" class="panel cycle-run-panel" aria-live="polite">
      <div class="panel-heading"><div><span class="eyebrow">Latest end-to-end rehearsal · {{ latestCycle.evidenceLevel }}</span><h2>{{ latestCycle.state === 'PASSED_SIMULATION' ? 'Synthetic cycle passed' : 'Synthetic cycle needs attention' }}</h2></div><StatusPill :label="`${latestCycle.summary.passed}/${latestCycle.summary.total} passed`" :tone="latestCycle.summary.failed ? 'danger' : 'good'" /></div>
      <div class="cycle-run-summary"><div><span>Run ID</span><strong>{{ latestCycle.id }}</strong><small>{{ latestCycle.completedAt }}</small></div><div><span>Negative paths</span><strong>{{ latestCycle.steps.filter((step) => step.outcome === 'OBSERVED' || step.outcome === 'BLOCKED' || step.outcome === 'DENIED').length }}</strong><small>Holds and prohibitions remain explicit</small></div><div><span>Traceability touched</span><strong>{{ latestCycle.traceability?.executed || 0 }}/{{ latestCycle.traceability?.total || 0 }}</strong><small>AT · ET · BT · VT · P0 identities linked to steps</small></div><div><span>External proof</span><strong>{{ latestCycle.externalProof }}</strong><small>Tenant, database and provider proofs remain separate</small></div></div>
      <div class="traceability-grid" aria-label="Traceability coverage"><article v-for="group in traceabilityGroups" :key="group.id"><span>{{ group.source }}</span><strong>{{ latestCycle.traceability?.groups?.[group.id]?.executed || 0 }}/{{ group.entries.length }}</strong><small>{{ group.label }} · {{ latestCycle.traceability?.groups?.[group.id]?.remaining || group.entries.length }} not run</small><p>{{ latestCycle.traceability?.executedIds?.filter((id) => id.startsWith(`${group.id}-`)).join(' · ') || 'No linked identity in this rehearsal' }}</p></article></div>
      <div class="cycle-run-step-list" role="list"><div v-for="step in latestCycle.steps" :key="step.id" class="cycle-run-step" role="listitem"><span class="cycle-run-step-state" :class="`state-${step.status.toLowerCase()}`"><Icon :name="step.status === 'PASS' ? 'check' : 'warning'" :size="14" /></span><div><strong>{{ step.id }} · {{ step.label }}</strong><small>{{ step.outcome }}<span v-if="step.code"> · {{ step.code }}</span>{{ step.message ? ` · ${step.message}` : '' }}</small></div><StatusPill :label="step.evidenceLevel" tone="neutral" /></div></div>
      <div class="prototype-note"><Icon name="info" :size="16" /><span>This run proves only browser-local synthetic behavior. It does not pass Microsoft permission, Frappe/MariaDB concurrency, records-retention, provider exactly-once, or recovery-fencing tests.</span></div>
    </section>

    <section class="feasibility-grid">
      <article v-for="card in feasibilityCards" :key="card.label" class="feasibility-card panel"><span class="feasibility-icon" :class="`tone-${card.tone}`"><Icon :name="card.icon" :size="19" /></span><div><span class="eyebrow">{{ card.label }}</span><h3>{{ card.value }}</h3><p>{{ card.detail }}</p></div></article>
    </section>

    <section class="readiness-decision-note"><Icon name="lock" :size="17" /><span><strong>Go / no-go rule:</strong> identity, isolation, exact artifacts, journal duplication, records protection, or recovery failures block expansion into live service capability. Optional webhook or embedded-preview gaps can remain disabled with an explicit owner decision.</span></section>
  </div>
</template>
