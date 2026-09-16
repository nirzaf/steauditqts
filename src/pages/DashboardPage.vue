<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import NextBestActionCard from '../components/NextBestActionCard.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, portfolioClients, timeline, workflowGuides } from '../data'
import { gateSummary, selectedClient, selectedEngagement, scenario } from '../domain/scenario.js'
import { useDemoContext } from '../demoContext.js'

const emit = defineEmits(['navigate'])
const range = ref('This period')
const ranges = ['This period', 'Next 30 days', 'All clients']
const openActions = ref(false)
const { mode: demoMode, tasks: projectedTasks, events: projectedEvents } = useDemoContext()

const dashboardEngagement = computed(() => selectedEngagement())
const dashboardClient = computed(() => selectedClient())
const gateState = computed(() => gateSummary(dashboardEngagement.value?.id))
const currentGates = computed(() => gateState.value.gates.filter((gate) => gate.applicable && gate.period === 'current'))
const nextPeriodGate = computed(() => gateState.value.gates.find((gate) => gate.id === 'G10'))
const activeGates = computed(() => gateState.value.currentReady)
const currentGateDenominator = computed(() => gateState.value.currentDenominator)
const openPbc = computed(() => (scenario.pbcRequests || []).filter((request) => !['ACCEPTED', 'CLOSED'].includes(request.state)).length)
const activeEngagements = computed(() => scenario.engagements.filter((engagement) => !engagement.isNextPeriodShell).length)
const openBlockers = computed(() => currentGates.value.filter((gate) => gate.status !== 'good').length)
const partnerBlockers = computed(() => currentGates.value.filter((gate) => ['G1', 'G7', 'G8'].includes(gate.id) && gate.status !== 'good').length)
const syncRetries = computed(() => (scenario.operations || []).filter((operation) => ['RETRY_REQUIRED', 'UNCERTAIN_REMOTE_SUCCESS', 'CURSOR_EXPIRED'].includes(operation.state)).length)
const integrationHealth = computed(() => scenario.provider?.connected ? (syncRetries.value ? '82%' : '100%') : 'Offline')
const integrationDetail = computed(() => scenario.provider?.connected ? `${syncRetries.value ? syncRetries.value + ' retry pending' : 'No retry pending'} · Connection status` : 'Provider disconnected · Connection status')
const dashboardStatus = computed(() => dashboardEngagement.value?.service === 'audit' ? 'Fieldwork in progress' : 'Preparation in progress')
const staticQueue = [
  { id: 'RP-042', title: 'Clear AR-019 evidence conflict', detail: 'Northstar · due today', route: 'reviews', tone: 'danger', engagementId: 'ENG-0018-AUD-2026' },
  { id: 'AJ-002', title: 'Review AJ-002 proposal', detail: 'Northstar · QAR 12,500', route: 'accounting', tone: 'warn', engagementId: 'ENG-0018-ACC-2026' },
  { id: 'LEAD-0001', title: 'Decide Al Noor acceptance hold', detail: 'Missing UBO evidence · specialist review', route: 'clients', tone: 'blue', engagementId: '' },
  { id: 'RC-026', title: 'Confirm EQR reviewer availability', detail: 'Northstar · before report date', route: 'release', tone: 'neutral', engagementId: 'ENG-0018-AUD-2026' },
]
const dashboardQueue = computed(() => {
  const projected = (projectedTasks.value || []).slice(0, 4).map((task) => ({
    id: task.target || task.taskId,
    title: task.title || task.taskId,
    detail: `${task.assigneeRole || task.assigneePersona || 'Queue'}${task.dueDate ? ` · due ${task.dueDate}` : ''}`,
    route: task.route || 'role-workspace',
    tone: task.priority === 'HIGH' ? 'danger' : 'warn',
    engagementId: task.engagementId || dashboardEngagement.value?.id,
  }))
  return demoMode.value === 'local' && projected.length ? projected : staticQueue
})
const dashboardActivity = computed(() => {
  const projected = (projectedEvents.value || []).slice(0, 4).map((event) => ({
    title: String(event.action || event.type || 'Workflow update').replaceAll('_', ' '),
    detail: event.objectId ? `${event.actor || 'Workspace'} · ${event.objectId}` : (event.actor || 'Workspace update'),
    date: event.createdAt ? new Date(event.createdAt).toLocaleDateString('en-QA', { day: '2-digit', month: 'short' }) : 'Today',
    tone: 'blue',
  }))
  return demoMode.value === 'local' && projected.length ? projected : timeline.slice(-4).reverse()
})

function navigate(route) {
  emit('navigate', route)
}

function engagementForPortfolio(item) {
  return scenario.engagements.find((engagement) => engagement.clientId === item?.id)
    || scenario.engagements.find((engagement) => item?.name && engagement.clientName === item.name)
    || null
}

function openQueue(routeKey, recordId, engagementId = dashboardEngagement.value?.id) {
  emit('navigate', { routeKey, recordId, engagementId })
}

function openPortfolioItem(item) {
  const engagement = engagementForPortfolio(item)
  if (engagement) openQueue('engagements', engagement.id, engagement.id)
  else openQueue('clients', item?.id, undefined)
}
</script>

<template>
  <div class="page dashboard-page">
    <PageHeader
      density="compact"
      eyebrow="Practice control room"
      title="See the whole engagement at a glance"
      description="Start with the queue, resolve blockers, and follow the next owner through every handoff."
      action-label="New engagement"
      @action="navigate('clients')"
    />
    <NextBestActionCard title="Next best action from the shared workflow" @navigate="navigate" />
    <WorkflowGuide :guide="workflowGuides.dashboard" />

    <div class="page-context-row">
      <div class="context-chip"><span class="context-dot"></span><strong>Demo workspace</strong><span>{{ dashboardClient?.name || 'No selected engagement' }}</span></div>
      <div class="range-toggle" aria-label="Dashboard time range">
        <button v-for="item in ranges" :key="item" type="button" :class="{ active: range === item }" @click="range = item">{{ item }}</button>
      </div>
    </div>

    <section class="metric-grid" aria-label="Practice metrics">
      <article class="metric-card accent-navy">
        <div class="metric-card-top"><span>Active engagements</span><span class="metric-icon"><Icon name="briefcase" :size="17" /></span></div>
        <strong>{{ activeEngagements }}</strong><small>{{ scenario.engagements.length - activeEngagements }} next-period shell(s) in planning</small>
      </article>
      <article class="metric-card accent-green">
        <div class="metric-card-top"><span>Gate progress</span><span class="metric-icon"><Icon name="check-circle" :size="17" /></span></div>
        <strong>{{ activeGates }}/{{ currentGateDenominator }}</strong><small>{{ dashboardClient?.name || 'Selected engagement' }} · current cycle</small>
      </article>
      <article class="metric-card accent-amber">
        <div class="metric-card-top"><span>Open blockers</span><span class="metric-icon"><Icon name="warning" :size="17" /></span></div>
        <strong>{{ openBlockers }}</strong><small>{{ partnerBlockers }} require partner attention</small>
      </article>
      <article class="metric-card accent-blue">
        <div class="metric-card-top"><span>Integration health</span><span class="metric-icon"><Icon name="pulse" :size="17" /></span></div>
        <strong>{{ integrationHealth }}</strong><small>{{ integrationDetail }}</small>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel panel-wide">
        <div class="panel-heading"><div><span class="eyebrow">Portfolio snapshot</span><h2>Engagements that need a decision</h2></div><button type="button" class="text-button" @click="navigate('portfolio')">Open live portfolio <Icon name="arrow-right" :size="15" /></button></div>
        <div class="table-wrap responsive-table">
          <table>
            <thead><tr><th>Client</th><th>Service route</th><th>Owner</th><th>Risk</th><th>Next action</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="item in portfolioClients.slice(0, 4)" :key="item.id" class="table-row-action" @click="openPortfolioItem(item)">
                <td><div class="client-cell"><span class="avatar" :class="`avatar-${item.tone}`">{{ item.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ item.name }}</strong><small>{{ item.id }}</small></span></div></td>
                <td>{{ item.service }}</td><td>{{ item.owner }}</td><td><span class="risk-label" :class="`risk-${item.tone}`">{{ item.risk }}</span></td><td><strong>{{ item.next }}</strong></td><td><StatusPill :label="item.status" :tone="item.tone === 'red' ? 'danger' : item.tone === 'amber' ? 'warn' : 'good'" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel action-panel">
        <div class="panel-heading"><div><span class="eyebrow">Your queue</span><h2>Next actions</h2></div><button type="button" class="icon-button" aria-label="Toggle action detail" title="Toggle action detail" :aria-expanded="openActions" @click="openActions = !openActions"><Icon name="chevron-down" :size="17" :class="{ rotated: openActions }" /></button></div>
        <div class="task-list">
          <button v-for="task in dashboardQueue.slice(0, openActions ? 4 : 3)" :key="task.id" type="button" class="task-item" @click="openQueue(task.route, task.id, task.engagementId)"><span class="task-indicator" :class="task.tone"></span><span><strong>{{ task.title }}</strong><small>{{ task.detail }}</small></span><Icon name="arrow-right" :size="16" /></button>
        </div>
        <div class="queue-footer"><span>{{ openPbc }} PBC items need client or firm action</span><button type="button" class="text-button" @click="navigate('pbc')">Open portal <Icon name="arrow-right" :size="15" /></button></div>
      </article>

      <article class="panel gate-panel">
        <div class="panel-heading"><div><span class="eyebrow">{{ dashboardClient?.name || 'Selected client' }}</span><h2>Cycle control path</h2></div><StatusPill :label="dashboardStatus" tone="warn" /></div>
        <div class="gate-progress"><div v-for="gate in currentGates" :key="gate.id" class="gate-progress-item" :class="`gate-${gate.status}`"><span class="gate-node">{{ gate.status === 'good' ? '✓' : gate.status === 'warn' ? '!' : gate.status === 'danger' ? '×' : '•' }}</span><span>{{ gate.id }}</span></div></div>
        <div class="gate-next-note"><span class="gate-next-node">{{ nextPeriodGate?.id }}</span><span><strong>{{ nextPeriodGate?.title }}</strong><small>Shown separately: {{ nextPeriodGate?.nextPeriodNote }}</small></span></div>
        <div class="gate-summary"><div><strong>{{ activeGates }} of {{ currentGateDenominator }}</strong><span>current gates ready</span></div><div><strong>{{ partnerBlockers }}</strong><span>approval blockers</span></div><div><strong>{{ syncRetries }}</strong><span>sync retries</span></div><button type="button" class="text-button" @click="navigate('engagements')">Open engagement <Icon name="arrow-right" :size="15" /></button></div>
      </article>

      <article class="panel timeline-panel">
        <div class="panel-heading"><div><span class="eyebrow">Audit trail</span><h2>Recent activity</h2></div><button type="button" class="text-button" @click="navigate('integration')">System health <Icon name="arrow-right" :size="15" /></button></div>
        <div class="timeline-list">
          <div v-for="(event, index) in dashboardActivity" :key="`${event.title}-${event.date}-${index}`" class="timeline-item"><span class="timeline-dot" :class="`tone-${event.tone}`"></span><div><strong>{{ event.title }}</strong><p>{{ event.detail }}</p><small>{{ event.date }} · {{ client.shortName }}</small></div></div>
        </div>
      </article>
    </section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Prototype data</strong> Values are anonymized and illustrative. Rules route work and surface blockers; qualified people own decisions, approvals, and conclusions.</span></div>
  </div>
</template>
