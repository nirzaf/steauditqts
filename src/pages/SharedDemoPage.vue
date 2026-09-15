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
  activeCommandContext,
  createDemoSession,
  createSharedIntent,
  getDemoMe,
  getSharedArtifacts,
  getSharedOutbox,
  getSharedPbc,
  idempotencyKey,
  isSharedDemoEnabled,
} from '../sharedDemo.js'
import { useSharedEngagement } from '../composables/useSharedEngagement.js'
import { useDraftForms } from '../composables/useDraftForms.js'
import { useDemoContext } from '../demoContext.js'

const emit = defineEmits(['navigate'])

const actionDefinitions = [
  { key: 'SUBMIT_CLIENT_DETAILS', label: 'Submit client details', icon: 'users', roles: ['client', 'admin'], help: 'Creates the shared profile and routes acceptance to the Partner.', fields: [['legalName', 'Company name', 'Northstar Trading W.L.L.'], ['registration', 'Registration number', 'CR-0018'], ['contactName', 'Contact name', 'Nadia Faris'], ['contactEmail', 'Contact email', 'nadia@northstar.example'], ['phone', 'Phone', '+974 5555 0180'], ['servicePeriod', 'Reporting period', 'FY2026'], ['serviceRequested', 'Requested service', 'Statutory audit'], ['context', 'Business notes', 'Onboarding information for the current engagement.']] },
  { key: 'ACCEPT_CLIENT', label: 'Record acceptance decision', icon: 'check-circle', roles: ['partner', 'admin'], help: 'Binds the Partner decision and rationale to the current engagement revision.', fields: [['decision', 'Decision (ACCEPT / DECLINE / ESCALATE)', 'ACCEPT'], ['rationale', 'Rationale', 'Independence and capability checks completed.']] },
  { key: 'RECORD_ESTIMATE', label: 'Record cost estimate', icon: 'calculator', roles: ['finance', 'admin'], help: 'Stores hours, internal cost and advance requirement for Finance review.', fields: [['estimateHours', 'Estimated hours', '140'], ['estimateCost', 'Estimated cost (QAR)', '26000.00'], ['advanceRequired', 'Advance required (QAR)', '9000.00']] },
  { key: 'APPROVE_FEE', label: 'Approve fee and quote', icon: 'file', roles: ['partner', 'admin'], help: 'Issues the quotation and exact Engagement Letter version.', fields: [['approvedFee', 'Approved fee (QAR)', '36000.00']] },
  { key: 'RESPOND_EL', label: 'Respond to Engagement Letter', icon: 'file', roles: ['client-management', 'admin'], help: 'Records management acceptance or rejection against the exact EL version.', fields: [['decision', 'Decision (ACCEPT / REJECT)', 'ACCEPT'], ['version', 'Exact EL version', 'EL-2026-01'], ['rationale', 'Rationale (required for rejection)', 'Management approval of the exact scope and responsibilities.']] },
  { key: 'VERIFY_ADVANCE', label: 'Verify advance payment', icon: 'check-circle', roles: ['finance', 'admin'], help: 'Stores the QAR 9,000 payment reference once.', fields: [['reference', 'Payment reference', 'PAY-0018']] },
  { key: 'ISSUE_TEMP_CREDENTIAL', label: 'Issue temporary credential', icon: 'key', roles: ['partner', 'admin'], help: 'Returns a one-time password; only a SHA-256 hash is stored in D1.', fields: [] },
  { key: 'ACTIVATE_PORTAL', label: 'Complete portal activation', icon: 'key', roles: ['client', 'client-management', 'admin'], help: 'Completes first-login setup and activates the scoped client workspace.', fields: [] },
  { key: 'ISSUE_ANNOUNCEMENT', label: 'Issue audit announcement', icon: 'calendar', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Publishes the start notice and creates a portal notification.', fields: [['subject', 'Announcement subject', 'Audit announcement · Northstar Trading · FY2026'], ['plannedDates', 'Planned dates', '06–24 October 2026']] },
  { key: 'CREATE_PBC_REQUEST', label: 'Create PBC request', icon: 'inbox', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Creates a request with acceptance criteria and a client task.', fields: [['title', 'Request title', 'Bank confirmations and October statements'], ['description', 'Description', 'Provide the bank support pack for the FY2026 audit.'], ['category', 'Document category', 'Banking'], ['period', 'Reporting period', 'FY2026'], ['dueDate', 'Due date', '2026-10-10'], ['clientOwner', 'Client owner', 'Nadia Faris'], ['reviewer', 'Reviewer', 'Audit Senior'], ['acceptanceCriteria', 'Acceptance criteria', 'Entity, period, completeness and readable source.']] },
  { key: 'SUBMIT_PBC_RECEIPT', label: 'Submit PBC receipt', icon: 'upload', roles: ['client', 'admin'], help: 'Stores the receipt details with the matching request.', fields: [['requestId', 'PBC request ID', 'PBC-REQUEST-ID'], ['fileName', 'File name / hard-copy label', 'bank-support-fy2026.xlsx'], ['fileSize', 'File size in bytes (0 for hard copy)', '24800'], ['mimeType', 'MIME type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['syntheticHash', 'Receipt hash', 'sha256:bank-support-0018'], ['comment', 'Comment', 'Receipt uploaded for review.'], ['hardCopy', 'Hard copy? (true / false)', 'false']] },
  { key: 'RESPOND_PBC_RECEIPT', label: 'Review PBC receipt', icon: 'check-circle', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Accepts the receipt or requests a clarification with a durable note.', fields: [['receiptId', 'Receipt ID', 'RECEIPT-ID'], ['decision', 'Decision (ACCEPT / CLARIFY)', 'ACCEPT'], ['note', 'Review note', 'Receipt meets the stated acceptance criteria.']] },
  { key: 'RECORD_TB_SOURCE', label: 'Record trial balance source', icon: 'calculator', roles: ['accountant', 'accounting-reviewer', 'preparer', 'client', 'admin'], help: 'Stores the balanced TB source version and mapping status in D1.', fields: [['sourceId', 'Source ID', 'TB-BASELINE-001'], ['sourceVersion', 'Source version', 'v03'], ['period', 'Reporting period', 'FY2026'], ['currency', 'Currency', 'QAR'], ['rowCount', 'Row count', '14'], ['debitTotal', 'Debit total', '1250000.00'], ['creditTotal', 'Credit total', '1250000.00'], ['validationState', 'Validation state', 'VALIDATED'], ['mappingComplete', 'Mapping complete? (true / false)', 'true'], ['replacesVersion', 'Replaces version (optional)', 'v02']] },
  { key: 'SUBMIT_WORKPAPER', label: 'Submit workpaper', icon: 'clipboard', roles: ['preparer', 'audit-senior', 'admin'], help: 'Submits a versioned procedure and routes it to the Manager review queue.', fields: [['procedureTitle', 'Procedure title', 'Revenue completeness test'], ['evidenceReference', 'Evidence reference', 'WP-EVIDENCE-0018'], ['conclusion', 'Conclusion', 'Procedure completed with no unresolved exception.'], ['workpaperId', 'Existing workpaper ID (optional)', '']] },
  { key: 'CREATE_REVIEW_POINT', label: 'Raise review point', icon: 'warning', roles: ['audit-manager', 'partner', 'admin'], help: 'Creates a review point attached to a submitted workpaper.', fields: [['workpaperId', 'Workpaper ID', 'WP-ID'], ['severity', 'Severity (STANDARD / SIGNIFICANT)', 'STANDARD'], ['owner', 'Owner', 'ACT-JUNIOR'], ['detail', 'Review point', 'Reviewer note requiring evidence linkage.']] },
  { key: 'CLEAR_REVIEW_POINT', label: 'Clear review point', icon: 'check-circle', roles: ['audit-manager', 'partner', 'admin'], help: 'Clears a point only when the Worker confirms separation of duties.', fields: [['reviewId', 'Review point ID', 'REVIEW-ID'], ['response', 'Response', 'Response reviewed and accepted by a separate reviewer.']] },
  { key: 'PUBLISH_DRAFT_FS', label: 'Publish Draft FS', icon: 'file', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Publishes the exact Draft FS version and creates a management response task.', fields: [['summary', 'Conclusion summary', 'Draft FS prepared from the validated source.']] },
  { key: 'RESPOND_DRAFT_FS', label: 'Respond to Draft FS', icon: 'message', roles: ['client-management', 'admin'], help: 'Records management acceptance, rejection or revision against the exact version.', fields: [['decision', 'Decision (ACCEPT / REJECT / REVISION)', 'ACCEPT'], ['version', 'Exact Draft FS version', 'v01'], ['explanation', 'Explanation', 'Management response to the exact draft version.']] },
  { key: 'COMPLETE_EQR', label: 'Complete EQR', icon: 'shield', roles: ['eqr', 'admin'], help: 'Records the independent quality review that gates release.', fields: [['decision', 'Decision (APPROVE / RETURN / HOLD)', 'APPROVE'], ['candidateId', 'Candidate version', 'v01'], ['note', 'Note', 'EQR review completed against the release candidate.']] },
  { key: 'RECORD_ASSESSMENT_RESPONSE', label: 'Record assessment response', icon: 'users', roles: ['client', 'client-management', 'preparer', 'audit-senior', 'audit-manager', 'partner', 'compliance', 'admin'], help: 'Records one shared evaluation answer against the canonical bank; holds recompute immediately.', fields: [['questionId', 'Question ID (e.g. CE-011)', 'CE-011'], ['answer', 'Answer (YES / NO)', 'YES'], ['applicability', 'Applicability', 'APPLICABLE'], ['explanation', 'Explanation / evidence', 'UBO declaration verified against registry.']] },
  { key: 'UPDATE_ACCOUNTING_STATUS', label: 'Update accounting tracker', icon: 'calculator', roles: ['accountant', 'accounting-reviewer', 'preparer', 'admin'], help: 'Updates reconciliations, journals and the FS package on the shared tracker.', fields: [['recon_state', 'Recon state', 'IN_PROGRESS'], ['open_recon_count', 'Open recons', '1'], ['journal_state', 'Journal state', 'PENDING'], ['pending_journal_count', 'Pending journals', '1'], ['fs_version', 'FS version', 'FS-v04'], ['fs_state', 'FS state', 'IN_REVIEW']] },
  { key: 'APPROVE_ACCOUNTING_FS', label: 'Approve accounting package', icon: 'check-circle', roles: ['client-management', 'admin'], help: 'Records management approval of the shared accounting FS package.', fields: [['decision', 'Decision (ACCEPT / REJECT)', 'ACCEPT'], ['explanation', 'Explanation', 'Package agreed for audit handoff.']] },
  { key: 'EVALUATE_ACCOUNTING_INPUT', label: 'Evaluate accounting input', icon: 'refresh', roles: ['audit-senior', 'audit-manager', 'admin'], help: 'Marks the current accounting input generation evaluated by audit.', fields: [] },
  { key: 'RECORD_MANAGER_COMPLETION', label: 'Recommend completion', icon: 'check-circle', roles: ['audit-manager', 'admin'], help: 'Records the manager completion recommendation with the evaluated input generation.', fields: [['decision', 'Decision (RECOMMEND_COMPLETE / RETURN_TO_TEAM / HOLD)', 'RECOMMEND_COMPLETE'], ['rationale', 'Rationale', 'File reviewed; workpapers submitted and points cleared.']] },
  { key: 'RECORD_PARTNER_REVIEW', label: 'Partner completion review', icon: 'shield', roles: ['partner', 'admin'], help: 'Records partner approval of the file for opinion.', fields: [['decision', 'Decision (APPROVE_FOR_OPINION / RETURN_TO_MANAGER / HOLD)', 'APPROVE_FOR_OPINION'], ['rationale', 'Rationale', 'Completion recommendation reviewed against the current input.']] },
  { key: 'SUBMIT_AUDIT_FILE', label: 'Submit audit file', icon: 'upload', roles: ['audit-senior', 'preparer'], help: 'Submits the current file manifest and routes it to the Manager review queue.', fields: [['fileId', 'File / manifest ID (optional)', 'AUDIT-FILE-0018'], ['procedureTitle', 'Submission title', 'FY2026 audit file manifest'], ['evidenceReference', 'Evidence reference', 'WP-EVIDENCE-SIM-0018'], ['conclusion', 'Conclusion', 'Submitted for manager review against the current generation.']] },
  { key: 'RECOMMEND_COMPLETION', label: 'Recommend completion', icon: 'check-circle', roles: ['audit-manager'], help: 'Hands the submitted file to the Partner with an explicit recommendation.', fields: [['rationale', 'Rationale', 'File reviewed; submitted work and review points are current.']] },
  { key: 'RETURN_TO_TEAM', label: 'Return file to team', icon: 'undo', roles: ['audit-manager'], help: 'Creates a correction loop and records why the current file cannot proceed.', fields: [['rationale', 'Correction reason', 'Add the missing evidence reference and resubmit the affected workpaper.']] },
  { key: 'REVIEW_PARTNER_COMPLETION', label: 'Review partner completion', icon: 'shield', roles: ['partner'], help: 'Approves the manager handoff for opinion formation.', fields: [['rationale', 'Rationale', 'Manager completion reviewed against the current candidate.']] },
  { key: 'RETURN_TO_MANAGER', label: 'Return to manager', icon: 'undo', roles: ['partner'], help: 'Returns the manager handoff with a durable correction reason.', fields: [['rationale', 'Correction reason', 'Please address the open completion item and resubmit.']] },
  { key: 'RECORD_FINAL_DISCUSSION', label: 'Record final discussion', icon: 'message', roles: ['partner', 'admin'], help: 'Records the final client discussion after the opinion.', fields: [['date', 'Date', '2026-09-20'], ['attendees', 'Attendees', 'Maya Rahman, Nadia Faris'], ['topics', 'Topics', 'Opinion, adjustments, subsequent events'], ['outcome', 'Outcome', 'No outstanding matters.']] },
  { key: 'RECORD_AUDIT_OPINION', label: 'Record audit opinion', icon: 'shield', roles: ['partner', 'admin'], help: 'Binds the Partner opinion to the latest published Draft FS.', fields: [['opinionType', 'Opinion (UNMODIFIED / QUALIFIED / ADVERSE / DISCLAIMER)', 'UNMODIFIED'], ['candidateVersion', 'Candidate version', 'v01'], ['rationale', 'Rationale', 'Opinion based on completed procedures and review evidence.']] },
  { key: 'RELEASE_FINAL_REPORT', label: 'Release final report', icon: 'lock', roles: ['partner', 'admin'], help: 'Publishes the final report and FS pair and queues the Finance invoice task.', fields: [['rationale', 'Release rationale', 'Release after completion and required EQR approval.']] },
  { key: 'VERIFY_RELEASE_CHECKPOINT', label: 'Verify release checkpoint', icon: 'shield', roles: ['records'], help: 'Verifies the exact final report and FS pair before delivery/archive.', fields: [['releaseId', 'Release decision ID', 'RELEASE-ID'], ['note', 'Checkpoint note', 'Final report and financial statements pair reconciled to the release event.']] },
  { key: 'DELIVER_FINAL_REPORT', label: 'Deliver final report', icon: 'send', roles: ['partner'], help: 'Makes the exact checkpointed report and financial statements visible to the client and records the delivery event.', fields: [['releaseId', 'Release decision ID', 'RELEASE-ID'], ['note', 'Delivery note', 'Delivered the checkpointed final report and financial statements to the client portal.']] },
  { key: 'ASSEMBLE_ARCHIVE', label: 'Assemble archive', icon: 'archive', roles: ['records'], help: 'Assembles the protected manifest after delivery; this does not close Finance.', fields: [['releaseId', 'Release decision ID', 'RELEASE-ID'], ['checkpointId', 'Checkpoint ID (optional)', 'CHECKPOINT-ID'], ['note', 'Archive note', 'Archive manifest assembled from the delivered release checkpoint.']] },
  { key: 'CREATE_INVOICE', label: 'Generate final invoice', icon: 'calculator', roles: ['finance', 'admin'], help: 'Stores actual hours/cost and queues simulated email, WhatsApp and portal notifications.', fields: [['actualHours', 'Actual hours', '156'], ['actualCost', 'Actual cost (QAR)', '28700.00']] },
  { key: 'CLOSE_ENGAGEMENT', label: 'Close commercial record', icon: 'archive', roles: ['finance', 'admin'], help: 'Closes the commercial record only after the invoice exists; archive completion alone is not enough.', fields: [] },
]

// Phase C — the Control Room follows the global demo context like every
// other page; it stays the presenter/QA command surface.
const { activeEngagementId: demoActiveEngagementId, allowedActions: sharedAllowedActions } = useDemoContext()
const engagementId = computed(() => demoActiveEngagementId.value || SHARED_ENGAGEMENT_ID)
const sharedEnabled = isSharedDemoEnabled
const currentUser = ref(loadDemoSession())
const serverSession = ref(null)
const selectedAction = ref('')
const form = ref({})
const busy = ref(false)
const actionMessage = ref(null)
const lastActionResponse = ref(null)
const artifacts = ref([])
const outbox = ref([])
const pbc = ref({ requests: [], receipts: [] })

// M7 STATE-03 — allow-listed free-text fields only; never decision values,
// tokens or gate state. formId is the action key so drafts never inherit
// across actions.
const FREE_TEXT_FIELDS = ['context', 'description', 'acceptanceCriteria', 'rationale', 'conclusion', 'detail', 'explanation', 'note', 'response', 'comment', 'attendees', 'topics', 'outcome', 'subject', 'plannedDates', 'procedureTitle', 'evidenceReference', 'summary', 'title']
const draftForms = useDraftForms(Object.fromEntries(actionDefinitions.map((item) => [item.key, FREE_TEXT_FIELDS])))
const draftStatus = ref(null)
const draftPrompt = ref(null)
const pendingIntent = ref(null)
let draftTimer = null

function draftScope(formId) {
  return {
    runId: 'm7-demo',
    generationId: String(engagement.value?.generationId || ''),
    actorId: String(serverSession.value?.actorId || currentUser.value?.id || ''),
    engagementId: String(engagementId.value || ''),
    formId: String(formId || ''),
  }
}

function fieldPlaceholder(field) {
  return activeAction.value?.fields?.find(([name]) => name === field)?.[2] ?? null
}

function restoreDraft(actionKey) {
  if (!draftForms || !actionKey) return
  const scope = draftScope(actionKey)
  const revision = Number(engagement.value?.revision || 0)
  if (!scope.generationId || !scope.actorId || revision < 1) return
  const loaded = draftForms.restore(scope, revision)
  if (!loaded.ok) {
    draftStatus.value = { error: loaded.message || 'Draft storage failed.' }
    return
  }
  if (loaded.outcome !== 'DRAFT_LOADED' || !loaded.draft) return
  const definition = actionDefinitions.find((item) => item.key === actionKey)
  const freeFields = (definition?.fields || []).filter(([field]) => FREE_TEXT_FIELDS.includes(field)).map(([field]) => field)
  const applicable = Object.fromEntries(Object.entries(loaded.draft.values || {}).filter(([key]) => freeFields.includes(key)))
  if (!Object.keys(applicable).length) return
  if (loaded.stale) {
    // Never auto-resubmit or auto-apply across revisions: the presenter
    // decides explicitly (M7 STATE-03 reconciliation prompt).
    draftPrompt.value = { values: applicable, baseRevision: loaded.draft.baseRevision, currentRevision: revision }
    return
  }
  const next = { ...form.value }
  let applied = false
  for (const [key, value] of Object.entries(applicable)) {
    if (next[key] !== fieldPlaceholder(key)) continue // the presenter already edited this field
    next[key] = value
    applied = true
  }
  if (!applied) return
  form.value = next
  draftStatus.value = { savedAt: loaded.draft.savedAt }
}

function keepStaleDraft() {
  const prompt = draftPrompt.value
  draftPrompt.value = null
  if (!prompt || !activeAction.value) return
  const next = { ...form.value }
  for (const [key, value] of Object.entries(prompt.values)) next[key] = value
  form.value = next
  draftStatus.value = null
}

function discardStaleDraft() {
  draftPrompt.value = null
  if (!draftForms || !activeAction.value) return
  const removed = draftForms.clear(draftScope(activeAction.value.key))
  draftStatus.value = removed.ok ? null : { error: removed.message || 'Draft storage failed.' }
}

const { engagement, tasks, events, generationChanged, loading, error, lastSync, runAction, refresh } = useSharedEngagement(() => engagementId.value, { assignee: '' })
const availableActions = computed(() => {
  // In shared mode the Worker owns the action allow-list.  The local role
  // labels are only a compatibility fallback while an older Worker is being
  // upgraded; an empty server list is intentionally treated as read-only,
  // never as permission to expose every presenter action.
  if (sharedEnabled) {
    const keys = Array.isArray(sharedAllowedActions.value) ? sharedAllowedActions.value : []
    return actionDefinitions.filter((item) => keys.includes(item.key))
  }
  return []
})
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
  lastActionResponse.value = null
  pendingIntent.value = null
  draftStatus.value = null
  draftPrompt.value = null
}

function navigate(route) { emit('navigate', route) }

async function refreshExtras() {
  if (!sharedEnabled) return
  const [artifactResult, outboxResult, pbcResult] = await Promise.all([getSharedArtifacts(engagementId.value), getSharedOutbox(engagementId.value), getSharedPbc(engagementId.value)])
  let meResult = await getDemoMe()
  // A first visit can race the App-level session bootstrap. Retry once by
  // minting the same allow-listed persona session; no role is accepted from
  // the browser and the Worker still decides the actor.
  if (!meResult.ok && currentUser.value?.id) {
    await createDemoSession(currentUser.value.id)
    meResult = await getDemoMe()
  }
  if (artifactResult.ok) artifacts.value = artifactResult.artifacts || []
  if (outboxResult.ok) outbox.value = outboxResult.messages || []
  if (pbcResult.ok) pbc.value = { requests: pbcResult.requests || [], receipts: pbcResult.receipts || [] }
  if (meResult.ok) serverSession.value = meResult.session
}

async function submitAction() {
  if (!activeAction.value || busy.value) return
  busy.value = true
  actionMessage.value = null
  const actionKey = activeAction.value.key
  const payload = { ...form.value }
  if (['ACCEPT_CLIENT'].includes(actionKey) && engagement.value?.revision) payload.expectedRevision = engagement.value.revision
  const signature = JSON.stringify([actionKey, ...Object.entries(form.value).map(([key, value]) => `${key}=${String(value ?? '')}`)])
  // M7 APPROVAL-03 — one stable intent per user action: retrying the exact
  // same action after an unconfirmed result re-sends the SAME idempotency key.
  let intent = pendingIntent.value
  if (!intent || intent.signature !== signature || !intent.intent.canRetry()) {
    intent = null
    const context = activeCommandContext(engagementId.value)
    if (context) {
      const targetId = String(payload.targetId || payload.candidateId || payload.workpaperId || payload.requestId || context.engagementId)
      intent = { signature, intent: createSharedIntent(context, actionKey, targetId, payload) }
    }
  }
  const result = intent
    ? await intent.intent.send()
    : await runAction(actionKey, { ...payload, idempotencyKey: idempotencyKey(actionKey.toLowerCase()) })
  busy.value = false
  if (result.ok) {
    pendingIntent.value = null
    actionMessage.value = { ok: true, tone: 'committed', text: `${activeAction.value.label} saved to the shared engagement record.` }
    lastActionResponse.value = Object.fromEntries(Object.entries(result).filter(([key]) => !['ok', 'evidenceLevel'].includes(key)))
    if (draftForms) {
      const cleared = draftForms.clear(draftScope(actionKey))
      draftStatus.value = cleared.ok ? null : { error: cleared.message || 'Draft storage failed.' }
    }
    if (intent) await refresh()
    await refreshExtras()
    return
  }
  const status = Number(result.error?.status || 0)
  const uncertain = String(result.outcome || '').toUpperCase() === 'UNCERTAIN'
    || result.error?.code === 'COMMIT_UNCONFIRMED' || result.error?.code === 'NETWORK_UNAVAILABLE'
    || !status || status >= 500
  if (uncertain) {
    // Keep the intent so "Retry same request" re-sends the SAME key.
    if (intent?.intent.canRetry()) pendingIntent.value = intent
    actionMessage.value = { ok: false, tone: 'uncertain', text: `${activeAction.value.label} could not be confirmed — it was not committed and not rejected. ${result.guidance || 'Retry this same request; do not create a new intent.'}` }
    lastActionResponse.value = { outcome: 'UNCERTAIN', error: result.error, guidance: result.guidance || null }
    return
  }
  pendingIntent.value = null
  actionMessage.value = { ok: false, tone: 'rejected', text: `${activeAction.value.label} was not committed: ${result.error?.message || result.error?.code || 'Worker rejected the request.'}` }
  lastActionResponse.value = { outcome: 'REJECTED', error: result.error }
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

// Debounced local-draft save for the current action form (free-text fields only).
watch(form, (values) => {
  if (!draftForms || !activeAction.value || draftPrompt.value) return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    const revision = Number(engagement.value?.revision || 0)
    const scope = draftScope(activeAction.value.key)
    if (revision < 1 || !scope.generationId || !scope.actorId) return
    const subset = {}
    for (const [field, value] of Object.entries(values || {})) {
      if (!FREE_TEXT_FIELDS.includes(field) || typeof value !== 'string' || !value.trim()) continue
      if (value === fieldPlaceholder(field)) continue
      subset[field] = value
    }
    if (!Object.keys(subset).length) {
      const removed = draftForms.clear(scope)
      draftStatus.value = removed.ok ? null : { error: removed.message || 'Draft storage failed.' }
      return
    }
    const saved = draftForms.save(scope, subset, revision)
    draftStatus.value = saved.ok ? { savedAt: saved.savedAt } : { error: saved.message || 'Draft storage failed.' }
  }, 500)
}, { deep: true })

// Restore a saved draft once the shared context (generation/revision) and the
// selected action are both known — including after the first poll.
watch(() => [selectedAction.value, engagement.value?.generationId, engagement.value?.revision], ([actionKey]) => {
  const revision = Number(engagement.value?.revision || 0)
  if (actionKey && revision >= 1) restoreDraft(actionKey)
})
</script>

<template>
  <div class="page shared-demo-page">
    <PageHeader eyebrow="WORKFLOW CONTROL ROOM" title="Run the shared audit workflow" description="Use this control room to follow the next action. The platform validates role and scope, then every open role sees the handoff through the pipeline, queue, and timeline." />

    <section v-if="!sharedEnabled" class="panel shared-demo-disabled">
      <Icon name="info" :size="20" /><div><h2>Shared workspace unavailable</h2><p>Reconnect to continue with the current engagement workflow.</p></div>
    </section>

    <section v-else class="shared-demo-scope panel">
      <div class="shared-demo-scope-copy"><span class="eyebrow">Current engagement</span><h2>Northstar Trading W.L.L. · FY2026</h2><p><strong>{{ currentUser?.roleLabel || 'Current role' }}</strong> · engagement <code>{{ engagementId }}</code></p></div>
      <div class="shared-demo-scope-stats"><div><span>Current stage</span><strong>{{ stageLabel }}</strong><small>{{ engagement?.currentStage || 'Loading…' }}</small></div><div><span>Revision</span><strong>{{ engagement?.revision || '—' }}</strong><small>{{ isClosed ? 'Commercial record closed' : 'Every action increments the revision' }}</small></div><StatusPill :label="isClosed ? 'COMPLETE' : loading ? 'SYNCING' : error ? 'API ERROR' : 'LIVE · D1'" :tone="isClosed ? 'good' : error ? 'danger' : 'neutral'" /></div>
    </section>

    <div v-if="generationChanged" class="permission-notice" role="status"><Icon name="refresh" :size="17" />Another authorized presenter reset the shared generation. Refresh this page before committing a new action.</div>
    <div v-if="error" class="guide-status-message" role="status">Shared reads are unavailable ({{ error.code }}). No action will be reported as committed until the Worker responds.</div>

    <SharedPipelineStatus v-if="sharedEnabled" :engagement-id="engagementId" @navigate="navigate" />

    <section v-if="sharedEnabled" class="shared-demo-action-layout">
      <article class="panel shared-action-panel">
        <div class="panel-heading"><div><span class="eyebrow">Next action</span><h2>Choose the next step</h2></div><span class="muted-label">{{ availableActions.length }} action{{ availableActions.length === 1 ? '' : 's' }} available for this role</span></div>
        <p class="panel-copy">Follow the order shown in the pipeline. A denied action names the missing role, scope or prerequisite; it never changes the shared record.</p>
        <div class="shared-action-picker"><button v-for="item in availableActions" :key="item.key" type="button" class="shared-action-option" :class="{ active: activeAction?.key === item.key }" @click="setAction(item.key)"><Icon :name="item.icon" :size="16" /><span><strong>{{ item.label }}</strong><small>{{ item.key }}</small></span></button></div>
        <form v-if="activeAction" class="shared-action-form" @submit.prevent="submitAction">
          <div class="shared-action-heading"><div><span class="eyebrow">{{ activeAction.key }}</span><h3>{{ activeAction.label }}</h3><p>{{ activeAction.help }}</p></div><StatusPill label="Validated server-side" tone="blue" /></div>
          <div v-if="activeAction.fields.length" class="form-grid compact-form-grid"><label v-for="[field, label, placeholder] in activeAction.fields" :key="field" :class="{ 'span-two': field === 'context' || field === 'description' || field === 'acceptanceCriteria' || field === 'rationale' || field === 'conclusion' || field === 'detail' || field === 'explanation' || field === 'note' || field === 'response' }">{{ label }}<textarea v-if="['context', 'description', 'acceptanceCriteria', 'rationale', 'conclusion', 'detail', 'explanation', 'note', 'response', 'comment'].includes(field)" v-model="form[field]" rows="2" :placeholder="placeholder" /><input v-else v-model="form[field]" :placeholder="placeholder" /></label></div>
          <div class="shared-action-submit"><span><Icon name="shield" :size="16" />The action stays within the selected engagement and role.</span><button type="submit" class="button primary" :disabled="busy || generationChanged">{{ busy ? 'Saving…' : 'Save action' }}<Icon name="arrow-right" :size="16" /></button></div>
          <p v-if="draftStatus?.savedAt" class="muted-label">Local draft saved · SAVED_LOCAL_DRAFT</p>
          <p v-if="draftStatus?.error" class="shared-action-result failure" role="status"><Icon name="warning" :size="15" />Local draft storage failed: {{ draftStatus.error }}</p>
          <div v-if="draftPrompt" class="permission-notice" role="status"><Icon name="refresh" :size="17" /><span>Draft saved against revision {{ draftPrompt.baseRevision }}; the current revision is {{ draftPrompt.currentRevision }}.</span><button type="button" class="button secondary" @click="keepStaleDraft">Keep draft</button><button type="button" class="button secondary" @click="discardStaleDraft">Discard</button></div>
        </form>
        <p v-if="actionMessage" class="shared-action-result" :class="actionMessage.ok ? 'success' : 'failure'" role="status"><Icon :name="actionMessage.ok ? 'check-circle' : 'warning'" :size="17" />{{ actionMessage.text }}</p>
        <button v-if="actionMessage?.tone === 'uncertain' && pendingIntent" type="button" class="button secondary" :disabled="busy" @click="submitAction">Retry same request<Icon name="refresh" :size="16" /></button>
        <details v-if="lastActionResponse" class="shared-action-response"><summary>Show Worker response details</summary><pre>{{ JSON.stringify(lastActionResponse, null, 2) }}</pre></details>
      </article>

      <aside class="panel shared-demo-guide-panel">
        <div class="panel-heading"><div><span class="eyebrow">How to demonstrate it</span><h2>Pass the baton</h2></div><Icon name="workflow" :size="18" /></div>
        <ol class="shared-demo-steps"><li><strong>Choose a persona</strong><span>Use the account menu to switch between Client, Senior, Manager, Partner and Finance.</span></li><li><strong>Commit one owned action</strong><span>Use the command surface; the Worker checks role, assignment and current D1 state.</span></li><li><strong>Open another browser</strong><span>Its queue, pipeline and timeline poll the same engagement approximately every five seconds.</span></li><li><strong>Explain the evidence</strong><span>Artifacts and outbox entries show what the portal published or queued without sending anything externally.</span></li></ol>
        <button type="button" class="button secondary full-width" @click="navigate('pipeline')">Open animated explainer <Icon name="arrow-right" :size="16" /></button>
      </aside>
    </section>

    <section v-if="sharedEnabled" class="shared-demo-lower-grid">
      <SharedTasks :engagement-id="engagementId" title="Shared task queue · all roles" @navigate="navigate" />
      <SharedTimeline :engagement-id="engagementId" title="Append-only shared timeline" />
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">Published record metadata</span><h2>Artifacts</h2></div><StatusPill :label="`${artifacts.length} visible`" tone="neutral" /></div><ul v-if="artifacts.length" class="shared-record-list"><li v-for="artifact in artifacts" :key="artifact.document_id"><span><strong>{{ artifact.title || artifact.document_type }}</strong><small>{{ artifact.document_type }} · {{ artifact.version }} · {{ artifact.visibility }}</small></span><StatusPill :label="artifact.state" tone="good" /></li></ul><p v-else class="guide-empty-state">No shared artifacts yet. Published announcements, Draft FS and final outputs appear here as the workflow advances.</p></article>
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">Portal delivery</span><h2>Outbox</h2></div><StatusPill :label="`${outbox.length} queued`" tone="neutral" /></div><ul v-if="outbox.length" class="shared-record-list"><li v-for="message in outbox.slice(0, 8)" :key="message.message_id"><span><strong>{{ message.subject }}</strong><small>{{ message.channel }} · {{ message.recipient }} · {{ message.state }}</small></span><Icon name="send" :size="16" /></li></ul><p v-else class="guide-empty-state">Email, WhatsApp, and portal notifications appear here as the workflow advances.</p></article>
      <article class="panel shared-record-panel"><div class="panel-heading"><div><span class="eyebrow">PBC receipt metadata</span><h2>Evidence requests</h2></div><StatusPill :label="`${pbc.requests.length} requests`" tone="neutral" /></div><ul v-if="pbc.requests.length" class="shared-record-list"><li v-for="request in pbc.requests.slice(0, 6)" :key="request.request_id"><span><strong>{{ request.title }}</strong><small>{{ request.request_id }} · {{ request.state }} · {{ request.due_date || 'No due date' }}</small></span><StatusPill :label="request.state" :tone="request.state === 'ACCEPTED' ? 'good' : request.state === 'CLARIFICATION' ? 'danger' : 'warn'" /></li></ul><p v-else class="guide-empty-state">PBC requests and receipt versions will be visible to the assigned client and audit team.</p></article>
    </section>

    <p v-if="sharedEnabled" class="panel-footnote shared-demo-footer"><Icon name="info" :size="16" /><span>Last synced {{ lastSync ? formatTime(lastSync) : 'never' }}. Each action stays tied to its role, engagement, and approval path.</span></p>
  </div>
</template>
