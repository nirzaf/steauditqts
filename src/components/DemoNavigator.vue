<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  currentUser: { type: Object, default: null },
  personas: { type: Array, default: () => [] },
  contexts: { type: Array, default: () => [] },
  activeEngagementId: { type: String, default: '' },
  activeContext: { type: Object, default: null },
  stageSummary: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  personaBusy: { type: Boolean, default: false },
  scenarioOptions: { type: Array, default: () => [] },
  activeScenario: { type: Object, default: null },
  scenarioBusy: { type: Boolean, default: false },
  canRestart: { type: Boolean, default: false },
  restartBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['switch-persona', 'switch-context', 'select-scenario', 'request-restart', 'navigate', 'open-palette', 'open-notifications'])

const clientOptions = computed(() => {
  const seen = new Map()
  for (const context of props.contexts) {
    if (!seen.has(context.clientId)) {
      seen.set(context.clientId, { id: context.clientId, name: context.clientName, shortName: context.clientShortName })
    }
  }
  return [...seen.values()]
})
const serviceOptions = computed(() => {
  const clientId = props.activeContext?.clientId
  const seen = new Map()
  for (const context of props.contexts.filter((c) => !clientId || c.clientId === clientId)) {
    if (!seen.has(context.service)) seen.set(context.service, { id: context.service, label: context.serviceLabel })
  }
  return [...seen.values()]
})
const periodOptions = computed(() => {
  const seen = new Set()
  for (const context of props.contexts) if (context.period) seen.add(context.period)
  return [...seen]
})
const nextAction = computed(() => props.stageSummary?.nextAction || null)
const stageText = computed(() => props.stageSummary?.label || 'Choose an engagement')
const stageDetail = computed(() => {
  const summary = props.stageSummary
  if (!summary?.stageTitle) return 'Choose an engagement to see the workflow position'
  return `${summary.stageTitle} · ${summary.completionPercent || 0}% complete`
})
const gatesText = computed(() => {
  const summary = props.stageSummary
  if (!summary) return 'Select a workspace to begin'
  return `${summary.openCount} open · ${summary.blockedCount} blocked`
})
function onPersona(event) {
  const personaId = event.target.value
  if (personaId && personaId !== props.currentUser?.id) emit('switch-persona', personaId)
}
function findContext(clientId, service, period) {
  return props.contexts.find((c) => c.clientId === clientId && c.service === service && c.period === period)
    || props.contexts.find((c) => c.clientId === clientId)
    || null
}
function onClient(event) {
  const clientId = event.target.value
  const fallback = props.contexts.find((c) => c.clientId === clientId)
  if (fallback && fallback.engagementId !== props.activeEngagementId) emit('switch-context', fallback.engagementId)
}
function onService(event) {
  const service = event.target.value
  const match = findContext(props.activeContext?.clientId, service, props.activeContext?.period)
  if (match && match.engagementId !== props.activeEngagementId) emit('switch-context', match.engagementId)
}
function onPeriod(event) {
  const period = event.target.value
  const match = findContext(props.activeContext?.clientId, props.activeContext?.service, period)
  if (match && match.engagementId !== props.activeEngagementId) emit('switch-context', match.engagementId)
}
function onScenario(event) {
  const presetKey = event.target.value
  if (presetKey && presetKey !== props.activeScenario?.key) emit('select-scenario', presetKey)
}
function openNext() {
  if (nextAction.value) emit('navigate', {
    routeKey: nextAction.value.route || 'role-workspace',
    engagementId: props.activeEngagementId || undefined,
    recordId: nextAction.value.targetId || nextAction.value.recordId || nextAction.value.taskId || undefined,
  })
}
</script>

<template>
  <section class="demo-navigator" aria-label="Workspace navigator">
    <div v-if="personas.length" class="demo-nav-group">
      <label class="demo-nav-label" for="demo-persona-select">Role</label>
      <select id="demo-persona-select" class="demo-nav-select" :value="currentUser?.id" :disabled="personaBusy" aria-label="Choose role" @change="onPersona">
        <option v-for="persona in personas" :key="persona.id" :value="persona.id">{{ persona.roleLabel }}</option>
      </select>
      <small class="demo-nav-hint">Choose the workspace that matches the work you want to explore.</small>
    </div>
    <div class="demo-nav-group">
      <label class="demo-nav-label" for="demo-client-select">Client</label>
      <select id="demo-client-select" class="demo-nav-select" :value="activeContext?.clientId" :disabled="loading || !contexts.length" @change="onClient">
        <option v-for="client in clientOptions" :key="client.id" :value="client.id">{{ client.name }}</option>
      </select>
      <small class="demo-nav-hint">{{ activeContext ? `${activeContext.serviceLabel} · ${activeContext.period}` : 'Choose a client to begin' }}</small>
    </div>
    <div class="demo-nav-group">
      <label class="demo-nav-label" for="demo-service-select">Engagement</label>
      <select id="demo-service-select" class="demo-nav-select" :value="activeContext?.service" :disabled="loading || !contexts.length" @change="onService">
        <option v-for="service in serviceOptions" :key="service.id" :value="service.id">{{ service.label }} · {{ activeContext?.period }}</option>
      </select>
      <small class="demo-nav-hint">
        <label class="sr-only" for="demo-period-select">Period</label>
        <select id="demo-period-select" class="demo-nav-mini-select" :value="activeContext?.period" :disabled="loading || periodOptions.length < 2" aria-label="Period" @change="onPeriod">
          <option v-for="period in periodOptions" :key="period" :value="period">{{ period }}</option>
        </select>
        <span>{{ stageText }} · {{ gatesText }}</span>
      </small>
      <small class="demo-nav-progress" :aria-label="stageDetail">{{ stageDetail }}</small>
      <small v-if="activeContext?.engagementId" class="demo-nav-context-id">{{ activeContext.engagementId }}</small>
    </div>
    <div v-if="scenarioOptions.length" class="demo-nav-group">
      <label class="demo-nav-label" for="demo-scenario-select">Walkthrough focus</label>
      <select id="demo-scenario-select" class="demo-nav-select" :value="activeScenario?.key || ''" :disabled="scenarioBusy" @change="onScenario">
        <option value="" disabled>Choose a focus</option>
        <option v-for="scenario in scenarioOptions" :key="scenario.key" :value="scenario.key">{{ scenario.label }}</option>
      </select>
      <small class="demo-nav-hint">{{ activeScenario?.description || 'Choose a known point in the workflow.' }}</small>
    </div>
    <div class="demo-nav-group demo-nav-next">
      <span class="demo-nav-label">Next</span>
      <button v-if="nextAction" type="button" class="button primary demo-nav-action" @click="openNext">
        <span>{{ nextAction.title }}</span>
        <Icon name="arrow-right" :size="15" />
      </button>
      <button v-else type="button" class="button secondary demo-nav-action" @click="emit('navigate', { routeKey: 'role-workspace', engagementId: activeEngagementId || undefined })">
        <span>Open workspace</span>
        <Icon name="arrow-right" :size="15" />
      </button>
      <small v-if="nextAction" class="demo-nav-hint">{{ nextAction.owner }}</small>
      <small v-else class="demo-nav-hint">Choose a role to see the next handoff.</small>
    </div>
    <div class="demo-nav-group demo-nav-tools">
      <span class="demo-nav-label">Find</span>
      <div class="demo-nav-icon-row">
        <button type="button" class="text-button" title="Search workspace (Ctrl/Cmd+K)" aria-label="Search workspace" @click="emit('open-palette')">Search workspace</button>
      </div>
      <small class="demo-nav-hint">Find a client, engagement, or task.</small>
    </div>
    <div v-if="canRestart" class="demo-nav-group demo-nav-restart">
      <span class="demo-nav-label">Walkthrough</span>
      <button type="button" class="button secondary demo-nav-action" :disabled="restartBusy" @click="emit('request-restart')">
        <span>{{ restartBusy ? 'Restarting…' : 'Restart walkthrough' }}</span>
        <Icon name="refresh" :size="15" />
      </button>
      <small class="demo-nav-hint">Restore the starting workflow.</small>
    </div>
  </section>
</template>

<style scoped>
.demo-navigator {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  align-items: start;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
}
.demo-nav-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.demo-nav-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
.demo-nav-select { max-width: 100%; padding: 6px 8px; border: 1px solid var(--border, #d1d5db); border-radius: 8px; background: var(--background, #f9fafb); font-size: 13px; }
.demo-nav-mini-select { padding: 1px 4px; font-size: 11px; border: 1px solid var(--border, #d1d5db); border-radius: 6px; margin-right: 6px; }
.demo-nav-hint { font-size: 11px; opacity: 0.72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.demo-nav-progress { color: var(--ink, #172033); font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.demo-nav-context-id { color: var(--ink, #172033); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: .02em; }
.demo-nav-next { border-left: 1px solid var(--border, #e5e7eb); padding-left: 12px; }
.demo-nav-action { justify-content: space-between; gap: 8px; font-size: 13px; padding: 7px 10px; }
.demo-nav-action span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-tools { align-items: flex-start; gap: 6px; }
.demo-nav-icon-row { display: flex; gap: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
@media (max-width: 1100px) { .demo-nav-next { border-left: none; padding-left: 0; } }
@media (max-width: 680px) {
  .demo-navigator { gap: 10px; padding: 10px 15px; }
  .demo-nav-select { width: 100%; min-height: 44px; padding: 8px 9px; }
  .demo-nav-mini-select { min-width: 64px; min-height: 44px; padding: 5px 6px; }
  .demo-nav-action { min-height: 44px; }
  .demo-nav-tools { grid-column: 1 / -1; }
}
</style>
