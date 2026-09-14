<script setup>
import Icon from './Icon.vue';
import { useSharedEngagement } from '../composables/useSharedEngagement.js';

const props = defineProps({
  engagementId: { type: String, required: true },
  title: { type: String, default: 'Shared activity' },
});

const { events, loading, error, refresh } = useSharedEngagement(() => props.engagementId);
function labelFor(action) {
  return String(action || 'Unknown event').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
function formatTime(value) {
  const date = new Date(String(value || '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('en-QA', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
</script>

<template>
  <section class="panel shared-timeline-panel" aria-labelledby="shared-timeline-title">
    <div class="panel-heading">
      <div><span class="eyebrow">Live from D1</span><h2 id="shared-timeline-title">{{ title }}</h2></div>
      <button type="button" class="text-button" :disabled="loading" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button>
    </div>
    <p v-if="error" class="guide-status-message" role="status">Timeline unavailable ({{ error.code }}).</p>
    <p v-else-if="!loading && !events.length" class="guide-empty-state">No shared events yet. The first committed action starts the timeline.</p>
    <ol v-else class="shared-timeline-list">
      <li v-for="event in events" :key="event.eventId" class="shared-timeline-row">
        <span class="activity-dot tone-blue"></span>
        <span><strong>{{ labelFor(event.action) }}</strong><small>{{ event.actor }} · {{ formatTime(event.createdAt) }}</small></span>
      </li>
    </ol>
    <p class="panel-footnote"><Icon name="info" :size="16" /><span>Append-only demo history. Every entry names its actor and action.</span></p>
  </section>
</template>
