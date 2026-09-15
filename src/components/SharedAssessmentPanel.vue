<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StatusPill from './StatusPill.vue'
import { loadDemoSession } from '../auth.js'
import { clientEvaluationQuestions } from '../domain/questionBanks.js'
import { getAssessmentSummary, recordAssessmentResponse, runSharedAction } from '../sharedDemo.js'
import { useDemoContext } from '../demoContext.js'

const { activeEngagementId, refresh: refreshDemoContext } = useDemoContext()

const summary = ref(null)
const responses = ref([])
const loading = ref(false)
const error = ref(null)
const message = ref(null)
const lastSync = ref('')

const questionId = ref('')
const answer = ref('YES')
const applicability = ref('APPLICABLE')
const explanation = ref('')
const decision = ref('ACCEPT')
const rationale = ref('')
const busy = ref(false)

const currentUser = computed(() => loadDemoSession())
const currentRole = computed(() => currentUser.value?.role || '')
const responseRows = computed(() => {
  const byId = Object.fromEntries((responses.value || []).map((row) => [row.question_id, row]))
  return clientEvaluationQuestions.map((question) => ({ question, response: byId[question.id] || null }))
})
const holds = computed(() => summary.value?.holds || [])
const recommendation = computed(() => summary.value?.recommendation || '—')

function demoRole() {
  const map = { client: 'client_contributor', 'client-management': 'management_approver', preparer: 'preparer', 'audit-senior': 'audit_senior', 'audit-manager': 'audit_manager', partner: 'engagement_partner', finance: 'finance_team', accountant: 'preparer', 'accounting-reviewer': 'accounting_reviewer', eqr: 'eqr_reviewer', records: 'records_custodian', 'system-admin': 'system_admin', compliance: 'compliance_reviewer', admin: 'engagement_partner' }
  return map[currentRole.value] || ''
}

function canRespond(question) {
  if (!question) return false
  if (question.professionalOnly) return ['engagement_partner', 'compliance_reviewer', 'system_admin'].includes(demoRole()) || currentRole.value === 'admin'
  return true
}

function canDecide() {
  return currentRole.value === 'partner' || currentRole.value === 'admin'
}

function answerOptions(id) {
  return id === 'CE-032'
    ? ['NO_MATCH', 'POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION']
    : ['YES', 'NO']
}

async function refresh() {
  const id = activeEngagementId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const result = await getAssessmentSummary(id)
    if (result.ok) {
      summary.value = result.summary
      responses.value = result.responses || []
      lastSync.value = new Date().toISOString()
    } else {
      error.value = result.error
    }
  } finally {
    loading.value = false
  }
}

async function submitResponse() {
  if (!questionId.value || busy.value) return
  busy.value = true
  message.value = null
  const result = await recordAssessmentResponse(activeEngagementId.value, {
    questionId: questionId.value,
    answer: answer.value,
    applicability: applicability.value,
    explanation: explanation.value,
  })
  busy.value = false
  if (result.ok) {
    summary.value = result.summary
    message.value = { ok: true, text: questionId.value + ' recorded (' + result.recorded + '). Holds recomputed from the shared bank.' }
    explanation.value = ''
    refreshDemoContext()
    await refresh()
  } else {
    message.value = { ok: false, text: 'Not recorded (' + (result.error?.code || 'ERROR') + '): ' + (result.error?.message || '') }
  }
}

async function submitDecision() {
  if (busy.value) return
  busy.value = true
  message.value = null
  const result = await runSharedAction(activeEngagementId.value, 'ACCEPT_CLIENT', { decision: decision.value, rationale: rationale.value })
  busy.value = false
  if (result.ok) {
    message.value = { ok: true, text: 'Partner decision ' + decision.value + ' committed to the shared record.' }
    rationale.value = ''
    refreshDemoContext()
    await refresh()
  } else {
    message.value = { ok: false, text: 'Decision not committed (' + (result.error?.code || 'ERROR') + '): ' + (result.error?.message || '') }
  }
}

watch(activeEngagementId, () => refresh())

onMounted(() => {
  refresh()
})
</script>

<template>
  <section class="panel shared-assessment-panel" aria-labelledby="shared-assessment-title">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Shared D1 evaluation · canonical bank v4-2026-01</span>
        <h2 id="shared-assessment-title">Client Evaluation</h2>
      </div>
      <button type="button" class="text-button" :disabled="loading" @click="refresh">Refresh <Icon name="refresh" :size="15" /></button>
    </div>

    <p v-if="loading && !summary" class="guide-status-message" role="status">Loading shared evaluation…</p>
    <p v-else-if="error && !summary" class="guide-status-message" role="status">Evaluation unavailable ({{ error.code }}). Shared acceptance needs the D1 session.</p>

    <template v-if="summary">
      <p v-if="error" class="guide-status-message" role="status">Showing last synced evaluation ({{ error.code }}).</p>
      <div class="assessment-counts" role="status">
        <div><strong>{{ summary.answered }} / {{ summary.required }}</strong><span>answered</span></div>
        <div><strong>{{ summary.verified }} / {{ summary.required }}</strong><span>verified</span></div>
        <div><strong>{{ summary.holds.length }}</strong><span>holds</span></div>
        <div><strong>{{ summary.hardStops.length }}</strong><span>hard stops</span></div>
        <div><StatusPill :label="'System: ' + recommendation" :tone="recommendation === 'ACCEPT' ? 'good' : recommendation === 'DECLINE' ? 'danger' : 'warn'" /></div>
      </div>

      <div class="assessment-categories">
        <div v-for="category in summary.categories" :key="category.name" class="assessment-category-row">
          <span class="assessment-category-name">{{ category.name }}</span>
          <span class="assessment-category-count">{{ category.answered }}/{{ category.total }} complete</span>
          <StatusPill :label="category.clear ? 'CLEAR' : category.holds + ' HOLD'" :tone="category.clear ? 'good' : 'warn'" />
        </div>
      </div>

      <div v-if="holds.length" class="assessment-holds">
        <span class="eyebrow">Unresolved holds ({{ holds.length }})</span>
        <ul>
          <li v-for="hold in holds.slice(0, 12)" :key="hold.questionId + hold.code"><strong>{{ hold.questionId }}</strong><span>{{ hold.message }}</span></li>
        </ul>
        <small v-if="holds.length > 12">…and {{ holds.length - 12 }} more. Acceptance stays blocked until every hold is resolved.</small>
      </div>

      <form v-if="currentRole" class="assessment-responder" @submit.prevent="submitResponse">
        <span class="eyebrow">Record a shared response</span>
        <div class="form-grid compact-form-grid">
          <label>Question
            <select v-model="questionId" required>
              <option value="" disabled>Choose a question</option>
              <option v-for="{ question, response } in responseRows" :key="question.id" :value="question.id" :disabled="!canRespond(question)">{{ question.id }} · {{ response?.answer || 'UNANSWERED' }} — {{ question.question.slice(0, 60) }}</option>
            </select>
          </label>
          <label>Answer
            <select v-model="answer"><option v-for="option in answerOptions(questionId)" :key="option" :value="option">{{ option }}</option></select>
          </label>
          <label>Applicability
            <select v-model="applicability"><option>APPLICABLE</option><option>NOT_APPLICABLE</option></select>
          </label>
          <label>Explanation / evidence
            <input v-model="explanation" type="text" placeholder="Rationale, evidence reference…" />
          </label>
        </div>
        <button type="submit" class="button secondary" :disabled="busy || !questionId">Record response</button>
      </form>

      <form v-if="canDecide()" class="assessment-decision" @submit.prevent="submitDecision">
        <span class="eyebrow">Partner decision — professional judgment, system assists only</span>
        <div class="form-grid compact-form-grid">
          <label>Decision
            <select v-model="decision"><option>ACCEPT</option><option>DECLINE</option><option>ESCALATE</option></select>
          </label>
          <label>Rationale
            <input v-model="rationale" type="text" placeholder="Decision rationale (required)" />
          </label>
        </div>
        <button type="submit" class="button primary" :disabled="busy">Record decision</button>
        <small>ACCEPT is blocked while required evaluation holds are unresolved. DECLINE and ESCALATE remain available as professional decisions.</small>
      </form>

      <p v-if="message" class="guide-status-message" role="status">{{ message.text }}</p>
      <p class="panel-footnote"><Icon name="info" :size="15" /><span>Holds derive from the canonical bank; acceptance reads them, never bypasses them.{{ lastSync ? ' Synced ' + new Date(lastSync).toLocaleTimeString('en-QA') + '.' : '' }}</span></p>
    </template>
  </section>
</template>

<style scoped>
.shared-assessment-panel { margin-bottom: 16px; }
.assessment-counts { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.assessment-counts div { display: flex; flex-direction: column; }
.assessment-counts strong { font-size: 17px; }
.assessment-counts span { font-size: 11px; opacity: 0.7; }
.assessment-categories { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.assessment-category-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.assessment-category-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assessment-category-count { font-size: 12px; opacity: 0.75; white-space: nowrap; }
.assessment-holds ul { margin: 6px 0; padding-left: 18px; font-size: 13px; display: flex; flex-direction: column; gap: 3px; }
.assessment-responder, .assessment-decision { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
</style>
