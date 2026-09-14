<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import { roleArchitecturePages, workflowGuides } from '../data'

const props = defineProps({
  persona: { type: String, default: 'admin' },
})

const emit = defineEmits(['navigate'])
const architecture = computed(() => roleArchitecturePages[props.persona] || roleArchitecturePages.admin)
const selectedStepId = ref(architecture.value.flow[0].id)
const selectedStep = computed(() => architecture.value.flow.find((step) => step.id === selectedStepId.value) || architecture.value.flow[0])

watch(() => props.persona, () => {
  selectedStepId.value = architecture.value.flow[0].id
})

function selectStep(id) {
  selectedStepId.value = id
}

function navigate(route) {
  emit('navigate', route)
}
</script>

<template>
  <div class="page role-architecture-page">
    <PageHeader
      :eyebrow="architecture.eyebrow"
      :title="architecture.title"
      :description="architecture.description"
      :action-label="`Open ${architecture.next.label}`"
      action-icon="arrow-right"
      @action="navigate(architecture.next.route)"
    />
    <WorkflowGuide :guide="workflowGuides[architecture.guideKey]" />

    <section class="role-architecture-intro panel">
      <div class="role-architecture-persona">
        <span class="role-architecture-avatar avatar" :class="`avatar-${architecture.avatarTone}`">{{ architecture.initials }}</span>
        <div>
          <span class="eyebrow">Audience lens</span>
          <h2>{{ architecture.audience }}</h2>
          <p>{{ architecture.scope }}</p>
        </div>
      </div>
      <div class="role-architecture-reading">
        <span class="eyebrow"><Icon name="workflow" :size="14" /> How to read this page</span>
        <p>Follow the numbered path from your action to the platform control. Select a step to see its owner, source of record, and handoff output.</p>
        <div class="architecture-status-stack" aria-label="Implementation status">
          <span class="architecture-status current"><strong>CURRENT IMPLEMENTATION</strong><small>Vue/Vite · browser-local synthetic state</small></span>
          <span class="architecture-status target"><strong>TARGET V4 ARCHITECTURE</strong><small>Frappe/Microsoft controls remain a reference design</small></span>
        </div>
        <div class="role-architecture-legend" aria-label="Architecture legend">
          <span><i class="role-legend-dot tone-blue"></i>Human access</span>
          <span><i class="role-legend-dot tone-navy"></i>Firm state</span>
          <span><i class="role-legend-dot tone-amber"></i>Document plane</span>
          <span><i class="role-legend-dot tone-purple"></i>Restricted control</span>
        </div>
      </div>
      <StatusPill label="Synthetic walkthrough" tone="neutral" />
    </section>

    <section class="role-architecture-layout">
      <article class="panel role-architecture-diagram-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">High-level architecture diagram</span><h2>{{ architecture.diagramTitle }}</h2></div>
          <span class="muted-label">{{ architecture.flow.length }} control points</span>
        </div>
        <p class="role-architecture-diagram-hint">{{ architecture.diagramHint }}</p>
        <div class="role-architecture-flow" role="list" :aria-label="`${architecture.audience} request path`">
          <template v-for="(step, index) in architecture.flow" :key="step.id">
            <div class="role-flow-item" role="listitem">
              <button
                type="button"
                class="role-flow-step"
                :class="[`role-flow-${step.tone}`, { selected: selectedStepId === step.id }]"
                :aria-pressed="selectedStepId === step.id"
                :aria-label="`Step ${step.number}: ${step.label}. ${step.system}`"
                @click="selectStep(step.id)"
              >
                <span class="role-flow-step-number">{{ step.number }}</span>
                <span class="role-flow-step-icon"><Icon :name="step.icon" :size="18" /></span>
                <span class="role-flow-step-copy"><strong>{{ step.label }}</strong><small>{{ step.system }}</small></span>
              </button>
            </div>
            <span v-if="index < architecture.flow.length - 1" class="role-flow-connector" aria-hidden="true"><Icon name="arrow-right" :size="16" /><small>handoff</small></span>
          </template>
        </div>
        <div class="role-architecture-read-note"><Icon name="info" :size="16" /><span><strong>What the arrows mean:</strong> the next service can act only after the current step has a visible owner, source revision, and evidence. A status badge is not a substitute for that proof.</span></div>
      </article>

      <aside class="panel role-architecture-detail" aria-live="polite">
        <div class="role-detail-heading">
          <span class="role-detail-number">{{ selectedStep.number }}</span>
          <div><span class="eyebrow">Selected control point</span><h2>{{ selectedStep.label }}</h2></div>
        </div>
        <p class="role-detail-action">{{ selectedStep.action }}</p>
        <dl class="role-detail-list">
          <div><dt>System of record</dt><dd>{{ selectedStep.system }}</dd></div>
          <div><dt>Control to observe</dt><dd>{{ selectedStep.control }}</dd></div>
          <div><dt>Handoff output</dt><dd>{{ selectedStep.output }}</dd></div>
        </dl>
        <div class="role-detail-callout"><Icon name="shield" :size="16" /><span>Keep this boundary visible when explaining the prototype: {{ architecture.audience.toLowerCase() }} sees a safe projection, while the authoritative record remains with its named owner.</span></div>
      </aside>
    </section>

    <section class="role-surface-grid">
      <article class="panel role-surface-panel">
        <div class="panel-heading"><div><span class="eyebrow">In your workspace</span><h2>What you can see and do</h2></div></div>
        <div class="role-surface-list">
          <div v-for="item in architecture.userSurface" :key="item.title" class="role-surface-item"><span class="role-surface-icon tone-blue"><Icon name="check-circle" :size="16" /></span><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div></div>
        </div>
      </article>
      <article class="panel role-surface-panel">
        <div class="panel-heading"><div><span class="eyebrow">Behind the screen</span><h2>What the platform protects</h2></div></div>
        <div class="role-surface-list">
          <div v-for="item in architecture.platformSurface" :key="item.title" class="role-surface-item"><span class="role-surface-icon tone-green"><Icon name="shield" :size="16" /></span><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div></div>
        </div>
      </article>
    </section>

    <section class="panel role-facts-panel">
      <div class="panel-heading"><div><span class="eyebrow">Key records and boundaries</span><h2>Remember where the truth lives</h2></div><span class="muted-label">Use these labels in a client walkthrough</span></div>
      <div class="role-facts-grid">
        <article v-for="fact in architecture.facts" :key="fact.label" class="role-fact-card"><span class="role-fact-label">{{ fact.label }}</span><strong>{{ fact.value }}</strong><p>{{ fact.detail }}</p></article>
      </div>
    </section>

    <section class="panel role-handoff-panel">
      <div class="panel-heading"><div><span class="eyebrow">Before you continue</span><h2>Use the diagram as a handoff checklist</h2></div><StatusPill label="Owner evidence first" tone="warn" /></div>
      <div class="role-handoff-layout">
        <ul class="role-handoff-list">
          <li v-for="item in architecture.checklist" :key="item"><Icon name="check" :size="15" /><span>{{ item }}</span></li>
        </ul>
        <div class="role-next-step"><span class="eyebrow">Next step</span><h3>{{ architecture.next.label }}</h3><p>{{ architecture.next.detail }}</p><button type="button" class="button primary" @click="navigate(architecture.next.route)">Open next page <Icon name="arrow-right" :size="16" /></button></div>
      </div>
    </section>

    <div class="prototype-note"><Icon name="info" :size="17" /><span><strong>Prototype boundary</strong> This role lens uses fictional values to explain ownership and flow. It does not expose live client data, create a professional approval, or prove a tenant capability.</span></div>
  </div>
</template>
