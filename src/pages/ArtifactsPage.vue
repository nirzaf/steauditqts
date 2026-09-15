<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import OutputCompletenessPanel from '../components/OutputCompletenessPanel.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { workflowGuides } from '../data'
import { v5Documents } from '../v5Data.js'
import { activeActor, accountingPackageFor, actorById, recordRoleTaskAction, scenario, selectedEngagement, termsFor } from '../domain/scenario.js'
import { sharedDemoEnabled } from '../composables/useSharedEngagement.js'
import { useRecordSelection } from '../composables/useRecordSelection.js'

const emit = defineEmits(['navigate'])
const search = ref('')
const filter = ref('All outputs')
const artifactSelection = useRecordSelection({ getIds: () => visibleDocuments.value.map((d) => d.id), initial: 'DOC-08' })
const selectedId = artifactSelection.selectedId
const toast = ref('')
const clientFacingDocumentIds = new Set(['DOC-07', 'DOC-08', 'DOC-10', 'DOC-11', 'DOC-13', 'DOC-14', 'DOC-17', 'DOC-18', 'DOC-19', 'DOC-22', 'DOC-23', 'DOC-24'])
const staleDocumentIds = new Set(['DOC-17', 'DOC-19', 'DOC-20', 'DOC-21', 'DOC-22', 'DOC-23'])
const readyDocumentStates = ['FINALIZED', 'SIGNED', 'ACCEPTED', 'VALIDATED', 'RECEIVED', 'ISSUED', 'SUBMITTED', 'FROZEN', 'APPROVED']
const isReadyDocument = (item) => readyDocumentStates.some((state) => item.status.includes(state))

const engagement = computed(() => selectedEngagement())
const actor = computed(() => activeActor())
const clientVisible = computed(() => Boolean(actor.value?.roles?.some((role) => ['client_contributor', 'client_finance'].includes(role))))
const managementVisible = computed(() => Boolean(actor.value?.roles?.includes('management_approver')))
const scopedCandidate = computed(() => (scenario.releaseCandidates || []).find((item) => item.engagementId === engagement.value?.id && item.state !== 'ARCHIVED') || null)
const clientPackagePublished = computed(() => ['DELIVERED_SIMULATION', 'VERIFIED'].includes(scopedCandidate.value?.deliveryState) || scopedCandidate.value?.archiveState === 'VERIFIED')
const visibleDocuments = computed(() => v5Documents.filter((item) => {
  if (clientVisible.value && !managementVisible.value && !['DOC-19', ...(clientPackagePublished.value ? ['DOC-22', 'DOC-23'] : [])].includes(item.id)) return false
  if (managementVisible.value && !['DOC-07', 'DOC-08', 'DOC-17', 'DOC-18', 'DOC-19', 'DOC-22', 'DOC-23', 'DOC-24'].includes(item.id)) return false
  const query = search.value.trim().toLowerCase()
  const matchesSearch = !query || `${item.id} ${item.title} ${item.owner} ${item.trigger}`.toLowerCase().includes(query)
  const matchesFilter = filter.value === 'All outputs'
    || ((filter.value === 'Ready' || filter.value === 'Current') && isReadyDocument(item))
    || ((filter.value === 'Needs action' || filter.value === 'Needs approval') && !isReadyDocument(item))
    || (filter.value === 'Client-facing' && clientFacingDocumentIds.has(item.id))
    || (filter.value === 'Internal' && !clientFacingDocumentIds.has(item.id))
    || (filter.value === 'Missing' && (item.tone === 'danger' || item.tone === 'neutral'))
    || (filter.value === 'Stale' && staleDocumentIds.has(item.id))
  return matchesSearch && matchesFilter
}))
watch(() => artifactSelection.targetedId.value, (id) => {
  if (!id) return
  if (v5Documents.some((d) => d.id === id)) { search.value = ''; filter.value = 'All outputs' }
})
const selected = computed(() => visibleDocuments.value.find((item) => item.id === selectedId.value) || visibleDocuments.value[0] || v5Documents[0])
const linkedRecord = computed(() => {
  const item = selected.value
  const pkg = accountingPackageFor(engagement.value?.linkedEngagementId || engagement.value?.id)
  const terms = termsFor(engagement.value?.id)
  const map = {
    'DOC-01': { id: `CLIENT-${engagement.value?.clientId || 'CLI-0018'}`, version: 'intake-v1', state: 'FINALIZED', actor: 'ACT-NADIA' },
    'DOC-02': { id: 'ASMT-0018-ACCEPT-2026', version: 'revision 4', state: 'HELD', actor: 'ACT-SARA' },
    'DOC-03': { id: 'CONT-0018-2026', version: 'current-year shell', state: 'READY', actor: 'ACT-OMAR' },
    'DOC-04': { id: 'ASMT-0018-CONT-2027', version: 'revision 1', state: 'IN PROGRESS', actor: 'ACT-MAYA' },
    'DOC-05': { id: 'COST-0018-2026', version: 'revision 2', state: 'APPROVED', actor: 'ACT-AISHA' },
    'DOC-06': { id: 'FEE-0018-2026', version: 'revision 2', state: 'APPROVED', actor: 'ACT-AISHA' },
    'DOC-07': { id: 'QTN-0018-2026', version: 'v1', state: 'ACCEPTED', actor: 'ACT-AISHA' },
    'DOC-08': { id: terms?.id || `TERMS-${engagement.value?.id || 'NO-SCOPE'}`, version: terms?.version || 'not issued', state: terms?.state || 'NOT ISSUED', actor: terms?.clientDecision?.actorId || terms?.signedBy || null },
    'DOC-09': { id: 'PLAN-0018-2026', version: 'v2', state: 'APPROVED', actor: 'ACT-OMAR' },
    'DOC-10': { id: 'ANN-0018-2026', version: 'v1', state: 'ISSUED', actor: 'ACT-OMAR' },
    'DOC-11': { id: 'PBC-019 / PBC-023', version: 'request revision 2', state: 'IN REVIEW', actor: 'ACT-NADIA' },
    'DOC-12': { id: 'AUD-PROGRAM-2026', version: 'v2', state: 'SUBMITTED', actor: 'ACT-OMAR' },
    'DOC-13': { id: pkg?.source?.sourceId || 'TB-REPLACEMENT-001', version: `package revision ${pkg?.revision || 1}`, state: pkg?.source?.validationState || 'VALIDATED', actor: 'ACT-LEILA' },
    'DOC-14': { id: 'PY-FS-0018-2025', version: 'snapshot v1', state: 'RECEIVED', actor: 'ACT-NADIA' },
    'DOC-15': { id: 'WP-AR-01 / WP-INV-01', version: 'submitted snapshots', state: 'SUBMITTED', actor: 'ACT-OMAR' },
    'DOC-16': { id: 'WPCS-0018-2026', version: 'revision 1', state: 'FROZEN', actor: 'ACT-OMAR' },
    'DOC-17': { id: pkg?.statement?.id || 'FS-0018-ACC-2026-V05', version: `revision ${pkg?.statement?.revision || 5}`, state: pkg?.statement?.state || 'DRAFT', actor: 'ACT-LEILA' },
    'DOC-18': { id: 'MIR-0018-2026', version: 'v1', state: 'SENT', actor: 'ACT-OMAR' },
    'DOC-19': { id: 'RESP-0018-2026', version: 'draft-v2', state: 'REVISED RESPONSE', actor: 'ACT-NADIA' },
    'DOC-20': { id: 'REV-0018-2026', version: 'review package v1', state: 'IN REVIEW', actor: 'ACT-OMAR' },
    'DOC-21': { id: 'OP-0018-2026', version: 'candidate v1', state: 'PENDING EQR', actor: 'ACT-PARTNER' },
    'DOC-22': { id: `REPORT-${engagement.value?.clientId || '0018'}-${engagement.value?.period || '2026'}`, version: scopedCandidate.value?.revision ? `candidate revision ${scopedCandidate.value.revision}` : 'candidate package', state: clientPackagePublished.value ? 'DELIVERED' : 'PENDING RELEASE', actor: 'ACT-PARTNER' },
    'DOC-23': { id: `FS-FINAL-${engagement.value?.clientId || '0018'}-${engagement.value?.period || '2026'}`, version: scopedCandidate.value?.revision ? `matched revision ${scopedCandidate.value.revision}` : 'matched candidate', state: clientPackagePublished.value ? 'DELIVERED' : 'PENDING RELEASE', actor: 'ACT-PARTNER' },
    'DOC-24': { id: 'INV-0018-2026', version: 'draft', state: 'DRAFT', actor: 'ACT-AISHA' },
    'DOC-25': { id: 'TIME-0018-2026', version: '156 hours planned/actual', state: 'IN PROGRESS', actor: 'ACT-AISHA' },
    'DOC-26': { id: 'ECS-0018-R2', version: 'reconciliation pending', state: 'PENDING CUTOFF', actor: 'ACT-AISHA' },
  }
  return map[item.id] || { id: item.id, version: 'current record', state: item.status, actor: null }
})
const artifactPreview = computed(() => {
  const item = selected.value
  const record = linkedRecord.value
  return `STE AUDITFLOW · WORKFLOW PREVIEW\n${item?.title || 'Workflow output'}\n\nEngagement: ${engagement.value?.id || 'NO-SCOPE'}\nClient / period: ${engagement.value?.clientId || '—'} · ${engagement.value?.period || '—'}\nRecord: ${record.id}\nVersion: ${record.version}\nState: ${record.state}\nOwner: ${item?.owner || '—'}\n\nThis preview explains the record handoff and its current owner.`
})

function inspect(item) {
  artifactSelection.select(item.id)
}

function navigate(route) {
  emit('navigate', route)
}

function acknowledge() {
  if (sharedDemoEnabled) {
    toast.value = 'Local artifact inspection is read-only in shared mode; use the shared approval queue for authoritative actions.'
    return
  }
  const result = recordRoleTaskAction({ taskId: selected.value.id, action: 'TASK_ACKNOWLEDGED', actorPersonaId: actor.value?.personaId, expectedSessionEpoch: actor.value?.sessionEpoch, idempotencyKey: `artifact-inspect-${selected.value.id}-${actor.value?.sessionEpoch || 1}`, detail: `Inspected ${selected.value.title}` })
  toast.value = result.outcome === 'COMMITTED' ? `${selected.value.id} inspection recorded in the local evidence trail.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page artifacts-page">
    <PageHeader eyebrow="Named outputs · document center" title="Inspect the 26 workflow artifacts" description="Each output is tied to a record, version, owner, state, and destination. Use this page to explain what the portal stores at every handoff." />
    <WorkflowGuide :guide="workflowGuides.v5Blueprint || workflowGuides.pipeline" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="panel artifact-contract-banner"><div class="artifact-contract-icon"><Icon name="file" :size="22" /></div><div><span class="eyebrow">Primary engagement · {{ engagement?.id }}</span><h2>{{ clientVisible ? (clientPackagePublished ? 'Published client package' : 'Client package status') : 'Document and record index' }}</h2><p>{{ clientVisible ? (clientPackagePublished ? 'The released report and final FS are visible as one matched, downloadable pair.' : 'No final package is published in this scope yet. The response record remains visible while the team completes release gates.') : 'Select a row to inspect its trigger, owner, exact record reference, version, and next handoff.' }}</p></div><div class="artifact-count"><strong>{{ visibleDocuments.length }}</strong><span>visible outputs</span></div></section>

    <OutputCompletenessPanel :active-filter="filter" @select-filter="filter = $event" />

    <section class="artifact-layout">
      <article class="panel artifact-list-panel"><div class="artifact-toolbar"><label class="search-field"><Icon name="search" :size="17" /><span class="sr-only">Search outputs</span><input v-model="search" type="search" placeholder="Search output, owner, or trigger" /></label><div class="filter-row" aria-label="Output filters"><button v-for="item in ['All outputs', 'Ready', 'Needs approval', 'Client-facing', 'Internal', 'Missing', 'Current', 'Stale']" :key="item" type="button" :class="{ active: filter === item }" @click="filter = item">{{ item }}</button></div></div><div class="artifact-list" role="listbox" aria-label="Workflow artifacts"><button v-for="item in visibleDocuments" :key="item.id" type="button" class="artifact-row" :class="{ selected: selected?.id === item.id, 'record-target': artifactSelection.isTarget(item.id) }" :data-record-id="item.id" role="option" :aria-selected="selected?.id === item.id" @click="inspect(item)"><span class="artifact-id">{{ item.id }}</span><span class="artifact-row-copy"><strong>{{ item.title }}</strong><small>{{ item.trigger }} · {{ item.owner }}</small></span><StatusPill :label="item.status" :tone="item.tone" /></button><div v-if="!visibleDocuments.length" class="empty-state"><strong>No outputs match this filter.</strong><span>Try another search or clear the filter.</span></div></div><div class="panel-footnote"><Icon name="info" :size="16" /><span>Each output remains linked to its owner, workflow step and exact version.</span></div></article>
      <aside class="panel artifact-detail-panel"><div class="panel-heading"><div><span class="eyebrow">Selected artifact</span><h2>{{ selected?.id }} · {{ selected?.title }}</h2></div><StatusPill :label="selected?.status || 'Not applicable'" :tone="selected?.tone || 'neutral'" /></div><dl class="artifact-detail-list"><div><dt>Trigger</dt><dd>{{ selected?.trigger }}</dd></div><div><dt>Owner</dt><dd>{{ selected?.owner }}</dd></div><div><dt>Record reference</dt><dd>{{ linkedRecord.id }}</dd></div><div><dt>Exact version</dt><dd>{{ linkedRecord.version }}</dd></div><div><dt>Current state</dt><dd>{{ linkedRecord.state }}</dd></div><div><dt>Recorded by</dt><dd>{{ linkedRecord.actor ? actorById(linkedRecord.actor)?.name : 'System projection' }}</dd></div></dl><div class="artifact-preview"><span class="artifact-watermark">WORKFLOW PREVIEW</span><pre>{{ artifactPreview }}</pre></div><div class="artifact-detail-copy"><span class="guide-label"><Icon name="workflow" :size="14" />How to use this record</span><p>Open the destination page to work the owning task. Inspecting an output does not set a gate complete; the underlying command and evidence must still be recorded.</p></div><div class="button-row artifact-detail-actions"><button type="button" class="button secondary" @click="navigate(selected?.route)">Open {{ selected?.route || 'record' }} <Icon name="arrow-right" :size="15" /></button><button type="button" class="button primary" @click="acknowledge">Mark inspected</button></div></aside>
    </section>
    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Version control</strong> A filename or catalogue row is not an approval. Decisions remain tied to the exact record and revision shown here.</span></div>
  </div>
</template>
