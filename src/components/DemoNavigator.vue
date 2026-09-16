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
  isClientInvitation: { type: Boolean, default: false },
  showAdvanced: { type: Boolean, default: true },
  presentationMode: { type: Boolean, default: false },
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
    <div class="demo-nav-summary">
      <div class="demo-nav-scope">
        <label class="demo-nav-label" for="demo-client-select">Current client</label>
        <select id="demo-client-select" name="demo-client" class="demo-nav-inline-select" :value="activeContext?.clientId" :disabled="loading || !contexts.length" @change="onClient">
          <option v-if="!clientOptions.length" value="">Choose a client</option>
          <option v-for="client in clientOptions" :key="client.id" :value="client.id">{{ client.name }}</option>
        </select>
        <small>{{ activeContext ? `${activeContext.serviceLabel} · ${activeContext.period}` : 'Select a workspace to begin' }}</small>
        <small v-if="activeContext?.engagementId" class="demo-nav-context-id">{{ activeContext.engagementId }}</small>
      </div>
      <div class="demo-nav-stage">
        <span class="demo-nav-label">Workflow stage</span>
        <strong>{{ stageText }}</strong>
        <small>{{ stageDetail }} · {{ gatesText }}</small>
      </div>
      <div class="demo-nav-next">
        <span class="demo-nav-label">Next action</span>
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
    </div>

    <details v-if="showAdvanced && !isClientInvitation && currentUser?.role !== 'client' && (personas.length || serviceOptions.length || periodOptions.length > 1 || scenarioOptions.length || canRestart)" class="demo-nav-details">
      <summary><span>Context details</span><small>{{ presentationMode ? 'Core journey' : 'Role, focus and walkthrough controls' }}</small></summary>
      <div class="demo-nav-advanced-grid">
        <div v-if="personas.length" class="demo-nav-group">
          <label class="demo-nav-label" for="demo-persona-select">Role</label>
            <select id="demo-persona-select" name="demo-persona" class="demo-nav-select" :value="currentUser?.id" :disabled="personaBusy" aria-label="Choose role" @change="onPersona">
            <option v-for="persona in personas" :key="persona.id" :value="persona.id">{{ persona.roleLabel }}</option>
          </select>
          <small class="demo-nav-hint">Choose the workspace that matches the work you want to explore.</small>
        </div>
        <div v-if="serviceOptions.length" class="demo-nav-group">
          <label class="demo-nav-label" for="demo-service-select">Engagement</label>
            <select id="demo-service-select" name="demo-service" class="demo-nav-select" :value="activeContext?.service" :disabled="loading || !contexts.length" @change="onService">
            <option v-for="service in serviceOptions" :key="service.id" :value="service.id">{{ service.label }}</option>
          </select>
          <small class="demo-nav-hint">Choose the service route for this client.</small>
        </div>
        <div v-if="periodOptions.length" class="demo-nav-group demo-nav-period">
          <label class="demo-nav-label" for="demo-period-select">Period</label>
            <select id="demo-period-select" name="demo-period" class="demo-nav-select" :value="activeContext?.period" :disabled="loading || periodOptions.length < 2" aria-label="Period" @change="onPeriod">
            <option v-for="period in periodOptions" :key="period" :value="period">{{ period }}</option>
          </select>
          <small class="demo-nav-hint">Reporting period for the selected engagement.</small>
        </div>
        <div v-if="scenarioOptions.length" class="demo-nav-group">
          <label class="demo-nav-label" for="demo-scenario-select">Walkthrough focus</label>
            <select id="demo-scenario-select" name="demo-scenario" class="demo-nav-select" :value="activeScenario?.key || ''" :disabled="scenarioBusy" @change="onScenario">
            <option value="" disabled>Choose a focus</option>
            <option v-for="scenario in scenarioOptions" :key="scenario.key" :value="scenario.key">{{ scenario.label }}</option>
          </select>
          <small class="demo-nav-hint">{{ activeScenario?.description || 'Choose a known point in the workflow.' }}</small>
        </div>
        <div v-if="canRestart" class="demo-nav-group demo-nav-restart">
          <span class="demo-nav-label">Walkthrough</span>
          <button type="button" class="button secondary demo-nav-action" :disabled="restartBusy" @click="emit('request-restart')">
            <span>{{ restartBusy ? 'Restarting…' : 'Restart walkthrough' }}</span>
            <Icon name="refresh" :size="15" />
          </button>
          <small class="demo-nav-hint">Restore the starting workflow.</small>
        </div>
      </div>
      <div class="demo-nav-detail-footer">
        <span v-if="activeContext?.engagementId" class="demo-nav-context-detail-id">Engagement {{ activeContext.engagementId }}</span>
        <div class="demo-nav-detail-actions">
          <button type="button" class="text-button" title="Search workspace (Ctrl/Cmd+K)" aria-label="Search workspace" @click="emit('open-palette')"><Icon name="search" :size="15" />Search workspace</button>
          <button type="button" class="text-button" aria-label="Open notifications" @click="emit('open-notifications')"><Icon name="bell" :size="15" />Alerts</button>
        </div>
      </div>
    </details>
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

/* Perfex-inspired context bar: a compact summary first, with details on demand. */
.demo-navigator { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 13px 28px 14px; border-bottom: 1px solid var(--line, #dbe3ee); background: #fff; }
.demo-nav-summary { display: grid; grid-template-columns: minmax(150px, 1.1fr) minmax(180px, 1.1fr) minmax(150px, .8fr) minmax(220px, 1.35fr) auto; gap: 16px; align-items: center; min-width: 0; }
.demo-nav-scope, .demo-nav-stage, .demo-nav-context-code, .demo-nav-next, .demo-nav-tools { min-width: 0; display: grid; gap: 2px; }
.demo-nav-scope strong, .demo-nav-stage strong, .demo-nav-context-code strong { overflow: hidden; color: var(--primary, #1e3a5f); font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-scope small, .demo-nav-stage small, .demo-nav-context-code small { overflow: hidden; color: var(--subtle, #64748b); font-size: .7rem; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-label { color: var(--subtle, #64748b); font-size: .64rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.demo-nav-context-code strong { font: 600 .68rem 'Fira Code', monospace; }
.demo-nav-next { border-left: 1px solid var(--line, #dbe3ee); padding-left: 14px; }
.demo-nav-action { justify-content: space-between; gap: 8px; min-height: 40px; padding: 7px 10px; font-size: .75rem; }
.demo-nav-action span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-tools { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.demo-nav-tools .text-button { min-height: 40px; padding: 4px 7px; font-size: .73rem; }
.demo-nav-hint { overflow: hidden; color: var(--subtle, #64748b); font-size: .67rem; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-context-controls { display: grid; grid-template-columns: minmax(180px, 1.2fr) minmax(170px, 1fr); gap: 10px; align-items: end; padding-top: 1px; }
.demo-nav-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.demo-nav-select { width: 100%; max-width: 100%; min-height: 40px; padding: 7px 9px; color: var(--ink, #0f172a); border: 1px solid var(--line-strong, #c4d0de); border-radius: 8px; background: #fff; font-size: .76rem; }
.demo-nav-select:hover { border-color: #9bb5d3; }
.demo-nav-context-id { align-self: center; overflow: hidden; color: var(--subtle, #64748b); font: 600 .64rem 'Fira Code', monospace; text-overflow: ellipsis; white-space: nowrap; }
.demo-nav-details { border-top: 1px solid #eef2f7; }
.demo-nav-details summary { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 6px 2px; color: var(--secondary, #2563eb); cursor: pointer; font-size: .74rem; font-weight: 700; list-style-position: inside; }
.demo-nav-details summary small { color: var(--subtle, #64748b); font-size: .66rem; font-weight: 500; }
.demo-nav-advanced-grid { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 12px; padding: 4px 0 2px; }
.demo-nav-restart .demo-nav-action { width: 100%; }
@media (max-width: 980px) {
  .demo-nav-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .demo-nav-next { grid-column: span 2; border-left: 0; padding-left: 0; }
  .demo-nav-tools { justify-content: flex-start; }
  .demo-nav-context-controls { grid-template-columns: minmax(180px, 1.2fr) minmax(170px, 1fr); }
  .demo-nav-context-id { grid-column: 1 / -1; justify-self: start; }
}
@media (max-width: 680px) {
  .demo-navigator { gap: 10px; padding: 11px 15px 13px; }
  .demo-nav-summary { grid-template-columns: 1fr 1fr; gap: 10px; }
  .demo-nav-scope, .demo-nav-stage, .demo-nav-context-code, .demo-nav-next { grid-column: span 2; }
  .demo-nav-context-controls { grid-template-columns: 1fr; gap: 8px; }
  .demo-nav-context-id { grid-column: auto; }
  .demo-nav-select { min-height: 44px; padding: 8px 9px; }
  .demo-nav-action { min-height: 44px; }
  .demo-nav-tools { grid-column: 1 / -1; justify-content: flex-start; }
  .demo-nav-advanced-grid { grid-template-columns: 1fr; gap: 9px; }
}

/* Focused context bar: three decisions up front, everything else on demand. */
.demo-navigator { min-width: 0; overflow-x: hidden; }
.demo-nav-summary { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(220px, 1.2fr); gap: 18px; }
.demo-nav-scope, .demo-nav-stage, .demo-nav-next { min-width: 0; }
.demo-nav-label { font-size: 12px; letter-spacing: .05em; }
.demo-nav-scope small, .demo-nav-stage small { font-size: 13px; }
.demo-nav-scope strong, .demo-nav-stage strong { font-size: .92rem; }
.demo-nav-inline-select { width: 100%; min-width: 0; min-height: 40px; padding: 6px 28px 6px 0; color: var(--primary, #1e3a5f); border: 0; border-bottom: 1px solid transparent; border-radius: 0; background-color: transparent; font-size: .92rem; font-weight: 700; text-overflow: ellipsis; }
.demo-nav-inline-select:hover { border-bottom-color: #9bb5d3; }
.demo-nav-inline-select:focus-visible { outline: 3px solid rgba(37, 99, 235, .28); outline-offset: 2px; border-radius: 4px; }
.demo-nav-detail-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding-top: 10px; border-top: 1px solid #eef2f7; }
.demo-nav-detail-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.demo-nav-detail-actions .text-button { min-height: 40px; }
.demo-nav-details summary { min-height: 40px; }
.demo-nav-context-id, .demo-nav-context-detail-id { max-width: 100%; }

@media (max-width: 1100px) {
  .demo-nav-summary { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .demo-nav-next { grid-column: 1 / -1; border-left: 0; padding-left: 0; }
}

@media (max-width: 680px) {
  .demo-nav-summary { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .demo-nav-scope, .demo-nav-stage, .demo-nav-next { grid-column: auto; }
  .demo-nav-inline-select { min-height: 44px; }
  .demo-nav-detail-footer { align-items: stretch; flex-direction: column; }
  .demo-nav-detail-actions { justify-content: flex-start; }
}
</style>
