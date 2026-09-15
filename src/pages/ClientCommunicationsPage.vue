<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import LocalFixtureNotice from '../components/LocalFixtureNotice.vue'
import { client, workflowGuides } from '../data'
import { activeActor, recordClientInformationResponse, scenario, selectedClient, selectedEngagement } from '../domain/scenario.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'

const emit = defineEmits(['navigate'])
const topics = [
  { label: 'Request clarification', detail: 'Ask what a file or balance should include.', tone: 'blue' },
  { label: 'Explain an exception', detail: 'Give context when a requested item is not available.', tone: 'amber' },
  { label: 'Confirm a handoff', detail: 'Agree the owner and due date for the next action.', tone: 'green' },
]
const scopedClient = computed(() => selectedClient() || client)
const messagePolicy = computed(() => `Messages are attached to ${scopedClient.value.name} · ${selectedEngagement()?.periodLabel || scopedClient.value.period}.`)
const informationRequests = computed(() => (scenario.informationRequests || []).filter((item) => item.engagementId === selectedEngagement()?.id))
const selectedInformationRequest = computed(() => informationRequests.value[0] || null)
const responseBody = ref('')
const responseStatus = ref('')
const responding = ref(false)

function navigate(route) {
  emit('navigate', route)
}

function submitInformationResponse() {
  if (sharedDemoEnabled) {
    responseStatus.value = 'Local communication fixtures are read-only in shared mode; use the shared command surface.'
    return
  }
  const request = selectedInformationRequest.value
  const actor = activeActor()
  if (!request || responding.value) return
  responding.value = true
  const result = recordClientInformationResponse({ informationRequestId: request.id, actorPersonaId: actor?.personaId, expectedRevision: request.revision, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `mir-response-${request.id}-${request.revision}`, response: responseBody.value, decision: 'RESPONDED' })
  responseStatus.value = result.outcome === 'COMMITTED' ? `Response ${request.id} recorded against revision ${result.revision}. The assigned senior can now evaluate it.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') responseBody.value = ''
  responding.value = false
}
</script>

<template>
  <div class="page client-communications-page">
    <PageHeader eyebrow="Client portal · communication" title="Portal communications" description="Keep questions, clarifications, and delivery updates in one shared thread with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-communications']" />
    <LocalFixtureNotice v-if="sharedDemoEnabled"
      title="Local communications are read-only"
      description="The shared workflow owns client responses and handoffs in shared mode. This browser-local thread is available for inspection only." />

    <section class="panel portal-thread-banner"><span class="thread-icon"><Icon name="message" :size="20" /></span><div><span class="eyebrow">Shared portal thread</span><h2>{{ scopedClient.name }} · Engagement team</h2><p>{{ messagePolicy }} Use the response composer below for the next message.</p></div><span class="thread-policy"><strong>Portal only</strong><small>No email side-channel in this prototype</small></span></section>

    <section class="panel information-response-panel"><div class="panel-heading"><div><span class="eyebrow">MIR · exact response record</span><h2>{{ selectedInformationRequest?.title || 'No information request in scope' }}</h2></div><StatusPill :label="selectedInformationRequest?.state || 'NOT_AVAILABLE'" :tone="selectedInformationRequest?.state === 'RESPONDED' ? 'good' : 'warn'" /></div><p class="panel-copy">Respond to the Management Information Request separately from the Draft FS decision. The response is versioned, assigned to this engagement, and never marks the financial statements approved by itself.</p><form v-if="selectedInformationRequest" class="portal-form" @submit.prevent="submitInformationResponse"><label>Response for {{ selectedInformationRequest.id }}<textarea v-model="responseBody" rows="4" maxlength="1600" placeholder="Explain the balance, attach the evidence reference, or state why the item is unavailable." required></textarea></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Use a concise explanation and reference the exact reporting period.</span><button type="submit" class="button primary" :disabled="responding || !responseBody.trim()">{{ responding ? 'Saving…' : 'Submit information response' }}<Icon name="arrow-right" :size="17" /></button></div></form><p v-if="responseStatus" class="portal-status" role="status" aria-live="polite">{{ responseStatus }}</p><div v-if="selectedInformationRequest?.response" class="request-note"><span class="eyebrow">Latest recorded response</span><p>{{ selectedInformationRequest.response.body }} · {{ selectedInformationRequest.response.decision }}</p></div></section>

    <div class="portal-communication-grid">
      <section class="panel communication-topics"><div class="panel-heading"><div><span class="eyebrow">Good messages include</span><h2>Choose a clear topic</h2></div></div><div class="topic-list"><div v-for="topic in topics" :key="topic.label" class="topic-row"><span class="topic-icon" :class="`tone-${topic.tone}`"><Icon :name="topic.tone === 'amber' ? 'warning' : topic.tone === 'green' ? 'check-circle' : 'info'" :size="17" /></span><span><strong>{{ topic.label }}</strong><small>{{ topic.detail }}</small></span></div></div></section>
      <section class="panel communication-next"><div class="panel-heading"><div><span class="eyebrow">After the reply</span><h2>Keep the handoff visible</h2></div></div><ol class="communication-steps"><li><span>1</span><div><strong>Read the team response</strong><small>Check which request or period it addresses.</small></div></li><li><span>2</span><div><strong>Confirm the action</strong><small>Reply with the owner, file, or date you agree to.</small></div></li><li><span>3</span><div><strong>Return to overview</strong><small>See whether another request still needs your attention.</small></div></li></ol><button type="button" class="button secondary full-width" @click="navigate('client-home')">Back to portal overview <Icon name="arrow-right" :size="16" /></button></section>
    </div>
  </div>
</template>
