<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, formatMoney, practiceJournals, reconciliationAreas, workflowGuides } from '../data'
import { baselineFixture, fixtureRows, parseCsv, replacementFixture, sourceReflection, summarizeRows } from '../domain/accounting.js'
import { subtractMoney } from '../domain/money.js'
import { activeActor, accountingPackageFor, engagementById, replaceAccountingSource, scenario, selectedEngagement as scenarioEngagement, stageAccountingJournal, submitAccountingStatement } from '../domain/scenario.js'

const activeTab = ref('Data intake')
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
    status: row.accountCode === '520100' && sourceReflection(baselineRows.value, sourceRows.value) === 'REFLECTED' ? 'Adjusted' : 'Mapped',
  }))
  return showAllRows.value ? rows : rows.slice(0, 8)
})
const debitTotal = computed(() => summary.value.debitTotal)
const creditTotal = computed(() => summary.value.creditTotal)
const closingTotal = computed(() => summary.value.signedTotal)
const bridgeState = computed(() => sourceReflection(baselineRows.value, sourceRows.value))
const mappingCoverage = computed(() => `${Object.values(mappings).length} / ${sourceRows.value.length}`)
const isBalanced = computed(() => debitTotal.value === creditTotal.value && closingTotal.value === '0.00')
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
  importOpen.value = true
  importError.value = ''
}

function closeImport() {
  importOpen.value = false
  importError.value = ''
  if (importFile.value) importFile.value.value = ''
}

function useFixture(kind) {
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
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = parseCsv(text, { entityId: 'CLI-0018', period: 'FY2026', currency: 'QAR', sourceId: `TB-UPLOAD-${Date.now()}` })
    if (!result.ok) {
      importError.value = `${result.code}: ${result.message}`
      return
    }
    const nextLabel = `${file.name} · validated synthetic upload`
    const committed = replaceAccountingSource({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: accountingEngagement.value?.revision, idempotencyKey: `source-${accountingEngagement.value?.id}-${accountingEngagement.value?.revision}-${result.rows[0]?.sourceRowId}`, sourceId: result.rows[0]?.sourceRowId?.split('-').slice(0, -1).join('-') || `TB-UPLOAD-${Date.now()}`, sourceLabel: nextLabel, rows: result.rows })
    if (committed.outcome === 'COMMITTED') {
      sourceRows.value = result.rows
      sourceLabel.value = nextLabel
    }
    closeImport()
    toast.value = committed.outcome === 'COMMITTED' ? `${file.name} parsed and committed as a new source revision. Control totals are ${result.source.debitTotal} per side.` : `${committed.outcome}: ${committed.code} — ${committed.message}`
    window.setTimeout(() => { toast.value = '' }, 4000)
  } catch (error) {
    importError.value = error.message || 'The synthetic CSV could not be read.'
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
  const result = submitAccountingStatement({ engagementId: accountingEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: packageRecord.value?.revision, idempotencyKey: `statement-submit-${accountingEngagement.value?.id}-${packageRecord.value?.revision}` })
  toast.value = result.outcome === 'COMMITTED' ? 'Statement package submitted for management approval with an exact package revision.' : `${result.outcome}: ${result.code} — ${result.message}`
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

    <section v-if="importOpen" class="panel import-panel" aria-labelledby="import-title">
      <div class="panel-heading"><div><span class="eyebrow">Synthetic import</span><h2 id="import-title">Load a trial-balance receipt</h2></div><button type="button" class="icon-button" aria-label="Close import" title="Close import" @click="closeImport"><Icon name="x" :size="17" /></button></div>
      <p class="panel-copy">Only the supplied synthetic CSV shape is accepted here. The file is parsed in this browser; it is not uploaded to a ledger or external provider.</p>
      <div class="import-actions"><button type="button" class="button secondary" @click="useFixture('baseline')">Use TB v02 fixture</button><button type="button" class="button secondary" @click="useFixture('replacement')">Use TB v03 fixture</button><label class="button primary import-file-label">Choose CSV<input ref="importFile" type="file" accept=".csv,text/csv" @change="readImport" /></label></div>
      <p v-if="importError" class="form-error" role="alert"><Icon name="warning" :size="16" />{{ importError }}</p>
      <dl class="import-contract"><div><dt>Required columns</dt><dd><code>account_code, account_name, area, debit, credit</code></dd></div><div><dt>Validation</dt><dd>Balanced control totals, unique account codes, literal Decimal values</dd></div><div><dt>Current result</dt><dd>{{ importSummary.rows }} rows · {{ importSummary.debitTotal }} / {{ importSummary.creditTotal }} · {{ importSummary.reflection }}</dd></div></dl>
    </section>

    <section class="data-hero panel"><div class="data-file"><span class="file-icon"><Icon name="file" :size="20" /></span><div><span class="eyebrow">Selected dataset · browser-local synthetic receipt</span><h2>{{ sourceLabel }}</h2><p>{{ accountingEngagement?.id || 'No accounting scope' }} · CSV receipt · literal Decimal parser · entity {{ sourceRows[0]?.entityId || '—' }} · period {{ sourceRows[0]?.period || '—' }} · source identity remains preserved</p></div></div><div class="data-status"><StatusPill :label="isBalanced ? 'Validated for processing' : 'Blocked — totals differ'" :tone="isBalanced ? 'good' : 'danger'" /><span>{{ sourceRows.length }} accounts · {{ sourceRows[0]?.currency || '—' }} · {{ sourceRows[0]?.period || '—' }}</span><small>Package {{ packageState }} · revision {{ packageRecord?.revision || '—' }} · source bridge: {{ bridgeState }}</small></div></section>

    <section class="stats-strip compact"><div><span>Debit control total</span><strong>{{ formatMoney(debitTotal) }}</strong><small>Literal values only</small></div><div><span>Credit control total</span><strong>{{ formatMoney(creditTotal) }}</strong><small>{{ isBalanced ? 'Matches debits' : 'Must match before promotion' }}</small></div><div><span>Signed balance</span><strong>{{ formatMoney(closingTotal) }}</strong><small>{{ isBalanced ? 'Zero at approved precision' : 'Non-zero — source held' }}</small></div><div><span>Mapping coverage</span><strong>{{ mappingCoverage }}</strong><small>Canonical account codes assigned</small></div></section>

    <nav class="sub-tabs" aria-label="Accounting views"><button v-for="tab in tabs" :key="tab" type="button" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav>

    <template v-if="activeTab === 'Data intake'">
      <section class="accounting-layout">
        <article class="panel table-panel">
          <div class="panel-heading"><div><span class="eyebrow">Canonical rows</span><h2>Trial balance control table</h2></div><button type="button" class="text-button" @click="showAllRows = !showAllRows">{{ showAllRows ? 'Show fewer' : `Show all ${sourceRows.length} rows` }} <Icon name="arrow-right" :size="15" /></button></div>
          <div class="table-wrap responsive-table"><table><thead><tr><th>Account</th><th>Area</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Closing</th><th>Taxonomy destination</th><th>Status</th></tr></thead><tbody><tr v-for="row in visibleRows" :key="row.sourceRowId"><td><div class="account-cell"><code>{{ row.code }}</code><strong>{{ row.account }}</strong></div></td><td>{{ row.area }}</td><td class="num">{{ row.debit !== '0.00' ? formatMoney(row.debit) : '—' }}</td><td class="num">{{ row.credit !== '0.00' ? formatMoney(row.credit) : '—' }}</td><td class="num strong-number">{{ formatMoney(row.closing) }}</td><td>{{ row.mapped }}</td><td><StatusPill :label="row.status" :tone="row.status === 'Adjusted' ? 'warn' : row.status === 'Mapped' ? 'good' : 'danger'" /></td></tr></tbody><tfoot><tr><th colspan="2">Control totals</th><th class="num">{{ formatMoney(debitTotal) }}</th><th class="num">{{ formatMoney(creditTotal) }}</th><th class="num">{{ formatMoney(closingTotal) }}</th><th colspan="2"><StatusPill :label="isBalanced ? 'Balanced' : 'Unbalanced — held'" :tone="isBalanced ? 'good' : 'danger'" /></th></tr></tfoot></table></div>
          <div class="table-footnote"><Icon name="database" :size="17" /><span>Source rows retain account codes as strings, including leading zeros. Raw receipts and replacement sources remain separate; no balancing plug is generated.</span></div>
        </article>
        <aside class="panel control-card"><div class="panel-heading"><div><span class="eyebrow">Validation run</span><h2>{{ isBalanced ? 'Checks passed' : 'Promotion held' }}</h2></div><StatusPill :label="isBalanced ? '0 exceptions' : 'Source exception'" :tone="isBalanced ? 'good' : 'danger'" /></div><ul class="check-list"><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Entity / period / currency</strong><small>{{ sourceRows[0]?.entityId || '—' }} · {{ sourceRows[0]?.period || '—' }} · {{ sourceRows[0]?.currency || '—' }}</small></span></li><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Row uniqueness</strong><small>{{ sourceRows.length }} canonical keys · duplicate detection active</small></span></li><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Control totals</strong><small>{{ isBalanced ? 'Debit, credit and signed balance reconcile' : 'Debit and credit must agree before promotion' }}</small></span></li><li><span class="list-icon" :class="bridgeState === 'REFLECTED' ? 'warn' : bridgeState === 'NOT_REFLECTED' ? 'good' : 'danger'"><Icon :name="bridgeState === 'REFLECTED' ? 'warning' : bridgeState === 'NOT_REFLECTED' ? 'check' : 'warning'" :size="14" /></span><span><strong>Source reflection</strong><small>AJ-001 is {{ bridgeState.toLowerCase() }}; never apply a reflected journal twice</small></span></li></ul><button type="button" class="button secondary full-width" @click="toast = 'Validation report is a browser-local synthetic summary; no external file was created.'">View validation report <Icon name="arrow-right" :size="16" /></button></aside>
      </section>
      <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Controlled journals</span><h2>Adjustments and source bridge</h2></div><button type="button" class="text-button" @click="toast = 'Journal register is represented by the immutable source bridge and revision tests in this synthetic build.'">Inspect register <Icon name="arrow-right" :size="15" /></button></div><div class="journal-list"><div v-for="(journal, index) in practiceJournals" :key="journal.id" class="journal-row"><span class="journal-id">{{ journal.id }}</span><span><strong>{{ journal.purpose }}</strong><small>{{ journal.origin }} · {{ journal.layer }} · {{ journal.support }}</small></span><strong class="journal-amount">{{ formatMoney(journal.amount) }}</strong><StatusPill :label="journalStatusFor(index)" :tone="journalStatusFor(index).includes('Reflected') || journalStatusFor(index).includes('authorized') ? 'good' : 'warn'" /><button v-if="index === 1" type="button" class="row-button" :disabled="actionWorking || journalStatusFor(index).includes('Staged') || journalStatusFor(index).includes('authorized')" @click="markJournal(index)">{{ journalStatusFor(index).includes('Staged') ? 'Staged' : journalStatusFor(index).includes('authorized') ? 'Authorized' : 'Stage for discussion' }}</button></div></div></article><article class="panel insight-card"><span class="eyebrow">Version rule</span><h2>AJ-001 is reflected once</h2><p>The replacement source already includes the QAR 5,000 depreciation entry. The bridge records that relationship and prevents the same journal from being appended a second time.</p><div class="equation"><span>TB v02</span><b>+</b><span>AJ-001</span><b>=</b><strong>TB v03</strong></div><div class="insight-metrics"><div><span>Net PPE</span><strong>{{ formatMoney(summary.netPpe) }}</strong></div><div><span>Current profit</span><strong>{{ formatMoney(summary.profit) }}</strong></div></div></article></section>
    </template>

    <template v-else-if="activeTab === 'Mappings & reconciliations'">
       <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Dual mapping</span><h2>Statement taxonomy coverage</h2></div><StatusPill :label="`${mappingCoverage} mapped`" tone="good" /></div><div class="mapping-summary"><div class="mapping-ring"><strong>{{ sourceRows.length ? Math.round((Object.keys(mappings).length / sourceRows.length) * 100) : 0 }}%</strong><span>mapped</span></div><div><strong>Every non-zero account has a reviewed destination.</strong><p>Presentation signs remain separate from original source signs. A mapping change creates a new schedule version and impact tasks.</p></div></div><div class="mapping-bars"><div><span>Financial statement taxonomy</span><strong>{{ mappingCoverage }}</strong><i><b :style="{ width: `${sourceRows.length ? Math.round((Object.keys(mappings).length / sourceRows.length) * 100) : 0}%` }"></b></i></div><div><span>Audit area mapping</span><strong>{{ mappingCoverage }}</strong><i><b :style="{ width: `${sourceRows.length ? Math.round((Object.keys(mappings).length / sourceRows.length) * 100) : 0}%` }"></b></i></div><div><span>Supporting schedule links</span><strong>11 / {{ sourceRows.length }}</strong><i><b :style="{ width: `${sourceRows.length ? Math.min(100, Math.round((11 / sourceRows.length) * 100)) : 0}%` }"></b></i></div></div></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Reconciliation workspaces</span><h2>Control account status</h2></div><button type="button" class="text-button" @click="toast = 'Reconciliation workspaces remain synthetic and are linked by account area, not by a live ledger.'">Inspect workspaces <Icon name="arrow-right" :size="15" /></button></div><div class="recon-list"><div v-for="area in reconciliationAreas" :key="area.name" class="recon-row"><span class="recon-icon" :class="`tone-${area.tone}`"><Icon name="chart" :size="16" /></span><span><strong>{{ area.name }}</strong><small>{{ area.source }} · {{ area.owner }}</small></span><span class="recon-amount">{{ formatMoney(area.balance) }}</span><StatusPill :label="area.status" :tone="area.tone" /></div></div></article></section>
       <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Source bridge</span><h2>What changed from TB v02 to the selected source</h2></div><StatusPill :label="bridgeState" :tone="bridgeState === 'REFLECTED' ? 'warn' : bridgeState === 'NOT_REFLECTED' ? 'good' : 'danger'" /></div><div class="bridge-flow"><div><span>TB v02</span><strong>{{ formatMoney(summarizeRows(baselineRows).debitTotal) }}</strong><small>Raw source · 14-account fixture</small></div><Icon class="bridge-arrow" name="arrow-right" :size="17" /><div class="bridge-change"><span>AJ-001</span><strong>+ {{ formatMoney(5000) }}</strong><small>{{ bridgeState.toLowerCase() }} source reflection</small></div><Icon class="bridge-arrow" name="arrow-right" :size="17" /><div><span>Selected source</span><strong>{{ formatMoney(debitTotal) }}</strong><small>{{ sourceLabel }}</small></div></div></section>
    </template>

    <template v-else>
      <section class="statement-layout"><article class="panel statement-card"><div class="panel-heading"><div><span class="eyebrow">Financial Statement Package · synthetic projection</span><h2>{{ packageRecord?.statement?.id || 'FS v05' }} · {{ packageState.toLowerCase() }}</h2></div><StatusPill :label="packageState === 'APPROVED' ? 'Approved in simulation' : 'Illustrative — not issued'" :tone="packageState === 'APPROVED' ? 'good' : 'warn'" /></div><div class="statement-metrics"><div><span>Total assets</span><strong>{{ formatMoney(summary.assets) }}</strong><small>Derived from the 14-account fixture</small></div><div><span>Current profit</span><strong>{{ formatMoney(summary.profit) }}</strong><small>After source reflection</small></div><div><span>Equity</span><strong>{{ formatMoney(summary.equity) }}</strong><small>Presentation bridge only</small></div></div><div class="statement-bars"><div class="bar-item"><span>Assets</span><b :style="{ height: `${Math.max(18, Math.round(Number(summary.assets) / 6000))}px` }"></b><strong>{{ formatMoney(summary.assets) }}</strong></div><div class="bar-item"><span>Liabilities</span><b class="bar-blue" :style="{ height: `${Math.max(18, Math.round(Number(summary.liabilities) / 6000))}px` }"></b><strong>{{ formatMoney(summary.liabilities) }}</strong></div><div class="bar-item"><span>Equity</span><b class="bar-green" :style="{ height: `${Math.max(18, Math.round(Number(summary.equity) / 6000))}px` }"></b><strong>{{ formatMoney(summary.equity) }}</strong></div></div><div class="prototype-note"><Icon name="info" :size="16" /><span>This miniature TB does not include cash-flow, comparative or disclosure inputs; the statement package is intentionally incomplete.</span></div></article><aside class="panel"><div class="panel-heading"><div><span class="eyebrow">Package checks</span><h2>Before audit release</h2></div><StatusPill :label="packageState" :tone="packageState === 'APPROVED' ? 'good' : 'warn'" /></div><ul class="check-list"><li><span class="list-icon" :class="isBalanced ? 'good' : 'danger'"><Icon :name="isBalanced ? 'check' : 'warning'" :size="14" /></span><span><strong>Statement balance</strong><small>{{ isBalanced ? 'Assets = liabilities + equity' : 'Source is unbalanced; package held' }}</small></span></li><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Profit-to-equity movement</strong><small>Current-period movement reconciles</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Disclosure responses</strong><small>Cash-flow, comparatives and notes are not in this fixture</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Accounting technical review</strong><small>{{ packageRecord?.journalRevisions?.some((item) => item.state === 'STAGED' || item.state === 'PROPOSED') ? 'AJ-002 remains staged for discussion' : 'No proposed journals pending' }}</small></span></li></ul><button type="button" class="button primary full-width" :disabled="actionWorking" @click="submitStatement">{{ actionWorking ? 'Working…' : 'Submit for management approval' }}</button><p class="prototype-note"><Icon name="info" :size="16" /><span>Submission is blocked until every financial component is provided and proposed journals are separately authorized. Management approval is recorded by the client role.</span></p></aside></section>
    </template>
  </div>
</template>
