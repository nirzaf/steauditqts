/**
 * useLifecyclePipeline — derive live pipeline stage states from domain/scenario data.
 *
 * Returns a computed array of stage-state objects that describe each pipeline
 * stage without maintaining any separate manually-editable state.  The states
 * are derived purely from the local scenario (and optionally from the shared
 * D1 progress snapshot when available).
 *
 * Possible displayState values:
 *   NOT_STARTED | READY | IN_PROGRESS | WAITING_FOR_CLIENT | WAITING_FOR_FINANCE
 *   WAITING_FOR_SENIOR | WAITING_FOR_MANAGER | WAITING_FOR_PARTNER | WAITING_FOR_EQR
 *   BLOCKED | STALE | COMPLETE
 */
import { computed } from 'vue'
import {
  scenario,
  assessmentFor,
  termsAcceptedFor,
  commercialRecordFor,
  engagementById,
} from '../domain/scenario.js'
import { pipelineStages } from '../pipelineData.js'

function assessmentAccepted(engagementId) {
  const assessment = assessmentFor(engagementId, 'acceptance')
  return Boolean(assessment?.decision && ['ACCEPT', 'CONTINUE'].includes(assessment.decision.decision))
}

function assessmentDecisionMade(engagementId) {
  const assessment = assessmentFor(engagementId, 'acceptance')
  return Boolean(assessment?.decision)
}

function assessmentDecisionIsReject(engagementId) {
  const assessment = assessmentFor(engagementId, 'acceptance')
  return assessment?.decision?.decision === 'DECLINE'
}

function hasQualifiedLead(leads) {
  return (leads || []).some((lead) => lead.status === 'QUALIFIED' || lead.status === 'CONVERTED')
}

function hasConvertedLead(leads) {
  return (leads || []).some((lead) => lead.status === 'CONVERTED')
}

function commercialReady(engagementId) {
  const record = commercialRecordFor(engagementId)
  return Boolean(record && record.feeApprovalState === 'APPROVED')
}

function engagementTeamSufficient(engagement) {
  if (!engagement) return false
  const team = engagement.team || []
  const hasPartner = team.some((m) => m.role === 'engagement_partner')
  const hasLeadAuditor = team.some((m) => ['audit_manager', 'audit_senior'].includes(m.role))
  const hasPreparer = team.some((m) => m.role === 'preparer')
  return hasPartner && hasLeadAuditor && hasPreparer
}

function advanceVerified(engagementId) {
  const record = commercialRecordFor(engagementId)
  if (!record) return false
  if (!record.advanceRequired || Number(record.advanceRequired) === 0) return true
  return record.advanceState === 'VERIFIED'
}

function seniorReviewComplete(engagementId) {
  const workpapers = (scenario.workpapers || []).filter(
    (wp) => wp.engagementId === engagementId && wp.state !== 'DRAFT',
  )
  if (workpapers.length === 0) return false
  return workpapers.every((wp) => wp.reviewState === 'SENIOR_CLEARED' || wp.seniorReviewed === true)
}

function openSignificantReviewPoints(engagementId) {
  return (scenario.reviews || []).filter(
    (rp) =>
      rp.engagementId === engagementId &&
      rp.status === 'OPEN' &&
      rp.severity === 'SIGNIFICANT',
  ).length
}

/**
 * Derive a display state for each pipeline stage from the current scenario.
 *
 * @param {string|null} engagementId — the engagement to evaluate (defaults to selectedEngagementId)
 * @param {object|null} sharedProgress — optional D1-derived progress snapshot
 * @returns computed array of { stageId, displayState, owner, nextAction, blocker }
 */
export function useLifecyclePipeline(engagementId = null, sharedProgress = null) {
  const resolvedEngagementId = computed(() => engagementId || scenario.selectedEngagementId)

  const stageStates = computed(() => {
    const engId = resolvedEngagementId.value
    const engagement = engId ? engagementById(engId) : null
    const leads = scenario.leads || []

    // Whether the shared progress snapshot (D1) says the engagement is at a given stage
    const progress = sharedProgress?.value || null

    return pipelineStages.map((stage) => {
      let displayState = 'NOT_STARTED'
      let nextAction = null
      let blocker = null
      let owner = stage.owner
      let relatedRecord = null

      switch (stage.id) {
        case 'lead': {
          const hasLeads = (leads || []).length > 0
          if (hasLeads) {
            const pendingCount = leads.filter((l) => l.status === 'PENDING').length
            displayState = pendingCount > 0 ? 'IN_PROGRESS' : 'COMPLETE'
            nextAction = pendingCount > 0 ? 'Qualify pending leads' : 'Create new lead'
            relatedRecord = `${leads.length} lead(s)`
          } else {
            displayState = 'NOT_STARTED'
            nextAction = 'Register first lead'
          }
          break
        }

        case 'qualify': {
          const qualified = leads.filter((l) => ['QUALIFIED', 'CONVERTED'].includes(l.status))
          const pending = leads.filter((l) => l.status === 'PENDING')
          if (qualified.length > 0) {
            displayState = 'READY'
            nextAction = 'Convert qualified lead'
            relatedRecord = `${qualified.length} qualified`
          } else if (pending.length > 0) {
            displayState = 'IN_PROGRESS'
            nextAction = 'Qualify pending leads'
            relatedRecord = `${pending.length} pending`
          } else {
            displayState = 'NOT_STARTED'
            nextAction = 'Register and qualify leads'
          }
          break
        }

        case 'convert': {
          const converted = leads.filter((l) => l.status === 'CONVERTED')
          const qualified = leads.filter((l) => l.status === 'QUALIFIED')
          if (converted.length > 0) {
            displayState = 'COMPLETE'
            nextAction = 'Complete client acceptance'
            relatedRecord = `${converted.length} converted`
          } else if (qualified.length > 0) {
            displayState = 'READY'
            nextAction = 'Convert qualified lead to client'
            relatedRecord = `${qualified.length} qualified`
          } else {
            displayState = 'NOT_STARTED'
            nextAction = 'Qualify a lead first'
            blocker = 'No qualified leads'
          }
          break
        }

        case 'intake': {
          if (!engagement) {
            displayState = 'NOT_STARTED'
            nextAction = 'Convert a lead to create an engagement'
            blocker = 'No engagement exists yet'
            break
          }
          const accepted = assessmentAccepted(engId)
          const decided = assessmentDecisionMade(engId)
          const rejected = assessmentDecisionIsReject(engId)
          if (rejected) {
            displayState = 'BLOCKED'
            blocker = 'Client declined — engagement cannot proceed'
            owner = 'Engagement partner'
          } else if (accepted) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to commercial'
          } else if (decided) {
            displayState = 'BLOCKED'
            blocker = 'Acceptance decision was not an acceptance'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Complete acceptance questionnaire and record partner decision'
            owner = 'Engagement partner'
          }
          relatedRecord = engId
          break
        }

        case 'commercial': {
          if (!engagement) { displayState = 'NOT_STARTED'; break }
          if (!assessmentAccepted(engId)) {
            displayState = 'NOT_STARTED'
            blocker = 'Client must be accepted first'
            break
          }
          const record = commercialRecordFor(engId)
          if (!record) { displayState = 'NOT_STARTED'; nextAction = 'Create commercial record'; break }
          if (commercialReady(engId) && termsAcceptedFor(engId)) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to team assignment'
          } else if (commercialReady(engId) && !termsAcceptedFor(engId)) {
            displayState = 'WAITING_FOR_CLIENT'
            nextAction = 'Waiting for client to accept engagement letter'
            owner = 'Client management'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Issue quotation and engagement letter'
            owner = 'Finance + partner'
          }
          relatedRecord = record?.id
          break
        }

        case 'staffing': {
          if (!engagement) { displayState = 'NOT_STARTED'; break }
          if (!assessmentAccepted(engId) || !termsAcceptedFor(engId)) {
            displayState = 'NOT_STARTED'
            blocker = 'Acceptance and terms required first'
            break
          }
          if (engagement.auditCommenced) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to audit planning'
            relatedRecord = `Commenced ${engagement.commencedAt ? new Date(engagement.commencedAt).toLocaleDateString() : ''}`
          } else if (engagementTeamSufficient(engagement) && advanceVerified(engId)) {
            displayState = 'READY'
            nextAction = 'START AUDIT'
            owner = 'Engagement partner / manager'
          } else if (!advanceVerified(engId)) {
            displayState = 'WAITING_FOR_FINANCE'
            nextAction = 'Finance to verify advance payment'
            owner = 'Finance team'
            blocker = 'Advance payment not verified'
          } else {
            displayState = 'BLOCKED'
            nextAction = 'Complete team assignment (Partner, Senior/Manager, Preparer)'
            blocker = 'Team staffing incomplete'
          }
          break
        }

        case 'planning': {
          if (!engagement?.auditCommenced) {
            displayState = 'NOT_STARTED'
            blocker = 'Audit must be commenced first'
            break
          }
          const planReady = engagement.evidence?.auditPlanReady
          if (planReady) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to evidence collection'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Draft and approve audit plan, issue announcement'
            owner = 'Audit senior + manager'
          }
          break
        }

        case 'evidence': {
          if (!engagement?.auditCommenced) { displayState = 'NOT_STARTED'; break }
          const pbcRequests = (scenario.pbcRequests || []).filter((r) => r.engagementId === engId)
          const underReview = pbcRequests.filter((r) => r.state === 'UNDER_REVIEW')
          const clarification = pbcRequests.filter((r) => r.state === 'CLARIFICATION_REQUIRED')
          const allAccepted = pbcRequests.length > 0 && pbcRequests.every((r) => r.state === 'ACCEPTED')
          if (allAccepted) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to audit execution'
          } else if (clarification.length > 0) {
            displayState = 'WAITING_FOR_CLIENT'
            nextAction = 'Client to provide clarification'
            blocker = `${clarification.length} request(s) need clarification`
          } else if (underReview.length > 0) {
            displayState = 'IN_PROGRESS'
            nextAction = 'Senior to review received evidence'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Issue PBC requests to client'
          }
          break
        }

        case 'draft-response': {
          if (!engagement?.auditCommenced) { displayState = 'NOT_STARTED'; break }
          const pkg = (scenario.accountingPackages || []).find((p) => p.engagementId === engId)
          const workpapers = (scenario.workpapers || []).filter((wp) => wp.engagementId === engId)
          const submittedWps = workpapers.filter((wp) => wp.state !== 'DRAFT')
          const infoRequest = (scenario.informationRequests || []).find((r) => r.engagementId === engId)
          if (submittedWps.length > 0 && infoRequest?.state === 'RESPONDED') {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to review chain'
          } else if (infoRequest?.state === 'OPEN') {
            displayState = 'WAITING_FOR_CLIENT'
            nextAction = 'Waiting for management response'
            blocker = 'Management Information Request pending'
          } else if (submittedWps.length > 0) {
            displayState = 'IN_PROGRESS'
            nextAction = 'Issue management information request'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Complete workpapers and issue management request'
          }
          break
        }

        case 'review': {
          if (!engagement?.auditCommenced) { displayState = 'NOT_STARTED'; break }
          const senior = seniorReviewComplete(engId)
          const mgr = engagement.evidence?.completionRecommendation === 'RECOMMEND_COMPLETE'
          const partner = engagement.evidence?.partnerApproved
          const eqrRequired = engagement.evidence?.eqrRequired
          const eqrDone = engagement.evidence?.eqrComplete
          const openRPs = openSignificantReviewPoints(engId)

          if (partner) {
            displayState = 'COMPLETE'
            nextAction = 'Proceed to release'
          } else if (eqrRequired && !eqrDone && mgr) {
            displayState = 'WAITING_FOR_EQR'
            nextAction = 'EQR to complete engagement quality review'
            owner = 'EQR reviewer'
          } else if (mgr && !partner) {
            displayState = 'WAITING_FOR_PARTNER'
            nextAction = 'Partner to complete review and form opinion'
            owner = 'Engagement partner'
          } else if (senior && openRPs === 0) {
            displayState = 'WAITING_FOR_MANAGER'
            nextAction = 'Manager to complete engagement file'
            owner = 'Audit manager'
          } else if (!senior) {
            displayState = 'WAITING_FOR_SENIOR'
            nextAction = 'Senior to review all workpapers'
            owner = 'Audit senior'
            blocker = 'Senior review not complete'
          } else if (openRPs > 0) {
            displayState = 'BLOCKED'
            blocker = `${openRPs} significant review point(s) unresolved`
            nextAction = 'Resolve significant review points'
          } else {
            displayState = 'IN_PROGRESS'
            nextAction = 'Begin review chain'
          }
          break
        }

        case 'release': {
          if (!engagement?.auditCommenced) { displayState = 'NOT_STARTED'; break }
          const candidate = (scenario.releaseCandidates || []).find(
            (rc) => rc.engagementId === engId && rc.state === 'CANDIDATE',
          )
          if (engagement.evidence?.archiveVerified) {
            displayState = 'COMPLETE'
            nextAction = 'Engagement archived'
          } else if (engagement.evidence?.commercialClosed) {
            displayState = 'IN_PROGRESS'
            nextAction = 'Archive engagement records'
          } else if (candidate?.deliveryState === 'DELIVERED') {
            displayState = 'WAITING_FOR_FINANCE'
            nextAction = 'Finance to generate and send invoice'
            owner = 'Finance team'
          } else if (engagement.evidence?.partnerApproved) {
            displayState = 'READY'
            nextAction = 'Partner to authorize release'
            owner = 'Engagement partner'
          } else {
            displayState = 'NOT_STARTED'
            blocker = 'Partner review and opinion required first'
          }
          break
        }

        default:
          displayState = 'NOT_STARTED'
      }

      return {
        stageId: stage.id,
        displayState,
        owner,
        nextAction,
        blocker,
        relatedRecord,
        lifecycle: stage.lifecycle,
      }
    })
  })

  return { stageStates }
}
