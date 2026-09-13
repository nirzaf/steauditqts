<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { archiveItems, client, formatMoney, workflowGuides } from '../data'

const releaseSteps = [
  ['Draft candidate', 'Candidate RC-026 created'],
  ['Freezing', 'Working inputs stop changing'],
  ['Snapshots verified', 'Exact files and hashes checked'],
  ['Approvals pending', 'Management, partner and EQR'],
  ['Completion verified', 'All blockers and dependencies'],
  ['Report date authorized', 'Signatory authority checked'],
  ['Signing', 'Approved package signed'],
  ['Signed package verified', 'Input/output relationship checked'],
  ['Release authorized', 'One immutable release event'],
  ['Issued', 'Recipients and delivery recorded'],
  ['Archive verified', 'Records protection observed'],
]
const releaseIndex = ref(3)
const toast = ref('')
const releaseStatus = computed(() => releaseIndex.value >= releaseSteps.length - 1 ? 'Archive verified' : releaseIndex.value >= 9 ? 'Issued' : releaseIndex.value >= 8 ? 'Release authorized' : releaseIndex.value >= 4 ? 'Completion in progress' : 'Approvals pending')
const nextStep = computed(() => releaseSteps[Math.min(releaseIndex.value + 1, releaseSteps.length - 1)])

function advanceRelease() {
  if (releaseIndex.value >= releaseSteps.length - 1) return
  releaseIndex.value += 1
  toast.value = `${releaseSteps[releaseIndex.value][0]} recorded in the prototype.`
  window.setTimeout(() => { toast.value = '' }, 3500)
}

function createReleaseCandidate() {
  releaseIndex.value = 0
  toast.value = 'Release candidate RC-026 is ready to inspect. Confirm matching FS, TB, report, approvals, recipients, and hashes before advancing.'
  window.setTimeout(() => { toast.value = '' }, 4000)
}
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Controlled finalization" title="Release & archive" description="A signed package is a durable, version-bound business event. Release, delivery, records protection and amendments are shown as separate controls." action-label="Create release candidate" @action="createReleaseCandidate" />
    <WorkflowGuide :guide="workflowGuides.release" />
    <div v-if="toast" class="toast" role="status" aria-live="polite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>{{ toast }}</div>

    <section class="release-hero panel"><div><span class="eyebrow">Release candidate RC-026 · {{ client.name }}</span><h2>FS v05 + Auditor report v1</h2><p>Report period {{ client.period }} · QAR · manifest digest <code>sha256:5db3…f8aa</code></p></div><div class="release-hero-meta"><StatusPill :label="releaseStatus" :tone="releaseIndex >= 9 ? 'good' : releaseIndex >= 4 ? 'warn' : 'danger'" /><strong>{{ formatMoney(745000) }}</strong><span>total assets in selected FS package</span></div></section>

    <section class="release-layout"><article class="panel release-flow-panel"><div class="panel-heading"><div><span class="eyebrow">State machine</span><h2>Release control path</h2></div><span class="muted-label">Click next control to advance the demo</span></div><div class="release-flow"><button v-for="(step, index) in releaseSteps" :key="step[0]" type="button" class="release-step" :class="{ complete: index < releaseIndex, active: index === releaseIndex, pending: index > releaseIndex }" @click="releaseIndex = index"><span class="release-step-node">{{ index < releaseIndex ? '✓' : index + 1 }}</span><span><strong>{{ step[0] }}</strong><small>{{ step[1] }}</small></span></button></div><div class="next-control"><div><span class="eyebrow">Next control</span><strong>{{ nextStep[0] }}</strong><p>{{ nextStep[1] }}</p></div><button type="button" class="button primary" :disabled="releaseIndex === releaseSteps.length - 1" @click="advanceRelease">{{ releaseIndex >= 8 ? 'Record next event' : 'Run next control' }} <span aria-hidden="true">→</span></button></div></article><aside class="panel completion-panel"><div class="panel-heading"><div><span class="eyebrow">Completion checklist</span><h2>Current readiness</h2></div><StatusPill label="3 blockers" tone="danger" /></div><ul class="check-list"><li><span class="list-icon good">✓</span><span><strong>Final FS / TB / report versions match</strong><small>FS v05 · TB v04 · report v1</small></span></li><li><span class="list-icon good">✓</span><span><strong>Management responsibility recorded</strong><small>Nadia Faris · exact FS v05</small></span></li><li><span class="list-icon warn">!</span><span><strong>Partner conclusion</strong><small>Pending after AR-019 and AJ-002</small></span></li><li><span class="list-icon danger">×</span><span><strong>Required EQR</strong><small>Yusuf Ali · not started</small></span></li><li><span class="list-icon warn">!</span><span><strong>Delivery recipients</strong><small>Validated only after release authorization</small></span></li></ul></aside></section>

    <section class="panel archive-panel"><div class="panel-heading"><div><span class="eyebrow">Records assembly</span><h2>Archive manifest</h2></div><span class="muted-label">Profile RP-2026-AUD · verified item by item</span></div><div class="archive-grid"><div v-for="item in archiveItems" :key="item.label" class="archive-item"><span class="archive-icon" :class="`tone-${item.tone}`"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4zM8 6V4h8v2M8 11h8M8 15h5"/></svg></span><div><strong>{{ item.label }}</strong><small>{{ item.type }}</small><p>{{ item.detail }}</p></div><StatusPill :label="item.state" :tone="item.tone" /></div></div><div class="archive-footer"><span><strong>Archive is more than Office files.</strong> Structured exports include assessments, TB/mapping snapshots, risks, procedures, findings, approvals, release events and application activity.</span><button type="button" class="button secondary">Open archive index</button></div></section>

    <section class="amendment-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg><span><strong>Amendments never overwrite an issued report.</strong> A post-issuance correction creates a linked amendment case, preserves the original package, and follows a new authorization path.</span></section>
  </div>
</template>
