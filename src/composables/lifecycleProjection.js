/**
 * lifecycleProjection — ONE mode-aware derivation of the 11 pipeline stages.
 *
 *   LOCAL_ONLY   → derived from the browser-local scenario state
 *   SHARED_DEMO  → derived from the D1 progress snapshot, and only from it
 *
 * The two inputs are never combined: a stage either reports what D1 recorded or
 * what the local scenario recorded, and `source` says which. Professional
 * predicates (submitted evidence, the senior-review gate, the commencement
 * staffing profile, the manager recommendation) are imported from
 * shared/lifecycleRules.js and shared/staffingRules.js, the same modules the
 * Worker enforces at the command boundary, so a stage can be green here and red
 * there only if the underlying records genuinely differ.
 *
 * Possible displayState values:
 *   NOT_STARTED | READY | IN_PROGRESS | WAITING_FOR_CLIENT | WAITING_FOR_FINANCE
 *   WAITING_FOR_SENIOR | WAITING_FOR_MANAGER | WAITING_FOR_PARTNER | WAITING_FOR_EQR
 *   BLOCKED | STALE | COMPLETE
 */
import { pipelineStages } from '../pipelineData.js';
import { staffingProfileBlockers } from '../../shared/staffingRules.js';
import {
  completionRecommendationView,
  seniorReviewGateFrom,
  staffingPolicyFor,
  waitingDisplayStateFor,
  isWorkpaperSubmitted,
  linkedAccountingEngagementFrom,
  termsAcceptanceIsCurrent,
} from '../../shared/lifecycleRules.js';

/**
 * D1 gate ids that constitute each pipeline stage. The Worker owns these gates
 * (worker/progress.js); the pipeline only reports them.
 */
const D1_GATES_BY_STAGE = Object.freeze({
  lead: [],
  qualify: [],
  convert: [],
  intake: ['client-details', 'client-evaluation', 'acceptance'],
  commercial: ['estimate', 'fee-approval', 'el-issue', 'el-decision'],
  staffing: ['advance'],
  planning: ['credential', 'portal-activation', 'announcement'],
  evidence: ['pbc-readiness', 'tb-source'],
  'draft-response': ['accounting-package', 'review-points', 'draft-fs'],
  review: ['workpapers', 'manager-completion', 'partner-review', 'eqr', 'opinion'],
  release: ['final-discussion', 'release', 'invoice', 'commercial-close'],
});

const BLOCKED_GATE_STATES = new Set(['BLOCKED', 'REJECTED', 'ESCALATED']);
const ACTIONABLE_GATE_STATES = new Set(['READY', 'OVERDUE']);

const engagementIn = (state, engagementId) =>
  (state?.engagements || []).find((entry) => entry.id === engagementId) || null;

const assessmentForIn = (state, engagementId, type = 'acceptance') =>
  (state?.assessments || []).find((entry) => entry.engagementId === engagementId && entry.type === type) || null;

const assessmentAcceptedIn = (state, engagementId) => {
  const decision = assessmentForIn(state, engagementId)?.decision;
  return Boolean(decision && ['ACCEPT', 'CONTINUE'].includes(decision.decision));
};

const termsAcceptedIn = (state, engagementId) =>
  termsAcceptanceIsCurrent((state?.terms || []).find((entry) => entry.engagementId === engagementId));

const commercialIn = (state, engagementId) =>
  (state?.commercialRecords || []).find((entry) => entry.engagementId === engagementId) || null;

function advanceVerifiedIn(state, engagementId) {
  const record = commercialIn(state, engagementId);
  if (!record) return false;
  if (!record.advanceRequired || Number(record.advanceRequired) === 0) return true;
  return record.advanceState === 'VERIFIED';
}

/**
 * The commencement staffing gaps for one engagement, from the shared profile.
 * @returns {Array<{code: string, message: string}>}
 */
export function staffingGapsFor(state, engagement) {
  if (!engagement) return [{ code: 'ENGAGEMENT_NOT_FOUND', message: 'No engagement record exists yet.' }];
  return staffingProfileBlockers(engagement.team || [], {
    smallFirmMode: staffingPolicyFor(engagement).smallFirmMode,
    requiresAccountingReviewer: Boolean(linkedAccountingEngagementFrom(state?.engagements || [], engagement)),
  });
}

// ─── SHARED_DEMO: D1 gate states → pipeline stage states ───────────────────

function d1StageState(stageId, gates, progress) {
  const base = { stageId, source: 'd1', owner: null, nextAction: null, blocker: null, relatedRecord: null, route: null };
  if (!gates.length) {
    // An engagement row in D1 can only exist after a lead was registered,
    // qualified and converted, so those stages are complete by definition.
    return { ...base, displayState: 'COMPLETE', nextAction: 'Recorded in D1', relatedRecord: progress.engagementId || '' };
  }
  const blocked = gates.find((gate) => BLOCKED_GATE_STATES.has(gate.state)) || null;
  if (blocked) {
    return {
      ...base,
      displayState: 'BLOCKED',
      owner: blocked.ownerLabel || blocked.ownerRole || '',
      blocker: blocked.reason || `${blocked.label} is blocked`,
      nextAction: blocked.action || blocked.label,
      route: blocked.route || null,
      relatedRecord: (blocked.sourceIds || [])[0] || null,
    };
  }
  const actionable = gates.find((gate) => ACTIONABLE_GATE_STATES.has(gate.state)) || null;
  if (actionable) {
    return {
      ...base,
      displayState: waitingDisplayStateFor(actionable.ownerRole),
      owner: actionable.ownerLabel || actionable.ownerRole || '',
      nextAction: actionable.action || actionable.label,
      route: actionable.route || null,
      relatedRecord: (actionable.sourceIds || [])[0] || null,
    };
  }
  const waiting = gates.find((gate) => gate.state === 'WAITING') || null;
  if (waiting) {
    return {
      ...base,
      displayState: waitingDisplayStateFor(waiting.ownerRole),
      owner: waiting.ownerLabel || waiting.ownerRole || '',
      blocker: waiting.reason || `${waiting.label} is waiting`,
      nextAction: waiting.action || waiting.label,
      route: waiting.route || null,
    };
  }
  if (gates.every((gate) => gate.state === 'APPROVED')) {
    return { ...base, displayState: 'COMPLETE', nextAction: 'Proceed to the next stage' };
  }
  return { ...base, displayState: 'NOT_STARTED' };
}

function deriveSharedStageStates(progress, stages) {
  const details = progress.gateDetails || [];
  const byId = new Map(details.filter((gate) => gate && !gate.advisory).map((gate) => [gate.id, gate]));
  return stages.map((stage) => {
    const gates = (D1_GATES_BY_STAGE[stage.id] || []).map((id) => byId.get(id)).filter(Boolean);
    const state = d1StageState(stage.id, gates, progress);
    state.lifecycle = stage.lifecycle;
    if (stage.id === 'staffing') return { ...state, ...d1StaffingState(progress, state) };
    return state;
  });
}

/**
 * Staffing needs the D1 roster, which no gate carries: commencement requires a
 * complete professional profile, and only D1 knows who is actually assigned.
 */
function d1StaffingState(progress, current) {
  if (progress.auditCommenced) {
    return { displayState: 'COMPLETE', nextAction: 'Proceed to audit planning', blocker: null, relatedRecord: 'Commenced in D1' };
  }
  const gaps = staffingProfileBlockers(progress.team || [], {
    smallFirmMode: staffingPolicyFor(progress).smallFirmMode,
    requiresAccountingReviewer: Boolean(progress.accounting?.exists ?? progress.accounting?.fsState),
  });
  if (gaps.length) {
    return {
      displayState: 'WAITING_FOR_PARTNER',
      owner: 'Engagement partner',
      blocker: `Team staffing incomplete: ${gaps.map((gap) => gap.code).join(', ')}`,
      nextAction: `Assign the missing roles (${gaps.map((gap) => gap.code.replace(/_REQUIRED$/, '').replace(/_/g, ' ')).join(', ')})`,
      route: 'engagements',
    };
  }
  if (current.displayState === 'WAITING_FOR_FINANCE') return {};
  return { displayState: 'READY', nextAction: 'START AUDIT', owner: 'Engagement partner / manager', route: 'engagements' };
}

// ─── LOCAL_ONLY: the scenario state → pipeline stage states ────────────────

function deriveLocalStageStates(state, engagementId, stages) {
  const engagement = engagementIn(state, engagementId);
  const leads = state?.leads || [];
  const workpapers = (state?.workpapers || []).filter((entry) => entry.engagementId === engagementId);
  const seniorGate = seniorReviewGateFrom(workpapers);
  const recommendation = completionRecommendationView(engagement?.evidence?.completionRecommendation);
  const openSignificant = (state?.reviews || []).filter(
    (point) => point.engagementId === engagementId && point.status === 'OPEN' && point.severity === 'SIGNIFICANT',
  ).length;

  return stages.map((stage) => {
    let displayState = 'NOT_STARTED';
    let nextAction = null;
    let blocker = null;
    const owner = stage.owner;
    let relatedRecord = null;

    switch (stage.id) {
      case 'lead': {
        if (!leads.length) {
          nextAction = 'Register first lead';
          break;
        }
        const pendingCount = leads.filter((lead) => lead.status === 'PENDING').length;
        displayState = pendingCount ? 'IN_PROGRESS' : 'COMPLETE';
        nextAction = pendingCount ? 'Qualify pending leads' : 'Create new lead';
        relatedRecord = `${leads.length} lead(s)`;
        break;
      }

      case 'qualify': {
        const qualified = leads.filter((lead) => ['QUALIFIED', 'CONVERTED'].includes(lead.status));
        const pending = leads.filter((lead) => lead.status === 'PENDING');
        if (qualified.length) {
          displayState = 'READY';
          nextAction = 'Convert qualified lead';
          relatedRecord = `${qualified.length} qualified`;
        } else if (pending.length) {
          displayState = 'IN_PROGRESS';
          nextAction = 'Qualify pending leads';
          relatedRecord = `${pending.length} pending`;
        } else {
          nextAction = 'Register and qualify leads';
        }
        break;
      }

      case 'convert': {
        const converted = leads.filter((lead) => lead.status === 'CONVERTED');
        const qualified = leads.filter((lead) => lead.status === 'QUALIFIED');
        if (converted.length) {
          displayState = 'COMPLETE';
          nextAction = 'Complete client acceptance';
          relatedRecord = `${converted.length} converted`;
        } else if (qualified.length) {
          displayState = 'READY';
          nextAction = 'Convert qualified lead to client';
          relatedRecord = `${qualified.length} qualified`;
        } else {
          nextAction = 'Qualify a lead first';
          blocker = 'No qualified leads';
        }
        break;
      }

      case 'intake': {
        if (!engagement) {
          nextAction = 'Convert a lead to create an engagement';
          blocker = 'No engagement exists yet';
          break;
        }
        const decision = assessmentForIn(state, engagementId)?.decision;
        if (decision?.decision === 'DECLINE') {
          displayState = 'BLOCKED';
          blocker = 'Client declined — engagement cannot proceed';
        } else if (assessmentAcceptedIn(state, engagementId)) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to commercial';
        } else if (decision) {
          displayState = 'BLOCKED';
          blocker = 'Acceptance decision was not an acceptance';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Complete acceptance questionnaire and record partner decision';
        }
        relatedRecord = engagementId;
        break;
      }

      case 'commercial': {
        if (!engagement) break;
        if (!assessmentAcceptedIn(state, engagementId)) {
          blocker = 'Client must be accepted first';
          break;
        }
        const record = commercialIn(state, engagementId);
        if (!record) {
          nextAction = 'Create commercial record';
          break;
        }
        const feeApproved = record.feeApprovalState === 'APPROVED';
        if (feeApproved && termsAcceptedIn(state, engagementId)) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to team assignment';
        } else if (feeApproved) {
          displayState = 'WAITING_FOR_CLIENT';
          nextAction = 'Waiting for client to accept engagement letter';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Issue quotation and engagement letter';
        }
        relatedRecord = record.id;
        break;
      }

      case 'staffing': {
        if (!engagement) break;
        if (!assessmentAcceptedIn(state, engagementId) || !termsAcceptedIn(state, engagementId)) {
          blocker = 'Acceptance and terms required first';
          break;
        }
        if (engagement.auditCommenced) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to audit planning';
          relatedRecord = engagement.commencedAt ? `Commenced ${String(engagement.commencedAt).slice(0, 10)}` : 'Commenced';
          break;
        }
        const gaps = staffingGapsFor(state, engagement);
        if (gaps.length) {
          // The professional profile is reported before the advance: this stage is
          // "Team assignment & commencement", and an incomplete team blocks it
          // whatever Finance has verified. Same order as the D1 branch.
          displayState = 'BLOCKED';
          nextAction = `Assign the missing roles (${gaps.map((gap) => gap.code.replace(/_REQUIRED$/, '').replace(/_/g, ' ')).join(', ')})`;
          blocker = `Team staffing incomplete: ${gaps.map((gap) => gap.code).join(', ')}`;
        } else if (!advanceVerifiedIn(state, engagementId)) {
          displayState = 'WAITING_FOR_FINANCE';
          nextAction = 'Finance to verify advance payment';
          blocker = 'Advance payment not verified';
        } else {
          displayState = 'READY';
          nextAction = 'START AUDIT';
        }
        break;
      }

      case 'planning': {
        if (!engagement?.auditCommenced) {
          blocker = 'Audit must be commenced first';
          break;
        }
        if (engagement.evidence?.auditPlanReady) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to evidence collection';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Draft and approve audit plan, issue announcement';
        }
        break;
      }

      case 'evidence': {
        if (!engagement?.auditCommenced) break;
        const requests = (state?.pbcRequests || []).filter((entry) => entry.engagementId === engagementId);
        const clarification = requests.filter((entry) => entry.state === 'CLARIFICATION_REQUIRED');
        const underReview = requests.filter((entry) => entry.state === 'UNDER_REVIEW');
        if (requests.length && requests.every((entry) => entry.state === 'ACCEPTED')) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to audit execution';
        } else if (clarification.length) {
          displayState = 'WAITING_FOR_CLIENT';
          nextAction = 'Client to provide clarification';
          blocker = `${clarification.length} request(s) need clarification`;
        } else if (underReview.length) {
          displayState = 'IN_PROGRESS';
          nextAction = 'Senior to review received evidence';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Issue PBC requests to client';
        }
        break;
      }

      case 'draft-response': {
        if (!engagement?.auditCommenced) break;
        const infoRequest = (state?.informationRequests || []).find((entry) => entry.engagementId === engagementId);
        const submitted = workpapers.filter((entry) => isWorkpaperSubmitted(entry));
        if (submitted.length && infoRequest?.state === 'RESPONDED') {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to review chain';
        } else if (infoRequest?.state === 'OPEN') {
          displayState = 'WAITING_FOR_CLIENT';
          nextAction = 'Waiting for management response';
          blocker = 'Management Information Request pending';
        } else if (submitted.length) {
          displayState = 'IN_PROGRESS';
          nextAction = 'Issue management information request';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Complete workpapers and issue management request';
        }
        break;
      }

      case 'review': {
        if (!engagement?.auditCommenced) break;
        const evidence = engagement.evidence || {};
        if (evidence.partnerApproved) {
          displayState = 'COMPLETE';
          nextAction = 'Proceed to release';
        } else if (recommendation?.recommended && evidence.eqrRequired && !evidence.eqrComplete) {
          displayState = 'WAITING_FOR_EQR';
          nextAction = 'EQR to complete engagement quality review';
        } else if (recommendation?.recommended) {
          displayState = 'WAITING_FOR_PARTNER';
          nextAction = 'Partner to complete review and form opinion';
        } else if (seniorGate.complete && openSignificant === 0) {
          displayState = 'WAITING_FOR_MANAGER';
          nextAction = 'Manager to complete engagement file';
        } else if (!seniorGate.complete) {
          displayState = 'WAITING_FOR_SENIOR';
          nextAction = seniorGate.total ? 'Senior to clear every submitted workpaper' : 'Submit workpapers for senior review';
          blocker = seniorGate.message;
        } else if (openSignificant > 0) {
          displayState = 'BLOCKED';
          blocker = `${openSignificant} significant review point(s) unresolved`;
          nextAction = 'Resolve significant review points';
        } else {
          displayState = 'IN_PROGRESS';
          nextAction = 'Begin review chain';
        }
        break;
      }

      case 'release': {
        if (!engagement?.auditCommenced) break;
        const evidence = engagement.evidence || {};
        const candidate = (state?.releaseCandidates || []).find(
          (entry) => entry.engagementId === engagementId && entry.state === 'CANDIDATE',
        );
        if (evidence.archiveVerified) {
          displayState = 'COMPLETE';
          nextAction = 'Engagement archived';
        } else if (evidence.commercialClosed) {
          displayState = 'IN_PROGRESS';
          nextAction = 'Archive engagement records';
        } else if (candidate?.deliveryState === 'DELIVERED') {
          displayState = 'WAITING_FOR_FINANCE';
          nextAction = 'Finance to generate and send invoice';
        } else if (evidence.partnerApproved) {
          displayState = 'READY';
          nextAction = 'Partner to authorize release';
        } else {
          blocker = 'Partner review and opinion required first';
        }
        break;
      }

      default:
        break;
    }

    return { stageId: stage.id, displayState, owner, nextAction, blocker, relatedRecord, route: stage.route, lifecycle: stage.lifecycle, source: 'local' };
  });
}

/**
 * The mode-aware stage projection.
 *
 * @param {object} args
 * @param {object} args.state — the browser-local scenario state (LOCAL_ONLY)
 * @param {string} args.engagementId
 * @param {object|null} [args.progress] — the D1 progress snapshot (SHARED_DEMO)
 * @param {Array<object>} [args.stages] — pipeline stage definitions
 * @returns {Array<{stageId: string, displayState: string, owner: string, nextAction: string|null, blocker: string|null, relatedRecord: string|null, route: string, lifecycle: string, source: 'local'|'d1'}>}
 */
export function deriveStageStates({ state, engagementId, progress = null, stages = pipelineStages } = {}) {
  if (progress && Array.isArray(progress.gateDetails)) return deriveSharedStageStates(progress, stages);
  return deriveLocalStageStates(state, engagementId, stages);
}
