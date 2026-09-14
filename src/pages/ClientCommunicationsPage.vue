<script setup>
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import WorkflowGuide from '../components/WorkflowGuide.vue'
import Icon from '../components/Icon.vue'
import { client, workflowGuides } from '../data'

const emit = defineEmits(['navigate'])
const topics = [
  { label: 'Request clarification', detail: 'Ask what a file or balance should include.', tone: 'blue' },
  { label: 'Explain an exception', detail: 'Give context when a requested item is not available.', tone: 'amber' },
  { label: 'Confirm a handoff', detail: 'Agree the owner and due date for the next action.', tone: 'green' },
]
const messagePolicy = computed(() => `Messages are attached to ${client.name} · ${client.period}.`)

function navigate(route) {
  emit('navigate', route)
}
</script>

<template>
  <div class="page client-communications-page">
    <PageHeader eyebrow="Client portal · communication" title="Portal communications" description="Keep questions, clarifications, and delivery updates in one shared thread with the engagement team." />
    <WorkflowGuide :guide="workflowGuides['client-communications']" />

    <section class="panel portal-thread-banner"><span class="thread-icon"><Icon name="message" :size="20" /></span><div><span class="eyebrow">Shared portal thread</span><h2>Northstar Trading · Engagement team</h2><p>{{ messagePolicy }} Use the comment composer above for the next message.</p></div><span class="thread-policy"><strong>Portal only</strong><small>No email side-channel in this prototype</small></span></section>

    <div class="portal-communication-grid">
      <section class="panel communication-topics"><div class="panel-heading"><div><span class="eyebrow">Good messages include</span><h2>Choose a clear topic</h2></div></div><div class="topic-list"><div v-for="topic in topics" :key="topic.label" class="topic-row"><span class="topic-icon" :class="`tone-${topic.tone}`"><Icon :name="topic.tone === 'amber' ? 'warning' : topic.tone === 'green' ? 'check-circle' : 'info'" :size="17" /></span><span><strong>{{ topic.label }}</strong><small>{{ topic.detail }}</small></span></div></div></section>
      <section class="panel communication-next"><div class="panel-heading"><div><span class="eyebrow">After the reply</span><h2>Keep the handoff visible</h2></div></div><ol class="communication-steps"><li><span>1</span><div><strong>Read the team response</strong><small>Check which request or period it addresses.</small></div></li><li><span>2</span><div><strong>Confirm the action</strong><small>Reply with the owner, file, or date you agree to.</small></div></li><li><span>3</span><div><strong>Return to overview</strong><small>See whether another request still needs your attention.</small></div></li></ol><button type="button" class="button secondary full-width" @click="navigate('client-home')">Back to portal overview <Icon name="arrow-right" :size="16" /></button></section>
    </div>
  </div>
</template>
