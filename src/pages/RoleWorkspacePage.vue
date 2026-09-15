<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import NextBestActionCard from '../components/NextBestActionCard.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import SharedTasks from '../components/SharedTasks.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { formatMoney, workflowGuides } from '../data'
import { roleWorkspaceFor } from '../roleWorkspaces.js'
import { activeActor, commercialRecordFor, completeSyntheticCredentialSetup, gateSummary, issueSyntheticCredential, recordRoleTaskAction, recordTerms, recordTermsDecision, scenario, selectedClient, selectedEngagement, termsFor, verifyAdvancePayment } from '../domain/scenario.js'
import LocalFixtureNotice from '../components/LocalFixtureNotice.vue'
import { loadDemoSession } from '../auth.js'
import { useDemoContext } from '../demoContext.js'
import { activeCommandContext, createSharedIntent, runSharedAction } from '../sharedDemo.js'
import { useDraftForms } from '../composables/useDraftForms.js'

const emit = defineEmits(['navigate'])
const sharedEnabled = sharedDemoEnabled
const toast = ref('')
const busyTask = ref('')
const credentialResult = ref(null)
const termsDecision = ref('ACCEPT')
const termsRationale = ref('')

// M7 §5 — shared mode: the workspace context provides the server-truth action
// allow-list and engagement revision; local scenario state stays read-only.
const {
  allowedActions: sharedAllowedActions,
  engagement: sharedEngagement,
  refresh: refreshSharedContext,
} = useDemoContext()
const sharedActionBusy = ref('')
const sharedActionMessage = ref('')
const sharedAdvanceReference = ref('')
const sharedApprovedFee = ref('')
const sharedActionAllowed = (action) => (sharedAllowedActions.value || []).includes(action)

const actor = computed(() => activeActor())
const workspace = computed(() => roleWorkspaceFor(actor.value?.personaId))
const sharedAssignee = computed(() => ({
  client: 'client_contributor',
  'client-management': 'management_approver',
  preparer: 'preparer',
  'audit-senior': 'audit_senior',
  'audit-manager': 'audit_manager',
  partner: 'engagement_partner',
  finance: 'finance_team',
  accountant: 'preparer',
  'accounting-reviewer': 'accounting_reviewer',
  eqr: 'eqr_reviewer',
  records: 'records_custodian',
  'system-admin': 'system_admin',
  compliance: 'compliance_reviewer',
  admin: '',
}[actor.value?.role] || ''))
const engagement = computed(() => selectedEngagement())
const client = computed(() => selectedClient())
const gates = computed(() => gateSummary(engagement.value?.id))
const currentGates = computed(() => gates.value.gates.filter((gate) => gate.applicable && gate.period === 'current'))
const blockers = computed(() => currentGates.value.filter((gate) => gate.status !== 'good'))
const commercial = computed(() => commercialRecordFor(engagement.value?.id))
const credentials = computed(() => (scenario.credentialBootstraps || []).filter((item) => item.engagementId === engagement.value?.id && !['EXPIRED', 'REVOKED'].includes(item.credentialState)))
const activeCredential = computed(() => credentials.value[0] || null)
const terms = computed(() => termsFor(engagement.value?.id))
const notifications = computed(() => (scenario.outbox || []).filter((item) => item.engagementId === engagement.value?.id).slice(-5).reverse())
const canIssueCredential = computed(() => Boolean(actor.value?.roles?.some((role) => ['engagement_partner', 'system_admin'].includes(role))))
const canCompleteCredential = computed(() => Boolean(actor.value?.roles?.some((role) => ['client_contributor', 'client_finance', 'management_approver'].includes(role))))
const canDecideTerms = computed(() => Boolean(actor.value?.roles?.includes('management_approver')))
const canReissueTerms = computed(() => Boolean(actor.value?.roles?.some((role) => ['management_approver', 'engagement_partner'].includes(role)) && terms.value && ['REJECTED', 'REVISION_REQUIRED'].includes(terms.value.state)))
const nextTermsVersion = computed(() => {
  const match = String(terms.value?.version || 'EL-2026-01').match(/^(.*-)(\d+)$/)
  return match ? `${match[1]}${String(Number(match[2]) + 1).padStart(2, '0')}` : `${terms.value?.version || 'EL-2026-01'}-02`
})

function show(message) {
  toast.value = message
  window.setTimeout(() => { toast.value = '' }, 5000)
}

function navigate(route) {
  emit('navigate', route)
}

function acknowledge(task) {
  if (sharedEnabled) {
    show('Local role tasks are read-only in shared mode; use the shared queue below.')
    return
  }
  if (busyTask.value) return
  busyTask.value = task.id
  const result = recordRoleTaskAction({ taskId: task.id, action: task.command || 'TASK_ACKNOWLEDGED', actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `role-task-${task.id}-${actor.value?.sessionEpoch || 1}` , detail: task.title })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `${task.title} recorded in the activity trail.` : `${result.outcome}: ${result.code} — ${result.message}`)
}

function verifyAdvance(task) {
  if (sharedEnabled) {
    show('Local role tasks are read-only in shared mode; use the shared queue below.')
    return
  }
  if (busyTask.value) return
  busyTask.value = task.id
  const result = verifyAdvancePayment({ engagementId: engagement.value?.id, actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `advance-${engagement.value?.id}-${actor.value?.sessionEpoch || 1}`, reference: 'PAY-SIM-0018' })
  busyTask.value = ''
  if (result.outcome === 'COMMITTED') {
    show('Required advance verified and allocated once. G4 will re-evaluate from the updated evidence.')
  } else show(`${result.outcome}: ${result.code} — ${result.message}`)
}

function issueCredential() {
  if (sharedEnabled) {
    show('Local credential controls are read-only in shared mode; use the shared queue below.')
    return
  }
  if (!actor.value || busyTask.value) return
  busyTask.value = 'credential'
  const result = issueSyntheticCredential({ engagementId: engagement.value?.id, actorPersonaId: actor.value.personaId, expectedSessionEpoch: actor.value.sessionEpoch, idempotencyKey: `credential-${engagement.value?.id}-${actor.value.sessionEpoch}` })
  busyTask.value = ''
  if (result.outcome === 'COMMITTED') {
    credentialResult.value = result.temporaryPassword ? { ...result.data, temporaryPassword: result.temporaryPassword } : credentialResult.value
    show(result.temporaryPassword ? 'Temporary credential issued. Copy the one-time password now; it is not stored in the audit trail.' : 'The existing temporary credential is already issued.')
  } else show(`${result.outcome}: ${result.code} — ${result.message}`)
}

function completeSetup() {
  if (sharedEnabled) {
    show('Local credential controls are read-only in shared mode; use the shared queue below.')
    return
  }
  if (!activeCredential.value || busyTask.value) return
  busyTask.value = 'credential-setup'
  const result = completeSyntheticCredentialSetup({ credentialId: activeCredential.value.id, actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `credential-setup-${activeCredential.value.id}-${actor.value?.sessionEpoch || 1}` })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? 'First-login setup complete. The client workspace is now active.' : `${result.outcome}: ${result.code} — ${result.message}`)
}

function decideTerms() {
  if (sharedEnabled) {
    show('Local terms controls are read-only in shared mode; use the shared queue below.')
    return
  }
  if (!actor.value || !engagement.value || !terms.value || busyTask.value) return
  busyTask.value = 'terms-decision'
  const result = recordTermsDecision({ engagementId: engagement.value.id, actorPersonaId: actor.value.personaId, expectedRevision: engagement.value.revision, expectedSessionEpoch: actor.value.sessionEpoch, idempotencyKey: `terms-decision-${engagement.value.id}-${engagement.value.revision}-${termsDecision.value}`, version: terms.value.version, decision: termsDecision.value, rationale: termsRationale.value })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `Engagement Letter ${terms.value.version} marked ${termsDecision.value}. The decision is bound to this exact revision.` : `${result.outcome}: ${result.code} — ${result.message}`)
  if (result.outcome === 'COMMITTED') termsRationale.value = ''
}

function reissueTerms() {
  if (sharedEnabled) {
    show('Local terms controls are read-only in shared mode; use the shared queue below.')
    return
  }
  if (!actor.value || !engagement.value || !terms.value || busyTask.value) return
  busyTask.value = 'terms-reissue'
  const result = recordTerms({ engagementId: engagement.value.id, actorPersonaId: actor.value.personaId, expectedRevision: engagement.value.revision, idempotencyKey: `terms-reissue-${engagement.value.id}-${engagement.value.revision}`, version: nextTermsVersion.value })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `Revised Engagement Letter ${nextTermsVersion.value} issued for exact client acceptance.` : `${result.outcome}: ${result.code} — ${result.message}`)
}

// M7 APPROVAL-03 / APP-F06 — one stable intent per shared command; the
// idempotency key survives retries until commit or explicit rejection.
const pendingIntents = new Map()

function sharedIntentFor(key, action, payload) {
  const context = activeCommandContext(engagement.value?.id)
  if (!context) return null
  const signature = JSON.stringify([action, payload])
  const existing = pendingIntents.get(key)
  if (existing && existing.signature === signature && existing.intent.canRetry()) return existing.intent
  const intent = createSharedIntent(context, action, payload.targetId || context.engagementId, payload)
  pendingIntents.set(key, { intent, signature })
  return intent
}

async function sendSharedIntent(key, action, payload, fallback) {
  const intent = sharedIntentFor(key, action, payload)
  if (intent) return intent.send()
  // No confirmed view context: fall back to the legacy unguarded action path.
  return fallback()
}

function sharedActionOutcome(message, result) {
  const outcome = String(result?.outcome || '').toUpperCase()
  if (result?.ok) {
    sharedActionMessage.value = message
    refreshSharedContext()
  } else if (outcome === 'UNCERTAIN' || result?.error?.code === 'COMMIT_UNCONFIRMED') {
    sharedActionMessage.value = 'The server did not confirm this commit. Press the same button again to retry the identical request; do not re-enter the command.'
  } else {
    sharedActionMessage.value = 'Not committed (' + (result?.error?.code || 'ERROR') + '): ' + (result?.error?.message || '')
  }
  window.setTimeout(() => { sharedActionMessage.value = '' }, 6000)
}

async function submitSharedVerifyAdvance() {
  if (sharedActionBusy.value) return
  if (!String(sharedAdvanceReference.value).trim()) {
    sharedActionMessage.value = 'Provide the payment reference (for example PAY-0018).'
    window.setTimeout(() => { sharedActionMessage.value = '' }, 6000)
    return
  }
  sharedActionBusy.value = 'advance'
  const payload = { reference: String(sharedAdvanceReference.value).trim() }
  const result = await sendSharedIntent('advance', 'VERIFY_ADVANCE', payload, () => runSharedAction(engagement.value?.id, 'VERIFY_ADVANCE', payload))
  sharedActionBusy.value = ''
  if (result?.ok) {
    sharedAdvanceReference.value = ''
    clearWorkspaceDraft()
  }
  sharedActionOutcome('Advance ' + payload.reference + ' verified once; gate G4 re-evaluates from the updated evidence.', result)
}

async function submitSharedIssueCredential() {
  if (sharedActionBusy.value) return
  sharedActionBusy.value = 'credential'
  const result = await sendSharedIntent('credential', 'ISSUE_TEMP_CREDENTIAL', {}, () => runSharedAction(engagement.value?.id, 'ISSUE_TEMP_CREDENTIAL', {}))
  sharedActionBusy.value = ''
  sharedActionOutcome(result?.temporaryPassword
    ? 'Temporary credential issued. One-time password (shown once): ' + result.temporaryPassword
    : 'Temporary credential issuance recorded on the shared workspace.', result)
}

async function submitSharedApproveFee() {
  if (sharedActionBusy.value) return
  const fee = String(sharedApprovedFee.value).trim()
  if (!fee) {
    sharedActionMessage.value = 'Provide the approved fee as a base-10 money value (for example 12500.00).'
    window.setTimeout(() => { sharedActionMessage.value = '' }, 6000)
    return
  }
  sharedActionBusy.value = 'fee'
  const payload = { approvedFee: fee }
  const result = await sendSharedIntent('fee', 'APPROVE_FEE', payload, () => runSharedAction(engagement.value?.id, 'APPROVE_FEE', payload))
  sharedActionBusy.value = ''
  if (result?.ok) sharedApprovedFee.value = ''
  sharedActionOutcome('Fee ' + fee + ' approved once; the Engagement Letter request now waits for the client.', result)
}

// M7 STATE-03 — the advance reference is the only free-text field in the
// shared action forms; the fee amount and the credential command are decision
// values and are never persisted locally.
const workspaceDraftForms = useDraftForms({ 'shared-advance': ['reference'] })
const workspaceDraftStatus = ref('')
const workspaceDraftError = ref('')
const workspaceStalePrompt = ref(null)
let workspaceDraftTimer = null

function workspaceDraftScope() {
  const engagementRow = sharedEngagement.value
  if (!engagementRow?.engagementId || !engagementRow?.generationId) return null
  const actorId = loadDemoSession()?.id || activeCommandContext(engagementRow.engagementId)?.actorId || ''
  if (!actorId) return null
  return { runId: 'm7-demo', generationId: String(engagementRow.generationId), actorId: String(actorId), engagementId: String(engagementRow.engagementId), formId: 'shared-advance' }
}

function clearWorkspaceDraft() {
  if (!workspaceDraftForms) return
  const scope = workspaceDraftScope()
  if (scope) workspaceDraftForms.clear(scope)
  workspaceDraftStatus.value = ''
}

watch(sharedAdvanceReference, () => {
  if (!workspaceDraftForms) return
  if (workspaceDraftTimer) window.clearTimeout(workspaceDraftTimer)
  workspaceDraftTimer = window.setTimeout(() => {
    const scope = workspaceDraftScope()
    if (!scope) return
    if (!String(sharedAdvanceReference.value).trim()) {
      workspaceDraftForms.clear(scope)
      workspaceDraftStatus.value = ''
      return
    }
    const saved = workspaceDraftForms.save(scope, { reference: sharedAdvanceReference.value }, Number(sharedEngagement.value?.revision || 0))
    if (saved.ok && saved.outcome === 'SAVED_LOCAL_DRAFT') {
      workspaceDraftStatus.value = 'SAVED_LOCAL_DRAFT'
      workspaceDraftError.value = ''
    } else if (saved.code !== 'DRAFT_SCOPE_INVALID') {
      workspaceDraftError.value = saved.message || 'The local draft could not be saved.'
    }
  }, 500)
})

function restoreWorkspaceDraft() {
  if (!workspaceDraftForms) return
  const scope = workspaceDraftScope()
  if (!scope) return
  const loaded = workspaceDraftForms.restore(scope, Number(sharedEngagement.value?.revision || 0))
  if (!loaded.ok || loaded.outcome !== 'DRAFT_LOADED' || !loaded.draft) return
  const value = String(loaded.draft.values?.reference || '')
  if (loaded.stale) {
    workspaceStalePrompt.value = { value, baseRevision: loaded.draft.baseRevision, currentRevision: Number(sharedEngagement.value?.revision || 0) }
    return
  }
  if (!sharedAdvanceReference.value) sharedAdvanceReference.value = value
}

function keepWorkspaceDraft() {
  const prompt = workspaceStalePrompt.value
  workspaceStalePrompt.value = null
  if (prompt && !sharedAdvanceReference.value) sharedAdvanceReference.value = prompt.value
}

function discardWorkspaceDraft() {
  const prompt = workspaceStalePrompt.value
  workspaceStalePrompt.value = null
  const scope = prompt && workspaceDraftScope()
  if (scope && workspaceDraftForms) workspaceDraftForms.clear(scope)
}

watch(() => sharedEngagement.value?.generationId, () => restoreWorkspaceDraft())
</script>

<template>
  <div class="page role-workspace-page">
    <PageHeader :eyebrow="workspace.eyebrow" :title="workspace.title" :description="workspace.summary" />
    <WorkflowGuide :guide="workflowGuides['role-workspace']" />
    <NextBestActionCard v-if="sharedEnabled" title="Your next shared handoff" compact @navigate="navigate" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <LocalFixtureNotice v-if="sharedEnabled"
      title="Local role workspace is read-only"
      description="The shared queue and shared commands below are authoritative for this persona. Local gate metrics, task controls, credentials and engagement terms are hidden or read-only fixtures here." />

    <section class="role-scope-banner panel">
      <div class="role-scope-icon" :class="`tone-${workspace.tone}`"><Icon :name="workspace.icon" :size="22" /></div>
      <div><span class="eyebrow">Current scope</span><h2>{{ workspace.scope }}</h2><p>Signed in as <strong>{{ actor?.name }}</strong> · {{ actor?.roles?.map((role) => role.replaceAll('_', ' ')).join(' · ') }}</p></div>
      <StatusPill v-if="!sharedEnabled" :label="`${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`" :tone="blockers.length ? 'danger' : 'good'" />
    </section>

    <section class="metric-grid role-metrics" aria-label="Role workspace metrics">
      <article v-if="!sharedEnabled" class="metric-card accent-navy"><div class="metric-card-top"><span>Current gate progress</span><span class="metric-icon"><Icon name="workflow" :size="17" /></span></div><strong>{{ gates.currentReady }}/{{ gates.currentDenominator }}</strong><small>{{ client?.name }} · current period</small></article>
      <article v-if="!sharedEnabled" class="metric-card accent-amber"><div class="metric-card-top"><span>Open blockers</span><span class="metric-icon"><Icon name="warning" :size="17" /></span></div><strong>{{ blockers.length }}</strong><small>Each blocker names its next owner</small></article>
      <article class="metric-card accent-green"><div class="metric-card-top"><span>Tasks in this role</span><span class="metric-icon"><Icon name="list-check" :size="17" /></span></div><strong>{{ workspace.tasks.length }}</strong><small>Use the links below to open the working page</small></article>
      <article class="metric-card accent-blue"><div class="metric-card-top"><span>Workspace status</span><span class="metric-icon"><Icon name="shield" :size="17" /></span></div><strong>GUIDED VIEW</strong><small>Follow the next handoff to continue.</small></article>
    </section>

    <section class="role-workspace-layout">
      <article class="panel role-task-panel">
        <div class="panel-heading"><div><span class="eyebrow">My tasks</span><h2>Work owned by this persona</h2></div><span class="muted-label">Select a task, then open its record</span></div>
        <div class="role-task-list">
          <article v-for="task in workspace.tasks" :key="task.id" class="role-task-card">
            <span class="role-task-icon" :class="`task-${task.tone}`"><Icon :name="task.icon" :size="18" /></span>
            <div class="role-task-copy"><strong>{{ task.title }}</strong><p>{{ task.detail }}</p><span v-if="!sharedEnabled" class="role-task-state"><i :class="`state-${task.tone}`"></i>{{ task.command === 'ADVANCE_VERIFY' ? (commercial?.advanceState === 'VERIFIED' ? 'Verified' : 'Needs finance action') : 'Ready to inspect' }}</span></div>
            <div class="role-task-actions"><button type="button" class="text-button" @click="navigate(task.route)">{{ task.action }} <Icon name="arrow-right" :size="15" /></button><button v-if="!sharedEnabled && task.command === 'ADVANCE_VERIFY'" type="button" class="button secondary small" :disabled="busyTask === task.id || commercial?.advanceState === 'VERIFIED'" @click="verifyAdvance(task)">{{ busyTask === task.id ? 'Saving…' : commercial?.advanceState === 'VERIFIED' ? 'Verified' : 'Verify advance' }}</button><button v-else-if="!sharedEnabled && task.command === 'TIME_ENTRY'" type="button" class="button secondary small" :disabled="busyTask === task.id" @click="acknowledge(task)">{{ busyTask === task.id ? 'Saving…' : 'Record task' }}</button></div>
          </article>
        </div>
      </article>

      <aside class="panel role-boundary-panel">
        <div class="panel-heading"><div><span class="eyebrow">Authority boundary</span><h2>What this role can do</h2></div><Icon name="shield" :size="18" /></div>
        <div class="role-boundary-group"><span class="guide-label"><Icon name="check" :size="14" />Allowed actions</span><ul class="check-list compact"><li v-for="item in workspace.allowed" :key="item"><span class="list-icon good"><Icon name="check" :size="13" /></span><span>{{ item }}</span></li></ul></div>
        <div class="role-boundary-group"><span class="guide-label"><Icon name="lock" :size="14" />Blocked actions</span><ul class="check-list compact"><li v-for="item in workspace.blocked" :key="item"><span class="list-icon danger"><Icon name="lock" :size="13" /></span><span>{{ item }}</span></li></ul></div>
        <div class="role-boundary-note"><Icon name="info" :size="16" /><span>Role membership, client assignment, and session validity are checked separately before each action.</span></div>
      </aside>
    </section>

    <SharedTasks v-if="sharedEnabled" :engagement-id="engagement?.id || ''" title="Shared queue for this persona" :assignee="sharedAssignee" @navigate="navigate" />

    <section v-if="sharedEnabled" class="panel shared-actions-panel" aria-labelledby="shared-actions-title">
      <div class="panel-heading"><div><span class="eyebrow">Shared commands · server-checked authority</span><h2 id="shared-actions-title">Registered equivalents for this persona</h2></div></div>
      <p v-if="sharedActionMessage" class="guide-status-message" role="status">{{ sharedActionMessage }}</p>
      <div class="shared-actions-grid">
        <form v-if="sharedActionAllowed('VERIFY_ADVANCE')" class="shared-action-form" @submit.prevent="submitSharedVerifyAdvance">
          <span class="eyebrow">Verify advance payment (G4 · Finance)</span>
          <label>Payment reference<input v-model="sharedAdvanceReference" type="text" maxlength="40" placeholder="e.g. PAY-SIM-0018" /></label>
          <small v-if="workspaceDraftStatus" class="muted-label">{{ workspaceDraftStatus }}</small>
          <small v-else-if="workspaceDraftError" class="draft-error">{{ workspaceDraftError }}</small>
          <button type="submit" class="button secondary" :disabled="sharedActionBusy === 'advance'">{{ sharedActionBusy === 'advance' ? 'Verifying…' : 'Verify advance' }}</button>
        </form>
        <form v-if="sharedActionAllowed('ISSUE_TEMP_CREDENTIAL')" class="shared-action-form" @submit.prevent="submitSharedIssueCredential">
          <span class="eyebrow">Issue temporary credential (G4 · Partner / Admin)</span>
          <p class="shared-action-copy">The shared command re-checks client details, acceptance, terms version and advance before issuing.</p>
          <button type="submit" class="button secondary" :disabled="sharedActionBusy === 'credential'">{{ sharedActionBusy === 'credential' ? 'Issuing…' : 'Issue temporary credential' }}</button>
        </form>
        <form v-if="sharedActionAllowed('APPROVE_FEE')" class="shared-action-form" @submit.prevent="submitSharedApproveFee">
          <span class="eyebrow">Approve fee (Finance handoff · Partner)</span>
          <label>Approved fee (QAR)<input v-model="sharedApprovedFee" type="text" inputmode="decimal" placeholder="e.g. 12500.00" /></label>
          <button type="submit" class="button secondary" :disabled="sharedActionBusy === 'fee'">{{ sharedActionBusy === 'fee' ? 'Recording…' : 'Approve fee' }}</button>
        </form>
        <p v-if="!sharedActionAllowed('VERIFY_ADVANCE') && !sharedActionAllowed('ISSUE_TEMP_CREDENTIAL') && !sharedActionAllowed('APPROVE_FEE')" class="guide-empty-state">This persona has no registered shared command; the queued tasks above name the owning page for each handoff.</p>
      </div>
      <div v-if="workspaceStalePrompt" class="draft-prompt" role="alert">
        <span>Local draft saved against revision {{ workspaceStalePrompt.baseRevision }}; the shared workspace is now at revision {{ workspaceStalePrompt.currentRevision }}.</span>
        <span class="draft-prompt-actions"><button type="button" class="row-button" @click="keepWorkspaceDraft">Keep draft</button><button type="button" class="row-button" @click="discardWorkspaceDraft">Discard draft</button></span>
      </div>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>First-login setup and Engagement Letter decisions are handled on their owning pages.</span></p>
    </section>

    <section v-if="canIssueCredential || canCompleteCredential || activeCredential" class="panel credential-panel">
      <div class="panel-heading"><div><span class="eyebrow">G4 · controlled onboarding</span><h2>Temporary credential</h2></div><StatusPill :label="activeCredential ? activeCredential.credentialState : 'Not issued'" :tone="activeCredential?.credentialState === 'ACTIVE' ? 'good' : 'warn'" /></div>
      <div v-if="!activeCredential" class="credential-empty"><Icon name="key" :size="20" /><div><strong>No credential issued for this engagement</strong><p>After acceptance, signed terms, verified advance, assignments, and workspace checks are complete, the partner or system administrator can issue one setup-only credential.</p></div><button v-if="canIssueCredential && !sharedEnabled" type="button" class="button primary" :disabled="busyTask === 'credential'" @click="issueCredential">{{ busyTask === 'credential' ? 'Issuing…' : 'Issue access credential' }}</button></div>
      <div v-else class="credential-grid"><div><span>Username</span><strong>{{ activeCredential.username }}</strong><small>Issued {{ new Date(activeCredential.issuedAt).toLocaleString('en-QA') }}</small></div><div><span>State</span><strong>{{ activeCredential.credentialState }}</strong><small>{{ activeCredential.firstLoginRequired ? 'First-login password change required' : 'Setup completed' }}</small></div><div v-if="credentialResult?.temporaryPassword" class="credential-secret"><span>One-time password</span><strong>{{ credentialResult.temporaryPassword }}</strong><small>Shown once in this browser response; never written to event history.</small></div><div class="credential-actions"><button v-if="canCompleteCredential && activeCredential.firstLoginRequired && !sharedEnabled" type="button" class="button primary" :disabled="busyTask === 'credential-setup'" @click="completeSetup">{{ busyTask === 'credential-setup' ? 'Saving…' : 'Complete first login' }}</button><button type="button" class="text-button" @click="show('This credential is shown to explain the secure setup flow.')">Why this matters <Icon name="info" :size="15" /></button></div></div>
    </section>

    <section v-if="canDecideTerms || terms" class="panel terms-panel">
      <div class="panel-heading"><div><span class="eyebrow">G3 · exact client acceptance</span><h2>Engagement Letter</h2></div><StatusPill :label="terms?.state || 'Not issued'" :tone="terms?.state === 'ACCEPTED' || terms?.clientDecision?.decision === 'ACCEPT' ? 'good' : terms?.state === 'REJECTED' || terms?.state === 'REVISION_REQUIRED' ? 'danger' : 'warn'" /></div>
      <div class="terms-grid">
        <div class="terms-preview"><span class="terms-document-icon"><Icon name="file" :size="20" /></span><div><strong>{{ terms?.id || 'No Engagement Letter' }}</strong><p>{{ engagement?.serviceLabel || 'Service' }} · {{ client?.name || 'No client scope' }} · {{ engagement?.period || '—' }}</p><small>Version {{ terms?.version || '—' }} · scope {{ terms?.scopeVersion || '—' }} · responsibilities {{ terms?.responsibilitiesVersion || '—' }}</small></div></div>
        <div class="terms-decision-summary"><span>Client decision</span><strong>{{ terms?.clientDecision?.decision || 'PENDING' }}</strong><small>{{ terms?.clientDecision?.version ? `Bound to ${terms.clientDecision.version}` : 'No version decision recorded' }}</small></div>
        <div class="terms-decision-summary"><span>Recorded by</span><strong>{{ terms?.clientDecision?.actorId || terms?.signedBy || '—' }}</strong><small>{{ terms?.clientDecision?.rationale || 'Decision rationale will be retained with the exact version.' }}</small></div>
      </div>
      <div v-if="!sharedEnabled && canDecideTerms && terms" class="terms-actions">
        <label>Decision<select v-model="termsDecision"><option value="ACCEPT">Accept exact version</option><option value="REQUEST_CHANGES">Request changes</option><option value="REJECT">Reject exact version</option></select></label>
        <label class="terms-rationale">Rationale<textarea v-model="termsRationale" rows="2" maxlength="500" :placeholder="termsDecision === 'ACCEPT' ? 'Optional approval context' : 'Explain the correction required'" /></label>
        <button type="button" class="button primary" :disabled="busyTask === 'terms-decision' || (termsDecision !== 'ACCEPT' && termsRationale.trim().length < 8)" @click="decideTerms">{{ busyTask === 'terms-decision' ? 'Recording…' : 'Record decision' }}<Icon name="check-circle" :size="16" /></button>
        <button v-if="canReissueTerms" type="button" class="button secondary" :disabled="busyTask === 'terms-reissue'" @click="reissueTerms">{{ busyTask === 'terms-reissue' ? 'Issuing…' : `Issue ${nextTermsVersion}` }}</button>
      </div>
      <p class="terms-note"><Icon name="shield" :size="15" />The portal gate checks this exact version; a rejection or change request keeps the prior decision in history and holds commencement.</p>
    </section>

    <section v-if="notifications.length" class="panel notification-panel"><div class="panel-heading"><div><span class="eyebrow">Handoff updates</span><h2>Handoffs and notifications</h2></div><span class="muted-label">Track each recipient and reference</span></div><div class="notification-list"><article v-for="item in notifications" :key="item.id" class="notification-row"><span class="notification-icon"><Icon :name="item.channel === 'PORTAL' ? 'message' : 'send'" :size="17" /></span><div><strong>{{ item.reference }}</strong><p>{{ item.preview }}</p><small>{{ item.channel }} · {{ item.state }} · {{ item.correlationId }}</small></div><StatusPill :label="item.state" tone="neutral" /></article></div><div class="prototype-note inline-note"><Icon name="info" :size="15" /><span>Each handoff shows its recipient, reference, timestamp and tracking ID.</span></div></section>
  </div>
</template>

<style scoped>
.shared-actions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 10px; }
.shared-action-form { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border, #dbe3ef); border-radius: 10px; padding: 12px; }
.shared-action-copy { margin: 0; color: var(--muted, #667085); font-size: 12px; }
.draft-prompt { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border: 1px solid #f0c36d; background: #fff8e6; border-radius: 10px; padding: 10px 12px; margin-top: 10px; color: #7a4d00; font-size: 13px; }
.draft-prompt-actions { display: flex; gap: 8px; }
.draft-error { color: #b42318; }
</style>
