<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'

const props = defineProps({
  currentUser: { type: Object, default: null },
  personas: { type: Array, default: () => [] },
  contexts: { type: Array, default: () => [] },
  activeEngagementId: { type: String, default: '' },
  activeContext: { type: Object, default: null },
  stageSummary: { type: Object, default: null },
  mode: { type: String, default: 'local' },
  loading: { type: Boolean, default: false },
  lastSync: { type: String, default: '' },
  personaBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['switch-persona', 'switch-context', 'navigate', 'open-palette', 'open-notifications'])

const isShared = computed(() => props.mode === 'shared')
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
const stageText = computed(() => {
  if (!isShared.value) return 'Local simulation'
  return props.stageSummary?.label || 'Stage — / 8'
})
const gatesText = computed(() => {
  if (!isShared.value) return 'browser-local scope'
  const summary = props.stageSummary
  if (!summary) return ''
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
function openNext() {
  if (nextAction.value) emit('navigate', {
    routeKey: nextAction.value.route || 'role-workspace',
    engagementId: props.activeEngagementId || undefined,
    recordId: nextAction.value.targetId || nextAction.value.recordId || nextAction.value.taskId || undefined,
  })
}
</script>

<template>
  <section class="demo-navigator" aria-label="Demo navigator">
    <div v-if="personas.length" class="demo-nav-group">
      <label class="demo-nav-label" for="demo-persona-select">Persona</label>
      <select id="demo-persona-select" class="demo-nav-select" :value="currentUser?.id" :disabled="personaBusy" aria-label="Demo persona switcher, simulation only" @change="onPersona">
        <option v-for="persona in personas" :key="persona.id" :value="persona.id">{{ persona.roleLabel }}</option>
      </select>
      <small class="demo-nav-hint">Demo persona switcher — simulation only</small>
    </div>
    <div class="demo-nav-group">
      <label class="demo-nav-label" for="demo-client-select">Client</label>
      <select id="demo-client-select" class="demo-nav-select" :value="activeContext?.clientId" :disabled="loading || !contexts.length" @change="onClient">
        <option v-for="client in clientOptions" :key="client.id" :value="client.id">{{ client.name }}</option>
      </select>
      <small class="demo-nav-hint">{{ activeContext?.engagementId || 'No shared context' }}</small>
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
    </div>
    <div class="demo-nav-group demo-nav-next">
      <span class="demo-nav-label">Next</span>
      <button v-if="nextAction && isShared" type="button" class="button primary demo-nav-action" @click="openNext">
        <span>{{ nextAction.title }}</span>
        <Icon name="arrow-right" :size="15" />
      </button>
      <button v-else type="button" class="button secondary demo-nav-action" @click="emit('navigate', { routeKey: 'role-workspace', engagementId: activeEngagementId || undefined })">
        <span>{{ isShared ? 'Open role workspace' : 'Open local workspace' }}</span>
        <Icon name="arrow-right" :size="15" />
      </button>
      <small v-if="nextAction && isShared" class="demo-nav-hint">{{ nextAction.owner }}</small>
      <small v-else class="demo-nav-hint">Local simulation scope</small>
    </div>
    <div class="demo-nav-group demo-nav-mode">
      <StatusPill :label="isShared ? 'LIVE SHARED DEMO · D1' : 'LOCAL SIMULATION'" :tone="isShared ? 'good' : 'neutral'" />
      <small class="demo-nav-hint" :title="isShared ? 'D1 is the displayed source of shared workflow truth.' : 'Browser-local scenario is the source.'">
        {{ isShared ? `D1 authoritative${lastSync ? ` · synced ${new Date(lastSync).toLocaleTimeString('en-QA')}` : ''}` : 'Browser-local authoritative' }}
      </small>
      <div class="demo-nav-icon-row">
        <button type="button" class="text-button" title="Search and commands (Ctrl/Cmd+K)" aria-label="Open command palette" @click="emit('open-palette')">⌘K Search</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.demo-navigator {
  display: grid;
  grid-template-columns: minmax(160px, 1.1fr) minmax(180px, 1.3fr) minmax(200px, 1.3fr) minmax(200px, 1.2fr) minmax(170px, 0.9fr);
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
.demo-nav-next { border-left: 1px solid var(--border, #e5e7eb); padding-left: 12px; }
.demo-nav-action { justify-content: space-between; gap: 8px; font-size: 13px; padding: 7px 10px; }
.demo-nav-action span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-mode { align-items: flex-start; gap: 6px; }
.demo-nav-icon-row { display: flex; gap: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
@media (max-width: 1100px) { .demo-navigator { grid-template-columns: 1fr 1fr; } .demo-nav-next { border-left: none; padding-left: 0; } }
@media (max-width: 680px) {
  .demo-navigator { gap: 10px; padding: 10px 15px; }
  .demo-nav-select { width: 100%; min-height: 44px; padding: 8px 9px; }
  .demo-nav-mini-select { min-width: 64px; min-height: 44px; padding: 5px 6px; }
  .demo-nav-action { min-height: 44px; }
  .demo-nav-mode { grid-column: 1 / -1; }
}
</style>
