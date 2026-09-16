<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import { client, workflowGuides } from '../data'
import { activeActor, recordClientInformationResponse, scenario, selectedClient, selectedEngagement } from '../domain/scenario.js'
import { activeDemoSession, getActiveDemoView, getPortalMessages, replyPortalMessage, sendPortalMessage } from '../sharedDemo.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { recordTargetFor } from '../navigation/recordTargets.js'

const emit = defineEmits(['navigate'])
const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const scopedView = ref(getActiveDemoView())
const messages = ref([])
const focusedMessageId = ref('')
const focusedInformationRequestId = ref('')
const targetNotice = ref('')
const messageBody = ref('')
const messageStatus = ref('')
const messageStatusTone = ref('neutral')
const sending = ref(false)
const replyTarget = ref(null)
const replyBody = ref('')
const responseBody = ref('')
const responseStatus = ref('')
const responding = ref(false)
const invitationSession = computed(() => activeDemoSession.value?.invitationId ? activeDemoSession.value : null)
const isSharedInvitation = computed(() => Boolean(sharedDemoEnabled && invitationSession.value))
const engagementId = computed(() => scopedView.value?.engagementId || selectedEngagement()?.id || '')
const scopedClient = computed(() => scopedView.value?.scope?.clientName ? { ...client, name: scopedView.value.scope.clientName } : (selectedClient() || client))
const messagePolicy = computed(() => `Messages are attached to ${scopedClient.value.name} · ${scopedView.value?.scope?.period || selectedEngagement()?.periodLabel || scopedClient.value.period}.`)
const informationRequests = computed(() => (scenario.informationRequests || []).filter((item) => item.engagementId === selectedEngagement()?.id))
const selectedInformationRequest = computed(() => informationRequests.value.find((item) => item.id === focusedInformationRequestId.value) || informationRequests.value[0] || null)
const canSend = computed(() => isSharedInvitation.value && Boolean(messageBody.value.trim()) && !sending.value)

function navigate(route) { emit('navigate', route) }

async function loadMessages() {
  if (!isSharedInvitation.value || !engagementId.value) return
  scopedView.value = getActiveDemoView() || scopedView.value
  const result = await getPortalMessages(engagementId.value)
  if (result.ok) messages.value = Array.isArray(result.messages) ? result.messages : []
  else { messageStatus.value = result.error?.message || 'The message thread could not be loaded.'; messageStatusTone.value = 'danger' }
}

watch([
  () => props.navigationTarget?.recordId,
  () => messages.value.map((item) => item.messageId).join('|'),
  () => informationRequests.value.map((item) => item.id).join('|'),
], async ([recordId]) => {
  const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
  if (!recordId || (target.targetType !== 'client-communications' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'client-communications'))) return
  const message = messages.value.find((item) => item.messageId === recordId)
  const informationRequest = informationRequests.value.find((item) => item.id === recordId)
  if (message) {
    focusedMessageId.value = message.messageId
    targetNotice.value = ''
    await nextTick()
    if (typeof document !== 'undefined') document.querySelector(`[data-record-id="${message.messageId}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  } else if (informationRequest) {
    focusedInformationRequestId.value = informationRequest.id
    focusedMessageId.value = ''
    targetNotice.value = ''
  } else targetNotice.value = `${recordId} is not in the selected communications scope.`
}, { immediate: true })

async function submitMessage() {
  if (!canSend.value) return
  sending.value = true; messageStatus.value = 'Sending to the engagement team…'; messageStatusTone.value = 'neutral'
  const result = await sendPortalMessage(engagementId.value, { body: messageBody.value.trim() })
  if (result.ok) { messageBody.value = ''; messageStatus.value = 'Message saved to the shared portal thread.'; messageStatusTone.value = 'good'; await loadMessages() }
  else { messageStatus.value = result.error?.message || 'The message was not saved. Retry.'; messageStatusTone.value = 'danger' }
  sending.value = false
}

function beginReply(message) { replyTarget.value = message; replyBody.value = ''; messageStatus.value = '' }
async function submitReply() {
  if (!replyTarget.value || !replyBody.value.trim() || sending.value) return
  sending.value = true; messageStatus.value = 'Sending reply…'; messageStatusTone.value = 'neutral'
  const result = await replyPortalMessage(replyTarget.value.messageId, { body: replyBody.value.trim() })
  if (result.ok) { replyTarget.value = null; replyBody.value = ''; messageStatus.value = 'Reply saved to the shared thread.'; messageStatusTone.value = 'good'; await loadMessages() }
  else { messageStatus.value = result.error?.message || 'The reply was not saved. Retry.'; messageStatusTone.value = 'danger' }
  sending.value = false
}

function submitInformationResponse() {
  if (sharedDemoEnabled) { responseStatus.value = isSharedInvitation.value ? 'Use the thread above for general questions; MIR response storage is enabled in the presenter workflow.' : 'Open an invitation link to submit client responses.'; return }
  const request = selectedInformationRequest.value; const actor = activeActor(); if (!request || responding.value) return
  responding.value = true
  const result = recordClientInformationResponse({ informationRequestId: request.id, actorPersonaId: actor?.personaId, expectedRevision: request.revision, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `mir-response-${request.id}-${request.revision}`, response: responseBody.value, decision: 'RESPONDED' })
  responseStatus.value = result.outcome === 'COMMITTED' ? `Response ${request.id} recorded against revision ${result.revision}.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') responseBody.value = ''; responding.value = false
}

onMounted(loadMessages)
</script>

<template>
  <div class="page client-communications-page client-surface">
    <PageHeader density="compact" eyebrow="Client portal · communication" title="Portal communications" description="Keep questions, clarifications, and delivery updates in one shared thread with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-communications']" />
    <div v-if="targetNotice" class="guide-status-message" role="status"><Icon name="warning" :size="16" />{{ targetNotice }}</div>
    <section class="panel portal-thread-banner"><span class="thread-icon"><Icon name="message" :size="20" /></span><div><span class="eyebrow">{{ isSharedInvitation ? 'Engagement portal thread' : 'Engagement portal' }}</span><h2>{{ scopedClient.name }} · Engagement team</h2><p>{{ messagePolicy }} General questions, evidence clarifications, and handoff confirmations stay together.</p></div><span class="thread-policy"><strong>One conversation</strong><small>Keep updates with the engagement team.</small></span></section>

    <section class="panel portal-thread-panel"><div class="panel-heading"><div><span class="eyebrow">Conversation</span><h2>Questions and replies</h2></div><StatusPill :label="isSharedInvitation ? `${messages.length} saved` : 'Preview'" :tone="isSharedInvitation ? 'good' : 'neutral'" /></div><div v-if="!isSharedInvitation" class="portal-empty-state"><Icon name="lock" :size="21" /><div><strong>Open an invitation to use the shared thread</strong><p>This preview keeps local examples separate. A client invitation enables D1-backed messages that are visible in another browser.</p></div></div><div v-else-if="!messages.length" class="portal-empty-state"><Icon name="message" :size="21" /><div><strong>No messages yet</strong><p>Start with the request, period, and action you need from the team.</p></div></div><div v-else class="portal-message-list"><article v-for="message in messages" :key="message.messageId" :data-record-id="message.messageId" class="portal-message" :class="{ 'is-client': ['client_contributor','client_finance','management_approver'].includes(message.senderRole), focused: focusedMessageId === message.messageId }"><div class="portal-message-meta"><strong>{{ message.senderRole.replaceAll('_', ' ') }}</strong><time>{{ message.createdAt }}</time><button type="button" class="text-button" @click="beginReply(message)">Reply</button></div><p>{{ message.body }}</p><small v-if="message.requestId">Request {{ message.requestId }}</small></article></div><p v-if="messageStatus" class="portal-status" :class="messageStatusTone" role="status" aria-live="polite">{{ messageStatus }}</p><form v-if="isSharedInvitation" class="portal-message-composer" @submit.prevent="submitMessage"><label>New message<textarea v-model="messageBody" name="new-message" rows="3" maxlength="2000" placeholder="Example: Can you confirm which FY2026 ledger extract belongs to this request?…" required></textarea></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Your message is visible to the assigned engagement team.</span><button type="submit" class="button primary" :disabled="!canSend">{{ sending ? 'Sending…' : 'Send message' }}<Icon name="arrow-right" :size="16" /></button></div></form><form v-if="replyTarget" class="portal-reply-form" @submit.prevent="submitReply"><div><span class="eyebrow">Replying to {{ replyTarget.senderRole.replaceAll('_', ' ') }}</span><p>{{ replyTarget.body }}</p></div><label>Your reply<textarea v-model="replyBody" name="reply-message" rows="3" maxlength="2000" required></textarea></label><div class="button-row"><button type="button" class="button secondary" @click="replyTarget = null">Cancel</button><button type="submit" class="button primary" :disabled="sending || !replyBody.trim()">Send reply</button></div></form></section>

    <section class="panel information-response-panel"><div class="panel-heading"><div><span class="eyebrow">MIR · exact response record</span><h2>{{ selectedInformationRequest?.title || 'Management information response' }}</h2></div><StatusPill :label="selectedInformationRequest?.state || 'Not in invitation scope'" :tone="selectedInformationRequest?.state === 'RESPONDED' ? 'good' : 'warn'" /></div><p class="panel-copy">Respond to a Management Information Request separately from general questions or the Draft FS decision. The response is versioned and never marks the financial statements approved by itself.</p><form v-if="selectedInformationRequest && !isSharedInvitation" class="portal-form" @submit.prevent="submitInformationResponse"><label>Response for {{ selectedInformationRequest.id }}<textarea v-model="responseBody" name="information-response" rows="4" maxlength="1600" placeholder="Explain the balance, attach the evidence reference, or state why the item is unavailable…" required></textarea></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Reference the exact reporting period.</span><button type="submit" class="button primary" :disabled="responding || !responseBody.trim()">{{ responding ? 'Saving…' : 'Submit information response' }}</button></div></form><p v-else class="panel-copy">MIR responses appear here when the engagement team sends one. Use the shared conversation above for a general question.</p><p v-if="responseStatus" class="portal-status" role="status">{{ responseStatus }}</p></section>

    <div class="portal-communication-grid"><section class="panel communication-topics"><div class="panel-heading"><div><span class="eyebrow">Good messages include</span><h2>Choose a clear topic</h2></div></div><div class="topic-list"><div v-for="topic in [{ label: 'Request clarification', detail: 'Ask what a file or balance should include.', tone: 'blue' }, { label: 'Explain an exception', detail: 'Give context when a requested item is not available.', tone: 'amber' }, { label: 'Confirm a handoff', detail: 'Agree the owner and due date for the next action.', tone: 'green' }]" :key="topic.label" class="topic-row"><span class="topic-icon" :class="`tone-${topic.tone}`"><Icon :name="topic.tone === 'amber' ? 'warning' : topic.tone === 'green' ? 'check-circle' : 'info'" :size="17" /></span><span><strong>{{ topic.label }}</strong><small>{{ topic.detail }}</small></span></div></div></section><section class="panel communication-next"><div class="panel-heading"><div><span class="eyebrow">After the reply</span><h2>Keep the handoff visible</h2></div></div><ol class="communication-steps"><li><span>1</span><div><strong>Read the team response</strong><small>Check which request or period it addresses.</small></div></li><li><span>2</span><div><strong>Confirm the action</strong><small>Reply with the owner, file, or date you agree to.</small></div></li><li><span>3</span><div><strong>Return to overview</strong><small>See whether another request still needs your attention.</small></div></li></ol><button type="button" class="button secondary full-width" @click="navigate('client-home')">Back to portal overview <Icon name="arrow-right" :size="16" /></button></section></div>
  </div>
</template>
