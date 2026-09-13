<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import { client, formatMoney, gateMeta, gateStatuses, pbcRequests, portfolioClients, timeline } from '../data'

const emit = defineEmits(['navigate'])
const range = ref('This period')
const ranges = ['This period', 'Next 30 days', 'All clients']
const openActions = ref(false)

const activeGates = computed(() => gateStatuses.filter((status) => status === 'good').length)
const openPbc = computed(() => pbcRequests.filter((request) => request.tone !== 'good').length)

function navigate(route) {
  emit('navigate', route)
}
</script>

<template>
  <div class="page dashboard-page">
    <PageHeader
      eyebrow="Practice control room"
      title="Good morning, Maya"
      description="A clear view of the firm’s active client work, approval gates, and the next action that keeps each engagement moving."
      action-label="New engagement"
      @action="navigate('clients')"
    />

    <div class="page-context-row">
      <div class="context-chip"><span class="context-dot"></span><strong>Demo workspace</strong><span>Northstar Trading W.L.L.</span></div>
      <div class="range-toggle" aria-label="Dashboard time range">
        <button v-for="item in ranges" :key="item" type="button" :class="{ active: range === item }" @click="range = item">{{ item }}</button>
      </div>
    </div>

    <section class="metric-grid" aria-label="Practice metrics">
      <article class="metric-card accent-navy">
        <div class="metric-card-top"><span>Active engagements</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Z"/><path d="M8 3v18M8 8h8M8 12h8M8 16h5"/></svg></span></div>
        <strong>12</strong><small>3 milestones due this week</small>
      </article>
      <article class="metric-card accent-green">
        <div class="metric-card-top"><span>Gate progress</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/></svg></span></div>
        <strong>{{ activeGates }}/10</strong><small>Northstar’s current cycle</small>
      </article>
      <article class="metric-card accent-amber">
        <div class="metric-card-top"><span>Open blockers</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16.5v.5"/></svg></span></div>
        <strong>4</strong><small>2 require partner attention</small>
      </article>
      <article class="metric-card accent-blue">
        <div class="metric-card-top"><span>Integration health</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V19h3M20 7.5V5h-3M7.5 16.5 10 14l2 2 4.5-5M4 7.5V5h3M20 16.5V19h-3M8 7.5 10.5 10l2-2 3.5 3.5"/></svg></span></div>
        <strong>96%</strong><small>Last reconciliation 18 sec</small>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel panel-wide">
        <div class="panel-heading"><div><span class="eyebrow">Portfolio snapshot</span><h2>Engagements that need a decision</h2></div><button type="button" class="text-button" @click="navigate('engagements')">View all <span aria-hidden="true">→</span></button></div>
        <div class="table-wrap responsive-table">
          <table>
            <thead><tr><th>Client</th><th>Service route</th><th>Owner</th><th>Risk</th><th>Next action</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="item in portfolioClients.slice(0, 4)" :key="item.id" class="table-row-action" @click="navigate('engagements')">
                <td><div class="client-cell"><span class="avatar" :class="`avatar-${item.tone}`">{{ item.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ item.name }}</strong><small>{{ item.id }}</small></span></div></td>
                <td>{{ item.service }}</td><td>{{ item.owner }}</td><td><span class="risk-label" :class="`risk-${item.tone}`">{{ item.risk }}</span></td><td><strong>{{ item.next }}</strong></td><td><StatusPill :label="item.status" :tone="item.tone === 'red' ? 'danger' : item.tone === 'amber' ? 'warn' : 'good'" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel action-panel">
        <div class="panel-heading"><div><span class="eyebrow">Your queue</span><h2>Next actions</h2></div><button type="button" class="icon-button" aria-label="Toggle action detail" :aria-expanded="openActions" @click="openActions = !openActions"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5 12 15l6-5.5"/></svg></button></div>
        <div class="task-list">
          <button type="button" class="task-item" @click="navigate('reviews')"><span class="task-indicator danger"></span><span><strong>Clear AR-019 evidence conflict</strong><small>Northstar · due today</small></span><span class="task-arrow" aria-hidden="true">→</span></button>
          <button type="button" class="task-item" @click="navigate('accounting')"><span class="task-indicator warn"></span><span><strong>Review AJ-002 proposal</strong><small>Northstar · QAR {{ formatMoney(12500).replace('QAR', '').trim() }}</small></span><span class="task-arrow" aria-hidden="true">→</span></button>
          <button type="button" class="task-item" @click="navigate('clients')"><span class="task-indicator blue"></span><span><strong>Decide Al Noor acceptance hold</strong><small>Missing UBO evidence · specialist review</small></span><span class="task-arrow" aria-hidden="true">→</span></button>
          <template v-if="openActions">
            <button type="button" class="task-item" @click="navigate('release')"><span class="task-indicator neutral"></span><span><strong>Confirm EQR reviewer availability</strong><small>Northstar · before report date</small></span><span class="task-arrow" aria-hidden="true">→</span></button>
          </template>
        </div>
        <div class="queue-footer"><span>{{ openPbc }} PBC items need client or firm action</span><button type="button" class="text-button" @click="navigate('pbc')">Open portal <span aria-hidden="true">→</span></button></div>
      </article>

      <article class="panel gate-panel">
        <div class="panel-heading"><div><span class="eyebrow">Northstar Trading W.L.L.</span><h2>Cycle control path</h2></div><StatusPill label="Fieldwork in progress" tone="warn" /></div>
        <div class="gate-progress"><div v-for="(gate, index) in gateMeta.slice(0, 10)" :key="gate.id" class="gate-progress-item" :class="`gate-${gateStatuses[index]}`"><span class="gate-node">{{ gateStatuses[index] === 'good' ? '✓' : gateStatuses[index] === 'warn' ? '!' : gateStatuses[index] === 'danger' ? '×' : '•' }}</span><span>{{ gate.id }}</span></div></div>
        <div class="gate-summary"><div><strong>4 of 10</strong><span>gates ready</span></div><div><strong>2</strong><span>approval blockers</span></div><div><strong>1</strong><span>sync retry</span></div><button type="button" class="text-button" @click="navigate('engagements')">Open engagement <span aria-hidden="true">→</span></button></div>
      </article>

      <article class="panel timeline-panel">
        <div class="panel-heading"><div><span class="eyebrow">Audit trail</span><h2>Recent activity</h2></div><button type="button" class="text-button" @click="navigate('integration')">System health <span aria-hidden="true">→</span></button></div>
        <div class="timeline-list">
          <div v-for="event in timeline.slice(-4).reverse()" :key="event.title" class="timeline-item"><span class="timeline-dot" :class="`tone-${event.tone}`"></span><div><strong>{{ event.title }}</strong><p>{{ event.detail }}</p><small>{{ event.date }} · {{ client.shortName }}</small></div></div>
        </div>
      </article>
    </section>

    <div class="prototype-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5v.5"/></svg><span><strong>Prototype data</strong> Values are anonymized and illustrative. Rules route work and surface blockers; qualified people own decisions, approvals, and conclusions.</span></div>
  </div>
</template>
