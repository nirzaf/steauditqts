import { annualContinuanceQuestions, clientEvaluationQuestions, QUESTION_BANK_VERSION } from './questionBanks.js'

export const ASSESSMENT_SCHEMA_VERSION = 1

const now = () => new Date().toISOString()
const questionsFor = (type) => type === 'continuance' ? annualContinuanceQuestions : clientEvaluationQuestions

export function createAssessment({ id, engagementId, type = 'acceptance', revision = 1, seed = {} } = {}) {
  const questions = questionsFor(type)
  const responses = Object.fromEntries(questions.map((question) => {
    const seeded = seed[question.id] || {}
    return [question.id, {
      questionId: question.id,
      templateVersion: QUESTION_BANK_VERSION,
      applicability: seeded.applicability || 'APPLICABLE',
      answer: seeded.answer || 'UNKNOWN',
      explanation: seeded.explanation || '',
      evidenceSnapshotId: seeded.evidenceSnapshotId || null,
      respondentActorId: seeded.respondentActorId || null,
      respondedAt: seeded.respondedAt || null,
      verification: seeded.verification || 'UNVERIFIED',
      visibility: seeded.visibility || (question.professionalOnly ? 'INTERNAL' : 'SHARED_FACT'),
    }]
  }))
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    id,
    engagementId,
    type,
    templateVersion: QUESTION_BANK_VERSION,
    revision,
    responses,
    decision: null,
    holds: [],
    createdAt: now(),
    updatedAt: now(),
  }
}

export function evaluateAssessment(assessment) {
  if (!assessment) return { applicable: 0, answered: 0, verified: 0, completion: 0, holds: [{ code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment is not available.' }], prohibitions: [] }
  const questions = questionsFor(assessment.type)
  const holds = []
  const prohibitions = []
  let applicable = 0
  let answered = 0
  let verified = 0
  for (const question of questions) {
    const response = assessment.responses?.[question.id] || {}
    if (response.applicability === 'NOT_APPLICABLE') {
      if (!String(response.explanation || '').trim()) holds.push({ questionId: question.id, code: 'NA_RATIONALE_REQUIRED', message: `${question.id} is marked not applicable without a rationale.` })
      continue
    }
    applicable += 1
    const answer = String(response.answer || 'UNKNOWN').toUpperCase()
    const allowedAnswers = question.id === 'CE-032'
      ? ['NO_MATCH', 'POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION', 'UNKNOWN']
      : ['YES', 'NO', 'UNKNOWN']
    if (!allowedAnswers.includes(answer)) {
      holds.push({ questionId: question.id, code: 'ANSWER_INVALID', message: `${question.id} has an unsupported answer for the versioned question bank.` })
    } else if (!answer || answer === 'UNKNOWN' || answer === 'MISSING') {
      holds.push({ questionId: question.id, code: 'RESPONSE_REQUIRED', message: `${question.id} has no favorable answer or supporting evidence.` })
    } else {
      answered += 1
      if (response.verification === 'VERIFIED') verified += 1
    }
    // The source catalogue contains directional rules. A negative response
    // is not automatically a legal conclusion, but when the approved rule
    // explicitly says the answer needs evidence, renegotiation, specialist
    // review or a hard stop, keep that review visible to the partner instead
    // of treating the response as a favorable completion.
    const rule = String(question.rule || '')
    const adverseDirection = (answer === 'NO' && /\bNo\s*=/i.test(rule))
      // A positive-risk rule (for example, "Yes = EDD") is still shown to
      // the professional, but a fixture response that already carries an
      // explicit VERIFIED marker represents that review having occurred. New
      // submitted answers remain held until somebody records the follow-up.
      || (answer === 'YES' && /\bYes\s*=/i.test(rule) && response.verification !== 'VERIFIED')
    if (adverseDirection) {
      const hardStop = /hard\s*stop|cannot\s+start|do\s+not\s+start|decline/i.test(rule)
      holds.push({
        questionId: question.id,
        code: hardStop ? 'HARD_STOP_RESPONSE' : 'ADVERSE_RESPONSE_REVIEW',
        message: `${question.id} requires professional follow-up: ${rule.split('=').slice(1).join('=').trim() || 'review the response and supporting evidence.'}`,
      })
    }
    if (answer === 'CONFIRMED_PROHIBITION' || (question.id === 'CE-032' && answer === 'MATCH_CONFIRMED')) {
      prohibitions.push({ questionId: question.id, code: 'CONFIRMED_PROHIBITION', message: `${question.id} is a confirmed prohibition and cannot be overridden.` })
    }
    if (answer === 'POSSIBLE_MATCH' || answer === 'SPECIALIST_REQUIRED') holds.push({ questionId: question.id, code: 'SPECIALIST_DISPOSITION_REQUIRED', message: `${question.id} requires a specialist disposition.` })
  }
  holds.push(...prohibitions)
  const completion = applicable ? Math.round((answered / applicable) * 100) : 100
  return { applicable, answered, verified, completion, holds, prohibitions }
}

function questionFor(assessment, questionId) {
  return questionsFor(assessment?.type).find((question) => question.id === questionId) || null
}

export function updateAssessmentResponse(assessment, { questionId, actor, expectedRevision, answer, applicability = 'APPLICABLE', explanation = '', evidenceSnapshotId = null } = {}) {
  if (!assessment) return { ok: false, code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment is not available.' }
  const question = questionFor(assessment, questionId)
  if (!question) return { ok: false, code: 'QUESTION_NOT_FOUND', message: 'That question is not part of this assessment template.' }
  if (!actor?.active) return { ok: false, code: 'ACTOR_INACTIVE', message: 'The scenario actor is not active.' }
  if (question.professionalOnly && actor.roles?.includes('client_finance')) return { ok: false, code: 'PROFESSIONAL_AUTHORITY_REQUIRED', message: 'This question is an internal professional assessment.' }
  if (!question.professionalOnly && !actor.roles?.some((role) => ['client_finance', 'preparer', 'compliance_reviewer', 'engagement_partner', 'system_admin'].includes(role))) return { ok: false, code: 'ASSESSMENT_AUTHORITY_REQUIRED', message: 'The actor cannot provide this assessment response.' }
  if (expectedRevision != null && expectedRevision !== assessment.revision) return { ok: false, code: 'REVISION_CONFLICT', message: `Expected assessment revision ${expectedRevision}, current revision is ${assessment.revision}.` }
  if (!['APPLICABLE', 'NOT_APPLICABLE'].includes(applicability)) return { ok: false, code: 'APPLICABILITY_INVALID', message: 'Applicability must be APPLICABLE or NOT_APPLICABLE.' }
  if (applicability === 'NOT_APPLICABLE' && !String(explanation).trim()) return { ok: false, code: 'NA_RATIONALE_REQUIRED', message: 'A not-applicable response requires a rationale.' }
  const normalizedAnswer = String(answer || 'UNKNOWN').toUpperCase()
  const allowedAnswers = question.id === 'CE-032'
    ? ['NO_MATCH', 'POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION', 'UNKNOWN']
    : ['YES', 'NO', 'UNKNOWN']
  if (!allowedAnswers.includes(normalizedAnswer)) return { ok: false, code: 'ANSWER_INVALID', message: `${question.id} does not support the answer ${normalizedAnswer} in this question-bank version.` }
  const response = assessment.responses[questionId]
  response.applicability = applicability
  response.answer = normalizedAnswer
  response.explanation = String(explanation || '').trim()
  response.evidenceSnapshotId = evidenceSnapshotId
  response.respondentActorId = actor.id
  response.respondedAt = now()
  response.verification = actor.roles?.includes('compliance_reviewer') || actor.roles?.includes('engagement_partner') ? 'VERIFIED' : 'SUBMITTED'
  assessment.revision += 1
  assessment.updatedAt = now()
  assessment.holds = evaluateAssessment(assessment).holds
  return { ok: true, code: 'RESPONSE_RECORDED', response, revision: assessment.revision, evaluation: evaluateAssessment(assessment) }
}

export function recordPartnerDecision(assessment, { actor, expectedRevision, decision, rationale = '' } = {}) {
  if (!assessment) return { ok: false, code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment is not available.' }
  if (!actor?.active || !actor.roles?.includes('engagement_partner')) return { ok: false, code: 'PARTNER_AUTHORITY_REQUIRED', message: 'Only the scoped engagement partner can record the decision.' }
  if (expectedRevision != null && expectedRevision !== assessment.revision) return { ok: false, code: 'REVISION_CONFLICT', message: `Expected assessment revision ${expectedRevision}, current revision is ${assessment.revision}.` }
  const evaluation = evaluateAssessment(assessment)
  if (!['ACCEPT', 'CONTINUE', 'DECLINE', 'ESCALATE'].includes(decision)) return { ok: false, code: 'DECISION_INVALID', message: 'Choose ACCEPT, CONTINUE, DECLINE, or ESCALATE.' }
  // A confirmed prohibition blocks a favorable acceptance/continuation, but
  // the Partner must still be able to record a documented decline or
  // escalation.  Requiring the prohibition to be cleared would erase the
  // very compliance fact the decision is meant to preserve.
  if (evaluation.prohibitions.length && ['ACCEPT', 'CONTINUE'].includes(decision)) return { ok: false, code: 'CONFIRMED_PROHIBITION', message: 'A confirmed prohibition cannot be overridden by a partner or administrator.', evaluation }
  if (['ACCEPT', 'CONTINUE'].includes(decision) && evaluation.holds.length) return { ok: false, code: 'ASSESSMENT_HOLDS', message: 'Resolve every hold before recording a favorable decision.', evaluation }
  assessment.decision = { decision, rationale: String(rationale).trim(), actorId: actor.id, recordedAt: now(), revision: assessment.revision }
  assessment.revision += 1
  assessment.updatedAt = now()
  return { ok: true, code: 'DECISION_RECORDED', decision: assessment.decision, revision: assessment.revision, evaluation }
}

export function visibleResponses(assessment, actor) {
  if (!assessment) return []
  const internal = actor?.roles?.some((role) => ['compliance_reviewer', 'engagement_partner', 'system_admin', 'independent_reviewer'].includes(role))
  return questionsFor(assessment.type).map((question) => ({ question, response: assessment.responses[question.id] })).filter(({ question }) => internal || !question.professionalOnly)
}
