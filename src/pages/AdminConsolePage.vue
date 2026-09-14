<script setup>
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { demoUsers } from '../auth'
import { navItems, workflowGuides } from '../data'

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

function navigate(route) { emit('navigate', route) }
</script>

<template>
  <div class="page admin-console-page">
    <PageHeader eyebrow="Admin portal" title="Admin console" description="Supervise the demo workspace, see every role boundary, and jump into any workflow page without changing the owner of a professional decision." />
    <WorkflowGuide :guide="workflowGuides['admin-console']" />

    <section class="admin-banner panel"><span class="admin-banner-icon"><Icon name="shield" :size="20" /></span><div><span class="eyebrow">Full demo privileges</span><h2>Every workflow boundary is visible</h2><p>Use this view to explain access, accountability, and operational health to stakeholders.</p></div><StatusPill label="Admin access" tone="good" /></section>

    <div class="admin-metric-grid"><article class="admin-metric"><span>Active personas</span><strong>3</strong><small>Client · accountant · admin</small></article><article class="admin-metric"><span>Workflow pages</span><strong>15</strong><small>9 core + 6 portal pages</small></article><article class="admin-metric"><span>Open blockers</span><strong>4</strong><small>Visible in the Overview queue</small></article><article class="admin-metric"><span>Integration health</span><strong>3 / 4</strong><small>One retry needs attention</small></article></div>

    <div class="admin-console-grid"><section class="panel access-matrix-panel"><div class="panel-heading"><div><span class="eyebrow">Role boundaries</span><h2>Persona access matrix</h2></div><span class="muted-label">Demo policy</span></div><div class="access-matrix"><div v-for="row in accessRows" :key="row.label" class="access-row"><span class="access-row-icon" :class="`tone-${row.tone}`"><Icon :name="row.tone === 'green' ? 'calculator' : row.tone === 'navy' ? 'shield' : 'users'" :size="17" /></span><span><strong>{{ row.label }}</strong><small>{{ row.scope }}</small></span><StatusPill :label="row.pages" tone="neutral" /><Icon name="arrow-right" :size="16" /></div></div><div class="panel-footnote"><Icon name="info" :size="16" /><span>Admin visibility is broad, but acceptance, review, and release decisions still show their named authority.</span></div></section>
      <section class="panel admin-accounts-panel"><div class="panel-heading"><div><span class="eyebrow">Demo accounts</span><h2>Who can sign in?</h2></div></div><div class="admin-account-list"><div v-for="user in demoUsers" :key="user.id" class="admin-account-row"><span class="avatar" :class="`avatar-${user.tone}`">{{ user.initials }}</span><span><strong>{{ user.name }}</strong><small>{{ user.roleLabel }} · {{ user.email }}</small></span><StatusPill :label="user.role === 'admin' ? 'All privileges' : user.role === 'accountant' ? 'Prepare' : 'Submit'" :tone="user.tone === 'navy' ? 'good' : 'neutral'" /></div></div></section></div>

    <section class="panel admin-activity-panel"><div class="panel-heading"><div><span class="eyebrow">Operations</span><h2>Recent activity</h2></div><button type="button" class="text-button" @click="navigate('integration')">Open integration health <Icon name="arrow-right" :size="15" /></button></div><div class="admin-activity-list"><div v-for="item in activity" :key="item.time + item.title" class="admin-activity-row"><span class="activity-dot" :class="`tone-${item.tone}`"></span><span class="activity-time">{{ item.time }}</span><span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span></div></div></section>

    <section class="panel admin-shortcuts-panel"><div class="panel-heading"><div><span class="eyebrow">All workflow pages</span><h2>Jump to a control</h2></div></div><div class="admin-shortcut-grid"><button v-for="item in navItems" :key="item.key" type="button" class="admin-shortcut" @click="navigate(item.key)"><Icon :name="item.icon" :size="16" /><span>{{ item.label }}</span><Icon name="arrow-right" :size="15" /></button></div></section>
  </div>
</template>
