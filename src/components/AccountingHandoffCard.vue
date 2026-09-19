<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'

const props = defineProps({
  handoff: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  canEvaluate: { type: Boolean, default: false },
})
const emit = defineEmits(['evaluate'])

const tones = { CURRENT: 'good', STALE: 'danger', PENDING_APPROVAL: 'warn', MISSING: 'warn', NOT_APPLICABLE: 'neutral' }
const tone = computed(() => tones[props.handoff?.status] || 'neutral')
const showAction = computed(() => props.handoff?.status === 'STALE' && Boolean(props.handoff?.actionLabel))
</script>

<template>
  <section v-if="props.handoff" class="panel accounting-handoff" :class="`status-${props.handoff.status}`" aria-labelledby="accounting-handoff-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Accounting → audit handoff</span>
        <h2 id="accounting-handoff-title">{{ props.handoff.applicable ? (props.handoff.packageLabel || 'Accounting package') : 'No accounting handoff applies' }}</h2>
      </div>
      <StatusPill :label="props.handoff.status.replace(/_/g, ' ')" :tone="tone" />
    </div>
    <dl v-if="props.handoff.applicable" class="handoff-facts">
      <div><dt>Management approval</dt><dd>{{ props.handoff.managementApproval }}</dd></div>
      <div><dt>Accounting input</dt><dd>g{{ props.handoff.accountingInputGeneration }}</dd></div>
      <div><dt>Audit evaluated input</dt><dd>g{{ props.handoff.auditEvaluatedGeneration }}</dd></div>
    </dl>
    <p class="handoff-message"><Icon :name="props.handoff.stale ? 'warning' : 'info'" :size="15" />{{ props.handoff.message }}</p>
    <div class="card-footer">
      <span>{{ props.handoff.stale ? 'The audit is working from a superseded package.' : 'The audit has evaluated the current accounting input.' }}</span>
      <button v-if="showAction" type="button" class="button small primary" :disabled="props.busy || !props.canEvaluate" @click="emit('evaluate')">
        {{ props.busy ? 'Evaluating…' : props.handoff.actionLabel }}
      </button>
      <span v-else-if="props.handoff.stale" class="muted-label">Record with an Audit Senior or Audit Manager</span>
    </div>
  </section>
</template>

<style scoped>
.accounting-handoff { border-top: 3px solid #0f766e; }
.accounting-handoff.status-STALE { border-top-color: #b91c1c; }
.accounting-handoff.status-PENDING_APPROVAL, .accounting-handoff.status-MISSING { border-top-color: #b45309; }
.handoff-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0 0; }
.handoff-facts > div { border: 1px solid #e5eaf2; border-radius: 10px; padding: 10px; }
.handoff-facts dt { color: #68768a; font-size: .74rem; }
.handoff-facts dd { margin: 4px 0 0; color: #17233b; font-weight: 600; font-size: .95rem; }
.handoff-message { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; color: #41506a; font-size: .86rem; }
.card-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; color: #68768a; font-size: .82rem; }
.muted-label { color: #68768a; font-size: .78rem; }
@media (max-width: 700px) { .handoff-facts { grid-template-columns: 1fr; } }
</style>
