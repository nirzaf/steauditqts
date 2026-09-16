<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  guide: { type: Object, required: true },
  collapsible: { type: Boolean, default: true },
})

const expanded = ref(!props.collapsible)
const guideId = computed(() => `workflow-guide-${props.guide.id}`)

const guideIcon = computed(() => ({
  'role-workspace-guide': 'grid',
  'overview-guide': 'grid',
  'clients-guide': 'users',
  'engagement-guide': 'briefcase',
  'pbc-guide': 'inbox',
  'accounting-guide': 'calculator',
  'audit-guide': 'clipboard',
  'reviews-guide': 'check-circle',
  'release-guide': 'lock',
  'integration-guide': 'pulse',
  'cycle-guide': 'workflow',
  'pipeline-guide': 'workflow',
  'v5-blueprint-guide': 'layers',
  'client-portal-guide': 'building',
  'client-details-guide': 'user',
  'client-communications-guide': 'message',
  'accountant-portal-guide': 'calculator',
  'accountant-client-guide': 'users',
  'admin-console-guide': 'shield',
  'architecture-guide': 'workflow',
  'readiness-guide': 'list-check',
  'admin-architecture-guide': 'workflow',
  'accountant-architecture-guide': 'calculator',
  'client-architecture-guide': 'workflow',
}[props.guide.id] || 'workflow'))

const stepIcons = ['list-check', 'file', 'arrow-right']

function toggle() {
  expanded.value = !expanded.value
}

</script>

<template>
  <aside class="workflow-guide panel" :aria-labelledby="`${guideId}-title`">
    <div class="guide-header">
      <div class="guide-icon" aria-hidden="true">
        <Icon :name="guideIcon" :size="22" />
      </div>
      <div class="guide-intro">
        <div class="guide-kicker"><span class="eyebrow">How to use this step</span><span class="guide-step">{{ guide.step }}</span><span class="guide-phase">{{ guide.phase }}</span></div>
        <h2 :id="`${guideId}-title`">{{ guide.title }}</h2>
        <p>{{ guide.summary }}</p>
      </div>
      <button v-if="collapsible" type="button" class="guide-toggle" :aria-expanded="expanded" :aria-controls="guideId" @click="toggle">
        <span>{{ expanded ? 'Hide details' : 'Show details' }}</span>
        <Icon name="chevron-down" :size="17" :class="{ rotated: expanded }" />
      </button>
    </div>

    <div v-if="expanded" :id="guideId" class="guide-content">
      <div class="guide-step-grid">
        <article v-for="(item, index) in guide.steps" :key="item.title" class="guide-step-card">
          <span class="guide-step-icon" aria-hidden="true"><Icon :name="stepIcons[index] || 'file'" :size="17" /></span>
          <div><h3>{{ item.title }}</h3><p>{{ item.body }}</p></div>
        </article>
      </div>
      <div v-if="guide.demoCheckpoint" class="guide-checkpoint" role="status" aria-live="polite"><Icon name="check-circle" :size="16" /><span><strong>Checkpoint:</strong> {{ guide.demoCheckpoint }}</span></div>
      <div class="guide-footer">
        <section class="guide-checks" aria-labelledby="guide-checks-title">
          <span id="guide-checks-title" class="guide-label"><Icon name="check-circle" :size="14" />Before you continue</span>
          <ul>
            <li v-for="check in guide.checks" :key="check"><Icon name="check" :size="14" />{{ check }}</li>
          </ul>
        </section>
        <section class="guide-next" aria-labelledby="guide-next-title">
          <span id="guide-next-title" class="guide-label"><Icon name="arrow-right" :size="14" />Next step</span>
          <strong>{{ guide.next }}</strong>
          <p>{{ guide.nextHint }}</p>
        </section>
      </div>

    </div>
  </aside>
</template>
