<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { DEMO_ENGAGEMENT_ID, loadClientProfile, saveClientProfile } from '../api'
import { client, workflowGuides } from '../data'
import { activeDemoSession, getActiveDemoView } from '../sharedDemo.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'

const form = reactive({
  engagementId: DEMO_ENGAGEMENT_ID,
  legalName: client.name,
  registration: client.registration,
  contactName: 'Nadia Faris',
  contactEmail: 'nadia@northstar.demo',
  phone: '+974 4412 0900',
  servicePeriod: client.period,
  serviceRequested: client.services.join(' + '),
  context: 'No changes to ownership or finance systems since the last submission.',
  submittedBy: 'Nadia Faris',
})
const loading = ref(true)
const saving = ref(false)
const source = ref('d1')
const syncState = ref('SYNCED')
const statusMessage = ref('')
const scopedView = ref(getActiveDemoView())
const activeEngagementId = computed(() => scopedView.value?.engagementId || DEMO_ENGAGEMENT_ID)
const invitationSession = computed(() => Boolean(activeDemoSession.value?.invitationId))
const canSubmit = computed(() => !sharedDemoEnabled || invitationSession.value)

function applyProfile(profile) {
  if (!profile) return
  Object.assign(form, profile)
}

async function loadProfile() {
  loading.value = true
  scopedView.value = getActiveDemoView() || scopedView.value
  form.engagementId = activeEngagementId.value
  try {
    const result = await loadClientProfile(activeEngagementId.value)
    source.value = result.source
    syncState.value = result.syncState || 'LOCAL_ONLY'
    applyProfile(result.profile)
    if (result.error) statusMessage.value = `${result.error.code}: ${result.error.message}`
  } catch (error) {
    source.value = 'local'
    syncState.value = 'LOCAL_ONLY'
    statusMessage.value = `${error?.code || 'PROFILE_UNAVAILABLE'}: ${error?.message || 'The client profile could not be loaded.'}`
  } finally {
    loading.value = false
  }
}

async function submitDetails() {
  if (saving.value || !canSubmit.value) return
  form.engagementId = activeEngagementId.value
  saving.value = true
  statusMessage.value = ''
  const result = await saveClientProfile({ ...form, submittedBy: form.contactName || 'Client contact' })
  source.value = result.source
  syncState.value = result.syncState || 'LOCAL_ONLY'
  if (result.profile) applyProfile(result.profile)
  statusMessage.value = result.outcome === 'COMMITTED'
    ? 'Client details submitted to the engagement record.'
    : result.outcome === 'SAVED_LOCAL_DRAFT'
      ? 'Details saved as SAVED_LOCAL_DRAFT. They are not synchronized or queued for replay.'
      : `${result.error?.code || 'SAVE_FAILED'}: ${result.error?.message || 'The details were not saved.'}`
  saving.value = false
}

onMounted(loadProfile)
</script>

<template>
  <div class="page client-details-page">
    <PageHeader eyebrow="Client portal · details" title="Client details" description="Submit the facts the engagement team needs to scope requests. You can return here when something changes." />
    <WorkflowGuide :guide="workflowGuides['client-details']" />

    <div class="portal-form-layout">
      <section class="panel portal-form-panel">
        <div class="panel-heading"><div><span class="eyebrow">Submission form</span><h2>Northstar Trading profile</h2></div><span class="portal-form-source" :class="{ local: source !== 'd1' }">{{ source === 'd1' ? 'Engagement record' : syncState === 'LOCAL_ONLY_FALLBACK' ? 'Saved draft' : 'Current workspace view' }}</span></div>
        <form class="portal-form" @submit.prevent="submitDetails">
          <div class="form-section-heading"><span><Icon name="building" :size="16" />Registered entity</span><small>Required for matching the engagement record</small></div>
          <div class="form-field-grid"><label>Legal name<input v-model="form.legalName" required maxlength="160" /></label><label>Registration / CR number<input v-model="form.registration" required maxlength="80" /></label></div>
          <div class="form-section-heading"><span><Icon name="user" :size="16" />Primary contact</span><small>Who can answer follow-up questions?</small></div>
          <div class="form-field-grid"><label>Contact name<input v-model="form.contactName" required maxlength="80" autocomplete="name" /></label><label>Email<input v-model="form.contactEmail" required type="email" maxlength="160" autocomplete="email" /></label><label>Phone<input v-model="form.phone" required maxlength="40" autocomplete="tel" /></label></div>
          <div class="form-section-heading"><span><Icon name="briefcase" :size="16" />Service context</span><small>Confirm the period and service route</small></div>
          <div class="form-field-grid"><label>Reporting period<input v-model="form.servicePeriod" required maxlength="120" /></label><label>Requested service<input v-model="form.serviceRequested" required maxlength="160" /></label></div>
          <label>What changed or needs context?<textarea v-model="form.context" maxlength="1200" rows="4" placeholder="Ownership, systems, locations, timing, or other context"></textarea></label>
          <div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Never enter passwords, access tokens, or banking credentials.</span><button type="submit" class="button primary" :disabled="saving || loading || !canSubmit">{{ saving ? 'Submitting…' : 'Submit client details' }}<Icon name="arrow-right" :size="17" /></button></div>
          <p v-if="sharedDemoEnabled && !invitationSession" class="portal-status neutral" role="status">This view is read-only. Open the client invitation to submit engagement details.</p>
          <p v-if="statusMessage" class="portal-status" role="status" aria-live="polite">{{ statusMessage }}</p>
        </form>
      </section>

      <aside class="panel portal-checklist-panel">
        <div class="panel-heading"><div><span class="eyebrow">Before submitting</span><h2>Quick checklist</h2></div></div>
        <ul class="portal-checklist"><li><span>1</span><div><strong>Match your records</strong><small>Legal name and CR number match the company registration.</small></div></li><li><span>2</span><div><strong>Use a monitored contact</strong><small>The contact can answer the team during the reporting period.</small></div></li><li><span>3</span><div><strong>Explain changes</strong><small>Include anything that changes the request scope or timing.</small></div></li></ul>
        <div class="portal-checklist-note"><strong>What happens next?</strong><p>The team reviews your submission, may ask a follow-up in Communications, and keeps the timestamp with the engagement record.</p></div>
      </aside>
    </div>
  </div>
</template>
