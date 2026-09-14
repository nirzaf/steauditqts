<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { archiveItems, formatMoney, workflowGuides } from '../data'
import { activeActor, advanceRelease as advanceReleaseCommand, assembleArchive, createAmendmentCase, createReleaseCheckpoint, recordLegalHold, releaseCandidateBlockers, releaseLegalHold, releaseSteps as scenarioReleaseSteps, scenario, selectedClient as scenarioClient, selectedEngagement as scenarioEngagement } from '../domain/scenario.js'

const releaseSteps = scenarioReleaseSteps
const inspectedIndex = ref(0)
const toast = ref('')
const selectedEngagement = computed(() => scenarioEngagement())
const selectedClient = computed(() => scenarioClient())
const candidate = computed(() => scenario.releaseCandidates.find((item) => item.engagementId === selectedEngagement.value?.id && item.state !== 'ARCHIVED') || scenario.releaseCandidates[0])
const releaseIndex = computed(() => candidate.value?.stepIndex || 0)
const blockers = computed(() => releaseCandidateBlockers(candidate.value?.id))
const releaseStatus = computed(() => candidate.value?.archiveState === 'VERIFIED' ? 'Archive verified' : releaseIndex.value >= releaseSteps.length - 1 ? 'Archive assembly required' : releaseIndex.value >= 8 ? 'Delivered' : releaseIndex.value >= 6 ? 'Release event committed' : blockers.value.length ? 'Blocked' : 'Ready to advance')
const releaseTone = computed(() => candidate.value?.archiveState === 'VERIFIED' ? 'good' : blockers.value.length ? 'danger' : releaseIndex.value >= 8 ? 'good' : 'warn')
const nextStep = computed(() => releaseSteps[Math.min(releaseIndex.value + 1, releaseSteps.length - 1)])
const archivePackage = computed(() => scenario.archivePackages?.find((item) => item.candidateId === candidate.value?.id) || null)
const legalHolds = computed(() => (scenario.legalHolds || []).filter((item) => item.engagementId === selectedEngagement.value?.id))
const amendments = computed(() => (scenario.amendments || []).filter((item) => item.engagementId === selectedEngagement.value?.id))
const canRecords = computed(() => Boolean(activeActor()?.roles?.includes('records_custodian')))
const canPartner = computed(() => Boolean(activeActor()?.roles?.includes('engagement_partner')))
const safetyChecks = computed(() => [
  { label: 'Client input generation', value: `g${selectedEngagement.value.inputGeneration}`, detail: `Candidate evaluated at g${candidate.value.evaluatedInputGeneration}`, icon: 'refresh', state: candidate.value.inputGeneration === candidate.value.evaluatedInputGeneration ? 'Current' : 'Stale', tone: candidate.value.inputGeneration === candidate.value.evaluatedInputGeneration ? 'good' : 'warn' },
  { label: 'Policy generation', value: `p${selectedEngagement.value.policyGeneration}`, detail: `Pinned to ${candidate.value.id}`, icon: 'settings', state: 'Current', tone: 'good' },
  { label: 'Manifest digest', value: candidate.value.manifestDigest, detail: `${selectedEngagement.value.serviceLabel} · revision ${candidate.value.revision}`, icon: 'link', state: 'Matched', tone: 'good' },
  { label: 'Protection + checkpoint', value: candidate.value.checkpointId || 'Pending', detail: candidate.value.protection === 'VERIFIED_SIMULATION' ? 'Simulated protection observed' : 'Protection or checkpoint still required', icon: 'shield', state: candidate.value.checkpointId ? 'Verified' : 'Blocks release', tone: candidate.value.checkpointId ? 'good' : 'danger' },
])

function advanceRelease() {
  if (releaseIndex.value >= releaseSteps.length - 1) return
  const actor = activeActor()
  const result = releaseIndex.value === 7 && !candidate.value.checkpointId
    ? createReleaseCheckpoint({ candidateId: candidate.value.id, actorPersonaId: actor?.personaId, expectedRevision: candidate.value.revision, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `checkpoint-${candidate.value.id}-${candidate.value.revision}` })
    : advanceReleaseCommand({ candidateId: candidate.value.id, actorPersonaId: actor?.personaId, expectedRevision: candidate.value.revision, expectedSessionEpoch: actor?.sessionEpoch, idempotencyKey: `release-${candidate.value.id}-${candidate.value.revision}-${releaseIndex.value}` })
  toast.value = result.outcome === 'COMMITTED' ? `${releaseSteps[Math.min(candidate.value.stepIndex, releaseSteps.length - 1)][0]} recorded with ${result.evidenceLevel} evidence.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createReleaseCandidate() {
  inspectedIndex.value = 0
  toast.value = `${candidate.value.id} selected for inspection. Rail clicks only inspect; guarded commands are required to advance.`
  window.setTimeout(() => { toast.value = '' }, 4000)
}

function inspectReleaseStep(index) {
  inspectedIndex.value = index
}

async function assembleArchivePackage() {
  const result = await assembleArchive({ candidateId: candidate.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: candidate.value?.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `archive-${candidate.value?.id}-${candidate.value?.revision}` })
  toast.value = result.outcome === 'COMMITTED' ? `Archive ${result.data.id} verified with manifest ${result.data.manifestDigest}.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function openLegalHold() {
  const result = recordLegalHold({ engagementId: selectedEngagement.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: selectedEngagement.value?.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `hold-${selectedEngagement.value?.id}-${scenario.legalHolds?.length || 0}`, type: 'LITIGATION', reason: 'Synthetic preservation hold recorded from the release workspace.' })
  toast.value = result.outcome === 'COMMITTED' ? `Legal hold ${result.data.id} is active; disposal remains blocked.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function releaseHold(hold) {
  const result = releaseLegalHold({ holdId: hold.id, actorPersonaId: activeActor()?.personaId, expectedRevision: hold.revision, expectedSessionEpoch: activeActor()?.sessionEpoch, idempotencyKey: `hold-release-${hold.id}-${hold.revision}`, rationale: 'Synthetic records custodian release recorded after the preservation need ended.' })
  toast.value = result.outcome === 'COMMITTED' ? `Legal hold ${hold.id} released; the original hold event remains in the ledger.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}

function openAmendment() {
  const result = createAmendmentCase({ candidateId: candidate.value?.id, actorPersonaId: activeActor()?.personaId, expectedRevision: candidate.value?.revision, idempotencyKey: `amendment-${candidate.value?.id}-${candidate.value?.revision}`, reason: 'Synthetic post-issuance fact requires a linked new assessment.' })
  toast.value = result.outcome === 'COMMITTED' ? `Amendment ${result.data.id} opened; original package ${result.data.originalCandidateId} remains preserved.` : `${result.outcome}: ${result.code} — ${result.message}`
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Controlled finalization" title="Release & archive" description="A signed package is a durable, version-bound business event. Release, delivery, records protection and amendments are shown as separate controls." action-label="Create release candidate" @action="createReleaseCandidate" />
    <WorkflowGuide :guide="workflowGuides.release" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ toast }}</div>

    <section class="release-hero panel"><div><span class="eyebrow">Release candidate {{ candidate.id }} · {{ selectedClient.name }}</span><h2>Version-bound synthetic package</h2><p>Period {{ selectedEngagement.periodLabel }} · {{ selectedEngagement.currency }} · manifest digest <code>{{ candidate.manifestDigest }}</code></p></div><div class="release-hero-meta"><StatusPill :label="releaseStatus" :tone="releaseTone" /><strong>{{ formatMoney(745000) }}</strong><span>illustrative total assets · SIMULATION</span></div></section>

    <section class="release-safety-strip" aria-label="Release safety checks">
      <article v-for="check in safetyChecks" :key="check.label" class="release-safety-card panel"><div class="release-safety-card-top"><span class="release-safety-icon" :class="`tone-${check.tone}`"><Icon :name="check.icon" :size="16" /></span><StatusPill :label="check.state" :tone="check.tone" /></div><span class="release-safety-label">{{ check.label }}</span><strong>{{ check.value }}</strong><small>{{ check.detail }}</small></article>
    </section>
    <div class="release-guard-note"><Icon name="lock" :size="16" /><span><strong>Why this candidate is {{ blockers.length ? 'blocked' : 'eligible for the next guard' }}:</strong> the command compares current input generation, policy generation, exact manifest, applicable approvals, protection attestation, and checkpoint at action time. Rail clicks inspect only; they never set a release state.</span></div>
    <div v-if="blockers.length" class="release-blocker-list" role="status" aria-live="polite"><strong>Current blockers</strong><ul><li v-for="blocker in blockers" :key="`${blocker.code}-${blocker.message}`"><code>{{ blocker.code }}</code> {{ blocker.message }}</li></ul></div>

    <section class="release-layout"><article class="panel release-flow-panel"><div class="panel-heading"><div><span class="eyebrow">State machine</span><h2>Release control path</h2></div><span class="muted-label">Select a step to inspect; use the guarded command to advance</span></div><div class="release-flow"><button v-for="(step, index) in releaseSteps" :key="step[0]" type="button" class="release-step" :class="{ complete: index < releaseIndex, active: index === releaseIndex, pending: index > releaseIndex, inspected: inspectedIndex === index }" @click="inspectReleaseStep(index)"><span class="release-step-node"><Icon :name="index < releaseIndex ? 'check' : 'clock'" :size="14" />{{ index >= releaseIndex ? index + 1 : '' }}</span><span><strong>{{ step[0] }}</strong><small>{{ step[1] }}</small></span></button></div><div class="next-control"><div><span class="eyebrow">Next guarded control</span><strong>{{ nextStep[0] }}</strong><p>{{ nextStep[1] }}</p></div><button type="button" class="button primary" :disabled="releaseIndex === releaseSteps.length - 1" @click="advanceRelease">{{ releaseIndex === 7 && !candidate.checkpointId ? 'Verify checkpoint' : releaseIndex >= 8 ? 'Record archive event' : 'Run guarded control' }} <Icon name="arrow-right" :size="16" /></button></div></article><aside class="panel completion-panel"><div class="panel-heading"><div><span class="eyebrow">Completion checklist</span><h2>Current readiness</h2></div><StatusPill :label="`${blockers.length} blockers`" :tone="blockers.length ? 'danger' : 'good'" /></div><ul class="check-list"><li v-for="blocker in blockers" :key="`${blocker.code}-check`"><span class="list-icon danger"><Icon name="lock" :size="14" /></span><span><strong>{{ blocker.code }}</strong><small>{{ blocker.message }}</small></span></li><li v-if="!blockers.length"><span class="list-icon good"><Icon name="check" :size="14" /></span><span><strong>All current guards satisfied</strong><small>The next action is still scoped to the named authority.</small></span></li></ul></aside></section>

    <section class="panel archive-panel"><div class="panel-heading"><div><span class="eyebrow">Records assembly</span><h2>Archive manifest</h2></div><span class="muted-label">Profile RP-2026-AUD · verified item by item</span></div><div class="archive-grid"><div v-for="item in archiveItems" :key="item.label" class="archive-item"><span class="archive-icon" :class="`tone-${item.tone}`"><Icon name="archive" :size="17" /></span><div><strong>{{ item.label }}</strong><small>{{ item.type }}</small><p>{{ item.detail }}</p></div><StatusPill :label="item.state" :tone="item.tone" /></div></div><div class="archive-footer"><span><strong>Archive is more than Office files.</strong> Structured exports include assessments, TB/mapping snapshots, risks, procedures, findings, approvals, release events and application activity.</span><button type="button" class="button secondary" :disabled="!canRecords || !candidate.releaseEventId || releaseIndex < 9" @click="assembleArchivePackage">{{ archivePackage ? 'Re-verify archive' : 'Assemble archive' }} <Icon name="arrow-right" :size="16" /></button></div><div class="archive-live-state"><div><span class="eyebrow">Live synthetic record</span><strong>{{ archivePackage ? archivePackage.id : 'Not assembled yet' }}</strong><small>{{ archivePackage ? `Canonical digest ${archivePackage.manifestDigest}` : 'The command needs a delivered candidate, release event and records-custodian authority.' }}</small></div><StatusPill :label="archivePackage?.state || 'PENDING'" :tone="archivePackage ? 'good' : 'warn'" /></div></section>

    <section class="release-records-grid"><article class="panel records-control-panel"><div class="panel-heading"><div><span class="eyebrow">Preservation controls</span><h2>Legal holds</h2></div><span class="muted-label">{{ legalHolds.length }} scoped record{{ legalHolds.length === 1 ? '' : 's' }}</span></div><div class="records-list"><div v-for="hold in legalHolds" :key="hold.id" class="records-row"><span class="records-row-icon" :class="hold.state === 'ACTIVE' ? 'tone-danger' : 'tone-neutral'"><Icon :name="hold.state === 'ACTIVE' ? 'lock' : 'archive'" :size="16" /></span><div><div class="records-row-title"><strong>{{ hold.id }}</strong><StatusPill :label="hold.state" :tone="hold.state === 'ACTIVE' ? 'danger' : 'neutral'" /></div><small>{{ hold.type }} · revision {{ hold.revision }}</small><p>{{ hold.reason }}</p></div><button v-if="hold.state === 'ACTIVE'" type="button" class="row-button" :disabled="!canRecords" @click="releaseHold(hold)">Release hold</button></div><div v-if="!legalHolds.length" class="records-empty"><Icon name="archive" :size="16" /><span>No hold is registered for this engagement. Record one when a preservation obligation is identified.</span></div></div><div class="records-footer"><span>Record and release events remain append-only; releasing a hold never deletes the history.</span><button type="button" class="button secondary" :disabled="!canRecords" @click="openLegalHold">Record legal hold</button></div></article><article class="panel records-control-panel"><div class="panel-heading"><div><span class="eyebrow">Post-issuance workflow</span><h2>Amendment cases</h2></div><span class="muted-label">Original package preserved</span></div><div v-if="amendments.length" class="records-list"><div v-for="amendment in amendments" :key="amendment.id" class="records-row"><span class="records-row-icon tone-warn"><Icon name="link" :size="16" /></span><div><div class="records-row-title"><strong>{{ amendment.id }}</strong><StatusPill :label="amendment.state" tone="warn" /></div><small>Original {{ amendment.originalCandidateId }} · revision {{ amendment.revision }}</small><p>{{ amendment.reason }}</p></div></div></div><div v-else class="records-empty"><Icon name="link" :size="16" /><span>No amendment case is open. Use this only after an issued package needs a new assessment.</span></div><div class="records-footer"><span>Amendments link the new case to the original release event and manifest digest.</span><button type="button" class="button secondary" :disabled="!canPartner || releaseIndex < 9 || !candidate.releaseEventId" @click="openAmendment">Open amendment case</button></div></article></section>

    <section class="amendment-note"><Icon name="link" :size="17" /><span><strong>Amendments never overwrite an issued report.</strong> A post-issuance correction creates a linked amendment case, preserves the original package, and follows a new authorization path.</span></section>
  </div>
</template>
