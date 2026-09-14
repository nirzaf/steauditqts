<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { loadDemoSession } from '../auth'
import { workflowGuides } from '../data'
import { pipelineLanes, pipelineStages } from '../pipelineData'

const emit = defineEmits(['navigate'])

const rootEl = ref(null)
const activeIndex = ref(0)
const playing = ref(false)
const isVisible = ref(true)
const reducedMotion = ref(false)
const liveMessage = ref('Stage 1 selected. Client details and acceptance start the audit portal handoff.')

let playbackTimer = null
let motionQuery = null
let intersectionObserver = null

const activeStage = computed(() => pipelineStages[activeIndex.value] || pipelineStages[0])
const currentRole = computed(() => loadDemoSession()?.role || 'admin')
const activeDestination = computed(() => activeStage.value.destinations?.[currentRole.value] || { route: activeStage.value.route, label: activeStage.value.routeLabel })
const stageNumber = computed(() => activeIndex.value + 1)
const progress = computed(() => pipelineStages.length <= 1 ? 100 : (activeIndex.value / (pipelineStages.length - 1)) * 100)
const progressLabel = computed(() => `${Math.round(progress.value)}% of the walkthrough`)
const statusText = computed(() => reducedMotion.value
  ? 'Reduced motion is on; use the stage buttons to step through the flow.'
  : playing.value
    ? 'Playing automatically · pauses when this page is hidden.'
    : 'Paused · select a stage or use Previous / Next.')

function announce(stage, prefix = 'Selected') {
  liveMessage.value = `${prefix}: stage ${stage.number}, ${stage.title}. ${stage.summary}`
}

function setStage(index, prefix = 'Selected') {
  const nextIndex = Math.min(Math.max(index, 0), pipelineStages.length - 1)
  activeIndex.value = nextIndex
  const stage = pipelineStages[nextIndex]
  announce(stage, prefix)
  if (nextIndex === pipelineStages.length - 1) playing.value = false
}

function nextStage() {
  if (activeIndex.value >= pipelineStages.length - 1) {
    playing.value = false
    liveMessage.value = 'The high-level pipeline is complete. Reset or select a stage to replay the handoff.'
    return
  }
  setStage(activeIndex.value + 1, 'Advanced to')
}

function previousStage() {
  setStage(activeIndex.value - 1, 'Returned to')
}

function reset() {
  playing.value = false
  setStage(0, 'Reset to')
}

function togglePlayback() {
  if (reducedMotion.value) {
    playing.value = false
    liveMessage.value = 'Auto-play is disabled because reduced motion is enabled. Use the stage buttons or Next control.'
    return
  }
  if (activeIndex.value >= pipelineStages.length - 1) activeIndex.value = 0
  playing.value = !playing.value
  liveMessage.value = playing.value
    ? `Playing from stage ${activeIndex.value + 1}. Use Pause at any time.`
    : `Paused on stage ${activeIndex.value + 1}, ${activeStage.value.title}.`
}

function syncPlayback() {
  if (playbackTimer) window.clearInterval(playbackTimer)
  playbackTimer = null
  if (!playing.value || reducedMotion.value || !isVisible.value) return
  playbackTimer = window.setInterval(nextStage, 2800)
}

function syncVisibility() {
  isVisible.value = document.visibilityState !== 'hidden'
}

function handleMotionPreference(event) {
  reducedMotion.value = event.matches
  if (event.matches) {
    playing.value = false
    liveMessage.value = 'Reduced motion is enabled. The full flow remains available with manual controls.'
  }
}

function handleStageKeydown(event, index) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    setStage(index + 1, 'Advanced to')
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    setStage(index - 1, 'Returned to')
  } else if (event.key === 'Home') {
    event.preventDefault()
    setStage(0, 'Jumped to')
  } else if (event.key === 'End') {
    event.preventDefault()
    setStage(pipelineStages.length - 1, 'Jumped to')
  }
}

function openDestination() {
  emit('navigate', activeDestination.value.route)
}

function statusTone(stage) {
  if (stage.tone === 'green') return 'good'
  if (stage.tone === 'amber') return 'warn'
  return 'neutral'
}

function laneCellState(lane, stage, index) {
  return {
    active: lane.stages.includes(stage.id),
    complete: index < activeIndex.value && lane.stages.includes(stage.id),
    upcoming: index > activeIndex.value && lane.stages.includes(stage.id),
  }
}

watch([playing, reducedMotion, isVisible], syncPlayback)

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionQuery.matches
  motionQuery.addEventListener?.('change', handleMotionPreference)
  document.addEventListener('visibilitychange', syncVisibility)

  if ('IntersectionObserver' in window && rootEl.value) {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible.value = entry.isIntersecting
    }, { threshold: 0.15 })
    intersectionObserver.observe(rootEl.value)
  }
  syncPlayback()
})

onBeforeUnmount(() => {
  if (playbackTimer) window.clearInterval(playbackTimer)
  motionQuery?.removeEventListener?.('change', handleMotionPreference)
  document.removeEventListener('visibilitychange', syncVisibility)
  intersectionObserver?.disconnect()
})
</script>

<template>
  <div ref="rootEl" class="page pipeline-page">
    <PageHeader
      eyebrow="High-level process visualizer · synthetic only"
      title="Audit portal pipeline"
      description="Play the client-to-portal-to-audit handoff from first intake through final report, invoice, and archive. Select a stage to see the real documents, owner, visibility boundary, and detailed prototype page behind it."
      action-label="Open complete cycle"
      action-icon="arrow-right"
      @action="emit('navigate', 'cycle')"
    />

    <WorkflowGuide :guide="workflowGuides.pipeline" />

    <section class="panel pipeline-intro" aria-labelledby="pipeline-intro-title">
      <div class="pipeline-intro-copy">
        <span class="eyebrow">PDF-derived handoff map</span>
        <h2 id="pipeline-intro-title">One record, four lanes, eight accountable stages</h2>
        <p>The moving packet is a teaching aid: it shows where a document or decision travels, while the detailed pages demonstrate the guarded synthetic controls. Nothing here sends email, WhatsApp, files, or professional conclusions.</p>
      </div>
      <div class="pipeline-intro-facts" aria-label="Pipeline facts">
        <div><strong>8</strong><span>handoff stages</span></div>
        <div><strong>4</strong><span>role lanes</span></div>
        <div><strong>26</strong><span>v5 named outputs behind the flow</span></div>
      </div>
    </section>

    <section class="panel pipeline-player" aria-labelledby="pipeline-player-title">
      <div class="pipeline-player-head">
        <div>
          <span class="eyebrow">Interactive walkthrough</span>
          <h2 id="pipeline-player-title">Watch the handoff travel through the portal</h2>
          <p>Play the sequence, pause it, or jump to any stage. The active stage is also highlighted in the swimlane below.</p>
        </div>
        <div class="pipeline-player-meta"><span>Stage {{ stageNumber }} of {{ pipelineStages.length }}</span><strong>{{ activeStage.phase }}</strong></div>
      </div>

      <div class="pipeline-controls" role="toolbar" aria-label="Pipeline playback controls">
        <button type="button" class="button secondary" :disabled="activeIndex === 0" aria-label="Previous stage" title="Previous stage" @click="previousStage"><Icon name="chevron-right" :size="16" class="pipeline-icon-flip" /><span>Previous</span></button>
        <button type="button" class="button primary" :aria-pressed="playing" :aria-label="playing ? 'Pause pipeline' : 'Play pipeline'" @click="togglePlayback"><Icon :name="playing ? 'pause' : 'play'" :size="16" /><span>{{ playing ? 'Pause' : 'Play' }}</span></button>
        <button type="button" class="button secondary" :disabled="activeIndex === pipelineStages.length - 1" aria-label="Next stage" title="Next stage" @click="nextStage"><span>Next</span><Icon name="chevron-right" :size="16" /></button>
        <button type="button" class="button ghost" aria-label="Reset pipeline" title="Reset pipeline to stage one" @click="reset"><Icon name="refresh" :size="16" /><span>Reset</span></button>
      </div>

      <div class="pipeline-progress-block">
        <div class="pipeline-progress-label"><span>Walkthrough progress</span><strong>{{ progressLabel }}</strong></div>
        <div class="pipeline-progress-track" role="progressbar" aria-label="Pipeline walkthrough progress" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="Math.round(progress)"><span class="pipeline-progress-fill" :style="{ transform: `scaleX(${progress / 100})` }"></span></div>
      </div>

      <ol class="pipeline-stage-rail" aria-label="Pipeline stages">
        <li v-for="(stage, index) in pipelineStages" :key="stage.id" :class="{ active: index === activeIndex, complete: index < activeIndex }">
          <button type="button" class="pipeline-stage-button" :class="[`tone-${stage.tone}`, { active: index === activeIndex, complete: index < activeIndex }]" :aria-current="index === activeIndex ? 'step' : undefined" :aria-label="`Stage ${stage.number}: ${stage.title}`" @click="setStage(index)" @keydown="handleStageKeydown($event, index)">
            <span class="pipeline-stage-top"><span class="pipeline-stage-number">{{ stage.number }}</span><span class="pipeline-stage-icon"><Icon :name="stage.icon" :size="18" /></span></span>
            <span class="pipeline-stage-phase">{{ stage.phase }}</span>
            <strong>{{ stage.title }}</strong>
            <small>{{ stage.actor }}</small>
            <span class="pipeline-stage-state" :class="`tone-${stage.tone}`">{{ index < activeIndex ? 'Complete' : index === activeIndex ? 'Current' : stage.status }}</span>
          </button>
        </li>
      </ol>

      <div class="pipeline-player-status" role="status" aria-live="polite"><span class="pipeline-live-dot" :class="{ playing }" aria-hidden="true"></span><span>{{ statusText }}</span><span class="pipeline-key-hint">Arrow keys move stages · Home / End jump</span></div>
      <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    </section>

    <section class="pipeline-content-grid">
      <article class="panel pipeline-detail" aria-labelledby="pipeline-detail-title" aria-live="polite">
        <div class="panel-heading pipeline-detail-heading">
          <div><span class="eyebrow">Selected stage · {{ activeStage.number }}</span><h2 id="pipeline-detail-title">{{ activeStage.title }}</h2></div>
          <StatusPill :label="activeStage.status" :tone="statusTone(activeStage)" />
        </div>
        <p class="pipeline-detail-summary">{{ activeStage.summary }}</p>
        <div class="pipeline-detail-owner"><span class="pipeline-detail-icon" :class="`tone-${activeStage.tone}`"><Icon :name="activeStage.icon" :size="20" /></span><div><strong>{{ activeStage.owner }}</strong><small>Accountable handoff · {{ activeStage.actor }}</small></div></div>
        <div class="pipeline-detail-block"><span class="eyebrow">Human action</span><p>{{ activeStage.humanAction }}</p></div>
        <div class="pipeline-detail-block pipeline-detail-system"><span class="eyebrow">Portal / system handoff</span><p><Icon name="workflow" :size="16" />{{ activeStage.portalAction }}</p></div>
        <div class="pipeline-detail-fields">
          <div><span class="pipeline-detail-label">Next owner</span><strong>{{ activeStage.nextOwner }}</strong></div>
          <div><span class="pipeline-detail-label">Client visibility</span><strong>{{ activeStage.visibility }}</strong></div>
        </div>
        <div class="pipeline-documents"><span class="pipeline-detail-label"><Icon name="file" :size="14" />Documents in this handoff</span><div class="pipeline-chip-row"><span v-for="document in activeStage.documents" :key="document" class="pipeline-document-chip">{{ document }}</span></div></div>
        <button type="button" class="button secondary full-width" @click="openDestination"><span>{{ activeDestination.label }}</span><Icon name="arrow-right" :size="16" /></button>
      </article>

      <article class="panel pipeline-lane-panel" aria-labelledby="pipeline-lane-title">
        <div class="panel-heading"><div><span class="eyebrow">Who sees what</span><h2 id="pipeline-lane-title">Swimlane handoff</h2></div><span class="muted-label">Stage {{ activeStage.number }} highlighted</span></div>
        <p class="pipeline-lane-intro">Read down a column to see the shared handoff. Read across a row to see each role’s responsibility and visibility boundary.</p>
        <div class="pipeline-lane-legend" aria-label="Swimlane legend"><span><i class="pipeline-legend-dot active"></i>Active responsibility</span><span><i class="pipeline-legend-dot complete"></i>Passed in this demo</span><span><i class="pipeline-legend-dot upcoming"></i>Upcoming</span></div>
        <div class="pipeline-lane-scroller">
          <div class="pipeline-lane-grid">
            <div class="pipeline-lane-corner">Role / handoff</div>
            <div v-for="stage in pipelineStages" :key="`head-${stage.id}`" class="pipeline-lane-stage-head" :class="{ active: stage.id === activeStage.id }"><span>{{ stage.number }}</span><strong>{{ stage.phase }}</strong></div>
            <template v-for="lane in pipelineLanes" :key="lane.id">
              <div class="pipeline-lane-label"><span class="pipeline-lane-icon" :class="`tone-${lane.tone}`"><Icon :name="lane.icon" :size="17" /></span><span><strong>{{ lane.label }}</strong><small>{{ lane.detail }}</small></span></div>
              <div v-for="(stage, index) in pipelineStages" :key="`${lane.id}-${stage.id}`" class="pipeline-lane-cell" :class="laneCellState(lane, stage, index)" :title="lane.stages.includes(stage.id) ? `${lane.label}: ${stage.title}` : `${lane.label}: not a direct action in ${stage.title}`"><Icon v-if="lane.stages.includes(stage.id)" :name="stage.icon" :size="15" /><span v-else aria-hidden="true">·</span></div>
            </template>
          </div>
        </div>
      </article>
    </section>

    <section class="panel pipeline-boundary" aria-labelledby="pipeline-boundary-title">
      <div class="pipeline-boundary-icon" aria-hidden="true"><Icon name="shield" :size="21" /></div>
      <div><span class="eyebrow">Prototype boundary</span><h2 id="pipeline-boundary-title">What the animation does — and does not — prove</h2><p>It explains the sequence and ownership using bounded QAR demo values and named outputs from the v5 operating model. It does not send a report, create a credential, email an invoice, call Microsoft Graph, or replace a partner, reviewer, finance, or records decision.</p></div>
      <button type="button" class="button ghost" @click="emit('navigate', 'architecture')"><span>View architecture map</span><Icon name="arrow-right" :size="16" /></button>
    </section>
  </div>
</template>
