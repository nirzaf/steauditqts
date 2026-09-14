<script setup>
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
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

    <div class="portal-kpi-grid accountant-kpis"><article class="portal-kpi"><span class="portal-kpi-icon tone-blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span><small>Client context</small><strong>Ready</strong><em>Read-only facts</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-amber"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span><span><small>PBC requests</small><strong>2 / 4</strong><em>Accepted or in review</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg></span><span><small>Trial balance</small><strong>TB v03</strong><em>QAR 1.825m balanced</em></span></article><article class="portal-kpi"><span class="portal-kpi-icon tone-navy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg></span><span><small>Audit handoff</small><strong>2 risks</strong><em>Need follow-up</em></span></article></div>

    <div class="accountant-work-grid"><section class="panel portal-work-panel"><div class="panel-heading"><div><span class="eyebrow">Continue the process</span><h2>Your work tracks</h2></div></div><div class="work-track-list"><button type="button" class="work-track" @click="navigate('accountant-client')"><span class="track-icon tone-blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span><strong>View client details</strong><small>Confirm entity, contact, period, and service scope.</small></span><StatusPill label="Read only" tone="good" /><span aria-hidden="true">→</span></button><button type="button" class="work-track" @click="navigate('pbc')"><span class="track-icon tone-amber"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 14h4l1.5 2h5L16 14h4"/></svg></span><span><strong>PBC portal</strong><small>Review accepted files and clarify evidence gaps.</small></span><StatusPill label="2 open" tone="warn" /><span aria-hidden="true">→</span></button><button type="button" class="work-track" @click="navigate('accounting')"><span class="track-icon tone-green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h1M12 11h1M15 11h1M9 15h1M12 15h1M15 15h1"/></svg></span><span><strong>Accounting &amp; TB</strong><small>Validate rows, mappings, journals, and statements.</small></span><StatusPill label="Balanced" tone="good" /><span aria-hidden="true">→</span></button><button type="button" class="work-track" @click="navigate('audit')"><span class="track-icon tone-navy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v17H7z"/><path d="M9 4V3h6v1M10 9h4M10 13h4M10 17h3"/></svg></span><span><strong>Audit &amp; fieldwork</strong><small>See linked risks and prepare the accounting handoff.</small></span><StatusPill label="2 follow-ups" tone="warn" /><span aria-hidden="true">→</span></button></div></section>
      <aside class="panel accountant-boundary-panel"><div class="panel-heading"><div><span class="eyebrow">Permission boundary</span><h2>What you can do</h2></div></div><ul class="permission-list"><li class="allowed"><span>✓</span><div><strong>View client details</strong><small>Read the current submitted profile.</small></div></li><li class="allowed"><span>✓</span><div><strong>Prepare accounting work</strong><small>Review PBC, TB, mappings, and journals.</small></div></li><li class="allowed"><span>✓</span><div><strong>Continue audit fieldwork</strong><small>See risks, populations, and workpapers.</small></div></li><li class="restricted"><span>×</span><div><strong>Accept, approve, or release</strong><small>Escalate these decisions to the authorized role.</small></div></li></ul><div class="portal-boundary-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5v.5"/></svg><span>Professional authority follows the named owner, not the screen a user can open.</span></div></aside></div>
  </div>
</template>

