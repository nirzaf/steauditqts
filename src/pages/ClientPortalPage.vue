<script setup>
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { client, pbcRequests, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const openRequests = computed(() => pbcRequests.filter((request) => request.status !== 'Accepted'))

function navigate(route) {
  emit('navigate', route)
}
</script>

<template>
  <div class="page client-portal-page">
    <PageHeader eyebrow="Client portal" title="Welcome back, Nadia" description="One clear place to submit Northstar Trading details, respond to requests, and keep every question with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-home']" />

    <section class="portal-banner panel">
      <span class="portal-avatar avatar avatar-blue">NF</span>
      <div><span class="eyebrow">Your engagement</span><h2>{{ client.name }}</h2><p>{{ client.period }} · {{ client.services[0] }}</p></div>
      <StatusPill label="Portal connected" tone="good" />
      <span class="portal-banner-note">Last team reply <strong>13 Sep 2026 · 15:20</strong></span>
    </section>

    <div class="portal-kpi-grid">
      <article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg></span><span><small>Details</small><strong>Submitted</strong><em>Reviewed 13 Sep</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span><span><small>Open requests</small><strong>{{ openRequests.length }}</strong><em>Need your attention</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v12H5z"/><path d="m7 8 5 4 5-4"/></svg></span><span><small>Messages</small><strong>2</strong><em>Team replies visible</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M5 9h14M5 15h14"/></svg></span><span><small>Next due</small><strong>Today</strong><em>Receivables evidence</em></span></article>
    </div>

    <div class="portal-content-grid">
      <section class="panel portal-request-panel">
        <div class="panel-heading"><div><span class="eyebrow">Action needed</span><h2>Requests from the team</h2></div><button type="button" class="text-button" @click="navigate('client-communications')">Ask a question <span aria-hidden="true">→</span></button></div>
        <div class="portal-request-list">
          <button v-for="request in openRequests" :key="request.id" type="button" class="portal-request-row" @click="navigate('client-communications')">
            <span class="portal-request-status" :class="`tone-${request.tone}`"></span><span><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · Owner {{ request.owner }}</small></span><span class="portal-request-due">{{ request.due }}<StatusPill :label="request.status" :tone="request.tone" /></span><span class="portal-row-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <div class="portal-panel-footer"><span>Accepted requests stay visible for your record.</span><button type="button" class="button secondary" @click="navigate('client-details')">Review my details</button></div>
      </section>

      <section class="panel portal-next-panel">
        <div class="panel-heading"><div><span class="eyebrow">Your shortcuts</span><h2>Continue in the portal</h2></div></div>
        <div class="portal-shortcuts">
          <button type="button" class="portal-shortcut" @click="navigate('client-details')"><span class="shortcut-icon tone-blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span><strong>Client details</strong><small>Submit or confirm entity facts</small></span><span aria-hidden="true">→</span></button>
          <button type="button" class="portal-shortcut" @click="navigate('client-communications')"><span class="shortcut-icon tone-green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 12h5"/></svg></span><span><strong>Communications</strong><small>Ask, clarify, and confirm next steps</small></span><span aria-hidden="true">→</span></button>
          <div class="portal-boundary-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5v.5"/></svg><span><strong>What stays private</strong> Internal risk notes, review points, and approvals remain with the engagement team.</span></div>
        </div>
      </section>
    </div>
  </div>
</template>

