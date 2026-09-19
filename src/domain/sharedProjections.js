// P5 in SHARED_DEMO — the accounting→audit handoff card and the engagement
// completion checklist, derived from the D1 progress snapshot.
//
// These are the twin of src/domain/localProjections.js: both call the same
// shared derivations (deriveAccountingHandoffFacts, seniorReviewGateFrom,
// staffingProfileBlockers, buildCompletionChecklist) and only differ in where
// the records come from. A presenter can therefore describe one engagement the
// same way in either mode.
import {
  buildCompletionChecklist,
  deriveAccountingHandoffFacts,
  seniorReviewGateFrom,
} from '../../shared/lifecycleRules.js';
import { staffingProfileBlockers } from '../../shared/staffingRules.js';

function gateMap(progress) {
  const details = Array.isArray(progress?.gateDetails) ? progress.gateDetails : [];
  return new Map(details.filter((gate) => gate && !gate.advisory).map((gate) => [gate.id, gate]));
}

/**
 * Summarise a group of D1 gates as one checklist fact.
 *
 * @param {Map<string, object>} gates
 * @param {string[]} ids — gates that must all be APPROVED
 * @param {string} completeDetail — shown when they are
 */
function gateFact(gates, ids, completeDetail) {
  const found = ids.map((id) => gates.get(id)).filter(Boolean);
  if (!found.length) return { done: false, detail: 'Not started in the shared demo yet.' };
  const outstanding = found.find((gate) => gate.state !== 'APPROVED') || null;
  if (!outstanding) return { done: true, detail: completeDetail };
  const owner = outstanding.ownerLabel || outstanding.ownerRole || '';
  const detail = `${outstanding.reason || `${outstanding.label} is not approved yet`}${owner ? ` · ${owner}` : ''}`;
  return { done: false, detail };
}

/**
 * The accounting→audit handoff card from the D1 accounting tracker.
 * @param {object|null} progress — the shared progress snapshot
 */
export function sharedAccountingHandoff(progress) {
  const tracker = progress?.accounting || null;
  const auditEngagement = {
    id: String(progress?.engagementId || ''),
    service: progress?.service || 'AUDIT',
    evidence: {
      accountingInputGeneration: tracker?.inputGeneration ?? progress?.inputGeneration ?? 1,
      accountingEvaluatedGeneration: tracker?.auditEvaluatedGeneration ?? progress?.evaluatedGeneration ?? null,
    },
  };
  return deriveAccountingHandoffFacts({
    auditEngagement,
    accountingEngagement: tracker ? { id: tracker.engagementId || auditEngagement.id, inputGeneration: tracker.inputGeneration } : null,
    tracker,
  });
}

/**
 * The consolidated completion checklist from D1.
 * @param {object|null} progress — the shared progress snapshot
 * @param {string} engagementId
 */
export function sharedCompletionChecklist(progress, engagementId = '') {
  const id = String(progress?.engagementId || engagementId || '');
  const service = String(progress?.service || 'AUDIT').toUpperCase();
  if (!progress || service !== 'AUDIT') {
    return buildCompletionChecklist({
      engagementId: id,
      applicable: false,
      message: progress ? 'The completion checklist describes an audit engagement; this shared record is not one.' : 'The shared demo has not loaded this engagement yet.',
    });
  }
  const gates = gateMap(progress);
  const team = Array.isArray(progress.team) ? progress.team : [];
  const tracker = progress.accounting || null;
  const staffingGaps = staffingProfileBlockers(team, {
    smallFirmMode: progress.smallFirmMode === true,
    requiresAccountingReviewer: Boolean(tracker?.exists),
  });
  const seniorGate = seniorReviewGateFrom(Array.isArray(progress.workpapers) ? progress.workpapers : []);
  const handoff = sharedAccountingHandoff(progress);
  const eqrRequired = progress.eqrRequired === true;
  const eqrFact = gateFact(gates, ['eqr'], 'Quality review approved the file.');
  const partnerFact = gateFact(gates, ['partner-review'], 'The partner approved the file for opinion.');
  const commenced = progress.auditCommenced === true;

  return buildCompletionChecklist({
    engagementId: id,
    facts: {
      'client-accepted': gateFact(gates, ['client-details', 'client-evaluation', 'acceptance'], 'Client details, evaluation and the partner acceptance decision are recorded.'),
      'terms-accepted': gateFact(gates, ['el-issue', 'el-decision'], 'Management accepted the current Engagement Letter.'),
      advance: gateFact(gates, ['advance'], 'Finance verified the required advance, or none was required.'),
      staffing: staffingGaps.length
        ? { done: false, detail: staffingGaps.map((gap) => gap.code).join(', ') }
        : { done: true, detail: `${team.length} team member(s) assigned in D1` },
      commenced: {
        done: commenced,
        detail: commenced ? 'Audit commencement recorded in D1' : 'Audit not commenced',
      },
      pbc: gateFact(gates, ['pbc-readiness'], 'Every information request is accepted.'),
      accounting: {
        done: handoff.status === 'CURRENT' || handoff.status === 'NOT_APPLICABLE',
        detail: handoff.message,
      },
      workpapers: {
        done: seniorGate.total > 0,
        detail: seniorGate.total ? `${seniorGate.total} submitted workpaper(s) recorded` : 'No submitted workpapers yet',
      },
      'senior-review': {
        done: seniorGate.complete,
        detail: seniorGate.complete
          ? `All ${seniorGate.total} submitted workpaper(s) cleared`
          : `${seniorGate.reviewed}/${seniorGate.total} cleared by the Audit Senior`,
      },
      'manager-completion': gateFact(gates, ['manager-completion'], 'The manager recommended completion with a recorded basis.'),
      'partner-review': partnerFact,
      eqr: eqrRequired
        ? eqrFact
        : { done: true, detail: 'Not required for this engagement by policy' },
      opinion: {
        done: gateFact(gates, ['opinion'], 'Opinion dated against the approved file.').done && (!eqrRequired || eqrFact.done) && partnerFact.done,
        detail: eqrRequired && !eqrFact.done
          ? 'The opinion is dated once the required EQR approves'
          : gateFact(gates, ['opinion'], 'Opinion dated against the approved file.').detail,
      },
      release: gateFact(gates, ['final-discussion', 'release', 'invoice', 'commercial-close'], 'Report released, delivered, invoiced and archived.'),
    },
  });
}
