<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import StatusPill from './StatusPill.vue';
import { pipelineStages } from '../pipelineData';
import { useSharedEngagement } from '../composables/useSharedEngagement.js';

const props = defineProps({
  engagementId: { type: String, required: true },
});
const emit = defineEmits(['navigate']);

const { engagement, loading, error, lastSync, generationChanged, refresh } = useSharedEngagement(() => props.engagementId);

const STAGE_ORDER = ['intake', 'commercial', 'activation', 'planning', 'evidence', 'draft-response', 'review', 'release'];
const currentIndex = computed(() => {
  const match = String(engagement.value?.currentStage || '').match(/STAGE-(\d{2})/);
  const n = match ? Number(match[1]) : 0;
  return Math.min(Math.max(n - 1, -1), STAGE_ORDER.length - 1);
});
const isClosed = computed(() => String(engagement.value?.gStatus?.commercialClose || '').toUpperCase() === 'CLOSED');
const liveStages = computed(() => STAGE_ORDER.map((id, index) => {
  const meta = pipelineStages.find((stage) => stage.id === id) || { title: id, route: 'pipeline' };
  const state = isClosed.value || index < currentIndex.value ? 'COMPLETE' : index === currentIndex.value ? 'IN PROGRESS' : 'NOT STARTED';
  return { ...meta, liveState: state, tone: state === 'COMPLETE' ? 'good' : state === 'IN PROGRESS' ? 'warn' : 'neutral' };
}));
function openStage(stage) { emit('navigate', stage.destinations?.admin?.route || stage.route || 'pipeline'); }
function formatSync(value) {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-QA', { timeStyle: 'medium' }).format(date);
}
</script>

<template>
  <section class="panel shared-live-panel" aria-labelledby="shared-live-title">
    <div class="panel-heading">
      <div><span class="eyebrow">Live shared state · D1</span><h2 id="shared-live-title">Pipeline status</h2></div>
      <button type="button" class="text-button" :disabled="loading" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button>
    </div>
    <p v-if="generationChanged" class="permission-notice" role="status">The shared demo was reset from another browser. <button type="button" class="text-button" @click="$emit('navigate', 'readiness')">Open readiness</button> or refresh to continue.</p>
    <p v-else-if="error" class="guide-status-message" role="status">Shared state unavailable ({{ error.code }}). Showing the explanatory walkthrough below.</p>
    <ol class="shared-stage-list">
      <li v-for="stage in liveStages" :key="stage.id" class="shared-stage-row">
        <span class="shared-stage-number">{{ stage.number || '' }}</span>
        <span class="shared-stage-main"><strong>{{ stage.title }}</strong><small>Stage {{ STAGE_ORDER.indexOf(stage.id) + 1 }} of 8</small></span>
        <StatusPill :label="stage.liveState" :tone="stage.tone" />
        <button type="button" class="text-button" @click="openStage(stage)">Open <Icon name="arrow-right" :size="15" /></button>
      </li>
    </ol>
    <p class="panel-footnote"><Icon name="info" :size="16" /><span>Read from the shared engagement record{{ engagement?.revision ? ` · revision ${engagement.revision}` : '' }} · synced {{ formatSync(lastSync) }} · polls every 5s while visible.</span></p>
  </section>
</template>
