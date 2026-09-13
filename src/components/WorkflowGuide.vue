<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  guide: { type: Object, required: true },
})

const expanded = ref(true)
const guideId = computed(() => `workflow-guide-${props.guide.id}`)

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <aside class="workflow-guide panel" :aria-labelledby="`${guideId}-title`">
    <div class="guide-header">
      <div class="guide-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h8"/></svg>
      </div>
      <div class="guide-intro">
        <div class="guide-kicker"><span class="eyebrow">How to use this step</span><span class="guide-step">{{ guide.step }}</span><span class="guide-phase">{{ guide.phase }}</span></div>
        <h2 :id="`${guideId}-title`">{{ guide.title }}</h2>
        <p>{{ guide.summary }}</p>
      </div>
      <button type="button" class="guide-toggle" :aria-expanded="expanded" :aria-controls="guideId" @click="toggle">
        <span>{{ expanded ? 'Hide details' : 'Show details' }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ rotated: expanded }"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </div>

    <div v-if="expanded" :id="guideId" class="guide-content">
      <div class="guide-step-grid">
        <article v-for="(item, index) in guide.steps" :key="item.title" class="guide-step-card">
          <span class="guide-number">{{ index + 1 }}</span>
          <div><h3>{{ item.title }}</h3><p>{{ item.body }}</p></div>
        </article>
      </div>
      <div class="guide-footer">
        <section class="guide-checks" aria-labelledby="guide-checks-title">
          <span id="guide-checks-title" class="guide-label">Before you continue</span>
          <ul>
            <li v-for="check in guide.checks" :key="check"><span aria-hidden="true">✓</span>{{ check }}</li>
          </ul>
        </section>
        <section class="guide-next" aria-labelledby="guide-next-title">
          <span id="guide-next-title" class="guide-label">Next step</span>
          <strong>{{ guide.next }}</strong>
          <p>{{ guide.nextHint }}</p>
        </section>
      </div>
    </div>
  </aside>
</template>
