<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import ProcessHealthPanel from '../components/ProcessHealthPanel.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { workflowGuides } from '../data'
import { getSharedPortfolio, isSharedDemoEnabled } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'

const emit = defineEmits(['navigate'])
const { activeEngagementId, switchEngagement } = useDemoContext()
const rows = ref([])
const loading = ref(false)
const error = ref(null)
const notice = ref('')

const selectedRow = computed(() => rows.value.find((row) => row.engagementId === activeEngagementId.value) || null)
const healthTone = (value) => ({ ON_TRACK: 'good', AT_RISK: 'warn', ATTENTION: 'warn', BLOCKED: 'danger' })[value] || 'neutral'
const progressWidth = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`

function showNotice(message) {
  notice.value = message
  window.setTimeout(() => { notice.value = '' }, 5000)
}

async function refresh() {
  if (!isSharedDemoEnabled) return
  loading.value = true
  const portfolioResult = await getSharedPortfolio()
  loading.value = false
  if (portfolioResult.ok) {
    rows.value = portfolioResult.portfolio || []
    error.value = null
  } else error.value = portfolioResult.error || { message: 'The operational portfolio could not be loaded.' }
}

watch(activeEngagementId, () => { void refresh() }, { immediate: true })

function selectRow(row) {
  if (!row?.engagementId || row.engagementId === activeEngagementId.value) return
  switchEngagement(row.engagementId)
  showNotice(`${row.client} is now the selected global engagement context.`)
}

function openRow(row) {
  selectRow(row)
  emit('navigate', row.nextRoute || 'role-workspace')
}

</script>

<template>
  <div class="page portfolio-page">
    <PageHeader eyebrow="Practice control · selected D1 context" title="Operational portfolio" description="Compare assigned engagements, see the real workflow health behind each row, and switch the global context before opening the next owner’s work. This view is available only to the Admin, Manager, and Partner demo roles." />
    <WorkflowGuide :guide="workflowGuides.engagements || workflowGuides.pipeline" />
    <div v-if="notice" class="toast" role="status" aria-live="polite"><Icon name="check-circle" :size="17" />{{ notice }}</div>

    <section class="panel portfolio-intro">
      <div><span class="eyebrow">How to use this control room</span><h2>Start with the red or amber row, then open the server-derived next action</h2><p>Click anywhere on a row to make it the global engagement context. The action button takes the user to the owning workspace; it does not complete the gate automatically.</p></div>
      <button type="button" class="button secondary" :disabled="loading || !isSharedDemoEnabled" @click="refresh">{{ loading ? 'Refreshing…' : 'Refresh portfolio' }} <Icon name="refresh" :size="16" /></button>
    </section>

    <section v-if="!isSharedDemoEnabled" class="panel portfolio-empty"><Icon name="info" :size="19" /><div><strong>Shared workspace is unavailable</strong><span>Reconnect to inspect the current multi-engagement portfolio.</span></div></section>
    <section v-else class="panel portfolio-table-panel" aria-labelledby="portfolio-table-title">
      <div class="panel-heading"><div><span class="eyebrow">Assigned engagements</span><h2 id="portfolio-table-title">Portfolio queue</h2></div><StatusPill :label="loading ? 'Refreshing' : `${rows.length} engagement${rows.length === 1 ? '' : 's'}`" :tone="loading ? 'warn' : 'neutral'" /></div>
      <p v-if="error" class="portfolio-error" role="status"><Icon name="warning" :size="16" />{{ error.message }}</p>
      <div v-else-if="!rows.length && !loading" class="portfolio-empty"><Icon name="briefcase" :size="19" /><div><strong>No assigned engagement is available.</strong><span>Choose a demo role with portfolio authority or refresh the shared session.</span></div></div>
      <div v-else class="portfolio-table-wrap" tabindex="0" aria-label="Operational portfolio table">
        <table class="portfolio-table">
          <thead><tr><th>Client</th><th>Service</th><th>Stage</th><th>Progress</th><th>Blocker</th><th>Next owner</th><th><span class="sr-only">Open</span></th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.engagementId" :class="{ selected: row.engagementId === activeEngagementId }" tabindex="0" @click="selectRow(row)" @keydown.enter.prevent="selectRow(row)" @keydown.space.prevent="selectRow(row)">
              <td><strong>{{ row.clientShortName || row.client }}</strong><small>{{ row.engagementId }} · {{ row.period }}</small></td>
              <td>{{ row.service }}</td>
              <td><span>{{ row.stageLabel || row.stage }}</span><StatusPill :label="row.health" :tone="healthTone(row.health)" /></td>
              <td><div class="portfolio-progress"><span><strong>{{ row.progress }}%</strong><small>{{ row.openTasks }} open · {{ row.overdueTasks }} overdue</small></span><i aria-hidden="true"><b :style="{ width: progressWidth(row.progress) }"></b></i></div></td>
              <td><span class="portfolio-blocker" :class="{ clear: !row.blocker }">{{ row.blocker || 'No current blocker' }}</span></td>
              <td><strong>{{ row.nextOwner || 'No handoff' }}</strong><small>{{ row.nextAction || 'No action queued' }}</small></td>
              <td><button type="button" class="text-button" @click.stop="openRow(row)">Open <Icon name="arrow-right" :size="15" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="portfolio-footnote"><Icon name="shield" :size="15" />Health, blockers, progress, and owner come from the Worker’s D1 snapshot. The browser only renders this projection.</p>
    </section>

    <div class="portfolio-detail-grid"><ProcessHealthPanel :engagement-id="activeEngagementId" @navigate="emit('navigate', $event)" /></div>
  </div>
</template>

<style scoped>
.portfolio-intro { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-left: 4px solid #174a87; }
.portfolio-intro h2 { margin: 4px 0; font-size: 1.1rem; color: #18263e; }
.portfolio-intro p { margin: 0; color: #69778c; line-height: 1.5; }
.portfolio-table-panel { padding-bottom: 14px; }
.portfolio-table-wrap { overflow-x: auto; border: 1px solid #e4eaf3; border-radius: 12px; }
.portfolio-table { width: 100%; min-width: 930px; border-collapse: collapse; }
.portfolio-table th { padding: 11px 13px; text-align: left; background: #f6f8fc; color: #607087; font-size: .76rem; font-weight: 700; text-transform: uppercase; letter-spacing: .035em; }
.portfolio-table td { padding: 13px; border-top: 1px solid #e8edf4; color: #35435a; vertical-align: middle; }
.portfolio-table tbody tr { cursor: pointer; outline: none; transition: background-color .16s ease; }
.portfolio-table tbody tr:hover, .portfolio-table tbody tr:focus-visible { background: #f3f7ff; }
.portfolio-table tbody tr.selected { background: #eaf2ff; box-shadow: inset 3px 0 #2563eb; }
.portfolio-table td strong, .portfolio-table td small { display: block; }
.portfolio-table td small { margin-top: 3px; color: #77859a; font-size: .78rem; }
.portfolio-table td:nth-child(3) { min-width: 135px; }
.portfolio-table td:nth-child(3) :deep(.status-pill) { margin-top: 5px; }
.portfolio-progress { min-width: 150px; }
.portfolio-progress > span { display: flex; align-items: baseline; gap: 6px; }
.portfolio-progress small { margin: 0; }
.portfolio-progress i { display: block; overflow: hidden; height: 6px; margin-top: 7px; background: #dce5f3; border-radius: 999px; }
.portfolio-progress b { display: block; height: 100%; background: #2b67bd; border-radius: inherit; }
.portfolio-blocker { display: block; max-width: 230px; color: #9a3412; font-size: .82rem; line-height: 1.35; }
.portfolio-blocker.clear { color: #0f766e; }
.portfolio-error, .portfolio-footnote { display: flex; align-items: center; gap: 8px; color: #69778c; font-size: .84rem; }
.portfolio-error { color: #9a3412; }
.portfolio-footnote { margin: 13px 0 0; }
.portfolio-empty { display: flex; align-items: center; gap: 11px; color: #69778c; }
.portfolio-empty strong, .portfolio-empty span { display: block; }
.portfolio-empty span { margin-top: 3px; font-size: .88rem; }
.portfolio-detail-grid { margin-top: 18px; }
@media (max-width: 640px) { .portfolio-intro { align-items: stretch; flex-direction: column; } .portfolio-intro .button { justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .portfolio-table tbody tr { transition: none; } }
</style>
