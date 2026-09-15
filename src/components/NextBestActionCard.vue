<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import { useDemoContext } from '../demoContext.js'

const emit = defineEmits(['navigate'])
const props = defineProps({
  title: { type: String, default: 'Next best action' },
  compact: { type: Boolean, default: false },
})

const { activeEngagementId, activeContext, loading, progress, progressError } = useDemoContext()
const action = computed(() => progress.value?.nextAction || null)
const sourceLabel = computed(() => progress.value?.derivedFrom === 'd1' ? 'Current workflow progress' : 'Preparing workflow progress')

function openAction() {
  if (action.value?.route) emit('navigate', {
    routeKey: action.value.route,
    engagementId: activeEngagementId.value || undefined,
    recordId: action.value.targetId || action.value.recordId || action.value.sourceIds?.[0] || undefined,
  })
}
</script>

<template>
  <section class="panel next-best-action" :class="{ compact }" aria-labelledby="next-best-action-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">{{ sourceLabel }} · {{ activeEngagementId }}</span>
        <h2 id="next-best-action-title">{{ title }}</h2>
      </div>
      <StatusPill :label="action ? action.ownerLabel || 'Assigned owner' : loading ? 'Refreshing' : 'No action queued'" :tone="action ? 'warn' : 'neutral'" />
    </div>
    <div v-if="progressError" class="next-best-error" role="status">
      <Icon name="warning" :size="16" />
      <span>The latest progress refresh did not complete. The last confirmed action remains visible.</span>
    </div>
    <div v-else-if="action" class="next-best-content">
      <span class="next-best-icon"><Icon name="arrow-right" :size="19" /></span>
      <div>
        <strong>{{ action.title }}</strong>
        <p>{{ action.ownerLabel || 'Assigned owner' }} · {{ activeContext?.clientName || 'Selected engagement' }}</p>
        <small>{{ action.gateId ? `Workflow gate ${action.gateId}` : 'Canonical workflow handoff' }}{{ action.route ? ` · ${action.route}` : '' }}</small>
      </div>
      <button type="button" class="button primary next-best-open" @click="openAction">Open action <Icon name="arrow-right" :size="15" /></button>
    </div>
    <div v-else class="next-best-empty">
      <Icon name="check-circle" :size="18" />
      <span>{{ loading ? 'Refreshing the selected engagement…' : 'No actionable handoff is currently queued for this selected engagement.' }}</span>
    </div>
  </section>
</template>

<style scoped>
.next-best-action { border-left: 4px solid var(--blue, #2563eb); }
.next-best-content { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.next-best-icon { display: inline-grid; place-items: center; inline-size: 38px; block-size: 38px; border-radius: 12px; color: #1d4ed8; background: #dbeafe; }
.next-best-content strong { display: block; color: var(--ink, #172033); }
.next-best-content p { margin: 3px 0; color: var(--muted, #667085); font-size: .9rem; }
.next-best-content small { color: #7a879b; }
.next-best-error, .next-best-empty { display: flex; align-items: center; gap: 9px; color: var(--muted, #667085); font-size: .9rem; }
.next-best-error { color: #9a3412; }
.next-best-open { white-space: nowrap; }
.compact .next-best-content { gap: 10px; }
@media (max-width: 720px) {
  .next-best-content { grid-template-columns: auto minmax(0, 1fr); }
  .next-best-open { grid-column: 1 / -1; width: 100%; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) { .next-best-action { scroll-behavior: auto; } }
</style>
