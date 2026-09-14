<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { feasibilityCards, phase0Experiments, phase0Stages, phase0Tracks, verticalSliceSteps, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const activeFilter = ref('All experiments')
const selectedId = ref('P0-03')
const filters = ['All experiments', 'Needs evidence', 'Blocked', 'Fixture ready']

const filteredExperiments = computed(() => phase0Experiments.filter((experiment) => {
  if (activeFilter.value === 'All experiments') return true
  if (activeFilter.value === 'Needs evidence') return ['Needs evidence', 'In progress', 'Owner workshop'].includes(experiment.state)
  if (activeFilter.value === 'Blocked') return experiment.tone === 'danger'
  return experiment.state === 'Fixture ready'
}))

const selectedExperiment = computed(() => phase0Experiments.find((experiment) => experiment.id === selectedId.value) || phase0Experiments[0])

function navigate(route) {
  emit('navigate', route)
}

function selectExperiment(id) {
  selectedId.value = id
}
</script>

<template>
  <div class="page readiness-page">
    <PageHeader
      eyebrow="V4 decision evidence · synthetic only"
      title="Phase 0 readiness"
      description="A sponsor-friendly proof register for the architecture: run one complete synthetic slice, inject failure boundaries, and decide what can be enabled before any live client work."
      action-label="View architecture map"
      @action="navigate('architecture')"
    />
    <WorkflowGuide :guide="workflowGuides.readiness" />

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
      <div class="vertical-slice-footer"><Icon name="shield" :size="16" /><span><strong>Test both paths:</strong> an accepted accounting correction and a separately scoped audit/release case, plus confirmed-prohibition and non-renewal branches.</span></div>
    </section>

    <section class="feasibility-grid">
      <article v-for="card in feasibilityCards" :key="card.label" class="feasibility-card panel"><span class="feasibility-icon" :class="`tone-${card.tone}`"><Icon :name="card.icon" :size="19" /></span><div><span class="eyebrow">{{ card.label }}</span><h3>{{ card.value }}</h3><p>{{ card.detail }}</p></div></article>
    </section>

    <section class="readiness-decision-note"><Icon name="lock" :size="17" /><span><strong>Go / no-go rule:</strong> identity, isolation, exact artifacts, journal duplication, records protection, or recovery failures block expansion into live service capability. Optional webhook or embedded-preview gaps can remain disabled with an explicit owner decision.</span></section>
  </div>
</template>
