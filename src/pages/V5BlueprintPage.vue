<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { client, workflowGuides } from '../data'
import { v5CommercialFixture, v5Documents, v5GateDefinitions, v5NotificationMatrix, v5RoleMatrix, v5SystemLayers } from '../v5Data'

const emit = defineEmits(['navigate'])
const selectedGateId = ref('G7')
const selectedDocumentId = ref('DOC-05')
const documentFilter = ref('All outputs')
const roleFilter = ref('All roles')

const documentFilters = ['All outputs', 'Ready / issued', 'Needs review', 'Pending']
const roleFilters = ['All roles', 'Client', 'Audit team', 'Finance', 'Control owners']
const destinationLabels = {
  architecture: 'Architecture map',
  clients: 'Clients & acceptance',
  blueprint: 'V5 operating model',
  engagements: 'Engagement workspace',
  pbc: 'PBC portal',
  audit: 'Audit & fieldwork',
  accounting: 'Accounting & TB',
  reviews: 'Reviews & approvals',
  'client-communications': 'Client communications',
  release: 'Release & archive',
  integration: 'Integration health',
}

const selectedGate = computed(() => v5GateDefinitions.find((gate) => gate.id === selectedGateId.value) || v5GateDefinitions[0])
const selectedDocument = computed(() => v5Documents.find((document) => document.id === selectedDocumentId.value) || v5Documents[0])

const filteredDocuments = computed(() => v5Documents.filter((document) => {
  if (documentFilter.value === 'All outputs') return true
  if (documentFilter.value === 'Ready / issued') return ['good'].includes(document.tone)
  if (documentFilter.value === 'Needs review') return ['warn', 'danger'].includes(document.tone)
  return document.tone === 'neutral'
}))

const filteredRoles = computed(() => v5RoleMatrix.filter((item) => {
  if (roleFilter.value === 'All roles') return true
  if (roleFilter.value === 'Client') return item.role.startsWith('Client')
  if (roleFilter.value === 'Audit team') return ['Junior / preparer', 'Audit Senior', 'Audit Manager', 'Audit Partner / signatory'].includes(item.role)
  if (roleFilter.value === 'Finance') return item.role === 'Finance team'
  return item.role === 'EQR / records / security'
}))

const estimatedLabour = computed(() => v5CommercialFixture.rows.reduce((sum, row) => sum + row.labourCost, 0))
const estimatedContribution = computed(() => v5CommercialFixture.rows.reduce((sum, row) => sum + row.contribution, 0))

function navigate(route) {
  emit('navigate', route)
}

function statusTone(tone) {
  return tone === 'green' ? 'good' : tone === 'amber' || tone === 'warn' ? 'warn' : tone === 'danger' ? 'danger' : tone === 'purple' ? 'neutral' : 'neutral'
}

function selectDocument(document) {
  selectedDocumentId.value = document.id
}

function formatQar(value) {
  return `QAR ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`
}

function destinationLabel(route) {
  return destinationLabels[route] || route
}

</script>

<template>
  <div class="page v5-blueprint-page">
    <PageHeader
      eyebrow="Specification v5.0 · operating model"
      title="Audit Practice Platform — v5 operating model"
      description="A stakeholder-friendly map of the v5 architecture, independent gates, 26 named outputs, commercial controls, role boundaries and notification handoffs for one Northstar Trading engagement."
      action-label="Open complete cycle"
      action-icon="workflow"
      @action="navigate('cycle')"
    />

    <WorkflowGuide :guide="workflowGuides.blueprint" />

    <section class="panel v5-contract-panel" aria-labelledby="v5-contract-title">
      <div class="v5-contract-heading">
        <div>
          <span class="eyebrow">How to read this page</span>
          <h2 id="v5-contract-title">One connected practice, two deployment layers</h2>
          <p>V5 describes the production target as a Frappe-first modular monolith. This workspace shows how the Vue/Vite client and Cloudflare Worker support the key workflow handoffs.</p>
        </div>
        <StatusPill label="Guided platform view" tone="neutral" />
      </div>
      <div class="v5-deployment-grid">
        <article class="v5-deployment-card current">
          <div class="v5-deployment-top"><span class="v5-deployment-icon"><Icon name="pulse" :size="17" /></span><span class="eyebrow">Current workspace</span></div>
          <h3>Vue/Vite + Cloudflare Worker</h3>
          <p>The workspace presents scoped client details, messages, evidence receipts and workflow handoffs through the configured API route.</p>
          <small><Icon name="lock" :size="14" />Each role sees only its own tasks and decisions</small>
        </article>
        <div class="v5-deployment-arrow" aria-hidden="true"><Icon name="arrow-right" :size="20" /><span>bounded edge boundary</span></div>
        <article class="v5-deployment-card target">
          <div class="v5-deployment-top"><span class="v5-deployment-icon"><Icon name="workflow" :size="17" /></span><span class="eyebrow">V5 target</span></div>
          <h3>Frappe + <code>audit_practice</code></h3>
          <p>One modular monolith owns authorization, commands, gates, approvals and structured records. MariaDB, Frappe workers, Graph, SharePoint and Purview remain named planes.</p>
          <small><Icon name="info" :size="14" />Worker is not the Frappe application host</small>
        </article>
      </div>
    </section>

    <section class="v5-section" aria-labelledby="v5-gates-title">
      <div class="v5-section-heading"><div><span class="eyebrow">§6.2 · independent gates</span><h2 id="v5-gates-title">The release path is eleven decisions, not one status</h2><p>Select a gate to see the evidence, owner and destination screen that explains it.</p></div><span class="muted-label">{{ v5GateDefinitions.filter((gate) => gate.status === 'READY').length }} ready · {{ v5GateDefinitions.filter((gate) => gate.tone === 'danger').length }} blocked</span></div>
      <div class="v5-gate-layout">
        <div class="v5-gate-grid" role="list" aria-label="V5 independent gates">
          <button v-for="gate in v5GateDefinitions" :key="gate.id" type="button" class="v5-gate-card" :class="[`v5-gate-${gate.tone}`, { selected: selectedGateId === gate.id }]" :aria-pressed="selectedGateId === gate.id" @click="selectedGateId = gate.id">
            <span class="v5-gate-number">{{ gate.id }}</span>
            <span class="v5-gate-copy"><strong>{{ gate.title }}</strong><small>{{ gate.detail }}</small></span>
            <StatusPill :label="gate.status" :tone="statusTone(gate.tone)" />
          </button>
        </div>
        <aside class="panel v5-gate-detail" aria-live="polite">
          <div class="v5-detail-head"><span class="v5-detail-number">{{ selectedGate.id }}</span><div><span class="eyebrow">Selected gate</span><h3>{{ selectedGate.title }}</h3></div><StatusPill :label="selectedGate.status" :tone="statusTone(selectedGate.tone)" /></div>
          <p>{{ selectedGate.detail }}</p>
          <dl class="v5-detail-list"><div><dt>Owner</dt><dd>{{ selectedGate.owner }}</dd></div><div><dt>Workspace</dt><dd>{{ destinationLabel(selectedGate.route) }}</dd></div><div><dt>Current status</dt><dd>{{ selectedGate.status === 'READY' ? 'Evidence is recorded for this step' : selectedGate.status === 'BLOCKED' ? 'AR-019, EQR or exact release evidence still holds the path' : 'The next action is visible in the complete cycle' }}</dd></div></dl>
          <button type="button" class="button secondary full-width" @click="navigate(selectedGate.route)">Open {{ destinationLabel(selectedGate.route) }} <Icon name="arrow-right" :size="16" /></button>
        </aside>
      </div>
    </section>

    <section class="panel v5-documents-panel" aria-labelledby="v5-documents-title">
      <div class="panel-heading"><div><span class="eyebrow">§24 · named outputs</span><h2 id="v5-documents-title">26 documents and records with distinct triggers</h2><p>Use the filters to explain what exists, when it is created and who owns the next decision.</p></div><span class="muted-label">{{ filteredDocuments.length }} shown</span></div>
      <div class="v5-doc-toolbar"><div class="filter-row" role="toolbar" aria-label="Filter named outputs"><button v-for="filter in documentFilters" :key="filter" type="button" :class="{ active: documentFilter === filter }" :aria-pressed="documentFilter === filter" @click="documentFilter = filter">{{ filter }}</button></div><span class="v5-doc-selected"><Icon name="file" :size="15" />{{ selectedDocument.id }} selected</span></div>
      <div class="v5-doc-layout">
        <div class="v5-doc-list" role="list" aria-label="Named document catalogue">
          <button v-for="document in filteredDocuments" :key="document.id" type="button" class="v5-doc-row" :class="{ selected: selectedDocumentId === document.id }" :aria-pressed="selectedDocumentId === document.id" @click="selectDocument(document)">
            <span class="v5-doc-id">{{ document.id }}</span><span class="v5-doc-copy"><strong>{{ document.title }}</strong><small>{{ document.trigger }}</small></span><StatusPill :label="document.status" :tone="statusTone(document.tone)" /><Icon name="chevron-right" :size="15" />
          </button>
        </div>
        <aside class="panel v5-doc-detail" aria-live="polite"><div class="v5-detail-head"><span class="v5-doc-detail-icon" :class="`tone-${selectedDocument.tone === 'danger' ? 'amber' : selectedDocument.tone}`"><Icon name="file" :size="19" /></span><div><span class="eyebrow">{{ selectedDocument.id }}</span><h3>{{ selectedDocument.title }}</h3></div><StatusPill :label="selectedDocument.status" :tone="statusTone(selectedDocument.tone)" /></div><dl class="v5-detail-list"><div><dt>Creation trigger</dt><dd>{{ selectedDocument.trigger }}</dd></div><div><dt>Owner / approval</dt><dd>{{ selectedDocument.owner }}</dd></div><div><dt>Workspace</dt><dd>{{ destinationLabel(selectedDocument.route) }}</dd></div></dl><button type="button" class="button secondary full-width" @click="navigate(selectedDocument.route)">Open {{ destinationLabel(selectedDocument.route) }} <Icon name="arrow-right" :size="16" /></button></aside>
      </div>
    </section>

    <section class="v5-commercial-layout" aria-labelledby="v5-commercial-title">
      <article class="panel v5-commercial-panel">
        <div class="panel-heading"><div><span class="eyebrow">Appendix E · D5 fixture</span><h2 id="v5-commercial-title">Commercial onboarding and close</h2><p>{{ v5CommercialFixture.client }} · {{ v5CommercialFixture.period }} · {{ v5CommercialFixture.engagement }}</p></div><StatusPill :label="v5CommercialFixture.estimate.state" tone="good" /></div>
        <div class="v5-commercial-kpis"><div><span>Budget hours</span><strong>{{ v5CommercialFixture.estimate.budgetHours }}</strong><small>Junior → Partner</small></div><div><span>Service cost</span><strong>{{ formatQar(v5CommercialFixture.estimate.serviceCost) }}</strong><small>Labour + travel</small></div><div><span>Approved fee</span><strong>{{ formatQar(v5CommercialFixture.estimate.approvedFee) }}</strong><small>{{ v5CommercialFixture.feeBasis }}</small></div><div><span>Advance</span><strong>{{ formatQar(v5CommercialFixture.estimate.advanceAllocated) }}</strong><small>Verified + allocated</small></div></div>
        <div class="table-wrap responsive-table"><table><thead><tr><th>Level</th><th>Hours</th><th>Internal rate</th><th>Labour cost</th><th>Illustrative sell</th><th>Time-price contribution</th></tr></thead><tbody><tr v-for="row in v5CommercialFixture.rows" :key="row.level"><td><strong>{{ row.level }}</strong></td><td>{{ row.hours }}</td><td>{{ formatQar(row.costRate) }} / hr</td><td>{{ formatQar(row.labourCost) }}</td><td>{{ formatQar(row.sellingRate) }} / hr</td><td>{{ formatQar(row.contribution) }}</td></tr><tr class="v5-total-row"><td><strong>Total</strong></td><td><strong>{{ v5CommercialFixture.estimate.budgetHours }}</strong></td><td>—</td><td><strong>{{ formatQar(estimatedLabour) }}</strong></td><td>—</td><td><strong>{{ formatQar(estimatedContribution) }}</strong></td></tr></tbody></table></div>
        <div class="v5-commercial-note"><Icon name="info" :size="16" /><span>QAR 36,000 is an authorized fixed fee, not the time-price illustration of QAR 36,400. The client sees approved pricing only; internal rates stay in the finance boundary.</span></div>
      </article>
      <aside class="panel v5-close-panel"><div class="panel-heading"><div><span class="eyebrow">After issuance · G9</span><h2>Actuals and invoice</h2></div><StatusPill label="Finance review" tone="warn" /></div><div class="v5-close-metrics"><div><span>Actual hours</span><strong>{{ v5CommercialFixture.actual.hours }}</strong><small>+{{ v5CommercialFixture.actual.hoursVariance }} vs baseline</small></div><div><span>Actual service cost</span><strong>{{ formatQar(v5CommercialFixture.actual.serviceCost) }}</strong><small>+{{ formatQar(v5CommercialFixture.actual.costVariance) }} variance</small></div><div><span>Contribution</span><strong>{{ formatQar(v5CommercialFixture.actual.contribution) }}</strong><small>{{ v5CommercialFixture.actual.contributionPercent.toFixed(2) }}% of fee basis</small></div><div><span>Remaining balance</span><strong>{{ formatQar(v5CommercialFixture.actual.remainingBalance) }}</strong><small>After one QAR 9,000 advance</small></div></div><div class="v5-invoice-line"><span><Icon name="file" :size="15" />{{ v5CommercialFixture.actual.invoiceState }}</span><strong>{{ formatQar(v5CommercialFixture.actual.finalInvoice) }}</strong></div><ul class="check-list v5-control-list"><li v-for="control in v5CommercialFixture.controls" :key="control"><span class="list-icon good"><Icon name="check" :size="14" /></span><span>{{ control }}</span></li></ul></aside>
    </section>

    <section class="v5-role-notification-layout" aria-labelledby="v5-roles-title">
      <article class="panel v5-role-panel"><div class="panel-heading"><div><span class="eyebrow">§2.3 + §26.1 · role boundaries</span><h2 id="v5-roles-title">Same platform, different authority</h2></div><span class="muted-label">{{ filteredRoles.length }} roles shown</span></div><div class="v5-role-filter"><div class="filter-row" role="toolbar" aria-label="Filter role boundaries"><button v-for="filter in roleFilters" :key="filter" type="button" :class="{ active: roleFilter === filter }" :aria-pressed="roleFilter === filter" @click="roleFilter = filter">{{ filter }}</button></div></div><div class="v5-role-list"><article v-for="item in filteredRoles" :key="item.role" class="v5-role-row"><span class="v5-role-icon" :class="`tone-${item.tone}`"><Icon :name="item.icon" :size="17" /></span><div><strong>{{ item.role }}</strong><p>{{ item.surface }}</p><small><Icon name="lock" :size="13" />{{ item.boundary }}</small></div></article></div></article>
      <article class="panel v5-notification-panel"><div class="panel-heading"><div><span class="eyebrow">§26.2 · notification matrix</span><h2>Every handoff has named recipients</h2></div><span class="muted-label">{{ v5NotificationMatrix.length }} triggers</span></div><div class="v5-notification-list"><div v-for="notification in v5NotificationMatrix" :key="notification.trigger" class="v5-notification-row"><span class="v5-notification-dot"></span><div><strong>{{ notification.trigger }}</strong><small>{{ notification.recipients }}</small><p>{{ notification.action }}</p></div></div></div></article>
    </section>

    <section class="panel v5-system-panel" aria-labelledby="v5-system-title"><div class="panel-heading"><div><span class="eyebrow">§4 + §27–29 · architecture path</span><h2 id="v5-system-title">From a named user to a recoverable release</h2><p>Follow the system boundary left to right. Each handoff has a source of record and a testable failure mode.</p></div><span class="muted-label">{{ v5SystemLayers.length }} layers</span></div><div class="v5-system-flow" role="list" aria-label="V5 architecture layers"><template v-for="(layer, index) in v5SystemLayers" :key="layer.id"><article class="v5-system-layer" :class="`tone-${layer.tone}`" role="listitem"><span class="v5-system-number">{{ layer.number }}</span><span class="v5-system-icon"><Icon :name="layer.icon" :size="18" /></span><span class="v5-system-copy"><strong>{{ layer.label }}</strong><small>{{ layer.kind }}</small><p>{{ layer.detail }}</p><em>{{ layer.handoff }}</em></span></article><span v-if="index < v5SystemLayers.length - 1" class="v5-system-connector" aria-hidden="true"><Icon name="arrow-right" :size="16" /></span></template></div></section>

    <div class="prototype-note v5-boundary-note"><Icon name="info" :size="17" /><span><strong>How to use this model:</strong> select a gate, review its owner and evidence, then open the linked workspace to see the handoff in context.</span></div>
  </div>
</template>
