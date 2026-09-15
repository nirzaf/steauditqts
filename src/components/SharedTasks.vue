<script setup>
import Icon from './Icon.vue';
import StatusPill from './StatusPill.vue';
import { useSharedEngagement } from '../composables/useSharedEngagement.js';

const props = defineProps({
  engagementId: { type: String, required: true },
  assignee: { type: String, default: '' },
  title: { type: String, default: 'Shared task queue' },
});

const emit = defineEmits(['navigate']);

const { tasks, loading, error, lastSync, refresh } = useSharedEngagement(() => props.engagementId, { assignee: () => props.assignee });
const toneFor = (state) => (state === 'COMPLETE' ? 'good' : state === 'BLOCKED' ? 'danger' : state === 'OPEN' ? 'warn' : 'neutral');
const taskMeta = (task) => [
  task.priority && task.priority !== 'NORMAL' ? `${task.priority} priority` : '',
  task.blockerCode ? `blocker ${task.blockerCode}` : '',
  task.stage ? task.stage : '',
  task.slaDueAt ? `SLA ${task.slaDueAt}` : '',
  task.escalationState && task.escalationState !== 'NONE' ? task.escalationState : '',
].filter(Boolean).join(' · ');
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
        <span class="shared-task-main"><strong>{{ task.title }}</strong><small>{{ task.assigneePersona || task.assigneeRole || 'Unassigned' }}{{ task.dueDate ? ` · due ${task.dueDate}` : '' }}</small><small v-if="taskMeta(task)">{{ taskMeta(task) }}</small></span>
        <StatusPill :label="task.state" :tone="toneFor(task.state)" />
        <button type="button" class="text-button" @click="emit('navigate', { routeKey: task.route || 'role-workspace', engagementId: task.engagementId || props.engagementId, recordId: task.target || task.linkedObjectId || task.taskId })">Open <Icon name="arrow-right" :size="14" /></button>
      </li>
    </ul>
    <p class="panel-footnote"><Icon name="info" :size="16" /><span>Synced {{ lastSync ? new Date(lastSync).toLocaleTimeString('en-QA') : 'never' }} · another browser's completed action appears here.</span></p>
  </section>
</template>
