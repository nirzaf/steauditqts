<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { capabilityMatrix, integrationIdentities, workflowGuides } from '../data'
import { activeActor, captureRecoveryBackup, reconcileRecovery, restoreRecoveryBackup, resumeRecovery, retryIntegrationOperation, runIntegrationReconciliation, scenario, setProviderSimulation, providerFaults } from '../domain/scenario.js'

const operations = computed(() => scenario.operations.map((operation) => ({
  ...operation,
  name: operation.type === 'DELTA_RECONCILIATION' ? 'Delta reconciliation' : operation.type === 'UPLOAD_TRANSFER' ? 'PBC upload transfer' : operation.type,
  system: operation.type === 'UPLOAD_TRANSFER' ? 'Portal → SharePoint (simulation)' : 'Graph + SharePoint (simulation)',
  started: 'Synthetic run',
  duration: '—',
  status: operation.state === 'SUCCEEDED' ? 'Succeeded' : operation.state === 'RETRY_REQUIRED' ? 'Needs retry' : operation.state === 'NOT_CONNECTED' ? 'Not connected' : operation.state === 'UNCERTAIN_REMOTE_SUCCESS' ? 'Uncertain remote result' : operation.state === 'FAILED' ? 'Failed' : operation.state === 'FENCED' ? 'Fenced' : operation.state === 'CURSOR_EXPIRED' ? 'Cursor expired' : 'Pending',
  tone: operation.state === 'SUCCEEDED' ? 'good' : ['FAILED', 'FENCED'].includes(operation.state) ? 'danger' : operation.state === 'NOT_CONNECTED' ? 'warn' : 'warn',
  detail: operation.expectedResult,
})))
const running = ref(false)
const toast = ref('')
const lastRun = computed(() => operations.value[0]?.id ? 'Latest synthetic check' : 'Not run')
const providerConnected = computed(() => scenario.provider.connected)
const connectedDraft = ref(scenario.provider.connected)
const selectedFault = ref(scenario.provider.nextFault || 'NONE')
const recovery = computed(() => scenario.recovery)
const retryableOperation = computed(() => scenario.operations.find((operation) => ['RETRY_REQUIRED', 'UNCERTAIN_REMOTE_SUCCESS', 'CURSOR_EXPIRED'].includes(operation.state)) || null)
const canSystemOperate = computed(() => Boolean(activeActor()?.roles?.includes('system_admin')))
const canRecordsOperate = computed(() => Boolean(activeActor()?.roles?.includes('records_custodian')))

function reconcile() {
  if (running.value) return
  running.value = true
  const result = runIntegrationReconciliation({ actorPersonaId: activeActor()?.personaId, idempotencyKey: `reconcile-${scenario.operations.length + 1}` })
  running.value = false
  toast.value = result.outcome === 'COMMITTED' ? `Operation ${result.operationId} recorded with ${result.evidenceLevel} evidence.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function applyProviderSimulation() {
  const result = setProviderSimulation({ actorPersonaId: activeActor()?.personaId, connected: connectedDraft.value, nextFault: selectedFault.value, idempotencyKey: `provider-${connectedDraft.value ? 'on' : 'off'}-${selectedFault.value}` })
  toast.value = result.outcome === 'COMMITTED' ? `Provider simulation set to ${result.data.connected ? 'connected' : 'not connected'} · next fault ${result.data.nextFault}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function retryLatest() {
  const operation = retryableOperation.value
  if (!operation) return
  const result = retryIntegrationOperation({ operationId: operation.id, actorPersonaId: activeActor()?.personaId, expectedAttempt: operation.attempt, idempotencyKey: `retry-${operation.id}-${operation.attempt}` })
  toast.value = result.outcome === 'COMMITTED' ? `${operation.id} reconciled against the same deterministic target.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function captureBackup() {
  const result = captureRecoveryBackup({ engagementId: scenario.selectedEngagementId, actorPersonaId: activeActor()?.personaId, idempotencyKey: `backup-${scenario.selectedEngagementId}-${scenario.recovery.activeEpoch}` })
  toast.value = result.outcome === 'COMMITTED' ? `Backup ${result.data.id} captured; recovery can be rehearsed without outward effects.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function restoreBackup() {
  const result = restoreRecoveryBackup({ actorPersonaId: activeActor()?.personaId, idempotencyKey: `restore-${scenario.recovery.backup?.id || 'none'}-${scenario.recovery.activeEpoch}` })
  toast.value = result.outcome === 'COMMITTED' ? `Restore quarantined at epoch ${scenario.recovery.activeEpoch}; permissions and outward effects remain disabled.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function reconcileBackup() {
  const result = reconcileRecovery({ actorPersonaId: activeActor()?.personaId, idempotencyKey: `recovery-reconcile-${scenario.recovery.activeEpoch}` })
  toast.value = result.outcome === 'COMMITTED' ? 'Recovery reconciled against the independent checkpoint.' : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function resumeBackup() {
  const result = resumeRecovery({ actorPersonaId: activeActor()?.personaId, expectedEpoch: scenario.recovery.activeEpoch, idempotencyKey: `recovery-resume-${scenario.recovery.activeEpoch}` })
  toast.value = result.outcome === 'COMMITTED' ? 'Recovery resumed in simulation; outward effects are still disabled.' : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Operations and observability" title="Integration health" description="Monitor the boundaries between Frappe, Microsoft Graph, SharePoint, Entra and Purview. Reconciliation is the baseline control; notifications are acceleration only." action-label="Run reconciliation" @action="reconcile" />
    <WorkflowGuide :guide="workflowGuides.integration" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="panel integration-control-panel"><div class="panel-heading"><div><span class="eyebrow">Synthetic boundary controls</span><h2>Rehearse provider outcomes safely</h2></div><StatusPill label="No external effects" tone="good" /></div><p class="integration-control-intro">These controls only change the local scenario. Use them to demonstrate retry-after, permission denial, timeout uncertainty, expired leases and cursor recovery without contacting Graph, SharePoint, Purview or Entra.</p><div class="integration-control-grid"><label><span>Provider connection</span><select v-model="connectedDraft" aria-label="Provider connection"><option :value="false">Not connected</option><option :value="true">Connected (simulated)</option></select></label><label><span>Next provider outcome</span><select v-model="selectedFault" aria-label="Next provider outcome"><option v-for="fault in providerFaults" :key="fault" :value="fault">{{ fault }}</option></select></label><div class="integration-control-actions"><button type="button" class="button secondary" :disabled="!canSystemOperate" @click="applyProviderSimulation">Apply simulation</button><button type="button" class="button primary" :disabled="!canSystemOperate" @click="reconcile">Run now <Icon name="arrow-right" :size="16" /></button></div></div><div class="integration-control-foot"><span><strong>Current:</strong> {{ providerConnected ? 'connected (simulated)' : 'not connected' }} · <strong>next fault:</strong> {{ scenario.provider.nextFault || 'NONE' }}</span><button type="button" class="text-button" :disabled="!retryableOperation || !canSystemOperate" @click="retryLatest">Retry latest retryable operation <Icon name="arrow-right" :size="15" /></button></div></section>

    <section class="health-grid"><article class="health-card warn"><div class="health-card-top"><span class="health-icon"><Icon name="link" :size="18" /></span><StatusPill label="Not connected" tone="warn" /></div><h2>Microsoft Graph</h2><p>Selected-resource permissions are simulated; no tenant connection is enabled.</p><strong>Provider state: {{ providerConnected ? 'simulated' : 'not connected' }}</strong></article><article class="health-card warn"><div class="health-card-top"><span class="health-icon"><Icon name="folder" :size="18" /></span><StatusPill label="Not connected" tone="warn" /></div><h2>SharePoint</h2><p>Repository binding and version reconciliation remain synthetic.</p><strong>Latest check: {{ lastRun }}</strong></article><article class="health-card warn"><div class="health-card-top"><span class="health-icon"><Icon name="warning" :size="18" /></span><StatusPill label="Manual verification" tone="warn" /></div><h2>Purview</h2><p>Retention label observation is awaiting an explicit records-admin proof.</p><strong>Evidence: SIMULATION</strong></article><article class="health-card warn"><div class="health-card-top"><span class="health-icon"><Icon name="key" :size="18" /></span><StatusPill label="Synthetic only" tone="warn" /></div><h2>Entra ID</h2><p>Persona switching is a walkthrough control, not production identity.</p><strong>No live identities connected</strong></article></section>

    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Durable outbox</span><h2>Recent operations</h2></div><span class="muted-label">{{ operations.length }} records</span></div><div class="operation-list"><div v-for="operation in operations.slice(0, 5)" :key="operation.id" class="operation-row"><span class="operation-icon" :class="`tone-${operation.tone}`"><Icon name="database" :size="16" /></span><div><div class="operation-title"><strong>{{ operation.name }}</strong><code>{{ operation.id }}</code></div><small>{{ operation.system }} · {{ operation.started }} · {{ operation.duration }}</small><p>{{ operation.detail }}</p></div><StatusPill :label="operation.status" :tone="operation.tone" /></div></div></article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">Control boundaries</span><h2>What health means</h2></div></div><ul class="check-list"><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Database intent is durable</strong><small>Each external write has an operation ID and retry state.</small></span></li><li><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>Poll / delta is the baseline</strong><small>Notifications can be lost without bypassing reconciliation.</small></span></li><li><span class="list-icon warn"><Icon name="warning" :size="14" /></span><span><strong>Purview is a separate control plane</strong><small>Desired labels are not reported as enforced until observed.</small></span></li><li><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>Tokens never enter download URLs</strong><small>Portal routes re-check scope for every delivery request.</small></span></li></ul></article></section>

    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Recovery posture</span><h2>Environment boundaries</h2></div><StatusPill label="Staging and production separated" tone="good" /></div><div class="environment-grid"><div><span class="environment-label">Development</span><strong>Synthetic client records</strong><small>Test Graph app · no production identities</small></div><div><span class="environment-label">Staging</span><strong>Production-like, sanitized</strong><small>Separate secrets, site and SharePoint storage</small></div><div><span class="environment-label">Production</span><strong>Restricted deployment rights</strong><small>Backups, monitoring and administrator evidence</small></div></div></section>

    <section class="integration-recovery-grid"><article class="panel recovery-control-panel"><div class="panel-heading"><div><span class="eyebrow">P20 recovery rehearsal</span><h2>Backup, quarantine, reconcile</h2></div><StatusPill :label="recovery.state" :tone="recovery.state === 'RESUMED_SIMULATION' ? 'good' : recovery.state === 'QUARANTINED' ? 'danger' : 'warn'" /></div><dl class="detail-list recovery-detail-list"><div><dt>Active epoch</dt><dd>{{ recovery.activeEpoch }}</dd></div><div><dt>Backup</dt><dd>{{ recovery.backup?.id || 'Not captured' }}</dd></div><div><dt>Independent checkpoint</dt><dd>{{ recovery.externalCheckpointIndependent ? 'Required and separate' : 'Not configured' }}</dd></div><div><dt>Outward effects</dt><dd>{{ recovery.outwardEffectsEnabled ? 'Enabled' : 'Disabled' }}</dd></div></dl><div class="button-row recovery-actions"><button type="button" class="button secondary" :disabled="!canSystemOperate" @click="captureBackup">Capture backup</button><button type="button" class="button secondary" :disabled="!canSystemOperate || !recovery.backup" @click="restoreBackup">Restore + quarantine</button><button type="button" class="button secondary" :disabled="!canSystemOperate || recovery.state !== 'QUARANTINED'" @click="reconcileBackup">Reconcile checkpoint</button><button type="button" class="button primary" :disabled="!canSystemOperate || recovery.state !== 'RECONCILED'" @click="resumeBackup">Resume simulation</button></div><p class="recovery-note"><Icon name="lock" :size="15" /> A resumed rehearsal never re-enables production effects. The user must still supply independent checkpoint evidence and explicit authorization before any real environment is considered.</p></article><article class="panel recovery-evidence-panel"><div class="panel-heading"><div><span class="eyebrow">Recovery evidence</span><h2>What is preserved</h2></div><span class="muted-label">Append-only rehearsal log</span></div><ul class="check-list"><li><span class="list-icon good"><Icon name="database" :size="14" /></span><span><strong>Backup scope is pinned</strong><small>{{ recovery.backup?.candidateIds?.length || 0 }} release candidate(s) and source revision {{ recovery.backup?.sourceRevision || '—' }}</small></span></li><li><span class="list-icon" :class="recovery.reconciliation ? 'good' : 'warn'"><Icon :name="recovery.reconciliation ? 'check' : 'clock'" :size="14" /></span><span><strong>Independent checkpoint</strong><small>{{ recovery.reconciliation?.checkpointId || 'Pending reconciliation' }}</small></span></li><li><span class="list-icon danger"><Icon name="shield" :size="14" /></span><span><strong>Outward effects fenced</strong><small>Recovery and retry commands remain synthetic even after the rehearsal resumes.</small></span></li></ul></article></section>

    <section class="integration-v4-grid">
      <article class="panel integration-identities-panel">
        <div class="panel-heading"><div><span class="eyebrow">Credential separation</span><h2>Who is allowed to do what</h2></div><span class="muted-label">V4 execution groups</span></div>
        <div class="integration-identity-list">
          <div v-for="identity in integrationIdentities" :key="identity.id" class="integration-identity-row">
            <span class="integration-identity-icon" :class="`tone-${identity.tone}`"><Icon :name="identity.icon" :size="16" /></span>
            <div><div class="integration-identity-title"><strong>{{ identity.id }}</strong><StatusPill :label="identity.state" :tone="identity.state === 'Bounded' || identity.state === 'Ready for proof' ? 'good' : identity.state === 'Restricted' || identity.state === 'Manual first' ? 'warn' : 'neutral'" /></div><small>{{ identity.purpose }} · {{ identity.scope }}</small><p>{{ identity.note }}</p></div>
          </div>
        </div>
      </article>
      <article class="panel capability-panel">
        <div class="panel-heading"><div><span class="eyebrow">Capability matrix</span><h2>What is enabled, held, or optional</h2></div><span class="muted-label">Proof required before activation</span></div>
        <div class="capability-list">
          <div v-for="capability in capabilityMatrix" :key="capability.capability" class="capability-row"><span class="capability-state" :class="`state-${capability.tone}`"><Icon :name="capability.tone === 'good' ? 'check' : capability.tone === 'warn' ? 'warning' : 'clock'" :size="14" /></span><div><strong>{{ capability.capability }}</strong><small>{{ capability.route }} · {{ capability.evidence }}</small></div><StatusPill :label="capability.state" :tone="capability.tone === 'good' ? 'good' : capability.tone === 'warn' ? 'warn' : 'neutral'" /></div>
        </div>
        <div class="capability-footnote"><Icon name="lock" :size="16" /><span>The baseline stays safe when an optional webhook, preview, signing, or tenant capability is unavailable: keep it disabled and show the owner the evidence needed to enable it.</span></div>
      </article>
    </section>
  </div>
</template>
