<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { addWorkflowComment, DEMO_ENGAGEMENT_ID, loadWorkflowState, saveWorkflowPreference } from '../api'
import Icon from './Icon.vue'

const props = defineProps({
  guide: { type: Object, required: true },
  engagementId: { type: String, default: DEMO_ENGAGEMENT_ID },
})

const expanded = ref(true)
const guideId = computed(() => `workflow-guide-${props.guide.id}`)
const feedbackId = computed(() => `${guideId.value}-feedback`)
const comments = ref([])
const authorName = ref('Client contact')
const commentBody = ref('')
const stepOptional = ref(false)
const loadingState = ref(true)
const savingComment = ref(false)
const savingPreference = ref(false)
const source = ref('d1')
const syncState = ref('SYNCED')
const statusMessage = ref('')

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

const sourceLabel = computed(() => source.value === 'd1' ? 'Shared demo record' : syncState.value === 'LOCAL_ONLY_FALLBACK' ? 'Saved local draft' : 'Browser-local synthetic state')
const sourceHint = computed(() => source.value === 'd1'
  ? 'This explicit shared-demo record is synthetic and carries SIMULATION evidence.'
  : syncState.value === 'LOCAL_ONLY_FALLBACK'
    ? 'The shared API was unavailable. This is a local-only draft with no automatic replay or professional effect.'
    : 'This normal prototype build stores synthetic state in this browser only; it is not synchronized.')
const commentCountLabel = computed(() => `${comments.value.length} ${comments.value.length === 1 ? 'comment' : 'comments'}`)

function toggle() {
  expanded.value = !expanded.value
}

function formatCommentDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-QA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function loadState() {
  loadingState.value = true
  statusMessage.value = ''
  try {
    const state = await loadWorkflowState({ engagementId: props.engagementId, pageKey: props.guide.id })
    comments.value = state.comments || []
    source.value = state.source
    syncState.value = state.syncState || 'LOCAL_ONLY'
    const preference = (state.preferences || []).find((item) => item.stepKey === props.guide.id)
    stepOptional.value = Boolean(preference?.isOptional)
    if (state.error) statusMessage.value = `${state.error.code}: ${state.error.message}`
  } catch (error) {
    comments.value = []
    source.value = 'local'
    syncState.value = 'LOCAL_ONLY'
    statusMessage.value = `${error?.code || 'WORKFLOW_STATE_UNAVAILABLE'}: ${error?.message || 'Workflow guidance could not be loaded.'}`
  } finally {
    loadingState.value = false
  }
}

async function addComment() {
  const body = commentBody.value.trim()
  const name = authorName.value.trim()
  if (!body || !name || savingComment.value) return
  savingComment.value = true
  statusMessage.value = ''
  const result = await addWorkflowComment({
    engagementId: props.engagementId,
    pageKey: props.guide.id,
    stepKey: props.guide.id,
    authorName: name,
    authorRole: 'Client contact',
    body,
  })
  source.value = result.source
  syncState.value = result.syncState || 'LOCAL_ONLY'
  commentBody.value = ''
  statusMessage.value = result.outcome === 'COMMITTED'
    ? 'Comment saved to the shared synthetic demo record.'
    : result.outcome === 'SAVED_LOCAL_DRAFT'
      ? 'Comment saved as SAVED_LOCAL_DRAFT. It is not synchronized or queued for replay.'
      : `${result.error?.code || 'SAVE_FAILED'}: ${result.error?.message || 'The comment was not saved.'}`
  if (result.comment) comments.value = [result.comment, ...comments.value.filter((item) => item.id !== result.comment.id)]
  savingComment.value = false
}

async function updateOptional(event) {
  const nextValue = Boolean(event.target.checked)
  if (savingPreference.value) return
  stepOptional.value = nextValue
  savingPreference.value = true
  statusMessage.value = ''
  const result = await saveWorkflowPreference({
    engagementId: props.engagementId,
    stepKey: props.guide.id,
    isOptional: nextValue,
    updatedBy: authorName.value.trim() || 'Client contact',
  })
  source.value = result.source
  syncState.value = result.syncState || 'LOCAL_ONLY'
  statusMessage.value = result.outcome === 'COMMITTED'
    ? 'Walkthrough visibility preference saved to the shared synthetic record.'
    : result.outcome === 'SAVED_LOCAL_DRAFT'
      ? 'Walkthrough visibility preference saved locally only; it never changes a professional gate.'
      : `${result.error?.code || 'SAVE_FAILED'}: ${result.error?.message || 'The preference was not saved.'}`
  savingPreference.value = false
}

onMounted(loadState)
watch(() => props.guide.id, loadState)
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
      <button type="button" class="guide-toggle" :aria-expanded="expanded" :aria-controls="guideId" @click="toggle">
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

      <div :id="feedbackId" class="guide-feedback-grid">
        <section class="guide-feedback-card" :aria-labelledby="`${feedbackId}-title`">
          <div class="guide-feedback-heading">
            <div>
              <span class="guide-label">Client input</span>
              <h3 :id="`${feedbackId}-title`">Add context for this step</h3>
            </div>
            <span class="guide-source" :class="{ local: source === 'local' }">{{ sourceLabel }}</span>
          </div>
          <p class="guide-feedback-copy">Leave a concise note for the engagement team. It is attached to <strong>{{ guide.title }}</strong> and remains separate from the professional conclusion.</p>
          <form class="guide-comment-form" @submit.prevent="addComment">
            <label>Display name<input v-model="authorName" maxlength="80" autocomplete="name" placeholder="e.g. Nadia Faris" /></label>
            <label class="guide-comment-field">Comment<textarea v-model="commentBody" maxlength="1200" rows="3" placeholder="What should the team know before continuing?" required></textarea></label>
            <div class="guide-form-footer"><span class="guide-character-count">{{ commentBody.length }}/1,200</span><button type="submit" class="button primary" :disabled="savingComment || !authorName.trim() || !commentBody.trim()">{{ savingComment ? 'Saving…' : 'Add comment' }}</button></div>
          </form>
          <div class="guide-persistence-note"><Icon name="database" :size="16" /><span>{{ sourceHint }}</span></div>
        </section>

        <section class="guide-comments-card" :aria-labelledby="`${feedbackId}-comments-title`">
          <div class="guide-feedback-heading"><div><span class="guide-label"><Icon name="settings" :size="14" />Decision aid</span><h3 :id="`${feedbackId}-comments-title`">Step setting &amp; comments</h3></div><span class="guide-comment-count">{{ commentCountLabel }}</span></div>
          <label class="guide-optional-control"><input type="checkbox" :checked="stepOptional" :disabled="savingPreference || loadingState" @change="updateOptional" /><span><strong>{{ stepOptional ? 'Allow skip in this walkthrough' : 'Include this step in the walkthrough' }}</strong><small>{{ stepOptional ? 'Presentation preference only; keep the reason visible.' : 'Keep the step visible while explaining the workflow boundary.' }}</small></span></label>
          <p class="guide-optional-warning">This is a presentation preference, not a control policy. It never bypasses an approval, independence check, or audit requirement.</p>
          <div class="guide-comment-list" aria-live="polite">
            <p v-if="loadingState" class="guide-empty-state">Loading comments…</p>
            <p v-else-if="!comments.length" class="guide-empty-state">No client comments yet. Add the first piece of context above.</p>
            <template v-else>
              <article v-for="comment in comments" :key="comment.id" class="guide-comment-item">
                <div class="guide-comment-meta"><strong>{{ comment.authorName }}</strong><span>{{ comment.authorRole }}</span><time :datetime="comment.createdAt">{{ formatCommentDate(comment.createdAt) }}</time></div>
                <p>{{ comment.body }}</p>
              </article>
            </template>
          </div>
          <p v-if="statusMessage" class="guide-status-message" role="status" aria-live="polite">{{ statusMessage }}</p>
        </section>
      </div>
    </div>
  </aside>
</template>
