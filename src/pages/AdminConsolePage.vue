<script setup>
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { computed, ref } from 'vue'
import { demoUsers } from '../auth'
import { workflowGuides } from '../data'
import { activeActor, actorSession, scenario, setActorStatus } from '../domain/scenario.js'
import { routeMenuForRole } from '../navigation/registry.js'
import { createDemoInvitation, getPortalMessages, replyPortalMessage, sendPortalMessage } from '../sharedDemo.js'

const emit = defineEmits(['navigate', 'request-restart'])
const ADMIN_SHORTCUT_ICONS = Object.freeze({
  dashboard: 'grid', portfolio: 'briefcase', clients: 'users', engagements: 'briefcase',
  pbc: 'inbox', accounting: 'calculator', audit: 'clipboard', reviews: 'check-circle',
  release: 'lock', integration: 'pulse', architecture: 'workflow', blueprint: 'layers',
  cycle: 'workflow', pipeline: 'workflow', 'shared-demo': 'workflow', artifacts: 'file',
  readiness: 'list-check', 'client-home': 'grid', 'client-details': 'users',
  'client-communications': 'message', 'client-architecture': 'workflow',
  'accountant-home': 'grid', 'accountant-client': 'users',
  'accountant-architecture': 'workflow',
})
const adminShortcuts = Object.freeze(routeMenuForRole('admin')
  .filter((route) => !['role-workspace', 'admin-console'].includes(route.key))
  .map((route) => ({ ...route, icon: ADMIN_SHORTCUT_ICONS[route.key] || 'workflow' })))
const accessRows = [
  { label: 'Client portal', scope: 'Submit details, evidence questions, and portal messages', tone: 'blue', pages: '3 pages' },
  { label: 'Accountant portal', scope: 'View client facts and continue preparation work', tone: 'green', pages: '5 pages' },
  { label: 'Admin portal', scope: 'All workflow pages, access overview, and control visibility', tone: 'navy', pages: '15 pages' },
]
const activity = [
  { time: '09:42', title: 'Graph delta reconciliation', detail: '41 items reconciled · no missing snapshots', tone: 'good' },
  { time: '09:30', title: 'Client detail submission', detail: 'Northstar Trading profile available for review', tone: 'blue' },
  { time: 'Yesterday', title: 'Permission matrix reviewed', detail: 'Client and accountant scopes remain separated', tone: 'neutral' },
]
const toast = ref('')
const actorRows = computed(() => scenario.actors.map((actor) => ({
  ...actor,
  session: actorSession(actor.personaId),
  roleLabel: actor.roles.map((role) => role.replaceAll('_', ' ')).join(' · '),
})))
const activePersonaCount = computed(() => actorRows.value.filter((actor) => actor.active).length)
const currentSessionEpoch = computed(() => activeActor()?.sessionEpoch || '—')
const invitationPersona = ref('client-demo')
const invitationBusy = ref(false)
const invitationResult = ref(null)
const inboxMessages = ref([])
const inboxBody = ref('')
const inboxStatus = ref('')
const inboxSending = ref(false)
const inboxReplyTarget = ref(null)

const invitationEngagementId = computed(() => {
  const runId = invitationResult.value?.runId || ''
  return runId ? `run-${runId.replace(/^run-/, '').slice(0, 10)}-0018-AUD-26` : ''
})

async function createInvitation() {
  if (invitationBusy.value) return
  invitationBusy.value = true; invitationResult.value = null
  const result = await createDemoInvitation({ personaId: invitationPersona.value })
  invitationResult.value = result.ok ? result.invitation : { error: result.error?.message || 'The invitation could not be created.' }
  inboxMessages.value = []
  inboxStatus.value = ''
  if (result.ok) await loadInvitationInbox()
  invitationBusy.value = false
}

async function loadInvitationInbox() {
  if (!invitationEngagementId.value || !invitationResult.value?.runId) return
  const result = await getPortalMessages(invitationEngagementId.value, invitationResult.value.runId)
  if (result.ok) {
    inboxMessages.value = Array.isArray(result.messages) ? result.messages : []
    inboxStatus.value = ''
  } else inboxStatus.value = result.error?.message || 'The invitation inbox could not be loaded.'
}

async function sendInboxMessage() {
  const body = inboxBody.value.trim()
  if (!body || inboxSending.value || !invitationEngagementId.value || !invitationResult.value?.runId) return
  inboxSending.value = true; inboxStatus.value = 'Saving to the shared client thread…'
  const wasReply = Boolean(inboxReplyTarget.value)
  const result = wasReply
    ? await replyPortalMessage(inboxReplyTarget.value.messageId, { body })
    : await sendPortalMessage(invitationEngagementId.value, { body }, invitationResult.value.runId)
  if (result.ok) { inboxBody.value = ''; inboxReplyTarget.value = null; inboxStatus.value = wasReply ? 'Team reply saved.' : 'Team message saved.'; await loadInvitationInbox() }
  else inboxStatus.value = result.error?.message || 'The team message was not saved. Retry.'
  inboxSending.value = false
}

function beginInboxReply(message) {
  inboxReplyTarget.value = message
  inboxBody.value = ''
  inboxStatus.value = `Replying to ${message.senderRole.replaceAll('_', ' ')}`
}

async function copyInvitation() {
  if (!invitationResult.value?.inviteUrl) return
  try { await navigator.clipboard.writeText(invitationResult.value.inviteUrl); toast.value = 'Invitation link copied.' } catch { toast.value = 'Copy was blocked; select the link and copy it manually.' }
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function navigate(route) { emit('navigate', route) }

function toggleActor(actor) {
  const current = activeActor()
  if (!current) {
    toast.value = 'The current demo session is inactive. Sign in again before changing actor access.'
  } else {
    const result = setActorStatus({
      targetActorId: actor.id,
      actorPersonaId: current.personaId,
      active: !actor.active,
      expectedSessionEpoch: current.sessionEpoch,
      idempotencyKey: `actor-status-${actor.id}-${actor.sessionEpoch}-${actor.active ? 'disable' : 'enable'}`,
      reason: actor.active ? 'Synthetic administrator disabled this demo actor for the walkthrough.' : 'Synthetic administrator re-enabled this demo actor for the walkthrough.',
    })
    toast.value = result.outcome === 'COMMITTED'
      ? `${actor.name} is now ${result.data.active ? 'enabled' : 'disabled'}; session epoch rotated to ${result.data.sessionEpoch}.`
      : `${result.outcome}: ${result.code} — ${result.message}`
  }
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page admin-console-page">
    <PageHeader density="compact" eyebrow="Admin portal" title="Admin console" description="Supervise the workspace, see every role boundary, and open any workflow page without changing the owner of a professional decision." />
    <WorkflowGuide :guide="workflowGuides['admin-console']" />

    <section class="admin-banner panel"><span class="admin-banner-icon"><Icon name="shield" :size="20" /></span><div><span class="eyebrow">Full workspace access</span><h2>Every workflow boundary is visible</h2><p>Use this view to explain access, accountability, and operational health to stakeholders.</p></div><StatusPill label="Admin access" tone="good" /></section>
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="shield" :size="17" />{{ toast }}</div>

    <section class="panel demo-controls-panel"><div class="panel-heading"><div><span class="eyebrow">Workspace controls</span><h2>Restart the walkthrough</h2></div></div><p class="muted-copy">Restore the starting context, tasks, progress, and next action. You stay signed in so the walkthrough can continue immediately.</p><div class="button-row"><button type="button" class="button secondary" @click="emit('request-restart')">Restart walkthrough</button><button type="button" class="text-button" @click="navigate('readiness')">Review readiness <Icon name="arrow-right" :size="15" /></button></div></section>

    <section class="panel invitation-panel"><div class="panel-heading"><div><span class="eyebrow">Client access</span><h2>Create a private client invitation</h2></div><StatusPill label="7-day link · 5 browser sessions" tone="neutral" /></div><p class="panel-copy">Create a fresh engagement for a client review. The link opens the client portal only; role switching and presenter controls are not shown to the recipient.</p><div class="invitation-form"><label>Client role<select v-model="invitationPersona"><option value="client-demo">Client portal · Nadia Faris</option><option value="client-management-demo">Client management approver · Nadia Faris</option></select></label><button type="button" class="button primary" :disabled="invitationBusy" @click="createInvitation">{{ invitationBusy ? 'Creating…' : 'Create invitation' }}<Icon name="arrow-right" :size="16" /></button></div><div v-if="invitationResult?.inviteUrl" class="invitation-result"><div><strong>Invitation ready</strong><small>Run {{ invitationResult.runId }} · expires {{ invitationResult.expiresAt }}</small><input :value="invitationResult.inviteUrl" readonly aria-label="Client invitation URL" /></div><div class="button-row"><button type="button" class="button secondary" @click="copyInvitation">Copy link</button><a class="button secondary" :href="invitationResult.inviteUrl" target="_blank" rel="noopener">Open preview</a></div></div><p v-if="invitationResult?.error" class="portal-status danger" role="alert">{{ invitationResult.error }}</p></section>

    <section v-if="invitationResult?.runId" class="panel invitation-inbox-panel"><div class="panel-heading"><div><span class="eyebrow">Team inbox · invitation run</span><h2>Answer the client thread</h2></div><button type="button" class="text-button" @click="loadInvitationInbox">Refresh <Icon name="refresh" :size="15" /></button></div><p class="panel-copy">This presenter-only inbox is scoped to <code>{{ invitationResult.runId }}</code>. Replies are visible to every browser using the same invitation; internal staff notes remain hidden from the client.</p><div v-if="!inboxMessages.length" class="portal-empty-state"><Icon name="message" :size="21" /><div><strong>No client message yet</strong><p>Open the invitation in another browser and send a question. It will appear here without sharing any public R2 or database URL.</p></div></div><div v-else class="portal-message-list"><article v-for="message in inboxMessages" :key="message.messageId" class="portal-message" :class="{ 'is-client': ['client_contributor','client_finance','management_approver'].includes(message.senderRole) }"><div class="portal-message-meta"><strong>{{ message.senderRole.replaceAll('_', ' ') }}</strong><time>{{ message.createdAt }}</time><button type="button" class="text-button" @click="beginInboxReply(message)">Reply</button></div><p>{{ message.body }}</p><small v-if="message.requestId">Request {{ message.requestId }}</small></article></div><p v-if="inboxStatus" class="portal-status" role="status" aria-live="polite">{{ inboxStatus }}</p><form class="portal-message-composer" @submit.prevent="sendInboxMessage"><label>{{ inboxReplyTarget ? `Reply to ${inboxReplyTarget.senderRole.replaceAll('_', ' ')}` : 'Team message' }}<textarea v-model="inboxBody" rows="3" maxlength="2000" placeholder="Send a clarification or next-step note to the invited client."></textarea></label><div class="portal-form-footer"><span class="form-safety-note"><Icon name="shield" :size="16" />Only the selected invitation run is addressed.</span><div class="button-row"><button v-if="inboxReplyTarget" type="button" class="button secondary" @click="inboxReplyTarget = null; inboxBody = ''; inboxStatus = ''">Cancel</button><button type="submit" class="button primary" :disabled="inboxSending || !inboxBody.trim()">{{ inboxSending ? 'Sending…' : inboxReplyTarget ? 'Send reply' : 'Send team message' }}<Icon name="arrow-right" :size="16" /></button></div></div></form></section>

    <div class="admin-metric-grid"><article class="admin-metric"><span>Active personas</span><strong>{{ activePersonaCount }}</strong><small>{{ actorRows.length }} scoped actors · session epoch {{ currentSessionEpoch }}</small></article><article class="admin-metric"><span>Workflow pages</span><strong>15</strong><small>9 core + 6 portal pages</small></article><article class="admin-metric"><span>Open blockers</span><strong>4</strong><small>Visible in the Overview queue</small></article><article class="admin-metric"><span>Integration health</span><strong>3 / 4</strong><small>One retry needs attention</small></article></div>

    <div class="admin-console-grid"><section class="panel access-matrix-panel"><div class="panel-heading"><div><span class="eyebrow">Role boundaries</span><h2>Role access matrix</h2></div><span class="muted-label">Access policy</span></div><div class="access-matrix"><div v-for="row in accessRows" :key="row.label" class="access-row"><span class="access-row-icon" :class="`tone-${row.tone}`"><Icon :name="row.tone === 'green' ? 'calculator' : row.tone === 'navy' ? 'shield' : 'users'" :size="17" /></span><span><strong>{{ row.label }}</strong><small>{{ row.scope }}</small></span><StatusPill :label="row.pages" tone="neutral" /><Icon name="arrow-right" :size="16" /></div></div><div class="panel-footnote"><Icon name="info" :size="16" /><span>Admin visibility is broad, but acceptance, review, and release decisions still show their named authority.</span></div></section>
      <section class="panel admin-accounts-panel"><div class="panel-heading"><div><span class="eyebrow">Accounts</span><h2>Who can sign in?</h2></div></div><div class="admin-account-list"><div v-for="user in demoUsers" :key="user.id" class="admin-account-row"><span class="avatar" :class="`avatar-${user.tone}`">{{ user.initials }}</span><span><strong>{{ user.name }}</strong><small>{{ user.roleLabel }} · {{ user.email }}</small></span><StatusPill :label="user.role === 'admin' ? 'All privileges' : user.role === 'accountant' ? 'Prepare' : 'Submit'" :tone="user.tone === 'navy' ? 'good' : 'neutral'" /></div></div></section></div>

    <section class="panel actor-access-panel"><div class="panel-heading"><div><span class="eyebrow">P03 authority control</span><h2>Scoped actor status</h2></div><span class="muted-label">Disable rotates the session epoch</span></div><div class="actor-access-list"><div v-for="actor in actorRows" :key="actor.id" class="actor-access-row"><span class="avatar avatar-navy">{{ actor.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span class="actor-access-main"><strong>{{ actor.name }}</strong><small>{{ actor.roleLabel }} · {{ actor.assignments.length }} assignment{{ actor.assignments.length === 1 ? '' : 's' }}</small><code>epoch {{ actor.sessionEpoch }}{{ actor.statusReason ? ` · ${actor.statusReason}` : '' }}</code></span><StatusPill :label="actor.active ? 'Enabled' : 'Disabled'" :tone="actor.active ? 'good' : 'danger'" /><button type="button" class="row-button" :disabled="!activeActor() || actor.id === activeActor()?.id" @click="toggleActor(actor)">{{ actor.active ? 'Disable' : 'Enable' }}</button></div></div><div class="panel-footnote"><Icon name="lock" :size="16" /><span>Role membership and assignment remain separate from session status. A disabled actor cannot issue guarded commands; re-enabling requires the next session epoch.</span></div></section>

    <section class="panel admin-activity-panel"><div class="panel-heading"><div><span class="eyebrow">Operations</span><h2>Recent activity</h2></div><button type="button" class="text-button" @click="navigate('integration')">Open integration health <Icon name="arrow-right" :size="15" /></button></div><div class="admin-activity-list"><div v-for="item in activity" :key="item.time + item.title" class="admin-activity-row"><span class="activity-dot" :class="`tone-${item.tone}`"></span><span class="activity-time">{{ item.time }}</span><span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span></div></div></section>

    <section class="panel admin-shortcuts-panel"><div class="panel-heading"><div><span class="eyebrow">All workflow pages</span><h2>Jump to a control</h2></div></div><div class="admin-shortcut-grid"><button v-for="item in adminShortcuts" :key="item.key" type="button" class="admin-shortcut" @click="navigate(item.key)"><Icon :name="item.icon" :size="16" /><span>{{ item.label }}</span><Icon name="arrow-right" :size="15" /></button></div></section>
  </div>
</template>
