<script setup>
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { computed, ref } from 'vue'
import { demoUsers } from '../auth'
import { navItems, workflowGuides } from '../data'
import { activeActor, actorSession, scenario, setActorStatus } from '../domain/scenario.js'
import { resetDemoData } from '../demoReset.js'
import { isSharedDemoEnabled, resetSharedDemo } from '../sharedDemo.js'

const emit = defineEmits(['navigate'])
const accessRows = [
  { label: 'Client portal', scope: 'Submit details, evidence questions, and portal messages', tone: 'blue', pages: '3 pages' },
  { label: 'Accountant portal', scope: 'View client facts and continue preparation work', tone: 'green', pages: '5 pages' },
  { label: 'Admin portal', scope: 'All workflow pages, access overview, and control visibility', tone: 'navy', pages: '15 pages' },
]
const activity = [
  { time: '09:42', title: 'Graph delta reconciliation', detail: '41 items reconciled · no missing snapshots', tone: 'good' },
  { time: '09:30', title: 'Client detail submission', detail: 'Northstar Trading profile available for review', tone: 'blue' },
  { time: 'Yesterday', title: 'Permission matrix reviewed', detail: 'Client and accountant scopes remain separated', tone: 'neutral' },
]
const toast = ref('')
const actorRows = computed(() => scenario.actors.map((actor) => ({
  ...actor,
  session: actorSession(actor.personaId),
  roleLabel: actor.roles.map((role) => role.replaceAll('_', ' ')).join(' · '),
})))
const activePersonaCount = computed(() => actorRows.value.filter((actor) => actor.active).length)
const currentSessionEpoch = computed(() => activeActor()?.sessionEpoch || '—')

function navigate(route) { emit('navigate', route) }

async function handleDemoReset() {
  if (isSharedDemoEnabled) {
    toast.value = 'Resetting the shared demo for every browser…';
    const result = await resetSharedDemo();
    toast.value = result.ok
      ? `Shared demo reset (generation ${result.generationId}). Reloading every open browser view…`
      : `Shared reset failed (${result.error.code}): ${result.error.message}`;
    if (result.ok) window.setTimeout(() => { window.location.reload() }, 900);
    else window.setTimeout(() => { toast.value = '' }, 5000);
    return;
  }
  toast.value = resetDemoData()
  window.setTimeout(() => { window.location.reload() }, 600)
}

function toggleActor(actor) {
  const current = activeActor()
  if (!current) {
    toast.value = 'The current demo session is inactive. Sign in again before changing actor access.'
  } else {
    const result = setActorStatus({
      targetActorId: actor.id,
      actorPersonaId: current.personaId,
      active: !actor.active,
      expectedSessionEpoch: current.sessionEpoch,
      idempotencyKey: `actor-status-${actor.id}-${actor.sessionEpoch}-${actor.active ? 'disable' : 'enable'}`,
      reason: actor.active ? 'Synthetic administrator disabled this demo actor for the walkthrough.' : 'Synthetic administrator re-enabled this demo actor for the walkthrough.',
    })
    toast.value = result.outcome === 'COMMITTED'
      ? `${actor.name} is now ${result.data.active ? 'enabled' : 'disabled'}; session epoch rotated to ${result.data.sessionEpoch}.`
      : `${result.outcome}: ${result.code} — ${result.message}`
  }
  window.setTimeout(() => { toast.value = '' }, 4500)
}
</script>

<template>
  <div class="page admin-console-page">
    <PageHeader eyebrow="Admin portal" title="Admin console" description="Supervise the demo workspace, see every role boundary, and jump into any workflow page without changing the owner of a professional decision." />
    <WorkflowGuide :guide="workflowGuides['admin-console']" />

    <section class="admin-banner panel"><span class="admin-banner-icon"><Icon name="shield" :size="20" /></span><div><span class="eyebrow">Full demo privileges</span><h2>Every workflow boundary is visible</h2><p>Use this view to explain access, accountability, and operational health to stakeholders.</p></div><StatusPill label="Admin access" tone="good" /></section>
    <div v-if="toast" class="toast" role="status" aria-live="polite"><Icon name="shield" :size="17" />{{ toast }}</div>

    <section class="panel demo-controls-panel"><div class="panel-heading"><div><span class="eyebrow">Demo controls</span><h2>Reset the walkthrough</h2></div></div><p class="muted-copy">Clears the synthetic scenario plus browser-local comments, preferences and profiles. You stay signed in so the tour can be re-run immediately. For a full sign-out, use the account menu.</p><div class="button-row"><button type="button" class="button secondary" @click="handleDemoReset">Reset demo data</button><button type="button" class="text-button" @click="navigate('readiness')">Run rehearsal instead <Icon name="arrow-right" :size="15" /></button></div></section>

    <div class="admin-metric-grid"><article class="admin-metric"><span>Active personas</span><strong>{{ activePersonaCount }}</strong><small>{{ actorRows.length }} scoped actors · session epoch {{ currentSessionEpoch }}</small></article><article class="admin-metric"><span>Workflow pages</span><strong>15</strong><small>9 core + 6 portal pages</small></article><article class="admin-metric"><span>Open blockers</span><strong>4</strong><small>Visible in the Overview queue</small></article><article class="admin-metric"><span>Integration health</span><strong>3 / 4</strong><small>One retry needs attention</small></article></div>

    <div class="admin-console-grid"><section class="panel access-matrix-panel"><div class="panel-heading"><div><span class="eyebrow">Role boundaries</span><h2>Persona access matrix</h2></div><span class="muted-label">Demo policy</span></div><div class="access-matrix"><div v-for="row in accessRows" :key="row.label" class="access-row"><span class="access-row-icon" :class="`tone-${row.tone}`"><Icon :name="row.tone === 'green' ? 'calculator' : row.tone === 'navy' ? 'shield' : 'users'" :size="17" /></span><span><strong>{{ row.label }}</strong><small>{{ row.scope }}</small></span><StatusPill :label="row.pages" tone="neutral" /><Icon name="arrow-right" :size="16" /></div></div><div class="panel-footnote"><Icon name="info" :size="16" /><span>Admin visibility is broad, but acceptance, review, and release decisions still show their named authority.</span></div></section>
      <section class="panel admin-accounts-panel"><div class="panel-heading"><div><span class="eyebrow">Demo accounts</span><h2>Who can sign in?</h2></div></div><div class="admin-account-list"><div v-for="user in demoUsers" :key="user.id" class="admin-account-row"><span class="avatar" :class="`avatar-${user.tone}`">{{ user.initials }}</span><span><strong>{{ user.name }}</strong><small>{{ user.roleLabel }} · {{ user.email }}</small></span><StatusPill :label="user.role === 'admin' ? 'All privileges' : user.role === 'accountant' ? 'Prepare' : 'Submit'" :tone="user.tone === 'navy' ? 'good' : 'neutral'" /></div></div></section></div>

    <section class="panel actor-access-panel"><div class="panel-heading"><div><span class="eyebrow">P03 authority control</span><h2>Scoped actor status</h2></div><span class="muted-label">Disable rotates the session epoch</span></div><div class="actor-access-list"><div v-for="actor in actorRows" :key="actor.id" class="actor-access-row"><span class="avatar avatar-navy">{{ actor.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }}</span><span class="actor-access-main"><strong>{{ actor.name }}</strong><small>{{ actor.roleLabel }} · {{ actor.assignments.length }} assignment{{ actor.assignments.length === 1 ? '' : 's' }}</small><code>epoch {{ actor.sessionEpoch }}{{ actor.statusReason ? ` · ${actor.statusReason}` : '' }}</code></span><StatusPill :label="actor.active ? 'Enabled' : 'Disabled'" :tone="actor.active ? 'good' : 'danger'" /><button type="button" class="row-button" :disabled="!activeActor() || actor.id === activeActor()?.id" @click="toggleActor(actor)">{{ actor.active ? 'Disable' : 'Enable' }}</button></div></div><div class="panel-footnote"><Icon name="lock" :size="16" /><span>Role membership and assignment remain separate from session status. A disabled actor cannot issue guarded commands; re-enabling requires the next session epoch.</span></div></section>

    <section class="panel admin-activity-panel"><div class="panel-heading"><div><span class="eyebrow">Operations</span><h2>Recent activity</h2></div><button type="button" class="text-button" @click="navigate('integration')">Open integration health <Icon name="arrow-right" :size="15" /></button></div><div class="admin-activity-list"><div v-for="item in activity" :key="item.time + item.title" class="admin-activity-row"><span class="activity-dot" :class="`tone-${item.tone}`"></span><span class="activity-time">{{ item.time }}</span><span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span></div></div></section>

    <section class="panel admin-shortcuts-panel"><div class="panel-heading"><div><span class="eyebrow">All workflow pages</span><h2>Jump to a control</h2></div></div><div class="admin-shortcut-grid"><button v-for="item in navItems" :key="item.key" type="button" class="admin-shortcut" @click="navigate(item.key)"><Icon :name="item.icon" :size="16" /><span>{{ item.label }}</span><Icon name="arrow-right" :size="15" /></button></div></section>
  </div>
</template>
