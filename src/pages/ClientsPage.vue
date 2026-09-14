<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, formatMoney, portfolioClients, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const search = ref('')
const filter = ref('All clients')
const selected = ref(null)
const toast = ref('')
const filters = ['All clients', 'Needs decision', 'In delivery', 'Low risk']

const filteredClients = computed(() => portfolioClients.filter((item) => {
  const query = search.value.trim().toLowerCase()
  const matchesSearch = !query || `${item.name} ${item.id} ${item.service}`.toLowerCase().includes(query)
  const matchesFilter = filter.value === 'All clients'
    || (filter.value === 'Needs decision' && (item.status === 'Acceptance hold' || item.risk === 'High'))
    || (filter.value === 'In delivery' && ['Fieldwork', 'Statements review', 'Planning'].includes(item.status))
    || (filter.value === 'Low risk' && item.risk === 'Low')
  return matchesSearch && matchesFilter
}))

function openEngagement() {
  emit('navigate', 'engagements')
}

function addClient() {
  toast.value = 'New client draft opened. Add the relationship first, then start a separate acceptance assessment.'
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Relationships and decisions" title="Clients & acceptance" description="Keep the commercial relationship separate from the professional acceptance decision. Every service and reporting period gets its own assessment." action-label="Add client" @action="addClient" />
    <WorkflowGuide :guide="workflowGuides.clients" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="stats-strip">
      <div><span>Active clients</span><strong>18</strong><small>Across 24 service-period engagements</small></div>
      <div><span>Awaiting partner decision</span><strong>3</strong><small>All blockers remain visible</small></div>
      <div><span>Continuances due</span><strong>5</strong><small>Next 30 days</small></div>
      <div><span>Question bank</span><strong>62 + 30</strong><small>Acceptance and annual review</small></div>
    </section>

    <section class="panel client-register-panel">
      <div class="panel-heading"><div><span class="eyebrow">Practice client register</span><h2>Professional relationships</h2></div><button type="button" class="text-button" @click="filter = 'Needs decision'">Show decisions <Icon name="arrow-right" :size="15" /></button></div>
      <div class="toolbar"><label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search clients</span><input v-model="search" type="search" placeholder="Search by name, ID or service" /></label><div class="filter-row" aria-label="Client filters"><button v-for="item in filters" :key="item" type="button" :class="{ active: filter === item }" @click="filter = item">{{ item }}</button></div></div>
      <div class="table-wrap responsive-table">
        <table>
          <thead><tr><th>Client</th><th>Service route</th><th>Partner</th><th>Risk</th><th>Next review</th><th>Relationship state</th><th><span class="sr-only">Action</span></th></tr></thead>
          <tbody>
            <tr v-for="item in filteredClients" :key="item.id">
              <td><div class="client-cell"><span class="avatar" :class="`avatar-${item.tone}`">{{ item.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span><strong>{{ item.name }}</strong><small>{{ item.id }}</small></span></div></td>
              <td>{{ item.service }}</td><td>{{ item.owner }}</td><td><span class="risk-label" :class="`risk-${item.tone}`">{{ item.risk }}</span></td><td><strong>{{ item.next }}</strong></td><td><StatusPill :label="item.status" :tone="item.tone === 'red' ? 'danger' : item.tone === 'amber' ? 'warn' : 'good'" /></td><td><button type="button" class="row-button" @click="selected = item">Open <Icon name="arrow-right" :size="15" /></button></td>
            </tr>
            <tr v-if="!filteredClients.length"><td colspan="7" class="empty-state"><strong>No clients match that filter.</strong><span>Try another search or clear the current filter.</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="split-grid">
      <article class="panel assessment-card">
        <div class="panel-heading"><div><span class="eyebrow">Selected assessment · {{ client.id }}</span><h2>Northstar annual continuance</h2></div><StatusPill label="Review in progress" tone="warn" /></div>
        <div class="assessment-summary"><div class="assessment-avatar">NT</div><div><strong>{{ client.name }}</strong><span>{{ client.period }} · {{ client.currency }}</span><span>Template ACCEPTANCE-2026-01 · revision 4</span></div></div>
        <div class="assessment-bar"><div><span>Responses verified</span><strong>26 / 30</strong></div><div class="progress-line"><span style="width:87%"></span></div></div>
        <div class="hold-list"><div><span class="hold-icon danger"><Icon name="warning" :size="15" /></span><span><strong>UBO verification evidence expired</strong><small>Blocks commencement until a current registry extract is verified.</small></span><StatusPill label="Blocking" tone="danger" /></div><div><span class="hold-icon warn"><Icon name="warning" :size="15" /></span><span><strong>Accounting system changed</strong><small>Update the data-risk assessment and pin the new source bridge.</small></span><StatusPill label="Specialist" tone="warn" /></div></div>
        <div class="card-footer"><span>Partner decision remains human-owned</span><button type="button" class="button secondary" @click="openEngagement">Open engagement <Icon name="arrow-right" :size="16" /></button></div>
      </article>
      <article class="panel selected-client" v-if="selected">
        <div class="panel-heading"><div><span class="eyebrow">Client profile</span><h2>{{ selected.name }}</h2></div><button type="button" class="icon-button" aria-label="Close client profile" title="Close client profile" @click="selected = null"><Icon name="x" :size="17" /></button></div>
        <dl class="detail-list"><div><dt>Relationship ID</dt><dd>{{ selected.id }}</dd></div><div><dt>Route</dt><dd>{{ selected.service }}</dd></div><div><dt>Engagement owner</dt><dd>{{ selected.owner }}</dd></div><div><dt>Next review</dt><dd>{{ selected.next }}</dd></div><div><dt>Evidence policy</dt><dd>Preserved snapshots + scoped portal access</dd></div></dl>
        <div class="card-footer"><button type="button" class="button primary" @click="openEngagement">Open workspace <Icon name="arrow-right" :size="16" /></button></div>
      </article>
      <article class="panel empty-side" v-else><Icon name="users" :size="31" /><h3>Select a client to inspect the relationship</h3><p>Client facts, decisions, evidence and permissions remain scoped to the selected professional relationship.</p></article>
    </section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Acceptance boundary</strong> A customer record, quotation, deposit or portal login never implies professional acceptance. The partner decision is stored separately.</span></div>
  </div>
</template>
