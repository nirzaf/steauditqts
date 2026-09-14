<script setup>
import Icon from './Icon.vue';
import StatusPill from './StatusPill.vue';
import { useSharedEngagement } from '../composables/useSharedEngagement.js';

const props = defineProps({
  engagementId: { type: String, required: true },
  assignee: { type: String, default: '' },
  title: { type: String, default: 'Shared task queue' },
});

const { tasks, loading, error, lastSync, refresh } = useSharedEngagement(() => props.engagementId, { assignee: () => props.assignee });
const toneFor = (state) => (state === 'COMPLETE' ? 'good' : state === 'BLOCKED' ? 'danger' : state === 'OPEN' ? 'warn' : 'neutral');
</script>

<template>
  <section class="panel shared-tasks-panel" aria-labelledby="shared-tasks-title">
    <div class="panel-heading">
      <div><span class="eyebrow">Live from D1</span><h2 id="shared-tasks-title">{{ title }}</h2></div>
      <button type="button" class="text-button" :disabled="loading" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button>
    </div>
    <p v-if="error" class="guide-status-message" role="status">Task queue unavailable ({{ error.code }}). Actions on this page stay local until the shared demo reconnects.</p>
    <p v-else-if="!loading && !tasks.length" class="guide-empty-state">No shared tasks for this filter yet. Actions from other roles appear here within seconds.</p>
    <ul v-else class="shared-task-list">
      <li v-for="task in tasks" :key="task.taskId" class="shared-task-row">
        <span class="shared-task-main"><strong>{{ task.title }}</strong><small>{{ task.assigneePersona || task.assigneeRole || 'Unassigned' }}{{ task.dueDate ? ` · due ${task.dueDate}` : '' }}</small></span>
        <StatusPill :label="task.state" :tone="toneFor(task.state)" />
      </li>
    </ul>
    <p class="panel-footnote"><Icon name="info" :size="16" /><span>Synced {{ lastSync ? new Date(lastSync).toLocaleTimeString('en-QA') : 'never' }} · another browser's completed action appears here.</span></p>
  </section>
</template>
