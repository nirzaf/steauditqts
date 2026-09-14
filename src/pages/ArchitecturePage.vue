<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { architectureFlowRows, architectureGuardrails, architectureNodes, client, serviceRoutes, systemsOfRecord, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const selectedNodeId = ref('frappe')

const selectedNode = computed(() => architectureNodes.find((node) => node.id === selectedNodeId.value) || architectureNodes[0])

function nodeFor(id) {
  return architectureNodes.find((node) => node.id === id) || architectureNodes[0]
}

function selectNode(id) {
  selectedNodeId.value = id
}

function navigate(route) {
  emit('navigate', route)
}

function statusTone(tone) {
  return tone === 'green' ? 'good' : tone === 'amber' ? 'warn' : 'neutral'
}
</script>

<template>
  <div class="page architecture-page">
    <PageHeader
      eyebrow="V4 architecture · admin view"
      title="Frappe-first control planes"
      description="See where identity, structured records, Office documents, professional decisions, records protection, and recovery live—and how each boundary is tested before production."
      action-label="Open Phase 0 proof"
      @action="navigate('readiness')"
    />
    <WorkflowGuide :guide="workflowGuides.architecture" />

    <section class="architecture-overview panel">
      <div class="architecture-overview-copy">
        <span class="eyebrow">Decision baseline</span>
        <h2>One modular app, explicit ownership</h2>
        <p>AuditFlow is a synthetic demonstration of the proposed Frappe/ERPNext + <code>audit_practice</code> modular monolith. Each system below has one job, one owner, and a visible handoff.</p>
      </div>
      <div class="architecture-chip-row" aria-label="Architecture decisions">
        <span class="architecture-chip"><Icon name="workflow" :size="16" /><strong>Frappe-first</strong><small>one custom app</small></span>
        <span class="architecture-chip"><Icon name="database" :size="16" /><strong>MariaDB</strong><small>structured records + outbox</small></span>
        <span class="architecture-chip"><Icon name="folder" :size="16" /><strong>SharePoint</strong><small>documents + snapshots</small></span>
        <span class="architecture-chip"><Icon name="key" :size="16" /><strong>Entra</strong><small>identity and sessions</small></span>
        <span class="architecture-chip"><Icon name="shield" :size="16" /><strong>Purview</strong><small>records control plane</small></span>
      </div>
    </section>

    <section class="architecture-layout">
      <article class="panel architecture-map-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Logical architecture</span><h2>Follow a request across the boundary</h2></div>
          <span class="muted-label">Select a node for the control note</span>
        </div>
        <div class="architecture-map-legend">
          <span><i class="legend-swatch tone-blue"></i>Identity / human access</span>
          <span><i class="legend-swatch tone-navy"></i>Firm-managed state</span>
          <span><i class="legend-swatch tone-amber"></i>Microsoft document plane</span>
          <span><i class="legend-swatch tone-purple"></i>Restricted records duty</span>
        </div>
        <div class="architecture-lanes">
          <div v-for="row in architectureFlowRows" :key="row.id" class="architecture-lane">
            <div class="architecture-lane-label">
              <span class="architecture-lane-icon"><Icon :name="row.icon" :size="16" /></span>
              <span><strong>{{ row.label }}</strong><small>{{ row.hint }}</small></span>
            </div>
            <div class="architecture-flow-nodes">
              <template v-for="(nodeId, nodeIndex) in row.nodeIds" :key="`${row.id}-${nodeId}`">
                <button
                  type="button"
                  class="architecture-node"
                  :class="[`node-${nodeFor(nodeId).tone}`, { selected: selectedNodeId === nodeId }]"
                  :aria-pressed="selectedNodeId === nodeId"
                  @click="selectNode(nodeId)"
                >
                  <span class="architecture-node-icon"><Icon :name="nodeFor(nodeId).icon" :size="17" /></span>
                  <span><strong>{{ nodeFor(nodeId).label }}</strong><small>{{ nodeFor(nodeId).kind }}</small></span>
                </button>
                <span v-if="nodeIndex < row.nodeIds.length - 1" class="architecture-connector" aria-hidden="true">
                  <Icon name="arrow-right" :size="16" />
                  <small>{{ row.arrows[nodeIndex] }}</small>
                </span>
              </template>
            </div>
          </div>
        </div>
        <div class="architecture-map-footnote"><Icon name="info" :size="16" /><span><strong>Read this left to right:</strong> a person authenticates, Frappe authorizes a bounded command, the correct source of record is updated, and external effects are reconciled before the next professional gate.</span></div>
      </article>

      <aside class="panel architecture-detail-panel" aria-live="polite">
        <div class="architecture-detail-head">
          <span class="architecture-detail-icon" :class="`tone-${selectedNode.tone}`"><Icon :name="selectedNode.icon" :size="22" /></span>
          <div><span class="eyebrow">{{ selectedNode.kind }}</span><h2>{{ selectedNode.label }}</h2></div>
        </div>
        <p class="architecture-detail-copy">{{ selectedNode.detail }}</p>
        <dl class="architecture-detail-list"><div><dt>Owner / source</dt><dd>{{ selectedNode.owner }}</dd></div><div><dt>Boundary rule</dt><dd>{{ selectedNode.rule }}</dd></div></dl>
        <div class="architecture-detail-callout"><Icon name="shield" :size="16" /><span>V4 rule: a green status is useful only when its scope, revision, and evidence are visible to the person acting.</span></div>
      </aside>
    </section>

    <section class="panel systems-record-panel">
      <div class="panel-heading"><div><span class="eyebrow">Systems of record</span><h2>Where each fact belongs</h2></div><span class="muted-label">{{ client.name }} · synthetic example</span></div>
      <div class="table-wrap responsive-table">
        <table>
          <thead><tr><th>Information</th><th>Authoritative system</th><th>How the prototype presents it</th></tr></thead>
          <tbody>
            <tr v-for="row in systemsOfRecord" :key="row.information">
              <td><div class="architecture-table-label"><span class="architecture-table-icon" :class="`tone-${row.tone}`"><Icon :name="row.icon" :size="15" /></span><strong>{{ row.information }}</strong></div></td>
              <td><strong class="architecture-system-name">{{ row.system }}</strong></td>
              <td class="architecture-projection">{{ row.projection }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-footnote"><Icon name="info" :size="16" /><span>The firm's own ERPNext ledger is not the client audit TB. A document filename, SharePoint column, invoice, or portal login never becomes a substitute for the professional record.</span></div>
    </section>

    <section class="architecture-guardrail-grid">
      <article v-for="guardrail in architectureGuardrails" :key="guardrail.title" class="architecture-guardrail panel">
        <span class="architecture-guardrail-icon" :class="`tone-${guardrail.tone}`"><Icon :name="guardrail.icon" :size="18" /></span>
        <div><h3>{{ guardrail.title }}</h3><p>{{ guardrail.detail }}</p></div>
      </article>
    </section>

    <section class="panel service-route-panel">
      <div class="panel-heading"><div><span class="eyebrow">Service capability profile</span><h2>Routes are enabled deliberately</h2></div><StatusPill label="Scope must be approved" tone="warn" /></div>
      <div class="service-route-grid">
        <article v-for="route in serviceRoutes" :key="route.name" class="service-route-card">
          <div class="service-route-top"><span class="service-route-icon" :class="`tone-${route.tone}`"><Icon :name="route.icon" :size="17" /></span><StatusPill :label="route.state" :tone="statusTone(route.tone)" /></div>
          <h3>{{ route.name }}</h3><p>{{ route.detail }}</p>
        </article>
      </div>
      <div class="architecture-bottom-note"><Icon name="lock" :size="16" /><span><strong>Prototype boundary:</strong> unsupported frameworks, group consolidation, autonomous conclusions, app-only Excel calculation, and live records disposal remain disabled until their own capability and owner evidence exists.</span></div>
    </section>
  </div>
</template>
