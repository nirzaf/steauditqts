<script setup>
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
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
      <article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><Icon name="file" :size="17" /></span><span><small>Details</small><strong>Submitted</strong><em>Reviewed 13 Sep</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><small>Open requests</small><strong>{{ openRequests.length }}</strong><em>Need your attention</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-green"><Icon name="message" :size="17" /></span><span><small>Messages</small><strong>2</strong><em>Team replies visible</em></span></article>
      <article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><Icon name="calendar" :size="17" /></span><span><small>Next due</small><strong>Today</strong><em>Receivables evidence</em></span></article>
    </div>

    <div class="portal-content-grid">
      <section class="panel portal-request-panel">
        <div class="panel-heading"><div><span class="eyebrow">Action needed</span><h2>Requests from the team</h2></div><button type="button" class="text-button" @click="navigate('client-communications')">Ask a question <Icon name="arrow-right" :size="15" /></button></div>
        <div class="portal-request-list">
          <button v-for="request in openRequests" :key="request.id" type="button" class="portal-request-row" @click="navigate('client-communications')">
            <span class="portal-request-status" :class="`tone-${request.tone}`"></span><span><strong>{{ request.title }}</strong><small>{{ request.id }} · {{ request.area }} · Owner {{ request.owner }}</small></span><span class="portal-request-due">{{ request.due }}<StatusPill :label="request.status" :tone="request.tone" /></span><Icon class="portal-row-arrow" name="arrow-right" :size="16" />
          </button>
        </div>
        <div class="portal-panel-footer"><span>Accepted requests stay visible for your record.</span><button type="button" class="button secondary" @click="navigate('client-details')">Review my details</button></div>
      </section>

      <section class="panel portal-next-panel">
        <div class="panel-heading"><div><span class="eyebrow">Your shortcuts</span><h2>Continue in the portal</h2></div></div>
        <div class="portal-shortcuts">
          <button type="button" class="portal-shortcut" @click="navigate('client-details')"><span class="shortcut-icon tone-blue"><Icon name="user" :size="17" /></span><span><strong>Client details</strong><small>Submit or confirm entity facts</small></span><Icon name="arrow-right" :size="16" /></button>
          <button type="button" class="portal-shortcut" @click="navigate('client-communications')"><span class="shortcut-icon tone-green"><Icon name="message" :size="17" /></span><span><strong>Communications</strong><small>Ask, clarify, and confirm next steps</small></span><Icon name="arrow-right" :size="16" /></button>
          <button type="button" class="portal-shortcut" @click="navigate('client-architecture')"><span class="shortcut-icon tone-navy"><Icon name="workflow" :size="17" /></span><span><strong>How the platform works</strong><small>See where your facts, files, and questions go</small></span><Icon name="arrow-right" :size="16" /></button>
          <div class="portal-boundary-note"><Icon name="shield" :size="17" /><span><strong>What stays private</strong> Internal risk notes, review points, and approvals remain with the engagement team.</span></div>
        </div>
      </section>
    </div>
  </div>
</template>
