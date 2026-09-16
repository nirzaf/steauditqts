<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import ActionOutcome from '../components/ActionOutcome.vue'
import { client, formatMoney, practiceJournals, reconciliationAreas, workflowGuides } from '../data'
import { baselineFixture, fixtureRows, mappingSummary, parseCsv, replacementFixture, sourceReflection, summarizeRows } from '../domain/accounting.js'
import { subtractMoney } from '../domain/money.js'
import { activeActor, accountingPackageFor, engagementById, recordDraftFsDecision, replaceAccountingSource, scenario, selectedEngagement as scenarioEngagement, stageAccountingJournal, submitAccountingStatement } from '../domain/scenario.js'
import { loadDemoSession } from '../auth.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { useDemoContext } from '../demoContext.js'
import { approveAccountingFs, idempotencyKey, runSharedAction } from '../sharedDemo.js'
import { recordTargetFor } from '../navigation/recordTargets.js'

const props = defineProps({ navigationTarget: { type: Object, default: () => ({}) } })
const activeTab = ref('Data intake')
const targetNotice = ref('')
const tabs = ['Data intake', 'Mappings & reconciliations', 'Financial statements']
const showAllRows = ref(false)
const journalStatus = ref(practiceJournals.map((journal) => journal.status))
const toast = ref('')
const importOpen = ref(false)
const importError = ref('')
const importFile = ref(null)
const sourceLabel = ref('TB v03 · reflected replacement fixture')
const sourceRows = ref([])
const actionWorking = ref(false)
const draftFsDecision = ref('APPROVE')
const draftFsRationale = ref('')
const decisionWorking = ref(false)
const mappings = {
  '100101': 'Cash & cash equivalents',
  '110100': 'Trade receivables',
  '120100': 'Inventories',
  '150100': 'Property, plant & equipment',
  '159100': 'PPE accumulated depreciation',
  '200100': 'Trade payables',
  '220100': 'Non-current borrowings',
  '300100': 'Share capital',
  '310100': 'Retained earnings',
  '400100': 'Revenue',
  '500100': 'Cost of sales',
  '510100': 'Employee benefits',
  '520100': 'Depreciation',
  '530100': 'Finance costs',
}
// Phase C — shared D1 accounting tracker. Local fixtures above stay
// browser-local; everything below reads and writes the Worker.
const {
  activeEngagementId: sharedEngagementId,
  accountingStatus: sharedAcctStatus,
  accountingSteps: sharedAcctSteps,
  refresh: refreshSharedContext,
} = useDemoContext()
const sharedNotice = ref('')
const sharedBusy = ref('')
const sharedActionResult = ref(null)
const sharedActionRetry = ref(null)
const tbForm = ref({ sourceId: 'TB-BASELINE-001', sourceVersion: 'v03', period: 'FY2026', currency: 'QAR', rowCount: 14, debitTotal: '1250000.00', creditTotal: '1250000.00', validationState: 'VALIDATED', mappingComplete: true })
const trackerForm = ref({ mapping_state: 'COMPLETE', mapping_coverage: '14/14 reviewed', recon_state: 'IN_PROGRESS', open_recon_count: 1, journal_state: 'PENDING', pending_journal_count: 1, fs_version: '', fs_state: 'DRAFT' })
const packageDecision = ref('ACCEPT')
const packageExplanation = ref('')

watch(() => [props.navigationTarget?.recordId, props.navigationTarget?.tab], ([recordId, tab]) => {
  if (tab && tabs.includes(tab)) activeTab.value = tab
  const target = recordTargetFor(props.navigationTarget?.routeKey, recordId)
  if (!recordId || (target.targetType !== 'accounting' && !(target.targetType === 'unknown' && props.navigationTarget?.routeKey === 'accounting'))) return
  activeTab.value = /FS-|PKG-/.test(recordId) ? 'Financial statements' : 'Data intake'
  targetNotice.value = `${recordId} opened in the accounting workspace.`
  if (typeof document !== 'undefined') window.requestAnimationFrame(() => document.querySelector(`[data-record-id="${recordId}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
}, { immediate: true })

const sharedDemoRole = computed(() => loadDemoSession()?.role || '')
const canSharedAccountant = computed(() => ['accountant', 'accounting-reviewer', 'preparer', 'client', 'admin', 'system-admin'].includes(sharedDemoRole.value))
const canSharedMgmtApprove = computed(() => ['client-management', 'admin'].includes(sharedDemoRole.value))
const acctGenerations = computed(() => {
  const status = sharedAcctStatus.value
  if (!status) return null
  return { input: status.inputGeneration, evaluated: status.auditEvaluatedGeneration, current: status.inputGeneration === status.auditEvaluatedGeneration }
})

function sharedAcctNotify(message, result) {
  const outcome = String(result?.outcome || '').toUpperCase()
  sharedActionResult.value = { ...result, outcome: result?.ok ? 'COMMITTED' : (outcome || 'REJECTED'), message: result?.ok ? message : ('Not committed (' + (result.error?.code || 'ERROR') + '): ' + (result.error?.message || '')) }
  sharedNotice.value = result.ok ? message : ('Not committed (' + (result.error?.code || 'ERROR') + '): ' + (result.error?.message || ''))
  if (result.ok) refreshSharedContext()
  window.setTimeout(() => { sharedNotice.value = '' }, 6000)
}

async function submitSharedTb() {
  if (sharedBusy.value) return
  sharedActionRetry.value = submitSharedTb
  sharedBusy.value = 'tb'
  const rows = sourceRows.value.length ? sourceRows.value : baselineRows.value
  const result = await runSharedAction(sharedEngagementId.value, 'RECORD_TB_SOURCE', { ...tbForm.value, rows, rowCount: rows.length, idempotencyKey: idempotencyKey('tb-source') })
  sharedBusy.value = ''
  sharedAcctNotify(result.ok ? 'TB ' + (result.sourceVersion || '') + ' recorded; accounting input generation advanced — audit must re-evaluate.' : '', result)
}

async function submitSharedTracker() {
  if (sharedBusy.value) return
  sharedActionRetry.value = submitSharedTracker
  sharedBusy.value = 'tracker'
  const result = await runSharedAction(sharedEngagementId.value, 'UPDATE_ACCOUNTING_STATUS', { ...trackerForm.value, idempotencyKey: idempotencyKey('accounting-status') })
  sharedBusy.value = ''
  sharedAcctNotify('Accounting tracker updated.', result)
}

async function submitSharedPackageApproval() {
  if (sharedBusy.value) return
  sharedActionRetry.value = submitSharedPackageApproval
  sharedBusy.value = 'approval'
  const result = await approveAccountingFs(sharedEngagementId.value, { decision: packageDecision.value, explanation: packageExplanation.value, idempotencyKey: idempotencyKey('accounting-fs') })
  sharedBusy.value = ''
  if (result.ok) packageExplanation.value = ''
  sharedAcctNotify('Management ' + packageDecision.value + ' recorded for the accounting package.', result)
}

function retrySharedAction() {
  if (sharedActionRetry.value) void sharedActionRetry.value()
}

const selectedEngagement = computed(() => scenarioEngagement())
const accountingEngagement = computed(() => selectedEngagement.value?.service === 'accounting' ? selectedEngagement.value : engagementById(selectedEngagement.value?.linkedEngagementId) || scenario.engagements.find((item) => item.clientId === selectedEngagement.value?.clientId && item.service === 'accounting') || null)
const packageRecord = computed(() => accountingPackageFor(accountingEngagement.value?.id))
const packageState = computed(() => packageRecord.value?.statement?.state || 'LOCAL DRAFT')
const sourceContext = computed(() => ({ entityId: accountingEngagement.value?.clientId || 'CLI-0018', period: accountingEngagement.value?.period || 'FY2026', currency: accountingEngagement.value?.currency || 'QAR' }))
const baselineRows = computed(() => fixtureRows(baselineFixture, { ...sourceContext.value, sourceId: 'TB-BASELINE-001' }))
const summary = computed(() => summarizeRows(sourceRows.value))
const visibleRows = computed(() => {
  const rows = sourceRows.value.map((row) => ({
    ...row,
    code: row.accountCode,
    closing: subtractMoney(row.debit, row.credit),
    mapped: mappings[row.accountCode] || 'Unmapped',
    status: !mappings[row.accountCode] ? 'Unmapped' : row.accountCode === '520100' && sourceReflection(baselineRows.value, sourceRows.value) === 'REFLECTED' ? 'Adjusted' : packageRecord.value?.mappings?.state === 'REVIEW_REQUIRED' ? 'Needs review' : 'Mapped',
  }))
  return showAllRows.value ? rows : rows.slice(0, 8)
})
const debitTotal = computed(() => summary.value.debitTotal)
const creditTotal = computed(() => summary.value.creditTotal)
const closingTotal = computed(() => summary.value.signedTotal)
const revenueValue = computed(() => sourceRows.value.find((row) => row.accountCode === '400100')?.credit || '0.00')
const bridgeState = computed(() => sourceReflection(baselineRows.value, sourceRows.value))
const mappingSummaryValue = computed(() => mappingSummary(sourceRows.value, mappings))
const mappedRowCount = computed(() => mappingSummaryValue.value.mapped)
const mappingCoverage = computed(() => `${mappedRowCount.value} / ${sourceRows.value.length}`)
const mappingPercent = computed(() => mappingSummaryValue.value.coveragePercent)
const mappingState = computed(() => packageRecord.value?.mappings?.state === 'REVIEW_REQUIRED' || mappingSummaryValue.value.unmapped ? 'REVIEW_REQUIRED' : 'REVIEWED')
const canManageDraft = computed(() => Boolean(activeActor()?.roles?.includes('management_approver')))
const isBalanced = computed(() => debitTotal.value === creditTotal.value && closingTotal.value === '0.00')
const statementComponents = computed(() => {
  const components = packageRecord.value?.statement?.components || {}
  const labels = { balanceSheet: 'Balance sheet', incomeStatement: 'Income statement', cashFlow: 'Cash-flow statement', comparatives: 'Comparatives', disclosures: 'Notes & disclosures' }
  return Object.entries(labels).map(([key, label]) => ({ key, label, state: components[key] || 'NOT_PROVIDED', ready: ['DERIVED', 'PROVIDED'].includes(components[key]) }))
})
const statementReadyCount = computed(() => statementComponents.value.filter((item) => item.ready).length)
const statementReadiness = computed(() => statementReadyCount.value === statementComponents.value.length ? 'READY_FOR_REVIEW' : 'INPUTS_REQUIRED')
const statementApproval = computed(() => packageRecord.value?.statement?.managementDecision || packageRecord.value?.statement?.managementApproval || null)
const importSummary = computed(() => ({
  debitTotal: summary.value.debitTotal,
  creditTotal: summary.value.creditTotal,
  rows: sourceRows.value.length,
  reflection: bridgeState.value,
}))

function syncSourceFromPackage() {
  const source = packageRecord.value?.source
  if (source?.rows?.length) {
    sourceRows.value = source.rows.map((row) => ({ ...row }))
    sourceLabel.value = source.sourceLabel || sourceLabel.value
    return
  }
  sourceRows.value = packageRecord.value ? fixtureRows(replacementFixture, { ...sourceContext.value, sourceId: 'TB-REPLACEMENT-001' }) : []
  sourceLabel.value = packageRecord.value ? 'TB v03 · reflected replacement fixture' : 'No accounting package in selected scope'
}

watch(() => [packageRecord.value?.id, packageRecord.value?.revision, packageRecord.value?.source?.sourceId, accountingEngagement.value?.id], syncSourceFromPackage, { immediate: true })

function csvFromRows(rows) {
  return ['account_code,account_name,area,debit,credit', ...rows.map(([code, account, area, debit, credit]) => `${code},${account},${area},${debit},${credit}`)].join('\n')
}

function openImport() {
  if (sharedDemoEnabled) {
    toast.value = 'The local source importer is read-only in shared mode; use the shared accounting tracker above.'
    return
  }
  importOpen.value = true
  importError.value = ''
}

function closeImport() {
  importOpen.value = false
  importError.value = ''
  if (importFile.value) importFile.value.value = ''
}

function useFixture(kind) {
  if (sharedDemoEnabled) {
    toast.value = 'The local source fixtures are read-only in shared mode; use the shared accounting tracker above.'
    return
  }
  const rows = fixtureRows(kind === 'baseline' ? baselineFixture : replacementFixture, { entityId: accountingEngagement.value?.clientId || 'CLI-0018', period: accountingEngagement.value?.period || 'FY2026', currency: accountingEngagement.value?.currency || 'QAR', sourceId: kind === 'baseline' ? 'TB-BASELINE-001' : 'TB-REPLACEMENT-001' })
  const label = kind === 'baseline' ? 'TB v02 · baseline fixture' : 'TB v03 · reflected replacement fixture'
  const result = replaceAccountingSource({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: accountingEngagement.value?.revision, idempotencyKey: `source-${accountingEngagement.value?.id}-${accountingEngagement.value?.revision}-${kind}`, sourceId: rows[0]?.sourceId || (kind === 'baseline' ? 'TB-BASELINE-001' : 'TB-REPLACEMENT-001'), sourceLabel: label, rows })
  if (result.outcome === 'COMMITTED') sourceRows.value = rows
  sourceLabel.value = result.outcome === 'COMMITTED' ? label : sourceLabel.value
  closeImport()
  toast.value = result.outcome === 'COMMITTED' ? `${label} committed as a new package source revision. The raw receipt remains preserved.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

async function readImport(event) {
  if (sharedDemoEnabled) {
    toast.value = 'The local source importer is read-only in shared mode.'
    return
  }
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = parseCsv(text, { ...sourceContext.value, sourceId: `TB-UPLOAD-${Date.now()}` })
    if (!result.ok) {
      importError.value = `${result.code}: ${result.message}`
      return
    }
    const nextLabel = `${file.name} · validated upload`
    const committed = replaceAccountingSource({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: accountingEngagement.value?.revision, idempotencyKey: `source-${accountingEngagement.value?.id}-${accountingEngagement.value?.revision}-${result.rows[0]?.sourceRowId}`, sourceId: result.rows[0]?.sourceRowId?.split('-').slice(0, -1).join('-') || `TB-UPLOAD-${Date.now()}`, sourceLabel: nextLabel, rows: result.rows })
    if (committed.outcome === 'COMMITTED') {
      sourceRows.value = result.rows
      sourceLabel.value = nextLabel
    }
    closeImport()
    toast.value = committed.outcome === 'COMMITTED' ? `${file.name} parsed and committed as a new source revision. Control totals are ${result.source.debitTotal} per side.` : `${committed.outcome}: ${committed.code} — ${committed.message}`
    window.setTimeout(() => { toast.value = '' }, 4000)
  } catch (error) {
    importError.value = error.message || 'The CSV could not be read.'
  }
}

function markJournal(index) {
  if (index !== 1) return
  const result = stageAccountingJournal({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: packageRecord.value?.revision, idempotencyKey: `journal-stage-${accountingEngagement.value?.id}-${packageRecord.value?.revision}`, journal: { logicalJournalId: 'AJ-002', amount: '12500.00', debitAccount: '510100', creditAccount: '210100', reason: 'Receivables provision discussion; management response required.' } })
  if (result.outcome === 'COMMITTED') journalStatus.value[index] = 'Staged for discussion'
  toast.value = result.outcome === 'COMMITTED' ? 'AJ-002 is staged for discussion only. Management authorization remains a separate decision.' : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function submitStatement() {
  if (sharedDemoEnabled) {
    toast.value = 'The local statement package is read-only in shared mode; use the shared accounting handoff.'
    return
  }
  const result = submitAccountingStatement({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: packageRecord.value?.revision, idempotencyKey: `statement-submit-${accountingEngagement.value?.id}-${packageRecord.value?.revision}` })
  toast.value = result.outcome === 'COMMITTED' ? 'Statement package submitted for management approval with an exact package revision.' : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function saveDraftFsDecision() {
  if (sharedDemoEnabled) {
    toast.value = 'The local Draft FS decision is read-only in shared mode; use the shared approval action.'
    return
  }
  if (decisionWorking.value || !packageRecord.value) return
  const actor = activeActor()
  decisionWorking.value = true
  const result = recordDraftFsDecision({ engagementId: accountingEngagement.value?.id, actorPersonaId: actor?.personaId, expectedRevision: packageRecord.value.revision, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `draft-fs-decision-${accountingEngagement.value?.id}-${packageRecord.value.revision}-${draftFsDecision.value}`, decision: draftFsDecision.value, rationale: draftFsRationale.value })
  decisionWorking.value = false
  toast.value = result.outcome === 'COMMITTED' ? `Draft FS ${draftFsDecision.value.toLowerCase().replace('_', ' ')} recorded against ${result.data.statementId} revision ${result.data.statementRevision}.` : `${result.outcome}: ${result.code} — ${result.message}`
  if (result.outcome === 'COMMITTED') draftFsRationale.value = ''
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function journalStatusFor(index) {
  if (index !== 1) return journalStatus.value[index]
  const journal = packageRecord.value?.journalRevisions?.find((item) => item.logicalJournalId === 'AJ-002')
  if (journal?.state === 'MANAGEMENT_AUTHORIZED') return 'Management authorized'
  if (journal?.state === 'STAGED') return 'Staged for discussion'
  return journalStatus.value[index]
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Accounting production" title="Accounting & TB" description="Follow the preserved raw receipt through validation, mapping, reconciliations, controlled journals and the versioned financial-statement package." action-label="Import dataset" @action="openImport" />
    <WorkflowGuide :guide="workflowGuides.accounting" />

    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>
    <div v-if="targetNotice" class="guide-status-message" role="status"><Icon name="info" :size="16" />{{ targetNotice }}</div>

    <section v-if="sharedDemoEnabled" class="panel shared-accounting-panel" aria-labelledby="shared-accounting-title">
      <div class="panel-heading"><div><span class="eyebrow">Shared D1 accounting process · {{ sharedEngagementId }}</span><h2 id="shared-accounting-title">Accounting tracker</h2></div><StatusPill :label="acctGenerations ? (acctGenerations.current ? 'Input g' + acctGenerations.input + ' · evaluated' : 'Input g' + acctGenerations.input + ' · audit at g' + acctGenerations.evaluated) : 'Loading…'" :tone="acctGenerations ? (acctGenerations.current ? 'good' : 'warn') : 'neutral'" /></div>
      <p v-if="sharedNotice" class="guide-status-message" role="status">{{ sharedNotice }}</p>
      <ActionOutcome :result="sharedActionResult" :title="sharedBusy ? `${sharedBusy} accounting action` : 'Accounting action'" :pending="Boolean(sharedBusy)" stage-summary="The accounting package remains tied to the selected input generation." next-action="Recheck the tracker or hand the package to its named reviewer." @retry="retrySharedAction" />
      <ol class="tracker-steps">
        <li v-for="step in sharedAcctSteps" :key="step.id" class="tracker-row">
          <span aria-hidden="true">{{ step.state === 'COMPLETE' || step.state === 'READY' ? '✓' : step.state === 'IN_PROGRESS' ? '!' : '·' }}</span>
          <span class="tracker-main"><strong>{{ step.label }}</strong><small>{{ step.detail }}</small></span>
          <StatusPill :label="step.state" :tone="step.state === 'COMPLETE' || step.state === 'READY' ? 'good' : step.state === 'IN_PROGRESS' ? 'warn' : 'neutral'" />
        </li>
      </ol>
      <div class="split-grid">
        <form class="shared-completion-form" @submit.prevent="submitSharedTb">
          <span class="eyebrow">Record TB source (advances input generation)</span>
          <label>Source ID<input v-model="tbForm.sourceId" name="tb-source-id" type="text" autocomplete="off" /></label>
          <label>Version<input v-model="tbForm.sourceVersion" name="tb-source-version" type="text" autocomplete="off" /></label>
          <label>Debit total<input v-model="tbForm.debitTotal" name="tb-debit-total" type="text" inputmode="decimal" autocomplete="off" /></label>
          <label>Credit total<input v-model="tbForm.creditTotal" name="tb-credit-total" type="text" inputmode="decimal" autocomplete="off" /></label>
          <button type="submit" class="button secondary" :disabled="!canSharedAccountant || sharedBusy === 'tb'">{{ sharedBusy === 'tb' ? 'Recording…' : 'Record TB source' }}</button>
          <small v-if="!canSharedAccountant">Available to the Client, Accountant or Reviewer role.</small>
        </form>
        <form class="shared-completion-form" @submit.prevent="submitSharedTracker">
          <span class="eyebrow">Update tracker</span>
          <label>Mapping<input v-model="trackerForm.mapping_coverage" name="mapping-coverage" type="text" autocomplete="off" placeholder="e.g. 14/14 reviewed…" /></label>
          <label>Recon state<select v-model="trackerForm.recon_state" name="reconciliation-state"><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETE</option></select></label>
          <label>Open recons<input v-model.number="trackerForm.open_recon_count" name="open-reconciliations" type="number" min="0" inputmode="numeric" /></label>
          <label>Journal state<select v-model="trackerForm.journal_state" name="journal-state"><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETE</option></select></label>
          <label>Pending journals<input v-model.number="trackerForm.pending_journal_count" name="pending-journals" type="number" min="0" inputmode="numeric" /></label>
          <label>FS version<input v-model="trackerForm.fs_version" name="fs-version" type="text" autocomplete="off" placeholder="e.g. FS-v04…" /></label>
          <label>FS state<select v-model="trackerForm.fs_state" name="fs-state"><option>DRAFT</option><option>IN_REVIEW</option><option>FINAL</option></select></label>
          <button type="submit" class="button secondary" :disabled="!canSharedAccountant || sharedBusy === 'tracker'">{{ sharedBusy === 'tracker' ? 'Saving…' : 'Save tracker' }}</button>
        </form>
        <form class="shared-completion-form" @submit.prevent="submitSharedPackageApproval">
          <span class="eyebrow">Management package approval</span>
          <label>Decision<select v-model="packageDecision" name="package-decision"><option>ACCEPT</option><option>REJECT</option></select></label>
          <label>Explanation<input v-model="packageExplanation" name="package-explanation" type="text" autocomplete="off" placeholder="Required when rejecting…" /></label>
          <button type="submit" class="button secondary" :disabled="!canSharedMgmtApprove || sharedBusy === 'approval'">{{ sharedBusy === 'approval' ? 'Recording…' : 'Record approval' }}</button>
          <small v-if="!canSharedMgmtApprove">Available to the Client Management role.</small>
        </form>
      </div>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>Every new TB source advances the input generation; audit, draft, manager and opinion records against older inputs go stale until re-evaluated.</span></p>
    </section>


    <section v-if="importOpen" class="panel import-panel" aria-labelledby="import-title">
      <div class="panel-heading"><div><span class="eyebrow">Trial balance import</span><h2 id="import-title">Load a trial-balance receipt</h2></div><button type="button" class="icon-button" aria-label="Close import" title="Close import" @click="closeImport"><Icon name="x" :size="17" /></button></div>
      <p class="panel-copy">Use the supplied CSV structure to check column headings, account codes and control totals before continuing.</p>
      <div class="import-actions"><button type="button" class="button secondary" @click="useFixture('baseline')">Use TB v02 fixture</button><button type="button" class="button secondary" @click="useFixture('replacement')">Use TB v03 fixture</button><label class="button primary import-file-label">Choose CSV<input ref="importFile" name="trial-balance-file" type="file" accept=".csv,text/csv" @change="readImport" /></label></div>
      <p v-if="importError" class="form-error" role="alert"><Icon name="warning" :size="16" />{{ importError }}</p>
      <dl class="import-contract"><div><dt>Required columns</dt><dd><code>account_code, account_name, area, debit, credit</code></dd></div><div><dt>Validation</dt><dd>Balanced control totals, unique account codes, literal Decimal values</dd></div><div><dt>Current result</dt><dd>{{ importSummary.rows }} rows · {{ importSummary.debitTotal }} / {{ importSummary.creditTotal }} · {{ importSummary.reflection }}</dd></div></dl>
    </section>

    <section class="data-hero panel" :data-record-id="packageRecord?.source?.sourceId || packageRecord?.id"><div class="data-file"><span class="file-icon"><Icon name="file" :size="20" /></span><div><span class="eyebrow">Selected trial balance</span><h2>{{ sourceLabel }}</h2><p>{{ accountingEngagement?.id || 'No accounting scope' }} · CSV receipt · literal Decimal parser · entity {{ sourceRows[0]?.entityId || '—' }} · period {{ sourceRows[0]?.period || '—' }} · source identity remains preserved</p></div></div><div class="data-status"><StatusPill :label="isBalanced ? 'Validated for processing' : 'Blocked — totals differ'" :tone="isBalanced ? 'good' : 'danger'" /><span>{{ sourceRows.length }} accounts · {{ sourceRows[0]?.currency || '—' }} · {{ sourceRows[0]?.period || '—' }}</span><small>Package {{ packageState }} · revision {{ packageRecord?.revision || '—' }} · source bridge: {{ bridgeState }}</small></div></section>

    <section class="stats-strip compact"><div><span>Debit control total</span><strong>{{ formatMoney(debitTotal) }}</strong><small>Literal values only</small></div><div><span>Credit control total</span><strong>{{ formatMoney(creditTotal) }}</strong><small>{{ isBalanced ? 'Matches debits' : 'Must match before promotion' }}</small></div><div><span>Signed balance</span><strong>{{ formatMoney(closingTotal) }}</strong><small>{{ isBalanced ? 'Zero at approved precision' : 'Non-zero — source held' }}</small></div><div><span>Mapping coverage</span><strong>{{ mappingCoverage }}</strong><small>{{ mappingState }} · {{ mappingPercent }}% of selected rows assigned</small></div></section>

    <nav class="sub-tabs" aria-label="Accounting views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Data intake'">
      <section class="accounting-layout">
        <article class="panel table-panel">
          <div class="panel-heading"><div><span class="eyebrow">Canonical rows</span><h2>Trial balance control table</h2></div><button type="button" class="text-button" @click="showAllRows = !showAllRows">{{ showAllRows ? 'Show fewer' : `Show all ${sourceRows.length} rows` }} <Icon name="arrow-right" :size="15" /></button></div>
          <div class="table-wrap responsive-table"><table><thead><tr><th>Account</th><th>Area</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Closing</th><th>Taxonomy destination</th><th>Status</th></tr></thead><tbody><tr v-for="row in visibleRows" :key="row.sourceRowId" :data-record-id="row.sourceRowId"><td><div class="account-cell"><code>{{ row.code }}</code><strong>{{ row.account }}</strong></div></td><td>{{ row.area }}</td><td class="num">{{ row.debit !== '0.00' ? formatMoney(row.debit) : '—' }}</td><td class="num">{{ row.credit !== '0.00' ? formatMoney(row.credit) : '—' }}</td><td class="num strong-number">{{ formatMoney(row.closing) }}</td><td>{{ row.mapped }}</td><td><StatusPill :label="row.status" :tone="row.status === 'Adjusted' ? 'warn' : row.status === 'Mapped' ? 'good' : 'danger'" /></td></tr></tbody><tfoot><tr><th colspan="2">Control totals</th><th class="num">{{ formatMoney(debitTotal) }}</th><th class="num">{{ formatMoney(creditTotal) }}</th><th class="num">{{ formatMoney(closingTotal) }}</th><th colspan="2"><StatusPill :label="isBalanced ? 'Balanced' : 'Unbalanced — held'" :tone="isBalanced ? 'good' : 'danger'" /></th></tr></tfoot></table></div>
          <div class="table-footnote"><Icon name="database" :size="17" /><span>Source rows retain account codes as strings, including leading zeros. Raw receipts and replacement sources remain separate; no balancing plug is generated.</span></div>
        </article>
        <aside class="panel control-card"><div class="panel-heading"><div><span class="eyebrow">Validation run</span><h2>{{ isBalanced ? 'Checks passed' : 'Promotion held' }}</h2></div><StatusPill :label="isBalanced ? '0 exceptions' : 'Source exception'" :tone="isBalanced ? 'good' : 'danger'" /></div><ul class="check-list"><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Entity / period / currency</strong><small>{{ sourceRows[0]?.entityId || '—' }} · {{ sourceRows[0]?.period || '—' }} · {{ sourceRows[0]?.currency || '—' }}</small></span></li><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Row uniqueness</strong><small>{{ sourceRows.length }} canonical keys · duplicate detection active</small></span></li><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Control totals</strong><small>{{ isBalanced ? 'Debit, credit and signed balance reconcile' : 'Debit and credit must agree before promotion' }}</small></span></li><li><span class="list-icon" :class="bridgeState === 'REFLECTED' ? 'warn' : bridgeState === 'NOT_REFLECTED' ? 'good' : 'danger'"><Icon :name="bridgeState === 'REFLECTED' ? 'warning' : bridgeState === 'NOT_REFLECTED' ? 'check' : 'warning'" :size="14" /></span><span><strong>Source reflection</strong><small>AJ-001 is {{ bridgeState.toLowerCase() }}; never apply a reflected journal twice</small></span></li></ul><button type="button" class="button secondary full-width" @click="toast = 'Validation report is a browser-local synthetic summary; no external file was created.'">View validation report <Icon name="arrow-right" :size="16" /></button></aside>
      </section>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Controlled journals</span><h2>Adjustments and source bridge</h2></div><button type="button" class="text-button" @click="toast = 'Journal register is represented by the immutable source bridge and revision tests in this synthetic build.'">Inspect register <Icon name="arrow-right" :size="15" /></button></div><div class="journal-list"><div v-for="(journal, index) in practiceJournals" :key="journal.id" :data-record-id="journal.id" class="journal-row"><span class="journal-id">{{ journal.id }}</span><span><strong>{{ journal.purpose }}</strong><small>{{ journal.origin }} · {{ journal.layer }} · {{ journal.support }}</small></span><strong class="journal-amount">{{ formatMoney(journal.amount) }}</strong><StatusPill :label="journalStatusFor(index)" :tone="journalStatusFor(index).includes('Reflected') || journalStatusFor(index).includes('authorized') ? 'good' : 'warn'" /><button v-if="index === 1" type="button" class="row-button" :disabled="actionWorking || journalStatusFor(index).includes('Staged') || journalStatusFor(index).includes('authorized')" @click="markJournal(index)">{{ journalStatusFor(index).includes('Staged') ? 'Staged' : journalStatusFor(index).includes('authorized') ? 'Authorized' : 'Stage for discussion' }}</button></div></div></article><article class="panel insight-card"><span class="eyebrow">Version rule</span><h2>AJ-001 is reflected once</h2><p>The replacement source already includes the QAR 5,000 depreciation entry. The bridge records that relationship and prevents the same journal from being appended a second time.</p><div class="equation"><span>TB v02</span><b>+</b><span>AJ-001</span><b>=</b><strong>TB v03</strong></div><div class="insight-metrics"><div><span>Net PPE</span><strong>{{ formatMoney(summary.netPpe) }}</strong></div><div><span>Current profit</span><strong>{{ formatMoney(summary.profit) }}</strong></div></div></article></section>
    </template>

    <template v-else-if="activeTab === 'Mappings & reconciliations'">
       <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Dual mapping</span><h2>Statement taxonomy coverage</h2></div><StatusPill :label="`${mappingCoverage} mapped`" :tone="mappingPercent === 100 && mappingState === 'REVIEWED' ? 'good' : 'warn'" /></div><div class="mapping-summary"><div class="mapping-ring"><strong>{{ mappingPercent }}%</strong><span>mapped</span></div><div><strong>{{ mappingState === 'REVIEWED' && mappingPercent === 100 ? 'Every selected account has a reviewed destination.' : 'Mapping review is still required before downstream readiness.' }}</strong><p>Presentation signs remain separate from original source signs. A mapping change creates a new schedule version and impact tasks.</p></div></div><div class="mapping-bars"><div><span>Financial statement taxonomy</span><strong>{{ mappingCoverage }}</strong><i><b :style="{ width: `${mappingPercent}%` }"></b></i></div><div><span>Audit area mapping</span><strong>{{ mappingCoverage }}</strong><i><b :style="{ width: `${mappingPercent}%` }"></b></i></div><div><span>Supporting schedule links</span><strong>{{ Math.min(mappedRowCount, 11) }} / {{ sourceRows.length }}</strong><i><b :style="{ width: `${sourceRows.length ? Math.min(100, Math.round((Math.min(mappedRowCount, 11) / sourceRows.length) * 100)) : 0}%` }"></b></i></div></div></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Reconciliation workspaces</span><h2>Control account status</h2></div><button type="button" class="text-button" @click="toast = 'Reconciliation workspaces remain synthetic and are linked by account area, not by a live ledger.'">Inspect workspaces <Icon name="arrow-right" :size="15" /></button></div><div class="recon-list"><div v-for="area in reconciliationAreas" :key="area.name" class="recon-row"><span class="recon-icon" :class="`tone-${area.tone}`"><Icon name="chart" :size="16" /></span><span><strong>{{ area.name }}</strong><small>{{ area.source }} · {{ area.owner }}</small></span><span class="recon-amount">{{ formatMoney(area.balance) }}</span><StatusPill :label="area.status" :tone="area.tone" /></div></div></article></section>
       <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Source bridge</span><h2>What changed from TB v02 to the selected source</h2></div><StatusPill :label="bridgeState" :tone="bridgeState === 'REFLECTED' ? 'warn' : bridgeState === 'NOT_REFLECTED' ? 'good' : 'danger'" /></div><div class="bridge-flow"><div><span>TB v02</span><strong>{{ formatMoney(summarizeRows(baselineRows).debitTotal) }}</strong><small>Raw source · 14-account fixture</small></div><Icon class="bridge-arrow" name="arrow-right" :size="17" /><div class="bridge-change"><span>AJ-001</span><strong>+ {{ formatMoney(5000) }}</strong><small>{{ bridgeState.toLowerCase() }} source reflection</small></div><Icon class="bridge-arrow" name="arrow-right" :size="17" /><div><span>Selected source</span><strong>{{ formatMoney(debitTotal) }}</strong><small>{{ sourceLabel }}</small></div></div></section>
    </template>

    <template v-else>
      <section class="split-grid">
        <article class="panel statement-preview-card">
          <div class="panel-heading">
            <div><span class="eyebrow">Versioned package</span><h2>Financial statement preview</h2></div>
            <StatusPill :label="packageState" :tone="packageState === 'APPROVED' ? 'good' : packageState === 'READY_FOR_APPROVAL' ? 'warn' : 'danger'" />
          </div>
          <p class="panel-copy">This preview is calculated from the selected, validated source. It is a read-only demonstration of how the accounting package is handed to management and the audit team.</p>
          <div class="statement-kpis">
            <div><span>Revenue</span><strong>{{ formatMoney(revenueValue) }}</strong><small>Mapped sales / income line</small></div>
            <div><span>Net assets</span><strong>{{ formatMoney(summary.assets) }}</strong><small>Assets less accumulated depreciation</small></div>
            <div><span>Liabilities</span><strong>{{ formatMoney(summary.liabilities) }}</strong><small>Trade payables and borrowings</small></div>
            <div><span>Equity</span><strong>{{ formatMoney(summary.equity) }}</strong><small>Including current-period result</small></div>
          </div>
          <div class="table-wrap responsive-table statement-table-wrap">
            <table>
              <thead><tr><th>Statement line</th><th class="num">QAR</th><th>Source / treatment</th></tr></thead>
              <tbody>
                <tr><td>Net assets</td><td class="num strong-number">{{ formatMoney(summary.assets) }}</td><td>Mapped balance-sheet accounts</td></tr>
                <tr><td>Profit for the period</td><td class="num strong-number">{{ formatMoney(summary.profit) }}</td><td>Revenue less mapped operating costs</td></tr>
                <tr><td>Liabilities</td><td class="num strong-number">{{ formatMoney(summary.liabilities) }}</td><td>Mapped credit balances</td></tr>
                <tr><td>Equity</td><td class="num strong-number">{{ formatMoney(summary.equity) }}</td><td>Share capital, retained earnings and result</td></tr>
              </tbody>
            </table>
          </div>
          <div class="table-footnote"><Icon name="lock" :size="16" /><span>Statement {{ packageRecord?.statement?.id || '—' }} · revision {{ packageRecord?.statement?.revision || '—' }} · engine {{ packageRecord?.statement?.engineVersion || '—' }} · source {{ packageRecord?.source?.sourceId || '—' }}</span></div>
        </article>
        <article class="panel">
          <div class="panel-heading"><div><span class="eyebrow">Completion checklist</span><h2>{{ statementReadyCount }} / {{ statementComponents.length }} components ready</h2></div><StatusPill :label="statementReadiness" :tone="statementReadiness === 'READY_FOR_REVIEW' ? 'good' : 'warn'" /></div>
          <ul class="check-list statement-components">
            <li v-for="component in statementComponents" :key="component.key"><span class="list-icon" :class="component.ready ? 'good' : 'danger'"><Icon :name="component.ready ? 'check' : 'warning'" :size="14" /></span><span><strong>{{ component.label }}</strong><small>{{ component.ready ? `${component.state.toLowerCase()} from controlled source` : `${component.state.toLowerCase()} — complete before submission` }}</small></span><StatusPill :label="component.state" :tone="component.ready ? 'good' : 'danger'" /></li>
          </ul>
          <button type="button" class="button secondary full-width" :disabled="!packageRecord || !isBalanced || statementReadiness !== 'READY_FOR_REVIEW'" @click="submitStatement">Submit exact package for management review <Icon name="arrow-right" :size="16" /></button>
        </article>
      </section>

      <section v-if="canManageDraft" class="panel draft-fs-panel">
        <div class="panel-heading"><div><span class="eyebrow">Client management decision</span><h2>Review Draft FS v{{ packageRecord?.statement?.revision || '—' }}</h2></div><StatusPill v-if="statementApproval" :label="statementApproval.decision" :tone="statementApproval.decision === 'APPROVE' ? 'good' : 'warn'" /></div>
        <p class="panel-copy">Management can approve the exact version, reject it, or request changes. Rejection and requested changes create a durable revision task for the preparer.</p>
        <div class="draft-fs-form"><label><span>Decision</span><select v-model="draftFsDecision" name="draft-fs-decision"><option value="APPROVE">Approve</option><option value="REQUEST_CHANGES">Request changes</option><option value="REJECT">Reject</option></select></label><label class="wide"><span>Rationale (required for changes or rejection)</span><textarea v-model="draftFsRationale" name="draft-fs-rationale" rows="3" placeholder="Explain the decision for the review record…"></textarea></label><button type="button" class="button primary" :disabled="decisionWorking || !packageRecord" @click="saveDraftFsDecision">{{ decisionWorking ? 'Saving…' : 'Record decision' }}</button></div>
        <div v-if="packageRecord?.statement?.revisionTasks?.length" class="revision-task"><Icon name="arrow-right" :size="16" /><span><strong>Open revision task</strong><small>{{ packageRecord.statement.revisionTasks.at(-1).id }} · owner {{ packageRecord.statement.revisionTasks.at(-1).ownerActorId }} · {{ packageRecord.statement.revisionTasks.at(-1).state }}</small></span></div>
      </section>

      <section v-else class="panel insight-card"><span class="eyebrow">Management handoff</span><h2>Awaiting scoped client decision</h2><p>Sign in as the Northstar management demo persona to approve or request changes on this exact statement revision. The audit team cannot substitute for the client’s management representation.</p><div class="equation"><span>{{ packageRecord?.statement?.id || 'FS package' }}</span><b>→</b><strong>{{ packageRecord?.statement?.managementDecision?.decision || 'PENDING MANAGEMENT' }}</strong></div></section>
    </template>
  </div>
</template>
