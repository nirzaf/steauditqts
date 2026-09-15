// M7 PIPE-02 — typed questionnaire policy keyed by stable question IDs.
// Human-readable wording remains in src/domain/questionBanks.js; policy here
// is explicit and does not parse the English rule strings to make decisions.

import { annualContinuanceQuestions, clientEvaluationQuestions, QUESTION_BANK_VERSION } from '../src/domain/questionBanks.js'

const HARD_STOP_IDS = new Set(['CE-001', 'CE-011', 'CE-023', 'CE-030', 'CE-032', 'CE-060', 'CE-075'])
const EVIDENCE_REQUIRED_IDS = new Set(clientEvaluationQuestions.map((question) => question.id))
const PROFESSIONAL_IDS = new Set([...clientEvaluationQuestions, ...annualContinuanceQuestions].filter((question) => question.professionalOnly).map((question) => question.id))

function entry(question, type) {
  const id = question.id
  const isMatchQuestion = id === 'CE-032'
  return Object.freeze({
    questionId: id,
    templateVersion: QUESTION_BANK_VERSION,
    type,
    allowedAnswers: isMatchQuestion
      ? ['NO_MATCH', 'POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION', 'UNKNOWN']
      : ['YES', 'NO', 'UNKNOWN'],
    allowedApplicability: ['APPLICABLE', 'NOT_APPLICABLE'],
    responderRoles: PROFESSIONAL_IDS.has(id) ? ['compliance_reviewer', 'audit_manager', 'engagement_partner'] : ['client_contributor', 'client_finance', 'management_approver', 'compliance_reviewer', 'audit_manager', 'engagement_partner'],
    verifierRoles: ['compliance_reviewer', 'audit_manager', 'engagement_partner'],
    verificationRequired: EVIDENCE_REQUIRED_IDS.has(id),
    hardStopOn: isMatchQuestion
      ? ['MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION']
      : (HARD_STOP_IDS.has(id) ? ['NO', 'UNKNOWN'] : []),
    followUpOn: isMatchQuestion ? ['POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION'] : ['NO', 'UNKNOWN'],
    requiresApplicabilityApproval: true,
    evidenceLabel: question.evidence || question.trigger || 'Supporting evidence',
  })
}

export const QUESTION_POLICY = Object.freeze(Object.fromEntries([
  ...clientEvaluationQuestions.map((question) => [question.id, entry(question, 'acceptance')]),
  ...annualContinuanceQuestions.map((question) => [question.id, entry(question, 'continuance')]),
]))

export function questionPolicyFor(questionId) {
  return QUESTION_POLICY[String(questionId || '')] || null
}

export function validateQuestionResponse({ questionId, answer = 'UNKNOWN', applicability = 'APPLICABLE', verification = 'UNVERIFIED', evidenceRef = '', disposition = '' } = {}) {
  const policy = questionPolicyFor(questionId)
  const normalizedAnswer = String(answer || '').toUpperCase()
  const normalizedApplicability = String(applicability || '').toUpperCase()
  const normalizedVerification = String(verification || '').toUpperCase()
  const blockers = []
  const warnings = []
  if (!policy) blockers.push({ code: 'QUESTION_NOT_REGISTERED', message: 'The question is not registered in the selected template.', responsibleRole: 'compliance_reviewer', targetId: questionId || '' })
  if (policy && !policy.allowedAnswers.includes(normalizedAnswer)) blockers.push({ code: 'ANSWER_NOT_ALLOWED', message: 'Choose an allowed answer.', responsibleRole: 'responder', targetId: questionId })
  if (policy && !policy.allowedApplicability.includes(normalizedApplicability)) blockers.push({ code: 'APPLICABILITY_NOT_ALLOWED', message: 'Choose an approved applicability state.', responsibleRole: 'compliance_reviewer', targetId: questionId })
  if (normalizedApplicability === 'NOT_APPLICABLE' && !String(disposition || '').trim()) blockers.push({ code: 'NA_APPROVAL_REQUIRED', message: 'A typed applicability decision is required; a rationale alone cannot waive the control.', responsibleRole: 'compliance_reviewer', targetId: questionId })
  if (policy && policy.verificationRequired && normalizedAnswer !== 'NOT_APPLICABLE' && normalizedVerification !== 'VERIFIED') {
    blockers.push({ code: 'EVIDENCE_NOT_VERIFIED', message: `Verify ${policy.evidenceLabel} before relying on this answer.`, responsibleRole: 'compliance_reviewer', targetId: questionId })
  }
  if (policy && policy.hardStopOn.includes(normalizedAnswer)) blockers.push({ code: 'HARD_STOP_RESPONSE', message: 'This response requires documented professional resolution before favorable acceptance.', responsibleRole: 'engagement_partner', targetId: questionId })
  if (policy && policy.followUpOn.includes(normalizedAnswer) && normalizedAnswer !== 'NOT_APPLICABLE') {
    const hasDisposition = String(disposition || '').trim().length > 0
    if (!hasDisposition) blockers.push({ code: 'FOLLOW_UP_REQUIRED', message: 'Record the required specialist or partner disposition for this response.', responsibleRole: 'compliance_reviewer', targetId: questionId })
    else warnings.push({ code: 'FOLLOW_UP_RECORDED', message: 'A follow-up disposition is recorded and remains subject to its owner.', targetId: questionId })
  }
  return { allowed: blockers.length === 0, blockers, warnings, policy }
}

export function evaluateAssessmentResponses(responses = [], { type = 'acceptance' } = {}) {
  const list = Array.isArray(responses) ? responses : []
  const applicable = list.filter((response) => String(response.applicability || 'APPLICABLE').toUpperCase() !== 'NOT_APPLICABLE')
  const results = applicable.map((response) => ({ response, ...validateQuestionResponse(response) }))
  const blockers = results.flatMap((item) => item.blockers)
  const warnings = results.flatMap((item) => item.warnings)
  const required = Object.values(QUESTION_POLICY).filter((policy) => policy.type === type).length
  const answered = list.filter((response) => String(response.answer || 'UNKNOWN').toUpperCase() !== 'UNKNOWN').length
  const verified = applicable.filter((response) => String(response.verification || '').toUpperCase() === 'VERIFIED').length
  return {
    templateVersion: QUESTION_BANK_VERSION,
    type,
    required,
    answered,
    verified,
    blockers,
    warnings,
    allowed: blockers.length === 0 && answered >= required,
    hardStops: blockers.filter((blocker) => blocker.code === 'HARD_STOP_RESPONSE').length,
  }
}
