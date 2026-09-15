<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import { getSharedArtifacts, isSharedDemoEnabled } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'

const props = defineProps({ activeFilter: { type: String, default: 'All outputs' } })
const emit = defineEmits(['select-filter'])
const { activeEngagementId, progress } = useDemoContext()
const artifacts = ref([])
const loading = ref(false)
const error = ref(null)
const filters = ['All outputs', 'Client-facing', 'Internal', 'Needs approval', 'Missing', 'Current', 'Stale']
const created = computed(() => Math.min(26, artifacts.value.length))
const ready = computed(() => artifacts.value.filter((row) => ['PUBLISHED', 'APPROVED', 'SIGNED', 'VALIDATED', 'RELEASED'].includes(String(row.state || '').toUpperCase())).length)
const waiting = computed(() => Math.max(0, created.value - ready.value))
const blocked = computed(() => Math.max(0, progress.value?.blockers?.length || 0))
const notStarted = computed(() => Math.max(0, 26 - created.value))

async function refresh() {
  if (!isSharedDemoEnabled || !activeEngagementId.value) return
  loading.value = true
  const result = await getSharedArtifacts(activeEngagementId.value)
  loading.value = false
  if (result.ok) { artifacts.value = result.artifacts || []; error.value = null }
  else error.value = result.error || { message: 'The live output register could not be loaded.' }
}
watch(activeEngagementId, () => { void refresh() }, { immediate: true })
</script>

<template>
  <section class="panel output-completeness" aria-labelledby="output-completeness-title">
    <div class="panel-heading"><div><span class="eyebrow">Selected engagement · {{ activeEngagementId }}</span><h2 id="output-completeness-title">Output completeness</h2></div><div class="output-completeness-actions"><StatusPill :label="isSharedDemoEnabled ? (loading ? 'Refreshing' : 'D1 linked') : 'Catalog view'" :tone="isSharedDemoEnabled ? 'good' : 'neutral'" /><button type="button" class="text-button" :disabled="loading || !isSharedDemoEnabled" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button></div></div>
    <div class="output-stats" aria-label="Output completeness summary"><div><span>Required</span><strong>26</strong><small>workflow outputs</small></div><div><span>Created</span><strong>{{ created }}</strong><small>registered in D1</small></div><div><span>Ready</span><strong>{{ ready }}</strong><small>published or approved</small></div><div><span>Waiting</span><strong>{{ waiting }}</strong><small>created, not ready</small></div><div><span>Blocked</span><strong>{{ blocked }}</strong><small>current gate blockers</small></div><div><span>Not started</span><strong>{{ notStarted }}</strong><small>catalog outputs</small></div></div>
    <div class="output-filter-row" aria-label="Document center filters"><span>Show</span><button v-for="filter in filters" :key="filter" type="button" :class="{ active: activeFilter === filter }" :aria-pressed="activeFilter === filter" @click="emit('select-filter', filter)">{{ filter }}</button></div>
    <p v-if="error" class="output-register-error" role="status"><Icon name="warning" :size="15" />{{ error.message }} The 26-output catalog remains available below.</p>
    <p class="output-completeness-note"><Icon name="info" :size="15" />Use these filters to focus the detailed catalog below. Counts are scoped to the currently selected engagement; a document’s readiness never creates an approval by itself.</p>
  </section>
</template>

<style scoped>
.output-completeness { border-top: 3px solid #0f766e; }
.output-completeness-actions { display: flex; align-items: center; gap: 10px; }
.output-stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid #e5eaf2; border-radius: 12px; overflow: hidden; }
.output-stats > div { padding: 12px; border-right: 1px solid #e5eaf2; }
.output-stats > div:last-child { border-right: 0; }
.output-stats span, .output-stats small { display: block; color: #68768a; font-size: .76rem; }
.output-stats strong { display: block; color: #17233b; font-size: 1.3rem; line-height: 1.2; margin: 3px 0; }
.output-filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 14px; }
.output-filter-row span { color: #68768a; font-size: .85rem; margin-right: 2px; }
.output-filter-row button { border: 1px solid #d6dfeb; background: #fff; color: #41506a; border-radius: 999px; padding: 6px 10px; font: inherit; font-size: .79rem; cursor: pointer; }
.output-filter-row button.active { background: #173f77; border-color: #173f77; color: #fff; }
.output-register-error, .output-completeness-note { display: flex; align-items: center; gap: 7px; margin: 12px 0 0; color: #68768a; font-size: .84rem; }
.output-register-error { color: #9a3412; }
@media (max-width: 900px) { .output-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } .output-stats > div:nth-child(3) { border-right: 0; } .output-stats > div:nth-child(-n+3) { border-bottom: 1px solid #e5eaf2; } }
@media (max-width: 550px) { .output-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .output-stats > div { border-bottom: 1px solid #e5eaf2; } .output-stats > div:nth-child(2n) { border-right: 0; } }
</style>
