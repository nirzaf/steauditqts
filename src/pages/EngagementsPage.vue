<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import { client, gateMeta, gateStatuses, timeline } from '../data'

const emit = defineEmits(['navigate'])
const activeTab = ref('Summary')
const tabs = ['Summary', 'Timeline', 'Team & scope']
const selectedGate = ref(4)
const statusLabels = { good: 'Satisfied', warn: 'In review', danger: 'Blocked', neutral: 'Planned' }

const readyCount = computed(() => gateStatuses.filter((status) => status === 'good').length)
const selectedGateInfo = computed(() => gateMeta[selectedGate.value])
function navigate(route) { emit('navigate', route) }
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Engagement workspace · ENG-2026-0018" title="Northstar Trading W.L.L." description="Recurring financial-statement audit with a separately scoped accounting-package handoff. Planning and PBC work can continue in parallel." action-label="Open client portal" @action="navigate('pbc')" />

    <section class="engagement-hero panel">
      <div class="engagement-identity"><div class="large-avatar">NT</div><div><div class="title-line"><h2>Year ended 31 Dec 2026</h2><StatusPill label="Fieldwork in progress" tone="warn" /></div><p>Financial-statement audit · QAR · Qatar · Medium client risk</p><div class="tag-row"><span class="tag">Independent auditor route</span><span class="tag">EQR required</span><span class="tag">SharePoint repository ready</span></div></div></div>
      <div class="engagement-kpis"><div><span>Gates ready</span><strong>{{ readyCount }} / 10</strong><small>G4 and G5 in review</small></div><div><span>Budget used</span><strong>68%</strong><small>QAR 94,600 of QAR 139,000</small></div><div><span>Next deadline</span><strong>15 Sep</strong><small>AR conclusion + AJ-002</small></div></div>
    </section>

    <nav class="sub-tabs" aria-label="Engagement views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Summary'">
      <section class="engagement-layout">
        <article class="panel gate-map-panel">
          <div class="panel-heading"><div><span class="eyebrow">Operational gates</span><h2>Where the engagement stands</h2></div><span class="muted-label">Click a gate for its owner and next action</span></div>
          <div class="gate-map">
            <button v-for="(gate, index) in gateMeta.slice(0, 10)" :key="gate.id" type="button" class="gate-map-item" :class="[`gate-${gateStatuses[index]}`, { selected: selectedGate === index }]" @click="selectedGate = index"><span class="gate-node">{{ gateStatuses[index] === 'good' ? '✓' : gateStatuses[index] === 'warn' ? '!' : gateStatuses[index] === 'danger' ? '×' : '•' }}</span><span><strong>{{ gate.id }} · {{ gate.title }}</strong><small>{{ gate.detail }}</small></span></button>
          </div>
          <div class="selected-gate"><div><span class="eyebrow">Selected gate</span><h3>{{ selectedGateInfo.id }} · {{ selectedGateInfo.title }}</h3><p>{{ selectedGateInfo.detail }}</p></div><StatusPill :label="statusLabels[gateStatuses[selectedGate]]" :tone="gateStatuses[selectedGate] === 'good' ? 'good' : gateStatuses[selectedGate] === 'warn' ? 'warn' : gateStatuses[selectedGate] === 'danger' ? 'danger' : 'neutral'" /></div>
        </article>

        <aside class="panel track-panel"><div class="panel-heading"><div><span class="eyebrow">Service routing</span><h2>Two accountable tracks</h2></div></div><div class="track-card accounting-track"><div class="track-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h3"/></svg></div><div><strong>Accounting package</strong><small>Leila Noor · management owns decisions</small><span>TB v03 validated · FS v05 in review</span></div><button type="button" class="text-button" @click="navigate('accounting')">Open <span aria-hidden="true">→</span></button></div><div class="track-card audit-track"><div class="track-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></div><div><strong>Audit file</strong><small>Omar Aziz · partner Maya Rahman</small><span>Plan approved · AR-019 follow-up open</span></div><button type="button" class="text-button" @click="navigate('audit')">Open <span aria-hidden="true">→</span></button></div><div class="handoff-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg><span><strong>Controlled handoff</strong> The accounting package is a versioned input to audit; it is not the auditor’s ledger.</span></div></aside>
      </section>
      <section class="split-grid">
        <article class="panel"><div class="panel-heading"><div><span class="eyebrow">People and authority</span><h2>Assigned team</h2></div><button type="button" class="text-button">Manage access <span aria-hidden="true">→</span></button></div><div class="team-list"><div v-for="member in client.team" :key="member.name" class="team-row"><span class="avatar" :class="`avatar-${member.color}`">{{ member.initials }}</span><span><strong>{{ member.name }}</strong><small>{{ member.role }}</small></span><StatusPill :label="member.role === 'Engagement partner' ? 'Decision owner' : 'Assigned'" :tone="member.role === 'Engagement partner' ? 'warn' : 'neutral'" /></div></div></article>
        <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Dates and commitments</span><h2>Milestone calendar</h2></div><button type="button" class="text-button" @click="navigate('reviews')">Review queue <span aria-hidden="true">→</span></button></div><div class="mini-calendar"><div class="calendar-item"><span class="calendar-date">15<span>SEP</span></span><span><strong>AR conclusion and AJ-002 response</strong><small>Partner decision · blocks G6</small></span><StatusPill label="Due soon" tone="danger" /></div><div class="calendar-item"><span class="calendar-date">18<span>SEP</span></span><span><strong>Management representation draft</strong><small>Client portal request</small></span><StatusPill label="Planned" tone="neutral" /></div><div class="calendar-item"><span class="calendar-date">25<span>SEP</span></span><span><strong>Target report date</strong><small>EQR must complete first</small></span><StatusPill label="Target" tone="good" /></div></div></article>
      </section>
    </template>

    <template v-else-if="activeTab === 'Timeline'">
      <section class="panel timeline-full"><div class="panel-heading"><div><span class="eyebrow">Immutable activity ledger</span><h2>Engagement timeline</h2></div><StatusPill label="Version history preserved" tone="good" /></div><div class="timeline-list detailed"> <div v-for="event in timeline" :key="event.title" class="timeline-item"><span class="timeline-dot" :class="`tone-${event.tone}`"></span><div><div class="timeline-title"><strong>{{ event.title }}</strong><span>{{ event.date }} 2026</span></div><p>{{ event.detail }}</p><small>Actor recorded · Northstar Trading · revision-bound event</small></div></div></div></section>
    </template>

    <template v-else>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Scope boundary</span><h2>What this engagement includes</h2></div></div><ul class="check-list"><li><span class="list-icon good">✓</span><span><strong>Statutory financial-statement audit</strong><small>Opinion and governance communication gate</small></span></li><li><span class="list-icon good">✓</span><span><strong>Accounting-package review</strong><small>Versioned TB, mappings, adjustments and notes</small></span></li><li><span class="list-icon good">✓</span><span><strong>SharePoint evidence repository</strong><small>Frappe stores references, versions and approvals</small></span></li><li><span class="list-icon warn">!</span><span><strong>Client bookkeeping</strong><small>Excluded — no journals post to the firm’s own ledger</small></span></li></ul></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Permission boundary</span><h2>Access checks</h2></div><StatusPill label="Scoped" tone="good" /></div><div class="permission-grid"><div><strong>Firm staff</strong><span>Desk access based on team role</span></div><div><strong>Northstar contacts</strong><span>Portal-only assigned requests</span></div><div><strong>SharePoint worker</strong><span>Selected repository grant</span></div><div><strong>Other clients</strong><span>Denied by client_id + engagement_id</span></div></div></article></section>
    </template>
  </div>
</template>
