<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import SharedPipelineStatus from '../components/SharedPipelineStatus.vue'
import SharedTasks from '../components/SharedTasks.vue'
import SharedTimeline from '../components/SharedTimeline.vue'
import { loadDemoSession } from '../auth.js'
import { pipelineStages } from '../pipelineData.js'
import {
  SHARED_ENGAGEMENT_ID,
  getDemoMe,
  getSharedArtifacts,
  getSharedOutbox,
  getSharedPbc,
  idempotencyKey,
  isSharedDemoEnabled,
} from '../sharedDemo.js'
import { useSharedEngagement } from '../composables/useSharedEngagement.js'

const emit = defineEmits(['navigate'])

const actionDefinitions = [
  { key: 'SUBMIT_CLIENT_DETAILS', label: 'Submit client details', icon: 'users', roles: ['client', 'admin'], help: 'Creates the shared profile and routes acceptance to the Partner.', fields: [['legalName', 'Company name', 'Northstar Trading W.L.L.'], ['registration', 'Registration number', 'CR-SIM-0018'], ['contactName', 'Contact name', 'Nadia Faris'], ['contactEmail', 'Contact email', 'nadia@northstar.demo'], ['phone', 'Phone', '+974 5555 0180'], ['servicePeriod', 'Reporting period', 'FY2026'], ['serviceRequested', 'Requested service', 'Statutory audit'], ['context', 'Business notes', 'Synthetic onboarding submission for the shared walkthrough.']] },
  { key: 'ACCEPT_CLIENT', label: 'Record acceptance decision', icon: 'check-circle', roles: ['partner', 'admin'], help: 'Binds the Partner decision and rationale to the current engagement revision.', fields: [['decision', 'Decision (ACCEPT / DECLINE / ESCALATE)', 'ACCEPT'], ['rationale', 'Rationale', 'Synthetic independence and capability checks completed.']] },
  { key: 'RECORD_ESTIMATE', label: 'Record cost estimate', icon: 'calculator', roles: ['finance', 'admin'], help: 'Stores hours, internal cost and advance requirement for Finance review.', fields: [['estimateHours', 'Estimated hours', '140'], ['estimateCost', 'Estimated cost (QAR)', '26000.00'], ['advanceRequired', 'Advance required (QAR)', '9000.00']] },
  { key: 'APPROVE_FEE', label: 'Approve fee and quote', icon: 'file', roles: ['partner', 'admin'], help: 'Issues the quotation and exact Engagement Letter version.', fields: [['approvedFee', 'Approved fee (QAR)', '36000.00']] },
  { key: 'RESPOND_EL', label: 'Respond to Engagement Letter', icon: 'file', roles: ['client-management', 'admin'], help: 'Records management acceptance or rejection against the exact EL version.', fields: [['decision', 'Decision (ACCEPT / REJECT)', 'ACCEPT'], ['version', 'Exact EL version', 'EL-2026-01'], ['rationale', 'Rationale (required for rejection)', 'Synthetic management approval of the exact scope and responsibilities.']] },
  { key: 'VERIFY_ADVANCE', label: 'Verify advance payment', icon: 'check-circle', roles: ['finance', 'admin'], help: 'Stores the synthetic QAR 9,000 payment reference once.', fields: [['reference', 'Synthetic payment reference', 'PAY-SIM-0018']] },
  { key: 'ISSUE_TEMP_CREDENTIAL', label: 'Issue temporary credential', icon: 'key', roles: ['partner', 'admin'], help: 'Returns a one-time password; only a SHA-256 hash is stored in D1.', fields: [] },
  { key: 'ACTIVATE_PORTAL', label: 'Complete portal activation', icon: 'key', roles: ['client', 'client-management', 'admin'], help: 'Completes first-login setup and activates the scoped client workspace.', fields: [] },
  { key: 'ISSUE_ANNOUNCEMENT', label: 'Issue audit announcement', icon: 'calendar', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Publishes the start notice and creates a portal notification.', fields: [['subject', 'Announcement subject', 'Audit announcement · Northstar Trading · FY2026'], ['plannedDates', 'Planned dates', '06–24 October 2026']] },
  { key: 'CREATE_PBC_REQUEST', label: 'Create PBC request', icon: 'inbox', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Creates a request with acceptance criteria and a client task.', fields: [['title', 'Request title', 'Bank confirmations and October statements'], ['description', 'Description', 'Provide the synthetic bank support pack for the FY2026 audit.'], ['category', 'Document category', 'Banking'], ['period', 'Reporting period', 'FY2026'], ['dueDate', 'Due date', '2026-10-10'], ['clientOwner', 'Client owner', 'Nadia Faris'], ['reviewer', 'Reviewer', 'Audit Senior'], ['acceptanceCriteria', 'Acceptance criteria', 'Entity, period, completeness and readable source.']] },
  { key: 'SUBMIT_PBC_RECEIPT', label: 'Submit PBC receipt', icon: 'upload', roles: ['client', 'admin'], help: 'Stores metadata only: no binary file leaves the browser in this demo.', fields: [['requestId', 'PBC request ID', 'PBC-REQUEST-ID'], ['fileName', 'File name / hard-copy label', 'bank-support-fy2026.xlsx'], ['fileSize', 'File size in bytes (0 for hard copy)', '24800'], ['mimeType', 'MIME type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['syntheticHash', 'Synthetic hash', 'sha256:demo-bank-support-0018'], ['comment', 'Comment', 'Synthetic receipt uploaded for review.'], ['hardCopy', 'Hard copy? (true / false)', 'false']] },
  { key: 'RESPOND_PBC_RECEIPT', label: 'Review PBC receipt', icon: 'check-circle', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Accepts the receipt or requests a clarification with a durable note.', fields: [['receiptId', 'Receipt ID', 'RECEIPT-ID'], ['decision', 'Decision (ACCEPT / CLARIFY)', 'ACCEPT'], ['note', 'Review note', 'Synthetic receipt meets the stated acceptance criteria.']] },
  { key: 'RECORD_TB_SOURCE', label: 'Record trial balance source', icon: 'calculator', roles: ['accountant', 'accounting-reviewer', 'preparer', 'client', 'admin'], help: 'Stores the balanced TB source version and mapping status in D1.', fields: [['sourceId', 'Source ID', 'TB-BASELINE-001'], ['sourceVersion', 'Source version', 'v03'], ['period', 'Reporting period', 'FY2026'], ['currency', 'Currency', 'QAR'], ['rowCount', 'Row count', '14'], ['debitTotal', 'Debit total', '1250000.00'], ['creditTotal', 'Credit total', '1250000.00'], ['validationState', 'Validation state', 'VALIDATED'], ['mappingComplete', 'Mapping complete? (true / false)', 'true'], ['replacesVersion', 'Replaces version (optional)', 'v02']] },
  { key: 'SUBMIT_WORKPAPER', label: 'Submit workpaper', icon: 'clipboard', roles: ['preparer', 'audit-senior', 'admin'], help: 'Submits a versioned procedure and routes it to the Manager review queue.', fields: [['procedureTitle', 'Procedure title', 'Revenue completeness test'], ['evidenceReference', 'Evidence reference', 'WP-EVIDENCE-SIM-0018'], ['conclusion', 'Conclusion', 'Synthetic procedure completed with no unresolved exception.'], ['workpaperId', 'Existing workpaper ID (optional)', '']] },
  { key: 'CREATE_REVIEW_POINT', label: 'Raise review point', icon: 'warning', roles: ['audit-manager', 'partner', 'admin'], help: 'Creates a review point attached to a submitted workpaper.', fields: [['workpaperId', 'Workpaper ID', 'WP-ID'], ['severity', 'Severity (STANDARD / SIGNIFICANT)', 'STANDARD'], ['owner', 'Owner', 'ACT-JUNIOR'], ['detail', 'Review point', 'Synthetic reviewer note requiring evidence linkage.']] },
  { key: 'CLEAR_REVIEW_POINT', label: 'Clear review point', icon: 'check-circle', roles: ['audit-manager', 'partner', 'admin'], help: 'Clears a point only when the Worker confirms separation of duties.', fields: [['reviewId', 'Review point ID', 'REVIEW-ID'], ['response', 'Response', 'Synthetic response reviewed and accepted by a separate reviewer.']] },
  { key: 'PUBLISH_DRAFT_FS', label: 'Publish Draft FS', icon: 'file', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Publishes the exact Draft FS version and creates a management response task.', fields: [['summary', 'Conclusion summary', 'Synthetic Draft FS prepared from the validated source.']] },
  { key: 'RESPOND_DRAFT_FS', label: 'Respond to Draft FS', icon: 'message', roles: ['client-management', 'admin'], help: 'Records management acceptance, rejection or revision against the exact version.', fields: [['decision', 'Decision (ACCEPT / REJECT / REVISION)', 'ACCEPT'], ['version', 'Exact Draft FS version', 'v01'], ['explanation', 'Explanation', 'Synthetic management response to the exact draft version.']] },
  { key: 'COMPLETE_EQR', label: 'Complete EQR', icon: 'shield', roles: ['eqr', 'admin'], help: 'Records the independent quality review that gates release.', fields: [['decision', 'Decision (APPROVE / RETURN / HOLD)', 'APPROVE'], ['candidateId', 'Candidate version', 'v01'], ['note', 'Note', 'Synthetic EQR review completed against the release candidate.']] },
  { key: 'RECORD_AUDIT_OPINION', label: 'Record audit opinion', icon: 'shield', roles: ['partner', 'admin'], help: 'Binds the Partner opinion to the latest published Draft FS.', fields: [['opinionType', 'Opinion (UNMODIFIED / QUALIFIED / ADVERSE / DISCLAIMER)', 'UNMODIFIED'], ['candidateVersion', 'Candidate version', 'v01'], ['rationale', 'Rationale', 'Synthetic opinion based on completed procedures and review evidence.']] },
  { key: 'RELEASE_FINAL_REPORT', label: 'Release final report', icon: 'lock', roles: ['partner', 'admin'], help: 'Publishes the final report and FS pair and queues the Finance invoice task.', fields: [['rationale', 'Release rationale', 'Synthetic release after completion and required EQR approval.']] },
  { key: 'CREATE_INVOICE', label: 'Generate final invoice', icon: 'calculator', roles: ['finance', 'admin'], help: 'Stores actual hours/cost and queues simulated email, WhatsApp and portal notifications.', fields: [['actualHours', 'Actual hours', '156'], ['actualCost', 'Actual cost (QAR)', '28700.00']] },
  { key: 'CLOSE_ENGAGEMENT', label: 'Close commercial record', icon: 'archive', roles: ['finance', 'admin'], help: 'Closes the commercial record only after the invoice exists; archive completion alone is not enough.', fields: [] },
]

const engagementId = SHARED_ENGAGEMENT_ID
const sharedEnabled = isSharedDemoEnabled
const currentUser = ref(loadDemoSession())
const serverSession = ref(null)
const selectedAction = ref('')
const form = ref({})
const busy = ref(false)
const actionMessage = ref(null)
const artifacts = ref([])
const outbox = ref([])
const pbc = ref({ requests: [], receipts: [] })

const { engagement, tasks, events, generationChanged, loading, error, lastSync, runAction, refresh } = useSharedEngagement(() => engagementId, { assignee: '' })
const availableActions = computed(() => actionDefinitions.filter((item) => item.roles.includes(currentUser.value?.role) || currentUser.value?.role === 'admin'))
const activeAction = computed(() => actionDefinitions.find((item) => item.key === selectedAction.value) || availableActions.value[0] || null)
const isClosed = computed(() => String(engagement.value?.gStatus?.commercialClose || '').toUpperCase() === 'CLOSED')
const stageLabel = computed(() => {
  const match = String(engagement.value?.currentStage || '').match(/STAGE-(\d{2})/)
  return pipelineStages[Number(match?.[1] || 1) - 1]?.title || 'Client details & acceptance'
})

function setAction(key) {
  selectedAction.value = key
  const definition = actionDefinitions.find((item) => item.key === key)
  const next = {}
  for (const [field, _label, placeholder] of definition?.fields || []) next[field] = placeholder
  form.value = next
  actionMessage.value = null
}

function navigate(route) { emit('navigate', route) }

async function refreshExtras() {
  if (!sharedEnabled) return
  const [artifactResult, outboxResult, pbcResult, meResult] = await Promise.all([getSharedArtifacts(engagementId), getSharedOutbox(engagementId), getSharedPbc(engagementId), getDemoMe()])
  if (artifactResult.ok) artifacts.value = artifactResult.artifacts || []
  if (outboxResult.ok) outbox.value = outboxResult.messages || []
  if (pbcResult.ok) pbc.value = { requests: pbcResult.requests || [], receipts: pbcResult.receipts || [] }
  if (meResult.ok) serverSession.value = meResult.session
}

async function submitAction() {
  if (!activeAction.value || busy.value) return
  busy.value = true
  actionMessage.value = null
  const payload = { ...form.value, idempotencyKey: idempotencyKey(activeAction.value.key.toLowerCase()) }
  if (['ACCEPT_CLIENT'].includes(activeAction.value.key) && engagement.value?.revision) payload.expectedRevision = engagement.value.revision
  const result = await runAction(activeAction.value.key, payload)
  busy.value = false
  if (result.ok) {
    actionMessage.value = { ok: true, text: `${activeAction.value.label} committed to the shared D1 demo record.` }
    await refreshExtras()
  } else {
    actionMessage.value = { ok: false, text: `${activeAction.value.label} was not committed: ${result.error?.message || result.error?.code || 'Worker rejected the request.'}` }
  }
}

function formatTime(value) {
  const date = new Date(String(value || '').replace(' ', 'T') + (String(value || '').includes('Z') ? '' : 'Z'))
  return Number.isNaN(date.getTime()) ? String(value || '') : new Intl.DateTimeFormat('en-QA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

onMounted(async () => {
  setAction(availableActions.value[0]?.key || '')
  await refreshExtras()
})
watch(availableActions, (items) => {
  if (!selectedAction.value && items[0]) setAction(items[0].key)
})
</script>

<template>
  <div class="page shared-demo-page">
    <PageHeader eyebrow="DEMO-INTERACTIVE-001 · Cloudflare shared walkthrough" title="Run the shared audit workflow" description="Use this control room to commit one synthetic action at a time. Cloudflare Worker validates the persona and scope, D1 stores the state, and every other open role sees the handoff through the live pipeline, queue and timeline." />

    <section v-if="!sharedEnabled" class="panel shared-demo-disabled">
      <Icon name="info" :size="20" /><div><h2>Shared mode is not enabled in this build</h2><p>This local preview remains browser-local. Deploy the production Pages build with the isolated synthetic flags to exercise the Worker-backed flow.</p></div>
    </section>

    <section v-else class="shared-demo-scope panel">
      <div class="shared-demo-scope-copy"><span class="eyebrow">Current shared scope</span><h2>Northstar Trading W.L.L. · FY2026</h2><p><strong>{{ currentUser?.roleLabel || 'Demo persona' }}</strong> · engagement <code>{{ engagementId }}</code> · server actor <code>{{ serverSession?.actorId || 'session pending' }}</code></p></div>
      <div class="shared-demo-scope-stats"><div><span>Current stage</span><strong>{{ stageLabel }}</strong><small>{{ engagement?.currentStage || 'Loading…' }}</small></div><div><span>Revision</span><strong>{{ engagement?.revision || '—' }}</strong><small>{{ isClosed ? 'Commercial record closed' : 'Every action increments the revision' }}</small></div><StatusPill :label="isClosed ? 'COMPLETE' : loading ? 'SYNCING' : error ? 'API ERROR' : 'LIVE · D1'" :tone="isClosed ? 'good' : error ? 'danger' : 'neutral'" /></div>
    </section>

    <div v-if="generationChanged" class="permission-notice" role="status"><Icon name="refresh" :size="17" />Another authorized presenter reset the shared generation. Refresh this page before committing a new action.</div>
    <div v-if="error" class="guide-status-message" role="status">Shared reads are unavailable ({{ error.code }}). No action will be reported as committed until the Worker responds.</div>

    <SharedPipelineStatus v-if="sharedEnabled" :engagement-id="engagementId" @navigate="navigate" />

    <section v-if="sharedEnabled" class="shared-demo-action-layout">
      <article class="panel shared-action-panel">
        <div class="panel-heading"><div><span class="eyebrow">Worker command surface</span><h2>Choose the next action</h2></div><span class="muted-label">{{ availableActions.length }} action{{ availableActions.length === 1 ? '' : 's' }} available for this persona</span></div>
        <p class="panel-copy">Follow the order shown in the pipeline. A denied action names the missing role, scope or prerequisite; it never changes the shared record.</p>
        <div class="shared-action-picker"><button v-for="item in availableActions" :key="item.key" type="button" class="shared-action-option" :class="{ active: activeAction?.key === item.key }" @click="setAction(item.key)"><Icon :name="item.icon" :size="16" /><span><strong>{{ item.label }}</strong><small>{{ item.key }}</small></span></button></div>
        <form v-if="activeAction" class="shared-action-form" @submit.prevent="submitAction">
          <div class="shared-action-heading"><div><span class="eyebrow">{{ activeAction.key }}</span><h3>{{ activeAction.label }}</h3><p>{{ activeAction.help }}</p></div><StatusPill label="Validated server-side" tone="blue" /></div>
          <div v-if="activeAction.fields.length" class="form-grid compact-form-grid"><label v-for="[field, label, placeholder] in activeAction.fields" :key="field" :class="{ 'span-two': field === 'context' || field === 'description' || field === 'acceptanceCriteria' || field === 'rationale' || field === 'conclusion' || field === 'detail' || field === 'explanation' || field === 'note' || field === 'response' }">{{ label }}<textarea v-if="['context', 'description', 'acceptanceCriteria', 'rationale', 'conclusion', 'detail', 'explanation', 'note', 'response', 'comment'].includes(field)" v-model="form[field]" rows="2" :placeholder="placeholder" /><input v-else v-model="form[field]" :placeholder="placeholder" /></label></div>
          <div class="shared-action-submit"><span><Icon name="shield" :size="16" />Synthetic only · no external message or binary file is sent.</span><button type="submit" class="button primary" :disabled="busy || generationChanged">{{ busy ? 'Committing…' : 'Commit shared action' }}<Icon name="arrow-right" :size="16" /></button></div>
        </form>
        <p v-if="actionMessage" class="shared-action-result" :class="actionMessage.ok ? 'success' : 'failure'" role="status"><Icon :name="actionMessage.ok ? 'check-circle' : 'warning'" :size="17" />{{ actionMessage.text }}</p>
      </article>

      <aside class="panel shared-demo-guide-panel">
        <div class="panel-heading"><div><span class="eyebrow">How to demonstrate it</span><h2>Pass the baton</h2></div><Icon name="workflow" :size="18" /></div>
        <ol class="shared-demo-steps"><li><strong>Choose a persona</strong><span>Use the account menu to switch between Client, Senior, Manager, Partner and Finance.</span></li><li><strong>Commit one owned action</strong><span>Use the command surface; the Worker checks role, assignment and current D1 state.</span></li><li><strong>Open another browser</strong><span>Its queue, pipeline and timeline poll the same engagement approximately every five seconds.</span></li><li><strong>Explain the evidence</strong><span>Artifacts and outbox entries show what the portal published or queued without sending anything externally.</span></li></ol>
        <button type="button" class="button secondary full-width" @click="navigate('pipeline')">Open animated explainer <Icon name="arrow-right" :size="16" /></button>
      </aside>
    </section>

    <section v-if="sharedEnabled" class="shared-demo-lower-grid">
      <SharedTasks :engagement-id="engagementId" title="Shared task queue · all roles" />
      <SharedTimeline :engagement-id="engagementId" title="Append-only shared timeline" />
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">Published record metadata</span><h2>Artifacts</h2></div><StatusPill :label="`${artifacts.length} visible`" tone="neutral" /></div><ul v-if="artifacts.length" class="shared-record-list"><li v-for="artifact in artifacts" :key="artifact.document_id"><span><strong>{{ artifact.title || artifact.document_type }}</strong><small>{{ artifact.document_type }} · {{ artifact.version }} · {{ artifact.visibility }}</small></span><StatusPill :label="artifact.state" tone="good" /></li></ul><p v-else class="guide-empty-state">No shared artifacts yet. Published announcements, Draft FS and final outputs appear here as the workflow advances.</p></article>
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">Portal delivery simulation</span><h2>Outbox</h2></div><StatusPill :label="`${outbox.length} queued`" tone="neutral" /></div><ul v-if="outbox.length" class="shared-record-list"><li v-for="message in outbox.slice(0, 8)" :key="message.message_id"><span><strong>{{ message.subject }}</strong><small>{{ message.channel }} · {{ message.recipient }} · {{ message.state }}</small></span><Icon name="send" :size="16" /></li></ul><p v-else class="guide-empty-state">Email, WhatsApp and portal notifications will appear as simulated outbox rows.</p></article>
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">PBC receipt metadata</span><h2>Evidence requests</h2></div><StatusPill :label="`${pbc.requests.length} requests`" tone="neutral" /></div><ul v-if="pbc.requests.length" class="shared-record-list"><li v-for="request in pbc.requests.slice(0, 6)" :key="request.request_id"><span><strong>{{ request.title }}</strong><small>{{ request.request_id }} · {{ request.state }} · {{ request.due_date || 'No due date' }}</small></span><StatusPill :label="request.state" :tone="request.state === 'ACCEPTED' ? 'good' : request.state === 'CLARIFICATION' ? 'danger' : 'warn'" /></li></ul><p v-else class="guide-empty-state">PBC requests and receipt versions will be visible to the assigned client and audit team.</p></article>
    </section>

    <p v-if="sharedEnabled" class="panel-footnote shared-demo-footer"><Icon name="info" :size="16" /><span>Last synced {{ lastSync ? formatTime(lastSync) : 'never' }}. This is a shared synthetic D1 rehearsal: use fictional values only, and treat each professional decision as an explanation of the proposed platform rather than an authorization.</span></p>
  </div>
</template>
