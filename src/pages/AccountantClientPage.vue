<script setup>
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { DEMO_ENGAGEMENT_ID, loadClientProfile } from '../api'
import { client, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const profile = reactive({ legalName: client.name, registration: client.registration, contactName: 'Nadia Faris', contactEmail: 'nadia@northstar.demo', phone: '+974 4412 0900', servicePeriod: client.period, serviceRequested: client.services.join(' + '), context: 'No changes to ownership or finance systems since the last submission.', updatedAt: '' })
const loading = ref(true)
const source = ref('d1')
const syncState = ref('SYNCED')

function navigate(route) { emit('navigate', route) }
function applyProfile(value) { if (value) Object.assign(profile, value) }

onMounted(async () => {
  try {
    const result = await loadClientProfile(DEMO_ENGAGEMENT_ID)
    source.value = result.source
    syncState.value = result.syncState || 'LOCAL_ONLY'
    applyProfile(result.profile)
  } catch {
    source.value = 'local'
    syncState.value = 'LOCAL_ONLY'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page accountant-client-page accountant-surface">
    <PageHeader eyebrow="Accountant portal · client context" title="View client details" description="Use this read-only context panel before preparing evidence or updating the accounting package." />
    <WorkflowGuide :guide="workflowGuides['accountant-client']" />

    <section class="panel read-only-banner"><span class="read-only-icon"><Icon name="lock" :size="20" /></span><div><span class="eyebrow">Accountant access</span><h2>Read-only client facts</h2><p>{{ source === 'd1' ? 'Showing the latest profile submitted for this engagement.' : syncState === 'LOCAL_ONLY_FALLBACK' ? 'Showing a saved draft while the connection is unavailable. Reopen this page once it is restored to view the submitted details.' : 'Showing the current workspace view.' }}</p></div><StatusPill label="Cannot edit here" tone="neutral" /></section>

    <div class="read-only-grid"><section class="panel client-facts-panel"><div class="panel-heading"><div><span class="eyebrow">Submitted profile</span><h2>{{ profile.legalName }}</h2></div><code>{{ DEMO_ENGAGEMENT_ID }}</code></div><dl class="facts-list"><div><dt>Registration / CR</dt><dd>{{ profile.registration }}</dd></div><div><dt>Reporting period</dt><dd>{{ profile.servicePeriod }}</dd></div><div><dt>Requested service</dt><dd>{{ profile.serviceRequested }}</dd></div><div><dt>Primary contact</dt><dd>{{ profile.contactName }} · {{ profile.contactEmail }}</dd></div><div><dt>Phone</dt><dd>{{ profile.phone }}</dd></div><div><dt>Client context</dt><dd>{{ profile.context }}</dd></div></dl><p v-if="loading" class="loading-note">Refreshing the latest client submission…</p></section>
      <aside class="panel continue-panel"><div class="panel-heading"><div><span class="eyebrow">Continue</span><h2>Open the next track</h2></div></div><button type="button" class="continue-row" @click="navigate('pbc')"><span class="track-icon tone-amber"><Icon name="inbox" :size="17" /></span><span><strong>PBC portal</strong><small>Evidence intake and clarification</small></span><Icon name="arrow-right" :size="16" /></button><button type="button" class="continue-row" @click="navigate('accounting')"><span class="track-icon tone-green"><Icon name="calculator" :size="17" /></span><span><strong>Accounting &amp; TB</strong><small>Validation, mappings, journals, and statements</small></span><Icon name="arrow-right" :size="16" /></button><button type="button" class="continue-row" @click="navigate('audit')"><span class="track-icon tone-navy"><Icon name="clipboard" :size="17" /></span><span><strong>Audit &amp; fieldwork</strong><small>Linked risks and accounting handoff</small></span><Icon name="arrow-right" :size="16" /></button><div class="portal-boundary-note"><Icon name="shield" :size="17" /><span>If a fact is wrong, raise it through the client portal thread or an authorized review point.</span></div></aside></div>
  </div>
</template>
