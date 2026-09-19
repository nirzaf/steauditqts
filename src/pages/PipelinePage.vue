<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import SharedPipelineStatus from '../components/SharedPipelineStatus.vue'
import ProcessValidityInspector from '../components/ProcessValidityInspector.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { useLifecyclePipeline } from '../composables/useLifecyclePipeline.js'
import { SHARED_ENGAGEMENT_ID } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'
import { loadDemoSession } from '../auth'
import { workflowGuides } from '../data'
import { pipelineLanes, pipelineLifecycles, pipelineStages } from '../pipelineData'
import { recordTargetFor } from '../navigation/recordTargets.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })

const {
  mode: demoMode,
  activeEngagementId: demoActiveEngagementId,
  progress: demoProgress,
  progressError: demoProgressError,
  loading: demoLoading,
  lastSync: demoLastSync,
} = useDemoContext()
const sharedEngagementId = computed(() => demoActiveEngagementId.value || SHARED_ENGAGEMENT_ID)

// Derive live stage states from the mode-aware projection: the shared
// engagement's stage strip is authoritative in D1, never in the local scenario.
const { stageStates } = useLifecyclePipeline(
  null,
  computed(() => (sharedDemoEnabled ? demoProgress.value : null)),
)
const stageStateMap = computed(() => {
  const map = {}
  for (const s of stageStates.value) map[s.stageId] = s
  return map
})

const rootEl = ref(null)
const activeIndex = ref(0)
const playing = ref(false)
const isVisible = ref(true)
const reducedMotion = ref(false)
const liveMessage = ref('Stage 1 selected. Lead registration is the first step of the relationship lifecycle.')
const viewMode = ref('two-level') // 'two-level' or 'swimlane'

let playbackTimer = null
let motionQuery = null
let intersectionObserver = null

const activeStage = computed(() => pipelineStages[activeIndex.value] || pipelineStages[0])
const activeStageState = computed(() => stageStateMap.value[activeStage.value.id] || null)
const currentRole = computed(() => loadDemoSession()?.role || 'admin')
const activeDestination = computed(
  () =>
    activeStage.value.destinations?.[currentRole.value] || {
      route: activeStage.value.route,
      label: activeStage.value.routeLabel,
    },
)
const stageNumber = computed(() => activeIndex.value + 1)
const progress = computed(() => (pipelineStages.length <= 1 ? 100 : (activeIndex.value / (pipelineStages.length - 1)) * 100))
const progressLabel = computed(() => `${Math.round(progress.value)}% of the walkthrough`)
const statusText = computed(() =>
  reducedMotion.value
    ? 'Reduced motion is on; use the stage buttons to step through the flow.'
    : playing.value
      ? 'Playing automatically · pauses when this page is hidden.'
      : 'Paused · select a stage or use Previous / Next.',
)

const gateStageIndex = Object.freeze({ G1: 3, G2: 4, G3: 5, G4: 6, G5: 7, G6: 8, G7: 9, G8: 10, G9: 10, G10: 10 })
const targetNotice = ref('')

// Lifecycle section summaries derived from live states
const lifecycleSections = computed(() =>
  pipelineLifecycles.map((lc) => {
    const stages = pipelineStages.filter((s) => lc.stages.includes(s.id))
    const states = stages.map((s) => stageStateMap.value[s.id]?.displayState || 'NOT_STARTED')
    const complete = states.every((s) => s === 'COMPLETE')
    const blocked = states.some((s) => s === 'BLOCKED')
    const inProgress = states.some((s) => ['IN_PROGRESS', 'READY', 'WAITING_FOR_CLIENT', 'WAITING_FOR_FINANCE', 'WAITING_FOR_SENIOR', 'WAITING_FOR_MANAGER', 'WAITING_FOR_PARTNER', 'WAITING_FOR_EQR'].includes(s))
    return {
      ...lc,
      overallState: complete ? 'COMPLETE' : blocked ? 'BLOCKED' : inProgress ? 'IN_PROGRESS' : 'NOT_STARTED',
    }
  }),
)

function displayStateTone(displayState) {
  if (displayState === 'COMPLETE') return 'good'
  if (['BLOCKED', 'STALE'].includes(displayState)) return 'bad'
  if (['IN_PROGRESS', 'READY'].includes(displayState)) return 'blue'
  if (displayState?.startsWith('WAITING_')) return 'warn'
  return 'neutral'
}

function displayStateLabel(displayState) {
  const map = {
    NOT_STARTED: 'Not started',
    READY: 'Ready',
    IN_PROGRESS: 'In progress',
    WAITING_FOR_CLIENT: 'Waiting — client',
    WAITING_FOR_FINANCE: 'Waiting — finance',
    WAITING_FOR_SENIOR: 'Waiting — senior',
    WAITING_FOR_MANAGER: 'Waiting — manager',
    WAITING_FOR_PARTNER: 'Waiting — partner',
    WAITING_FOR_EQR: 'Waiting — EQR',
    BLOCKED: 'Blocked',
    STALE: 'Stale',
    COMPLETE: 'Complete',
  }
  return map[displayState] || displayState || 'Unknown'
}

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
    liveMessage.value = 'The full lifecycle pipeline is complete. Reset or select a stage to replay.'
    return
  }
  setStage(activeIndex.value + 1, 'Advanced to')
}

function previousStage() { setStage(activeIndex.value - 1, 'Returned to') }
function reset() { playing.value = false; setStage(0, 'Reset to') }

function togglePlayback() {
  if (reducedMotion.value) {
    playing.value = false
    liveMessage.value = 'Auto-play is disabled because reduced motion is enabled.'
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

function syncVisibility() { isVisible.value = document.visibilityState !== 'hidden' }

function handleMotionPreference(event) {
  reducedMotion.value = event.matches
  if (event.matches) { playing.value = false; liveMessage.value = 'Reduced motion is enabled.' }
}

function handleStageKeydown(event, index) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setStage(index + 1, 'Advanced to') }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setStage(index - 1, 'Returned to') }
  else if (event.key === 'Home') { event.preventDefault(); setStage(0, 'Jumped to') }
  else if (event.key === 'End') { event.preventDefault(); setStage(pipelineStages.length - 1, 'Jumped to') }
}

watch(
  () => props.navigationTarget?.recordId,
  (recordId) => {
    const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
    if (!recordId || (target.targetType !== 'pipeline' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'pipeline'))) return
    const index = gateStageIndex[String(recordId).toUpperCase()]
    if (index == null) { targetNotice.value = `${recordId} is not a named stage in this pipeline scope.`; return }
    targetNotice.value = ''
    setStage(index, 'Opened')
  },
  { immediate: true },
)

function openDestination() {
  emit('navigate', { routeKey: activeDestination.value.route, engagementId: demoActiveEngagementId.value || undefined })
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
    intersectionObserver = new IntersectionObserver(
      ([entry]) => { isVisible.value = entry.isIntersecting },
      { threshold: 0.15 },
    )
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
      eyebrow="Full lifecycle pipeline visualizer"
      title="Lead-to-archive lifecycle"
      description="The complete relationship and engagement lifecycle — from first prospect contact through final report, invoice, and archive. Each stage shows live state derived from the current scenario. Select a stage to see the owner, next action, blocker, and workspace."
      action-label="Open complete cycle"
      action-icon="arrow-right"
      @action="emit('navigate', 'cycle')"
    />

    <WorkflowGuide :guide="workflowGuides.pipeline" />
    <div v-if="targetNotice" class="guide-status-message" role="status"><Icon name="warning" :size="16" />{{ targetNotice }}</div>
    <ProcessValidityInspector :progress="demoProgress" :loading="demoLoading" :error="demoProgressError" :mode="demoMode" :last-sync="demoLastSync" @navigate="emit('navigate', $event)" />
    <SharedPipelineStatus v-if="sharedDemoEnabled" :engagement-id="sharedEngagementId" @navigate="emit('navigate', $event)" />

    <!-- Lifecycle overview cards -->
    <section class="panel pipeline-lifecycle-overview" aria-labelledby="lifecycle-overview-title">
      <div class="pipeline-intro-copy">
        <span class="eyebrow">Two-level lifecycle</span>
        <h2 id="lifecycle-overview-title">Relationship → Engagement → Archive</h2>
        <p>Lead qualification and client conversion are now distinct from the engagement execution lifecycle. The pipeline tracks both levels as a connected sequence.</p>
      </div>
      <div class="pipeline-lifecycle-sections">
        <div
          v-for="lc in lifecycleSections"
          :key="lc.id"
          class="pipeline-lifecycle-card"
          :class="`lifecycle-${lc.overallState.toLowerCase().replace(/_/g, '-')}`"
        >
          <span class="pipeline-lifecycle-icon" :class="`tone-${lc.tone}`"><Icon :name="lc.icon" :size="20" /></span>
          <div>
            <strong>{{ lc.label }}</strong>
            <small>{{ lc.description }}</small>
          </div>
          <StatusPill
            :label="displayStateLabel(lc.overallState)"
            :tone="displayStateTone(lc.overallState)"
          />
        </div>
      </div>
    </section>

    <!-- Stats bar -->
    <section class="panel pipeline-intro" aria-labelledby="pipeline-intro-title">
      <div class="pipeline-intro-copy">
        <span class="eyebrow">PDF-derived handoff map</span>
        <h2 id="pipeline-intro-title">One record · two lifecycles · {{ pipelineStages.length }} accountable stages</h2>
        <p>The moving packet shows where a document or decision travels. Open a detailed page to see the owner, the task and the next handoff behind each stage.</p>
      </div>
      <div class="pipeline-intro-facts" aria-label="Pipeline facts">
        <div><strong>{{ pipelineStages.length }}</strong><span>handoff stages</span></div>
        <div><strong>4</strong><span>role lanes</span></div>
        <div><strong>2</strong><span>lifecycle levels</span></div>
        <div><strong>26</strong><span>v5 named outputs</span></div>
      </div>
    </section>

    <!-- Interactive walkthrough player -->
    <section class="panel pipeline-player" aria-labelledby="pipeline-player-title">
      <div class="pipeline-player-head">
        <div>
          <span class="eyebrow">Interactive walkthrough</span>
          <h2 id="pipeline-player-title">Watch the handoff travel through the lifecycle</h2>
          <p>Play the sequence, pause it, or jump to any stage. The active stage is highlighted in the swimlane below.</p>
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

      <!-- Two-level stage rail: group by lifecycle -->
      <div v-for="lc in pipelineLifecycles" :key="lc.id" class="pipeline-lifecycle-group">
        <div class="pipeline-lifecycle-group-header" :class="`tone-${lc.tone}`">
          <Icon :name="lc.icon" :size="14" />
          <span>{{ lc.label }}</span>
        </div>
        <ol class="pipeline-stage-rail" :aria-label="`${lc.label} stages`">
          <li
            v-for="(stage) in pipelineStages.filter((s) => lc.stages.includes(s.id))"
            :key="stage.id"
            :class="{ active: pipelineStages.indexOf(stage) === activeIndex, complete: pipelineStages.indexOf(stage) < activeIndex }"
          >
            <button
              type="button"
              class="pipeline-stage-button"
              :class="[`tone-${stage.tone}`, { active: pipelineStages.indexOf(stage) === activeIndex, complete: pipelineStages.indexOf(stage) < activeIndex }]"
              :aria-current="pipelineStages.indexOf(stage) === activeIndex ? 'step' : undefined"
              :aria-label="`Stage ${stage.number}: ${stage.title}`"
              @click="setStage(pipelineStages.indexOf(stage))"
              @keydown="handleStageKeydown($event, pipelineStages.indexOf(stage))"
            >
              <span class="pipeline-stage-top">
                <span class="pipeline-stage-number">{{ stage.number }}</span>
                <span class="pipeline-stage-icon"><Icon :name="stage.icon" :size="18" /></span>
              </span>
              <span class="pipeline-stage-phase">{{ stage.phase }}</span>
              <strong>{{ stage.title }}</strong>
              <small>{{ stage.actor }}</small>
              <!-- Live derived state badge -->
              <span
                v-if="stageStateMap[stage.id]"
                class="pipeline-stage-state"
                :class="`tone-${displayStateTone(stageStateMap[stage.id].displayState)}`"
              >
                {{ displayStateLabel(stageStateMap[stage.id].displayState) }}
              </span>
              <span v-else class="pipeline-stage-state" :class="`tone-${stage.tone}`">
                {{ pipelineStages.indexOf(stage) < activeIndex ? 'Complete' : pipelineStages.indexOf(stage) === activeIndex ? 'Current' : stage.status }}
              </span>
            </button>
          </li>
        </ol>
      </div>

      <div class="pipeline-player-status" role="status" aria-live="polite"><span class="pipeline-live-dot" :class="{ playing }" aria-hidden="true"></span><span>{{ statusText }}</span><span class="pipeline-key-hint">Arrow keys move stages · Home / End jump</span></div>
      <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    </section>

    <!-- Stage detail + swimlane -->
    <section class="pipeline-content-grid">
      <article class="panel pipeline-detail" aria-labelledby="pipeline-detail-title" aria-live="polite">
        <div class="panel-heading pipeline-detail-heading">
          <div>
            <span class="eyebrow">
              {{ activeStage.lifecycle === 'relationship' ? 'Relationship lifecycle' : 'Engagement lifecycle' }}
              · {{ activeStage.number }}
            </span>
            <h2 id="pipeline-detail-title">{{ activeStage.title }}</h2>
          </div>
          <StatusPill
            v-if="activeStageState"
            :label="displayStateLabel(activeStageState.displayState)"
            :tone="displayStateTone(activeStageState.displayState)"
          />
          <StatusPill v-else :label="activeStage.status" :tone="statusTone(activeStage)" />
        </div>
        <p class="pipeline-detail-summary">{{ activeStage.summary }}</p>

        <!-- Live state panel — shown when derived state is available -->
        <div v-if="activeStageState" class="pipeline-live-state-panel">
          <div v-if="activeStageState.nextAction" class="pipeline-detail-block pipeline-live-next">
            <span class="eyebrow">Next action</span>
            <p><Icon name="arrow-right" :size="14" />{{ activeStageState.nextAction }}</p>
          </div>
          <div v-if="activeStageState.blocker" class="pipeline-detail-block pipeline-live-blocker">
            <span class="eyebrow">Blocker</span>
            <p><Icon name="warning" :size="14" />{{ activeStageState.blocker }}</p>
          </div>
          <div v-if="activeStageState.relatedRecord" class="pipeline-detail-block">
            <span class="eyebrow">Related record</span>
            <p>{{ activeStageState.relatedRecord }}</p>
          </div>
        </div>

        <div class="pipeline-detail-owner">
          <span class="pipeline-detail-icon" :class="`tone-${activeStage.tone}`"><Icon :name="activeStage.icon" :size="20" /></span>
          <div>
            <strong>{{ activeStageState?.owner || activeStage.owner }}</strong>
            <small>Accountable handoff · {{ activeStage.actor }}</small>
          </div>
        </div>
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
        <p class="pipeline-lane-intro">Read down a column to see the shared handoff. Read across a row to see each role's responsibility and visibility boundary.</p>
        <div class="pipeline-lane-legend" aria-label="Swimlane legend"><span><i class="pipeline-legend-dot active"></i>Active responsibility</span><span><i class="pipeline-legend-dot complete"></i>Complete</span><span><i class="pipeline-legend-dot upcoming"></i>Upcoming</span></div>
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
      <div><span class="eyebrow">Explore the operating model</span><h2 id="pipeline-boundary-title">See the systems behind each handoff</h2><p>Review the architecture map for the records, access boundaries, document storage and system responsibilities that support this workflow.</p></div>
      <button type="button" class="button ghost" @click="emit('navigate', 'architecture')"><span>View architecture map</span><Icon name="arrow-right" :size="16" /></button>
    </section>
  </div>
</template>
