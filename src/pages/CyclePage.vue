<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { cycleFailureCheckpoints, workflowGuides } from '../data'
import { v5JourneySteps as cycleJourneySteps } from '../v5Data'

const emit = defineEmits(['navigate'])

const filters = ['All steps', 'Acquire & accept', 'Commercial onboarding', 'Plan & prepare', 'Execute', 'Conclude', 'Commercial close', 'Archive & recovery']
const activeFilter = ref('All steps')
const selectedStepNumber = ref(cycleJourneySteps[0]?.number || '01')

const filteredJourney = computed(() => activeFilter.value === 'All steps'
  ? cycleJourneySteps
  : cycleJourneySteps.filter((step) => step.phase === activeFilter.value))

const selectedStep = computed(() => cycleJourneySteps.find((step) => step.number === selectedStepNumber.value) || cycleJourneySteps[0])

function navigate(route) {
  emit('navigate', route)
}

function selectStep(step) {
  selectedStepNumber.value = step.number
}

function displayOutcome(outcome) {
  return String(outcome || '').replace(/^Synthetic outcome:\s*/i, 'Expected outcome: ')
}
</script>

<template>
  <div class="page cycle-page">
    <PageHeader
      eyebrow="V5 walkthrough · complete cycle"
      title="One complete cycle — acceptance to renewal"
      description="Walk one scoped record through the v5 G0–G10 gates. Every row names the human action, system-controlled outcome, control boundary, named output and the page where that handoff is shown."
      action-label="Open v5 operating model"
      action-icon="list-check"
      @action="navigate('blueprint')"
    />

    <WorkflowGuide :guide="workflowGuides.cycle" />

    <section class="panel cycle-contract" aria-labelledby="cycle-contract-title">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">How to read this journey</span>
          <h2 id="cycle-contract-title">How to read this journey</h2>
        </div>
        <StatusPill label="Step-by-step view" tone="neutral" />
      </div>
      <p class="cycle-contract-intro">This map follows the v5 new-client handover: acceptance, commercial onboarding, terms, advance-gated portal access, planning, evidence, accounting, audit, paired client response, completion, release, commercial close, archive, recovery and renewal.</p>
      <div class="cycle-contract-rules">
        <article><span class="cycle-contract-icon tone-blue"><Icon name="workflow" :size="17" /></span><div><strong>Statuses are derived</strong><p>Gates and holds come from scoped records, revisions, and evidence—not editable green flags.</p></div></article>
        <article><span class="cycle-contract-icon tone-amber"><Icon name="archive" :size="17" /></span><div><strong>Approvals bind to snapshots</strong><p>A changed source or statement creates a new generation and can make a prior approval stale.</p></div></article>
        <article><span class="cycle-contract-icon tone-green"><Icon name="shield" :size="17" /></span><div><strong>Responsibilities stay clear</strong><p>Each handoff keeps its owner, evidence and next step visible to the team.</p></div></article>
      </div>
    </section>

    <section class="cycle-journey-section" aria-labelledby="cycle-journey-title">
      <div class="cycle-section-heading">
        <div>
          <span class="eyebrow">§35.1 complete new-client walkthrough</span>
          <h2 id="cycle-journey-title">Follow the work in order</h2>
          <p>Select a step to see the accountable action, the system-controlled result, and the destination screen.</p>
        </div>
        <span class="muted-label">{{ filteredJourney.length }} of {{ cycleJourneySteps.length }} steps</span>
      </div>

      <div class="cycle-filter-bar" role="toolbar" aria-label="Filter complete cycle steps">
        <span class="cycle-filter-label"><Icon name="filter" :size="15" />Show</span>
        <div class="filter-row cycle-filter-row">
          <button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" :aria-pressed="activeFilter === filter" @click="activeFilter = filter">{{ filter }}</button>
        </div>
      </div>

      <div class="cycle-layout">
        <article class="panel cycle-journey-list-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">Human action → system outcome</span><h2>Cycle steps</h2></div>
            <span class="muted-label">{{ activeFilter }}</span>
          </div>
          <div class="cycle-journey-list" role="list">
            <button v-for="step in filteredJourney" :key="step.number" type="button" class="cycle-journey-row" :class="{ selected: selectedStepNumber === step.number }" :aria-pressed="selectedStepNumber === step.number" @click="selectStep(step)">
              <span class="cycle-step-number">{{ step.number }}</span>
              <span class="cycle-step-icon" :class="`tone-${step.tone}`"><Icon :name="step.icon" :size="16" /></span>
              <span class="cycle-step-copy"><span class="cycle-step-meta"><strong>{{ step.gate }}</strong><em>{{ step.phase }}</em></span><strong>{{ step.title }}</strong><small>{{ displayOutcome(step.outcome) }}</small></span>
              <Icon class="cycle-step-arrow" name="chevron-right" :size="16" aria-hidden="true" />
            </button>
            <p v-if="!filteredJourney.length" class="cycle-empty-state"><Icon name="info" :size="17" />No steps match this view.</p>
          </div>
        </article>

        <aside v-if="selectedStep" class="panel cycle-detail-panel" aria-live="polite" aria-labelledby="cycle-detail-title">
          <div class="panel-heading">
            <div><span class="eyebrow">Selected step · {{ selectedStep.number }}</span><h2 id="cycle-detail-title">{{ selectedStep.title }}</h2></div>
            <StatusPill :label="selectedStep.gate" :tone="selectedStep.tone === 'danger' ? 'danger' : selectedStep.tone === 'amber' ? 'warn' : selectedStep.tone === 'green' ? 'good' : 'neutral'" />
          </div>
          <div class="cycle-detail-owner"><span class="cycle-detail-icon" :class="`tone-${selectedStep.tone}`"><Icon :name="selectedStep.icon" :size="20" /></span><div><strong>{{ selectedStep.phase }}</strong><small>Gate {{ selectedStep.gate }} · destination walkthrough</small></div></div>
          <div class="cycle-detail-block"><span class="eyebrow">Human action</span><p>{{ selectedStep.action }}</p></div>
          <div class="cycle-detail-block cycle-detail-outcome"><span class="eyebrow">System-controlled outcome</span><p><Icon name="check-circle" :size="16" />{{ displayOutcome(selectedStep.outcome) }}</p></div>
          <div class="cycle-detail-block"><span class="eyebrow">Control boundary</span><p>{{ selectedStep.control }}</p></div>
          <button type="button" class="button secondary full-width" @click="navigate(selectedStep.route)"> {{ selectedStep.routeLabel }} <Icon name="arrow-right" :size="16" /></button>
        </aside>
      </div>
    </section>

    <section class="panel cycle-checkpoints-panel" aria-labelledby="cycle-checkpoints-title">
      <div class="panel-heading">
        <div><span class="eyebrow">§27–29 execution overlays</span><h2 id="cycle-checkpoints-title">Failure-boundary checkpoints</h2></div>
        <span class="muted-label">Safety overlays, not extra gates</span>
      </div>
      <p class="cycle-checkpoints-intro">These checks sit across the journey. They make the hard-to-see failure modes explicit so a client can understand what must be verified before an outward effect or professional decision.</p>
      <div class="cycle-checkpoint-grid">
        <article v-for="checkpoint in cycleFailureCheckpoints" :key="checkpoint.id" class="cycle-checkpoint-card">
          <div class="cycle-checkpoint-top"><span class="cycle-checkpoint-id">{{ checkpoint.id }}</span><Icon name="shield" :size="17" /></div>
          <h3>{{ checkpoint.title }}</h3>
          <p>{{ checkpoint.detail }}</p>
          <small><Icon name="check" :size="14" />{{ checkpoint.guard }}</small>
        </article>
      </div>
    </section>

    <div class="prototype-note cycle-boundary-note"><Icon name="info" :size="16" /><span><strong>Use this page as a guide:</strong> select a step, open its linked workspace and review the owner, record and next handoff.</span></div>
  </div>
</template>
