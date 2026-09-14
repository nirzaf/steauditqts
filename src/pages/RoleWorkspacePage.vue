<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { formatMoney, workflowGuides } from '../data'
import { roleWorkspaceFor } from '../roleWorkspaces.js'
import { activeActor, commercialRecordFor, completeSyntheticCredentialSetup, gateSummary, issueSyntheticCredential, recordRoleTaskAction, recordTerms, recordTermsDecision, scenario, selectedClient, selectedEngagement, termsFor, verifyAdvancePayment } from '../domain/scenario.js'

const emit = defineEmits(['navigate'])
const toast = ref('')
const busyTask = ref('')
const credentialResult = ref(null)
const termsDecision = ref('ACCEPT')
const termsRationale = ref('')

const actor = computed(() => activeActor())
const workspace = computed(() => roleWorkspaceFor(actor.value?.personaId))
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
  if (busyTask.value) return
  busyTask.value = task.id
  const result = recordRoleTaskAction({ taskId: task.id, action: task.command || 'TASK_ACKNOWLEDGED', actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `role-task-${task.id}-${actor.value?.sessionEpoch || 1}` , detail: task.title })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `${task.title} recorded in the synthetic activity trail.` : `${result.outcome}: ${result.code} — ${result.message}`)
}

function verifyAdvance(task) {
  if (busyTask.value) return
  busyTask.value = task.id
  const result = verifyAdvancePayment({ engagementId: engagement.value?.id, actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `advance-${engagement.value?.id}-${actor.value?.sessionEpoch || 1}`, reference: 'PAY-SIM-0018' })
  busyTask.value = ''
  if (result.outcome === 'COMMITTED') {
    show('Required advance verified and allocated once. G4 will re-evaluate from the updated evidence.')
  } else show(`${result.outcome}: ${result.code} — ${result.message}`)
}

function issueCredential() {
  if (!actor.value || busyTask.value) return
  busyTask.value = 'credential'
  const result = issueSyntheticCredential({ engagementId: engagement.value?.id, actorPersonaId: actor.value.personaId, expectedSessionEpoch: actor.value.sessionEpoch, idempotencyKey: `credential-${engagement.value?.id}-${actor.value.sessionEpoch}` })
  busyTask.value = ''
  if (result.outcome === 'COMMITTED') {
    credentialResult.value = result.temporaryPassword ? { ...result.data, temporaryPassword: result.temporaryPassword } : credentialResult.value
    show(result.temporaryPassword ? 'Synthetic credential issued. Copy the one-time password now; it is not stored in the audit trail.' : 'The existing synthetic credential is already issued.')
  } else show(`${result.outcome}: ${result.code} — ${result.message}`)
}

function completeSetup() {
  if (!activeCredential.value || busyTask.value) return
  busyTask.value = 'credential-setup'
  const result = completeSyntheticCredentialSetup({ credentialId: activeCredential.value.id, actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `credential-setup-${activeCredential.value.id}-${actor.value?.sessionEpoch || 1}` })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? 'First-login setup complete. The synthetic client workspace is now active.' : `${result.outcome}: ${result.code} — ${result.message}`)
}

function decideTerms() {
  if (!actor.value || !engagement.value || !terms.value || busyTask.value) return
  busyTask.value = 'terms-decision'
  const result = recordTermsDecision({ engagementId: engagement.value.id, actorPersonaId: actor.value.personaId, expectedRevision: engagement.value.revision, expectedSessionEpoch: actor.value.sessionEpoch, idempotencyKey: `terms-decision-${engagement.value.id}-${engagement.value.revision}-${termsDecision.value}`, version: terms.value.version, decision: termsDecision.value, rationale: termsRationale.value })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `Engagement Letter ${terms.value.version} marked ${termsDecision.value}. The decision is bound to this exact revision.` : `${result.outcome}: ${result.code} — ${result.message}`)
  if (result.outcome === 'COMMITTED') termsRationale.value = ''
}

function reissueTerms() {
  if (!actor.value || !engagement.value || !terms.value || busyTask.value) return
  busyTask.value = 'terms-reissue'
  const result = recordTerms({ engagementId: engagement.value.id, actorPersonaId: actor.value.personaId, expectedRevision: engagement.value.revision, idempotencyKey: `terms-reissue-${engagement.value.id}-${engagement.value.revision}`, version: nextTermsVersion.value })
  busyTask.value = ''
  show(result.outcome === 'COMMITTED' ? `Revised Engagement Letter ${nextTermsVersion.value} issued for exact client acceptance.` : `${result.outcome}: ${result.code} — ${result.message}`)
}
</script>

<template>
  <div class="page role-workspace-page">
    <PageHeader :eyebrow="workspace.eyebrow" :title="workspace.title" :description="workspace.summary" />
    <WorkflowGuide :guide="workflowGuides['role-workspace']" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="role-scope-banner panel">
      <div class="role-scope-icon" :class="`tone-${workspace.tone}`"><Icon :name="workspace.icon" :size="22" /></div>
      <div><span class="eyebrow">Current scope</span><h2>{{ workspace.scope }}</h2><p>Signed in as <strong>{{ actor?.name }}</strong> · {{ actor?.roles?.map((role) => role.replaceAll('_', ' ')).join(' · ') }}</p></div>
      <StatusPill :label="`${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`" :tone="blockers.length ? 'danger' : 'good'" />
    </section>

    <section class="metric-grid role-metrics" aria-label="Role workspace metrics">
      <article class="metric-card accent-navy"><div class="metric-card-top"><span>Current gate progress</span><span class="metric-icon"><Icon name="workflow" :size="17" /></span></div><strong>{{ gates.currentReady }}/{{ gates.currentDenominator }}</strong><small>{{ client?.name }} · current period</small></article>
      <article class="metric-card accent-amber"><div class="metric-card-top"><span>Open blockers</span><span class="metric-icon"><Icon name="warning" :size="17" /></span></div><strong>{{ blockers.length }}</strong><small>Each blocker names its next owner</small></article>
      <article class="metric-card accent-green"><div class="metric-card-top"><span>Tasks in this role</span><span class="metric-icon"><Icon name="list-check" :size="17" /></span></div><strong>{{ workspace.tasks.length }}</strong><small>Use the links below to open the working page</small></article>
      <article class="metric-card accent-blue"><div class="metric-card-top"><span>Evidence level</span><span class="metric-icon"><Icon name="shield" :size="17" /></span></div><strong>SIMULATION</strong><small>Browser-local synthetic values only</small></article>
    </section>

    <section class="role-workspace-layout">
      <article class="panel role-task-panel">
        <div class="panel-heading"><div><span class="eyebrow">My tasks</span><h2>Work owned by this persona</h2></div><span class="muted-label">Select a task, then open its record</span></div>
        <div class="role-task-list">
          <article v-for="task in workspace.tasks" :key="task.id" class="role-task-card">
            <span class="role-task-icon" :class="`task-${task.tone}`"><Icon :name="task.icon" :size="18" /></span>
            <div class="role-task-copy"><strong>{{ task.title }}</strong><p>{{ task.detail }}</p><span class="role-task-state"><i :class="`state-${task.tone}`"></i>{{ task.command === 'ADVANCE_VERIFY' ? (commercial?.advanceState === 'VERIFIED' ? 'Verified' : 'Needs finance action') : 'Ready to inspect' }}</span></div>
            <div class="role-task-actions"><button type="button" class="text-button" @click="navigate(task.route)">{{ task.action }} <Icon name="arrow-right" :size="15" /></button><button v-if="task.command === 'ADVANCE_VERIFY'" type="button" class="button secondary small" :disabled="busyTask === task.id || commercial?.advanceState === 'VERIFIED'" @click="verifyAdvance(task)">{{ busyTask === task.id ? 'Saving…' : commercial?.advanceState === 'VERIFIED' ? 'Verified' : 'Verify advance' }}</button><button v-else-if="task.command === 'TIME_ENTRY'" type="button" class="button secondary small" :disabled="busyTask === task.id" @click="acknowledge(task)">{{ busyTask === task.id ? 'Saving…' : 'Record task' }}</button></div>
          </article>
        </div>
      </article>

      <aside class="panel role-boundary-panel">
        <div class="panel-heading"><div><span class="eyebrow">Authority boundary</span><h2>What this role can do</h2></div><Icon name="shield" :size="18" /></div>
        <div class="role-boundary-group"><span class="guide-label"><Icon name="check" :size="14" />Allowed actions</span><ul class="check-list compact"><li v-for="item in workspace.allowed" :key="item"><span class="list-icon good"><Icon name="check" :size="13" /></span><span>{{ item }}</span></li></ul></div>
        <div class="role-boundary-group"><span class="guide-label"><Icon name="lock" :size="14" />Blocked actions</span><ul class="check-list compact"><li v-for="item in workspace.blocked" :key="item"><span class="list-icon danger"><Icon name="lock" :size="13" /></span><span>{{ item }}</span></li></ul></div>
        <div class="role-boundary-note"><Icon name="info" :size="16" /><span>Role membership, client assignment, and session validity are separate checks in the synthetic command layer.</span></div>
      </aside>
    </section>

    <section v-if="canIssueCredential || canCompleteCredential || activeCredential" class="panel credential-panel">
      <div class="panel-heading"><div><span class="eyebrow">G4 · controlled onboarding</span><h2>Synthetic temporary credential</h2></div><StatusPill :label="activeCredential ? activeCredential.credentialState : 'Not issued'" :tone="activeCredential?.credentialState === 'ACTIVE' ? 'good' : 'warn'" /></div>
      <div v-if="!activeCredential" class="credential-empty"><Icon name="key" :size="20" /><div><strong>No credential issued for this engagement</strong><p>After acceptance, signed terms, verified advance, assignments, and workspace checks are complete, the partner or system administrator can issue one setup-only credential.</p></div><button v-if="canIssueCredential" type="button" class="button primary" :disabled="busyTask === 'credential'" @click="issueCredential">{{ busyTask === 'credential' ? 'Issuing…' : 'Issue synthetic credential' }}</button></div>
      <div v-else class="credential-grid"><div><span>Username</span><strong>{{ activeCredential.username }}</strong><small>Issued {{ new Date(activeCredential.issuedAt).toLocaleString('en-QA') }}</small></div><div><span>State</span><strong>{{ activeCredential.credentialState }}</strong><small>{{ activeCredential.firstLoginRequired ? 'First-login password change required' : 'Setup completed' }}</small></div><div v-if="credentialResult?.temporaryPassword" class="credential-secret"><span>One-time password</span><strong>{{ credentialResult.temporaryPassword }}</strong><small>Shown once in this browser response; never written to event history.</small></div><div class="credential-actions"><button v-if="canCompleteCredential && activeCredential.firstLoginRequired" type="button" class="button primary" :disabled="busyTask === 'credential-setup'" @click="completeSetup">{{ busyTask === 'credential-setup' ? 'Saving…' : 'Complete first login' }}</button><button type="button" class="text-button" @click="show('Credential state is synthetic and is not production authentication.')">Why this matters <Icon name="info" :size="15" /></button></div></div>
    </section>

    <section v-if="canDecideTerms || terms" class="panel terms-panel">
      <div class="panel-heading"><div><span class="eyebrow">G3 · exact client acceptance</span><h2>Engagement Letter</h2></div><StatusPill :label="terms?.state || 'Not issued'" :tone="terms?.state === 'ACCEPTED' || terms?.clientDecision?.decision === 'ACCEPT' ? 'good' : terms?.state === 'REJECTED' || terms?.state === 'REVISION_REQUIRED' ? 'danger' : 'warn'" /></div>
      <div class="terms-grid">
        <div class="terms-preview"><span class="terms-document-icon"><Icon name="file" :size="20" /></span><div><strong>{{ terms?.id || 'No Engagement Letter' }}</strong><p>{{ engagement?.serviceLabel || 'Service' }} · {{ client?.name || 'No client scope' }} · {{ engagement?.period || '—' }}</p><small>Version {{ terms?.version || '—' }} · scope {{ terms?.scopeVersion || '—' }} · responsibilities {{ terms?.responsibilitiesVersion || '—' }}</small></div></div>
        <div class="terms-decision-summary"><span>Client decision</span><strong>{{ terms?.clientDecision?.decision || 'PENDING' }}</strong><small>{{ terms?.clientDecision?.version ? `Bound to ${terms.clientDecision.version}` : 'No version decision recorded' }}</small></div>
        <div class="terms-decision-summary"><span>Recorded by</span><strong>{{ terms?.clientDecision?.actorId || terms?.signedBy || '—' }}</strong><small>{{ terms?.clientDecision?.rationale || 'Decision rationale will be retained with the exact version.' }}</small></div>
      </div>
      <div v-if="canDecideTerms && terms" class="terms-actions">
        <label>Decision<select v-model="termsDecision"><option value="ACCEPT">Accept exact version</option><option value="REQUEST_CHANGES">Request changes</option><option value="REJECT">Reject exact version</option></select></label>
        <label class="terms-rationale">Rationale<textarea v-model="termsRationale" rows="2" maxlength="500" :placeholder="termsDecision === 'ACCEPT' ? 'Optional approval context' : 'Explain the correction required'" /></label>
        <button type="button" class="button primary" :disabled="busyTask === 'terms-decision' || (termsDecision !== 'ACCEPT' && termsRationale.trim().length < 8)" @click="decideTerms">{{ busyTask === 'terms-decision' ? 'Recording…' : 'Record decision' }}<Icon name="check-circle" :size="16" /></button>
        <button v-if="canReissueTerms" type="button" class="button secondary" :disabled="busyTask === 'terms-reissue'" @click="reissueTerms">{{ busyTask === 'terms-reissue' ? 'Issuing…' : `Issue ${nextTermsVersion}` }}</button>
      </div>
      <p class="terms-note"><Icon name="shield" :size="15" />The portal gate checks this exact version; a rejection or change request keeps the prior decision in history and holds commencement.</p>
    </section>

    <section v-if="notifications.length" class="panel notification-panel"><div class="panel-heading"><div><span class="eyebrow">Synthetic outbox</span><h2>Handoffs and notifications</h2></div><span class="muted-label">No message leaves this browser</span></div><div class="notification-list"><article v-for="item in notifications" :key="item.id" class="notification-row"><span class="notification-icon"><Icon :name="item.channel === 'PORTAL' ? 'message' : 'send'" :size="17" /></span><div><strong>{{ item.reference }}</strong><p>{{ item.preview }}</p><small>{{ item.channel }} · {{ item.state }} · {{ item.correlationId }}</small></div><StatusPill :label="item.state" tone="neutral" /></article></div><div class="prototype-note inline-note"><Icon name="info" :size="15" /><span>Outbound email/WhatsApp is represented as a queued simulation with recipient persona, reference, timestamp and correlation ID.</span></div></section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Prototype boundary</strong> This workspace demonstrates role-aware handoffs with fictional QAR values. It never sends an email, creates a real account, or makes a professional decision for a user.</span></div>
  </div>
</template>
