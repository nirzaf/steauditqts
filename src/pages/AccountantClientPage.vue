<script setup>
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { DEMO_ENGAGEMENT_ID, loadClientProfile } from '../api'
import { client, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const profile = reactive({ legalName: client.name, registration: client.registration, contactName: 'Nadia Faris', contactEmail: 'nadia@northstar.demo', phone: '+974 4412 0900', servicePeriod: client.period, serviceRequested: client.services.join(' + '), context: 'No changes to ownership or finance systems since the last submission.', updatedAt: '' })
const loading = ref(true)
const source = ref('d1')

function navigate(route) { emit('navigate', route) }
function applyProfile(value) { if (value) Object.assign(profile, value) }

onMounted(async () => {
  const result = await loadClientProfile(DEMO_ENGAGEMENT_ID)
  source.value = result.source
  applyProfile(result.profile)
  loading.value = false
})
</script>

<template>
  <div class="page accountant-client-page">
    <PageHeader eyebrow="Accountant portal · client context" title="View client details" description="Use this read-only context panel before preparing evidence or updating the accounting package." />
    <WorkflowGuide :guide="workflowGuides['accountant-client']" />

    <section class="panel read-only-banner"><span class="read-only-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10h12v11H6z"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg></span><div><span class="eyebrow">Accountant access</span><h2>Read-only client facts</h2><p>{{ source === 'd1' ? 'Showing the latest profile submitted through the client portal.' : 'Showing the local demo copy while the API is offline.' }}</p></div><StatusPill label="Cannot edit here" tone="neutral" /></section>

    <div class="read-only-grid"><section class="panel client-facts-panel"><div class="panel-heading"><div><span class="eyebrow">Submitted profile</span><h2>{{ profile.legalName }}</h2></div><code>{{ DEMO_ENGAGEMENT_ID }}</code></div><dl class="facts-list"><div><dt>Registration / CR</dt><dd>{{ profile.registration }}</dd></div><div><dt>Reporting period</dt><dd>{{ profile.servicePeriod }}</dd></div><div><dt>Requested service</dt><dd>{{ profile.serviceRequested }}</dd></div><div><dt>Primary contact</dt><dd>{{ profile.contactName }} · {{ profile.contactEmail }}</dd></div><div><dt>Phone</dt><dd>{{ profile.phone }}</dd></div><div><dt>Client context</dt><dd>{{ profile.context }}</dd></div></dl><p v-if="loading" class="loading-note">Refreshing the latest client submission…</p></section>
      <aside class="panel continue-panel"><div class="panel-heading"><div><span class="eyebrow">Continue</span><h2>Open the next track</h2></div></div><button type="button" class="continue-row" @click="navigate('pbc')"><span class="track-icon tone-amber"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 14h4l1.5 2h5L16 14h4"/></svg></span><span><strong>PBC portal</strong><small>Evidence intake and clarification</small></span><span aria-hidden="true">→</span></button><button type="button" class="continue-row" @click="navigate('accounting')"><span class="track-icon tone-green"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h1M12 11h1M15 11h1M9 15h1M12 15h1M15 15h1"/></svg></span><span><strong>Accounting &amp; TB</strong><small>Validation, mappings, journals, and statements</small></span><span aria-hidden="true">→</span></button><button type="button" class="continue-row" @click="navigate('audit')"><span class="track-icon tone-navy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v17H7z"/><path d="M10 9h4M10 13h4M10 17h3"/></svg></span><span><strong>Audit &amp; fieldwork</strong><small>Linked risks and accounting handoff</small></span><span aria-hidden="true">→</span></button><div class="portal-boundary-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5v.5"/></svg><span>If a fact is wrong, raise it through the client portal thread or an authorized review point.</span></div></aside></div>
  </div>
</template>

