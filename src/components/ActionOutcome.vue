<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  result: { type: Object, default: null },
  title: { type: String, default: 'Action update' },
  stageSummary: { type: String, default: '' },
  nextAction: { type: String, default: '' },
  pending: { type: Boolean, default: false },
})
const emit = defineEmits(['retry'])
const tone = computed(() => (props.result?.outcome || props.result?.tone || '').toString().toLowerCase())
const icon = computed(() => tone.value === 'committed' || props.result?.ok ? 'check-circle' : tone.value === 'uncertain' ? 'refresh' : 'warning')
const label = computed(() => tone.value === 'committed' || props.result?.ok ? 'Completed' : tone.value === 'uncertain' ? 'Needs confirmation' : 'Action needs attention')
</script>

<template>
  <section v-if="result || pending" class="action-outcome" :class="`outcome-${tone || 'pending'}`" role="status" aria-live="polite">
    <span class="action-outcome-icon"><Icon :name="pending ? 'refresh' : icon" :size="17" /></span>
    <div class="action-outcome-copy"><strong>{{ pending ? 'Working…' : `${label}: ${title}` }}</strong><span v-if="result?.message || result?.text">{{ result.message || result.text }}</span><small v-if="stageSummary">{{ stageSummary }}</small><small v-if="nextAction">Next: {{ nextAction }}</small></div>
    <button v-if="tone === 'uncertain' && !pending" type="button" class="button secondary" @click="emit('retry')">Retry same request <Icon name="refresh" :size="15" /></button>
  </section>
</template>

<style scoped>
.action-outcome { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; background: #f8fafc; }
.action-outcome-icon { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: 50%; color: #334155; background: #e2e8f0; }
.outcome-committed, .outcome-success { border-color: #bbf7d0; background: #f0fdf4; } .outcome-committed .action-outcome-icon, .outcome-success .action-outcome-icon { color: #166534; background: #dcfce7; }
.outcome-rejected, .outcome-error, .outcome-failure { border-color: #fecaca; background: #fef2f2; } .outcome-rejected .action-outcome-icon, .outcome-error .action-outcome-icon, .outcome-failure .action-outcome-icon { color: #991b1b; background: #fee2e2; }
.outcome-uncertain { border-color: #fde68a; background: #fffbeb; } .outcome-uncertain .action-outcome-icon { color: #92400e; background: #fef3c7; }
.action-outcome-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } .action-outcome-copy strong { color: var(--ink, #172033); font-size: 13px; } .action-outcome-copy span, .action-outcome-copy small { color: var(--muted, #667085); font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .action-outcome * { transition: none !important; animation: none !important; } }
</style>
