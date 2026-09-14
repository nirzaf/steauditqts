<script setup>
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])

function navigate(route) {
  emit('navigate', route)
}
</script>

<template>
  <div class="page accountant-page">
    <PageHeader eyebrow="Accountant portal" title="Good morning, Leila" description="Prepare the accounting package with the client context, evidence, and controlled handoffs you need—without crossing acceptance or approval boundaries." />
    <WorkflowGuide :guide="workflowGuides['accountant-home']" />

    <section class="portal-banner panel accountant-banner"><span class="portal-avatar avatar avatar-green">LN</span><div><span class="eyebrow">Assigned engagement</span><h2>{{ client.name }}</h2><p>{{ client.period }} · Accounting package handoff</p></div><StatusPill label="Preparation in progress" tone="warn" /><span class="portal-banner-note">Your scope <strong>View + prepare</strong></span></section>

    <div class="portal-kpi-grid accountant-kpis"><article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><Icon name="user" :size="17" /></span><span><small>Client context</small><strong>Ready</strong><em>Read-only facts</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><small>PBC requests</small><strong>2 / 4</strong><em>Accepted or in review</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-green"><Icon name="calculator" :size="17" /></span><span><small>Trial balance</small><strong>TB v03</strong><em>QAR 1.825m balanced</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><Icon name="clipboard" :size="17" /></span><span><small>Audit handoff</small><strong>2 risks</strong><em>Need follow-up</em></span></article></div>

    <div class="accountant-work-grid"><section class="panel portal-work-panel"><div class="panel-heading"><div><span class="eyebrow">Continue the process</span><h2>Your work tracks</h2></div></div><div class="work-track-list"><button type="button" class="work-track" @click="navigate('accountant-client')"><span class="track-icon tone-blue"><Icon name="user" :size="17" /></span><span><strong>View client details</strong><small>Confirm entity, contact, period, and service scope.</small></span><StatusPill label="Read only" tone="good" /><Icon name="arrow-right" :size="16" /></button><button type="button" class="work-track" @click="navigate('pbc')"><span class="track-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><strong>PBC portal</strong><small>Review accepted files and clarify evidence gaps.</small></span><StatusPill label="2 open" tone="warn" /><Icon name="arrow-right" :size="16" /></button><button type="button" class="work-track" @click="navigate('accounting')"><span class="track-icon tone-green"><Icon name="calculator" :size="17" /></span><span><strong>Accounting &amp; TB</strong><small>Validate rows, mappings, journals, and statements.</small></span><StatusPill label="Balanced" tone="good" /><Icon name="arrow-right" :size="16" /></button><button type="button" class="work-track" @click="navigate('audit')"><span class="track-icon tone-navy"><Icon name="clipboard" :size="17" /></span><span><strong>Audit &amp; fieldwork</strong><small>See linked risks and prepare the accounting handoff.</small></span><StatusPill label="2 follow-ups" tone="warn" /><Icon name="arrow-right" :size="16" /></button></div></section>
      <aside class="panel accountant-boundary-panel"><div class="panel-heading"><div><span class="eyebrow">Permission boundary</span><h2>What you can do</h2></div></div><ul class="permission-list"><li class="allowed"><Icon name="check-circle" :size="17" /><div><strong>View client details</strong><small>Read the current submitted profile.</small></div></li><li class="allowed"><Icon name="check-circle" :size="17" /><div><strong>Prepare accounting work</strong><small>Review PBC, TB, mappings, and journals.</small></div></li><li class="allowed"><Icon name="check-circle" :size="17" /><div><strong>Continue audit fieldwork</strong><small>See risks, populations, and workpapers.</small></div></li><li class="restricted"><Icon name="lock" :size="17" /><div><strong>Accept, approve, or release</strong><small>Escalate these decisions to the authorized role.</small></div></li></ul><div class="portal-boundary-note"><Icon name="shield" :size="17" /><span>Professional authority follows the named owner, not the screen a user can open.</span></div></aside></div>
  </div>
</template>
