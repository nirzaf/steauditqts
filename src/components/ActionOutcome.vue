<!-- P1.1 — Action → Result → Next Action. Presentational only: callers pass
     the already-committed command result + stage summary + next action.
     No new state system. -->
<script setup>
import Icon from './Icon.vue'

const props = defineProps({
  title: { type: String, default: '' },
  result: { type: String, default: '' },
  owner: { type: String, default: '' },
  nextAction: { type: String, default: '' },
  nextRoute: { type: String, default: '' },
  progressFrom: { type: Number, default: null },
  progressTo: { type: Number, default: null },
  tone: { type: String, default: 'good' },
})
const emit = defineEmits(['open-next', 'dismiss'])
</script>

<template>
  <section v-if="title" class="panel action-outcome" :class="`tone-${tone}`" role="status" aria-live="polite" aria-label="Last action outcome">
    <div class="action-outcome-icon"><Icon name="check-circle" :size="20" /></div>
    <div class="action-outcome-main">
      <span class="eyebrow">Action committed</span>
      <strong>{{ title }}</strong>
      <p v-if="result">{{ result }}</p>
      <small v-if="owner">Owner · {{ owner }}</small>
      <small v-if="progressFrom != null && progressTo != null && progressFrom !== progressTo">Progress {{ progressFrom }}% → {{ progressTo }}%</small>
      <div v-if="nextAction" class="action-outcome-next">
        <span>Next action · {{ nextAction }}</span>
        <span class="button-row">
          <button v-if="nextRoute" type="button" class="button primary" @click="emit('open-next')">Open next <Icon name="arrow-right" :size="14" /></button>
          <button type="button" class="text-button" @click="emit('dismiss')">Dismiss</button>
        </span>
      </div>
      <button v-else type="button" class="text-button" @click="emit('dismiss')">Dismiss</button>
    </div>
  </section>
</template>

<style scoped>
.action-outcome { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; border-left: 4px solid var(--good, #137333); margin: 12px 16px 0; }
.action-outcome.tone-warn { border-left-color: #b45309; }
.action-outcome-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: #dcfce7; color: #15803d; }
.action-outcome-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.action-outcome-main strong { color: var(--ink, #172033); }
.action-outcome-main p { margin: 0; color: var(--muted, #475569); font-size: .88rem; }
.action-outcome-main small { color: #64748b; font-size: .75rem; }
.action-outcome-next { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--line, #dbe3ee); font-size: .85rem; }
.button-row { display: flex; gap: 8px; align-items: center; }
</style>
