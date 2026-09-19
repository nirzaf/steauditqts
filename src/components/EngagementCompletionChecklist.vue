<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import AccountingHandoffCard from './AccountingHandoffCard.vue';

const props = defineProps({
  checklist: { type: Object, required: true },
  handoff: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  canEvaluate: { type: Boolean, default: false },
  source: { type: String, default: 'local' },
})
const emit = defineEmits(['evaluate'])

const tones = { COMPLETE: 'good', ATTENTION: 'warn', PENDING: 'neutral' }
const icons = { COMPLETE: 'check-circle', ATTENTION: 'warning', PENDING: 'clock' }
const nextStep = computed(() => props.checklist?.items?.find((item) => item.state === 'ATTENTION') || null)
const actionableCount = computed(() => (props.checklist?.items || []).filter((item) => item.state === 'ATTENTION').length)
</script>

<template>
  <section v-if="props.checklist" class="panel completion-checklist" aria-labelledby="completion-checklist-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Engagement completion · {{ props.checklist.engagementId }}</span>
        <h2 id="completion-checklist-title">Completion checklist</h2>
      </div>
      <div class="checklist-heading-actions">
        <StatusPill :label="props.source === 'd1' ? 'Derived from D1' : 'Derived from the local scenario'" tone="neutral" />
        <StatusPill v-if="props.checklist.applicable" :label="`${props.checklist.completeCount}/${props.checklist.totalCount} recorded`" :tone="props.checklist.complete ? 'good' : 'warn'" />
      </div>
    </div>

    <p v-if="!props.checklist.applicable" class="checklist-empty"><Icon name="info" :size="15" />{{ props.checklist.message }}</p>
    <template v-else>
      <ol class="checklist-items">
        <li v-for="item in props.checklist.items" :key="item.key" :class="`item-${item.state.toLowerCase()}`">
          <span class="checklist-marker" :aria-hidden="true"><Icon :name="icons[item.state] || 'info'" :size="15" /></span>
          <span class="checklist-body">
            <strong>{{ item.label }}</strong>
            <small>{{ item.detail }}</small>
          </span>
          <StatusPill :label="item.state === 'ATTENTION' ? 'Actionable now' : item.state === 'PENDING' ? 'Waiting upstream' : 'Recorded'" :tone="tones[item.state]" />
        </li>
      </ol>
      <div class="card-footer">
        <span>{{ props.checklist.message }}{{ nextStep ? ` Next: ${nextStep.label}.` : '' }}</span>
        <small v-if="actionableCount">{{ actionableCount }} step(s) actionable now; the rest wait on an upstream record.</small>
      </div>
      <AccountingHandoffCard
        v-if="props.handoff && props.handoff.applicable"
        :handoff="props.handoff"
        :busy="props.busy"
        :can-evaluate="props.canEvaluate"
        @evaluate="emit('evaluate')"
      />
    </template>
  </section>
</template>

<style scoped>
.completion-checklist { border-top: 3px solid #173f77; }
.checklist-heading-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.checklist-items { list-style: none; display: grid; gap: 8px; margin: 12px 0 0; padding: 0; }
.checklist-items li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid #e5eaf2; border-radius: 12px; padding: 10px 12px; }
.checklist-items li.item-complete { background: #f6fdfa; border-color: #bbf7d0; }
.checklist-items li.item-attention { background: #fffbeb; border-color: #fde68a; }
.checklist-marker { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; background: #eef2f8; color: #41506a; }
.item-complete .checklist-marker { background: #dcfce7; color: #15803d; }
.item-attention .checklist-marker { background: #fef3c7; color: #b45309; }
.checklist-body { display: grid; }
.checklist-body strong { color: #17233b; font-size: .92rem; }
.checklist-body small { color: #68768a; font-size: .78rem; }
.card-footer { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 12px; color: #68768a; font-size: .82rem; }
.checklist-empty { display: flex; align-items: center; gap: 7px; margin: 12px 0 0; color: #68768a; font-size: .86rem; }
@media (max-width: 700px) { .checklist-items li { grid-template-columns: 26px minmax(0, 1fr); } .checklist-items li :deep(.status-pill) { grid-column: 2; justify-self: start; } }
</style>
