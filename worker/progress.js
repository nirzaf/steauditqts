// Phase B — server-derived workflow progress and process validity.
//
// deriveProgressFromSnapshot() is pure: it folds a plain D1 snapshot into
// gates, stages, blockers, warnings and contradictions. current_stage stays a
// cached projection; the derived stage is the authority. Gates with no shared
// D1 record type in this phase are marked advisory so they stay visible
// without capping derived completion.
import { waitingDisplayStateFor } from '../shared/lifecycleRules.js';

export const PROGRESS_STAGE_ORDER = ['STAGE-01', 'STAGE-02', 'STAGE-03', 'STAGE-04', 'STAGE-05', 'STAGE-06', 'STAGE-07', 'STAGE-08'];

export const PROGRESS_STAGE_TITLES = {
  'STAGE-01': 'Acceptance',
  'STAGE-02': 'Commercial & terms',
  'STAGE-03': 'Activation',
  'STAGE-04': 'Planning',
  'STAGE-05': 'Evidence & TB',
  'STAGE-06': 'Audit & Draft FS',
  'STAGE-07': 'Review & opinion',
  'STAGE-08': 'Release & close',
};

const PROGRESS_OWNER_LABELS = {
  client_contributor: 'Client Contributor',
  client_finance: 'Client Finance',
  management_approver: 'Client Management',
  preparer: 'Preparer',
  audit_senior: 'Audit Senior',
  audit_manager: 'Audit Manager',
  engagement_partner: 'Audit Partner',
  signatory: 'Signatory',
  finance_team: 'Finance',
  accounting_reviewer: 'Accounting Reviewer',
  independent_reviewer: 'Independent Reviewer',
  eqr_reviewer: 'EQR',
  system_admin: 'System Administrator',
  compliance_reviewer: 'Compliance',
  records_custodian: 'Records',
};

export function progressOwnerLabel(role) {
  return PROGRESS_OWNER_LABELS[role] || role || 'Unassigned';
}

export function progressWaitingState(role) {
  // The pipeline vocabulary is shared with the browser projection so a stage
  // cannot read "waiting for the senior" in one mode and a different owner in
  // the other (shared/lifecycleRules.js owns the mapping).
  return waitingDisplayStateFor(role);
}

export function progressStageNumber(stage) {
  const match = String(stage || '').match(/STAGE-(\d{2})/);
  const n = match ? Number(match[1]) : 0;
  return n >= 1 && n <= 8 ? n : 0;
}

export function normalizeProgressSnapshot(raw) {
  const snap = raw && typeof raw === 'object' ? raw : {};
  return {
    engagementId: String(snap.engagementId || ''),
    cachedStage: String(snap.cachedStage || ''),
    revision: Number(snap.revision || 0),
    generationId: String(snap.generationId || ''),
    hasClientProfile: snap.hasClientProfile === true,
    decisions: snap.decisions && typeof snap.decisions === 'object' ? snap.decisions : {},
    commercial: snap.commercial && typeof snap.commercial === 'object' ? {
      ...snap.commercial,
      advanceRequired: snap.commercial.advanceRequired == null ? '' : String(snap.commercial.advanceRequired),
    } : null,
    credentialState: snap.credentialState || null,
    portalActivated: snap.portalActivated === true,
    announcement: snap.announcement || null,
    pbcRequests: Array.isArray(snap.pbcRequests) ? snap.pbcRequests : [],
    pbcReceipts: Array.isArray(snap.pbcReceipts) ? snap.pbcReceipts : [],
    tbSources: Array.isArray(snap.tbSources) ? snap.tbSources : [],
    workpapers: Array.isArray(snap.workpapers) ? snap.workpapers : [],
    reviewPoints: Array.isArray(snap.reviewPoints) ? snap.reviewPoints : [],
    draftVersions: Array.isArray(snap.draftVersions) ? snap.draftVersions : [],
    tasks: Array.isArray(snap.tasks) ? snap.tasks : [],
    team: Array.isArray(snap.team) ? snap.team : [],
    auditCommenced: snap.auditCommenced === true,
    smallFirmMode: snap.smallFirmMode === true,
    eqrRequired: snap.eqrRequired === true,
    artifactCount: Number(snap.artifactCount || 0),
    publishedArtifactCount: Number(snap.publishedArtifactCount || 0),
    today: String(snap.today || new Date().toISOString().slice(0, 10)),
    assessment: snap.assessment && typeof snap.assessment === 'object' ? {
      answered: Number(snap.assessment.answered || 0),
      required: Number(snap.assessment.required || 0),
      verified: Number(snap.assessment.verified || 0),
      holds: Array.isArray(snap.assessment.holds) ? snap.assessment.holds : [],
      hardStops: Number(snap.assessment.hardStops || 0),
      prohibitions: Number(snap.assessment.prohibitions || 0),
    } : null,
    inputGeneration: Number(snap.inputGeneration || 1),
    evaluatedGeneration: snap.evaluatedGeneration == null ? Number(snap.inputGeneration || 1) : Number(snap.evaluatedGeneration),
    accounting: snap.accounting && typeof snap.accounting === 'object' ? snap.accounting : null,
    finalDiscussion: snap.finalDiscussion && typeof snap.finalDiscussion === 'object' ? snap.finalDiscussion : null,
  };
}

function decisionGeneration(decision) {
  return Number((decision && decision.generation) || 1);
}

function progressGate(id, label, stage, outcome) {
  return {
    id: id,
    label: label,
    stage: stage,
    state: outcome.state,
    reason: outcome.reason || '',
    action: outcome.action || label,
    ownerRole: outcome.ownerRole || '',
    ownerLabel: progressOwnerLabel(outcome.ownerRole || ''),
    route: outcome.route || 'role-workspace',
    sourceIds: outcome.sourceIds || [],
    advisory: outcome.advisory === true,
  };
}

// Reusable prerequisite engine: every gate resolves to one explicit state
// (APPROVED / READY / WAITING / BLOCKED / OVERDUE / ESCALATED / REJECTED)
// with a human reason, an owner, a route and the source record ids behind it.
function evaluateProgressGatesHead(rawSnapshot) {
  const snap = normalizeProgressSnapshot(rawSnapshot);
  const gates = [];
  const contradictions = [];
  const warnings = [];

  function contradict(code, message, sourceIds) {
    contradictions.push({ code: code, message: message, sourceIds: sourceIds || [] });
  }
  function warn(code, message) {
    warnings.push({ code: code, message: message });
  }

  const acceptance = snap.decisions.ACCEPTANCE || null;
  const acceptanceApproved = Boolean(acceptance && acceptance.decision === 'ACCEPT');
  const elDecision = snap.decisions.ENGAGEMENT_LETTER || null;
  const draftDecision = snap.decisions.DRAFT_FS || null;
  const eqr = snap.decisions.EQR || null;
  const eqrApproved = Boolean(eqr && eqr.decision === 'APPROVE');
  const opinion = snap.decisions.AUDIT_OPINION || null;
  const release = snap.decisions.RELEASE || null;
  const commercial = snap.commercial || {};
  // A zero-value advance is a real policy outcome, not a missing verification.
  // Keep the distinction explicit so an accounting-only/no-advance service can
  // proceed without weakening the positive-evidence requirement for paid
  // advances. Legacy snapshots that omit advanceRequired remain conservative.
  const advanceRequired = String(commercial.advanceRequired ?? '').trim();
  const noAdvanceRequired = advanceRequired !== ''
    && /^\d+(?:\.\d{1,2})?$/.test(advanceRequired)
    && Number(advanceRequired) === 0;
  const hasEstimate = Boolean(commercial && commercial.estimateHours && commercial.estimateHours !== '0');
  const feeApproved = Boolean(commercial && commercial.feeState === 'APPROVED');
  const elIssued = Boolean(commercial && commercial.elVersion);
  const elDecisionCurrent = Boolean(elDecision && elIssued && elDecision.version === commercial.elVersion);
  const elAccepted = Boolean(elDecisionCurrent && elDecision.decision === 'ACCEPT');
  const advanceState = String(commercial.advanceState || '').toUpperCase();
  const advanceVerified = Boolean(commercial && (
    ['VERIFIED', 'ALLOCATED'].includes(advanceState)
    || (noAdvanceRequired && advanceState === 'NOT_REQUIRED')
  ));
  const credentialIssued = Boolean(snap.credentialState === 'ISSUED' || snap.credentialState === 'ACTIVATED');
  const announced = Boolean(snap.announcement);
  const validatedTb = snap.tbSources.filter((row) => String(row.validationState || '').toUpperCase() === 'VALIDATED' && Number(row.mappingComplete) === 1);
  const tbApproved = validatedTb.length > 0;
  // Senior-reviewed workpapers remain submitted evidence: after senior review
  // clears a workpaper its state becomes SENIOR_REVIEWED, and gates that
  // require submission must still count it.
  const submittedWorkpapers = snap.workpapers.filter((row) => ['SUBMITTED', 'SENIOR_REVIEWED'].includes(String(row.state || '').toUpperCase()));
  const openReviews = snap.reviewPoints.filter((row) => String(row.state || '').toUpperCase() === 'OPEN');
  const openSignificant = openReviews.filter((row) => String(row.severity || '').toUpperCase() === 'SIGNIFICANT');
  const latestDraft = snap.draftVersions.length ? snap.draftVersions[snap.draftVersions.length - 1] : null;
  const draftAccepted = Boolean(draftDecision && draftDecision.decision === 'ACCEPT' && latestDraft && draftDecision.version === latestDraft);
  const invoiceIssued = Boolean(commercial && commercial.invoiceState === 'ISSUED');
  const commerciallyClosed = Boolean(commercial && commercial.commercialClose === 'CLOSED');

  gates.push(progressGate('client-details', 'Client details submitted', 'STAGE-01', snap.hasClientProfile
    ? { state: 'APPROVED', reason: 'The shared client profile is on record.', ownerRole: 'client_contributor', route: 'client-details', sourceIds: [snap.engagementId] }
    : { state: 'READY', reason: 'No shared client profile yet; submission opens the pipeline.', action: 'Submit client details', ownerRole: 'client_contributor', route: 'client-details' }));

  if (!snap.assessment) {
    gates.push(progressGate('client-evaluation', 'Client evaluation questionnaire', 'STAGE-01', {
      state: 'WAITING', reason: 'No shared assessment response is on record yet.', action: 'Start shared evaluation', ownerRole: 'compliance_reviewer', route: 'clients',
    }));
  } else if (snap.assessment.prohibitions > 0) {
    gates.push(progressGate('client-evaluation', 'Client evaluation questionnaire', 'STAGE-01', {
      state: 'BLOCKED', reason: snap.assessment.prohibitions + ' confirmed prohibition(s) cannot be overridden.', action: 'Review confirmed prohibition', ownerRole: 'engagement_partner', route: 'clients',
      sourceIds: snap.assessment.holds.filter((hold) => String(hold.code || '').indexOf('PROHIBITION') !== -1).slice(0, 5).map((hold) => hold.questionId),
    }));
  } else if (snap.assessment.hardStops > 0) {
    gates.push(progressGate('client-evaluation', 'Client evaluation questionnaire', 'STAGE-01', {
      state: 'BLOCKED', reason: snap.assessment.hardStops + ' hard stop(s) must be resolved with evidence.', action: 'Resolve evaluation hard stops', ownerRole: 'engagement_partner', route: 'clients',
      sourceIds: snap.assessment.holds.slice(0, 5).map((hold) => hold.questionId),
    }));
  } else if (snap.assessment.holds.length > 0) {
    gates.push(progressGate('client-evaluation', 'Client evaluation questionnaire', 'STAGE-01', {
      state: 'READY', reason: snap.assessment.holds.length + ' hold(s) still need answers, evidence or verification.', action: 'Resolve evaluation holds', ownerRole: 'engagement_partner', route: 'clients',
      sourceIds: snap.assessment.holds.slice(0, 5).map((hold) => hold.questionId),
    }));
  } else {
    gates.push(progressGate('client-evaluation', 'Client evaluation questionnaire', 'STAGE-01', {
      state: 'APPROVED', reason: snap.assessment.answered + ' of ' + snap.assessment.required + ' applicable questions answered, ' + snap.assessment.verified + ' verified.', ownerRole: 'engagement_partner', route: 'clients',
    }));
  }

  if (!acceptance) {
    gates.push(progressGate('acceptance', 'Partner acceptance', 'STAGE-01', snap.hasClientProfile
      ? { state: 'READY', reason: 'Client details are on record and await the Partner decision.', action: 'Record acceptance decision', ownerRole: 'engagement_partner', route: 'clients' }
      : { state: 'WAITING', reason: 'Acceptance unlocks once client details are submitted.', ownerRole: 'engagement_partner', route: 'clients' }));
  } else if (acceptance.decision === 'ACCEPT') {
    gates.push(progressGate('acceptance', 'Partner acceptance', 'STAGE-01', { state: 'APPROVED', reason: 'Partner accepted the relationship with a recorded rationale.', ownerRole: 'engagement_partner', route: 'clients', sourceIds: [acceptance.by || 'decision'] }));
  } else if (acceptance.decision === 'DECLINE') {
    gates.push(progressGate('acceptance', 'Partner acceptance', 'STAGE-01', { state: 'REJECTED', reason: 'Partner declined the relationship; downstream work cannot proceed on this record.', action: 'Review declined acceptance', ownerRole: 'engagement_partner', route: 'clients' }));
  } else {
    gates.push(progressGate('acceptance', 'Partner acceptance', 'STAGE-01', { state: 'ESCALATED', reason: 'Acceptance was escalated; the Partner owns the next decision, authority is not transferred.', action: 'Resolve escalated acceptance', ownerRole: 'engagement_partner', route: 'clients' }));
  }

  gates.push(progressGate('estimate', 'Cost estimate', 'STAGE-02', hasEstimate
    ? { state: 'APPROVED', reason: 'Finance recorded hours, cost and the advance requirement.', ownerRole: 'finance_team', route: 'engagements' }
    : (acceptanceApproved
      ? { state: 'READY', reason: 'Acceptance is recorded; Finance can estimate now.', action: 'Record cost estimate', ownerRole: 'finance_team', route: 'engagements' }
      : { state: 'WAITING', reason: 'Estimating unlocks after Partner acceptance.', ownerRole: 'finance_team', route: 'engagements' })));

  if (feeApproved && !acceptanceApproved) {
    contradict('FEE_BEFORE_ACCEPTANCE', 'The fee was approved before Partner acceptance is on record.', []);
    gates.push(progressGate('fee-approval', 'Fee approval', 'STAGE-02', { state: 'BLOCKED', reason: 'Fee approval precedes the required acceptance decision.', action: 'Reconcile fee before acceptance', ownerRole: 'engagement_partner', route: 'engagements' }));
  } else {
    gates.push(progressGate('fee-approval', 'Fee approval', 'STAGE-02', feeApproved
      ? { state: 'APPROVED', reason: 'Partner approved the fee and the quotation was issued.', ownerRole: 'engagement_partner', route: 'engagements' }
      : (hasEstimate
        ? { state: 'READY', reason: 'The Finance estimate is ready for Partner approval.', action: 'Approve fee and quote', ownerRole: 'engagement_partner', route: 'engagements' }
        : { state: 'WAITING', reason: 'Fee approval unlocks after the Finance estimate.', ownerRole: 'engagement_partner', route: 'engagements' })));
  }

  if (elIssued && !feeApproved) {
    contradict('EL_BEFORE_FEE', 'An Engagement Letter was issued before fee approval is on record.', [commercial.elVersion || 'EL']);
    gates.push(progressGate('el-issue', 'Engagement Letter issued', 'STAGE-02', { state: 'BLOCKED', reason: 'The letter precedes the required fee approval.', action: 'Reconcile letter before fee', ownerRole: 'engagement_partner', route: 'engagements' }));
  } else {
    gates.push(progressGate('el-issue', 'Engagement Letter issued', 'STAGE-02', elIssued
      ? { state: 'APPROVED', reason: 'Letter ' + commercial.elVersion + ' was issued for management response.', ownerRole: 'engagement_partner', route: 'engagements', sourceIds: [commercial.elVersion || 'EL'] }
      : (feeApproved
        ? { state: 'READY', reason: 'Fee is approved; the exact letter version can be issued.', action: 'Issue Engagement Letter', ownerRole: 'engagement_partner', route: 'engagements' }
        : { state: 'WAITING', reason: 'The letter is issued after fee approval.', ownerRole: 'engagement_partner', route: 'engagements' })));
  }

  if (elDecision && !elIssued) {
    contradict('EL_RESPONSE_WITHOUT_ISSUE', 'A management EL response exists with no issued letter on record.', [elDecision.version || 'EL']);
    gates.push(progressGate('el-decision', 'Management EL response', 'STAGE-02', { state: 'BLOCKED', reason: 'The response names a letter that was never issued.', action: 'Reconcile EL response', ownerRole: 'management_approver', route: 'engagements' }));
  } else if (elDecisionCurrent && elDecision.decision === 'ACCEPT') {
    gates.push(progressGate('el-decision', 'Management EL response', 'STAGE-02', { state: 'APPROVED', reason: 'Management accepted letter ' + elDecision.version + '.', ownerRole: 'management_approver', route: 'engagements', sourceIds: [elDecision.version || 'EL'] }));
  } else if (elDecisionCurrent && elDecision.decision === 'REJECT') {
    gates.push(progressGate('el-decision', 'Management EL response', 'STAGE-02', { state: 'REJECTED', reason: 'Management rejected the letter; Finance must revise and reissue.', action: 'Revise Engagement Letter', ownerRole: 'finance_team', route: 'engagements' }));
  } else if (elDecision && elIssued && elDecision.version !== commercial.elVersion) {
    warn('EL_SUPERSEDED', 'Management responded to ' + elDecision.version + ' but the current letter is ' + commercial.elVersion + '; a fresh response is required.');
    gates.push(progressGate('el-decision', 'Management EL response', 'STAGE-02', { state: 'READY', reason: 'Letter ' + commercial.elVersion + ' supersedes the earlier response.', action: 'Respond to Engagement Letter', ownerRole: 'management_approver', route: 'engagements' }));
  } else {
    gates.push(progressGate('el-decision', 'Management EL response', 'STAGE-02', elIssued
      ? { state: 'READY', reason: 'Letter ' + commercial.elVersion + ' awaits the management response.', action: 'Respond to Engagement Letter', ownerRole: 'management_approver', route: 'engagements' }
      : { state: 'WAITING', reason: 'The response unlocks once the letter is issued.', ownerRole: 'management_approver', route: 'engagements' }));
  }

  gates.push(progressGate('advance', 'Advance verified', 'STAGE-03', advanceVerified
      ? { state: 'APPROVED', reason: noAdvanceRequired ? 'No advance is required for this service route.' : 'Finance verified the advance reference once.', ownerRole: 'finance_team', route: 'engagements', sourceIds: [commercial.advanceReference || 'advance'] }
    : (elAccepted
      ? { state: 'READY', reason: 'Terms are accepted; the advance can be verified now.', action: 'Verify advance payment', ownerRole: 'finance_team', route: 'engagements' }
      : { state: 'WAITING', reason: 'Advance verification unlocks after terms acceptance.', ownerRole: 'finance_team', route: 'engagements' })));

  if (credentialIssued && !advanceVerified) {
    contradict('CREDENTIAL_BEFORE_ADVANCE', 'A synthetic credential was issued before the advance was verified.', []);
    gates.push(progressGate('credential', 'Temporary credential', 'STAGE-03', { state: 'BLOCKED', reason: 'Credential issue precedes the required advance verification.', action: 'Reconcile credential before advance', ownerRole: 'engagement_partner', route: 'engagements' }));
  } else {
    gates.push(progressGate('credential', 'Temporary credential', 'STAGE-03', credentialIssued
      ? { state: 'APPROVED', reason: 'The one-time credential was issued; only its hash is stored.', ownerRole: 'engagement_partner', route: 'engagements' }
      : (advanceVerified
        ? { state: 'READY', reason: 'Advance is verified; the credential can be issued.', action: 'Issue temporary credential', ownerRole: 'engagement_partner', route: 'engagements' }
        : { state: 'WAITING', reason: 'Credential issue unlocks after advance verification.', ownerRole: 'engagement_partner', route: 'engagements' })));
  }

  gates.push(progressGate('portal-activation', 'Portal activation', 'STAGE-03', snap.portalActivated
    ? { state: 'APPROVED', reason: 'First-login setup completed the scoped client workspace.', ownerRole: 'client_contributor', route: 'client-home' }
    : (credentialIssued
      ? { state: 'READY', reason: 'A credential is issued and awaits first-login activation.', action: 'Complete portal activation', ownerRole: 'client_contributor', route: 'client-home' }
      : { state: 'WAITING', reason: 'Activation unlocks once the credential is issued.', ownerRole: 'client_contributor', route: 'client-home' })));

  if (announced) {
    if (!acceptanceApproved || !elAccepted) {
      contradict('ANNOUNCEMENT_SKIPPED_PREREQUISITES', 'The audit announcement was issued before acceptance and terms are complete.', [snap.announcement.id || 'announcement']);
    }
    if (!snap.portalActivated) {
      warn('ANNOUNCEMENT_BEFORE_ACTIVATION', 'The announcement is published while portal activation is still pending.');
    }
    gates.push(progressGate('announcement', 'Audit announcement', 'STAGE-04', { state: 'APPROVED', reason: 'The start notice was published to the client portal.', ownerRole: 'audit_senior', route: 'audit', sourceIds: [snap.announcement.id || 'announcement'] }));
  } else {
    gates.push(progressGate('announcement', 'Audit announcement', 'STAGE-04', snap.portalActivated
      ? { state: 'READY', reason: 'Activation is complete; the announcement can be issued.', action: 'Issue audit announcement', ownerRole: 'audit_senior', route: 'audit' }
      : { state: 'WAITING', reason: 'The announcement unlocks after portal activation.', ownerRole: 'audit_senior', route: 'audit' }));
  }

  return { snap: snap, gates: gates, contradictions: contradictions, warnings: warnings, derived: { acceptanceApproved, elAccepted, advanceVerified, credentialIssued, announced, tbApproved, validatedTb, submittedWorkpapers, openReviews, openSignificant, latestDraft, draftAccepted, draftDecision, eqrApproved, eqr, opinion, release, invoiceIssued, commerciallyClosed, commercial } };
}

function finishProgressGates(head) {
  const snap = head.snap;
  const d = head.derived;
  const gates = head.gates;
  const contradictions = head.contradictions;
  const warnings = head.warnings;

  function contradict(code, message, sourceIds) {
    contradictions.push({ code: code, message: message, sourceIds: sourceIds || [] });
  }
  function warn(code, message) {
    warnings.push({ code: code, message: message });
  }

  const orphanReceipts = snap.pbcReceipts.filter((receipt) => !snap.pbcRequests.some((request) => request.id === receipt.requestId));
  if (orphanReceipts.length) {
    contradict('ORPHAN_PBC_RECEIPT', orphanReceipts.length + ' PBC receipt(s) answer no known request on this engagement.', orphanReceipts.map((receipt) => receipt.id));
  }
  if (!snap.pbcRequests.length) {
    gates.push(progressGate('pbc-readiness', 'PBC readiness', 'STAGE-05', d.announced
      ? { state: 'READY', reason: 'No evidence requests have been created yet.', action: 'Create PBC request', ownerRole: 'audit_senior', route: 'pbc' }
      : { state: 'WAITING', reason: 'Evidence requests unlock after the announcement.', ownerRole: 'audit_senior', route: 'pbc' }));
  } else {
    const pending = snap.pbcRequests.filter((request) => String(request.state || '').toUpperCase() !== 'ACCEPTED');
    const overdue = pending.filter((request) => String(request.dueDate || '').slice(0, 10) && String(request.dueDate || '').slice(0, 10) < snap.today);
    const awaitingReview = pending.some((request) => String(request.state || '').toUpperCase() === 'RECEIVED');
    const owner = awaitingReview ? 'audit_senior' : 'client_contributor';
    if (!pending.length) {
      gates.push(progressGate('pbc-readiness', 'PBC readiness', 'STAGE-05', { state: 'APPROVED', reason: 'Every evidence request is accepted.', ownerRole: 'audit_senior', route: 'pbc' }));
    } else if (overdue.length) {
      gates.push(progressGate('pbc-readiness', 'PBC readiness', 'STAGE-05', { state: 'OVERDUE', reason: overdue.length + ' request(s) are past due and not accepted.', action: 'Clear overdue PBC requests', ownerRole: owner, route: 'pbc', sourceIds: overdue.map((request) => request.id) }));
    } else {
      gates.push(progressGate('pbc-readiness', 'PBC readiness', 'STAGE-05', { state: 'READY', reason: pending.length + ' request(s) still need evidence or review.', action: awaitingReview ? 'Review PBC receipt' : 'Submit PBC evidence', ownerRole: owner, route: 'pbc', sourceIds: pending.slice(0, 5).map((request) => request.id) }));
    }
  }

  if (d.tbApproved) {
    gates.push(progressGate('tb-source', 'Trial balance source', 'STAGE-05', { state: 'APPROVED', reason: 'A balanced, mapped TB source is validated.', ownerRole: 'accounting_reviewer', route: 'accounting', sourceIds: d.validatedTb.map((row) => row.version) }));
  } else if (snap.tbSources.length) {
    gates.push(progressGate('tb-source', 'Trial balance source', 'STAGE-05', { state: 'READY', reason: 'TB sources exist but none is validated and mapped yet.', action: 'Validate TB source', ownerRole: 'accounting_reviewer', route: 'accounting' }));
  } else {
    gates.push(progressGate('tb-source', 'Trial balance source', 'STAGE-05', (d.announced || snap.pbcRequests.length)
      ? { state: 'READY', reason: 'No TB source has been recorded yet.', action: 'Record trial balance source', ownerRole: 'preparer', route: 'accounting' }
      : { state: 'WAITING', reason: 'TB loading unlocks once fieldwork starts.', ownerRole: 'preparer', route: 'accounting' }));
  }

  const accounting = snap.accounting || null;
  const accountingApproved = Boolean(accounting && accounting.reconState === 'COMPLETE' && Number(accounting.openRecons || 0) === 0 && accounting.journalState === 'COMPLETE' && Number(accounting.pendingJournals || 0) === 0 && accounting.fsState === 'FINAL' && accounting.mgmtApproval === 'ACCEPTED');
  const accountingStarted = Boolean(accounting && (accounting.sourceVersion || accounting.fsVersion || (accounting.reconState !== 'PENDING') || (accounting.journalState !== 'PENDING')));
  if (accountingApproved) {
    gates.push(progressGate('accounting-package', 'Accounting package review', 'STAGE-05', { state: 'APPROVED', reason: 'Reconciliations and journals are complete, the FS package is final and management approved it.', ownerRole: 'accounting_reviewer', route: 'accounting' }));
  } else if (accountingStarted || d.tbApproved) {
    const pending = [];
    if (!accounting || accounting.reconState !== 'COMPLETE' || Number(accounting.openRecons || 0) > 0) pending.push('reconciliations');
    if (!accounting || accounting.journalState !== 'COMPLETE' || Number(accounting.pendingJournals || 0) > 0) pending.push('journals');
    if (!accounting || accounting.fsState !== 'FINAL') pending.push('FS package');
    if (!accounting || accounting.mgmtApproval !== 'ACCEPTED') pending.push('management approval');
    gates.push(progressGate('accounting-package', 'Accounting package review', 'STAGE-05', { state: 'READY', reason: 'Open: ' + pending.join(', ') + '.', action: 'Complete accounting package', ownerRole: 'accounting_reviewer', route: 'accounting' }));
  } else {
    gates.push(progressGate('accounting-package', 'Accounting package review', 'STAGE-05', { state: 'WAITING', reason: 'The package tracker unlocks once a TB source is recorded.', ownerRole: 'accounting_reviewer', route: 'accounting' }));
  }

  if (d.submittedWorkpapers.length) {
    gates.push(progressGate('workpapers', 'Workpapers submitted', 'STAGE-06', { state: 'APPROVED', reason: d.submittedWorkpapers.length + ' workpaper(s) submitted for review.', ownerRole: 'audit_manager', route: 'audit', sourceIds: d.submittedWorkpapers.slice(0, 5).map((row) => row.id) }));
  } else {
    gates.push(progressGate('workpapers', 'Workpapers submitted', 'STAGE-06', (d.tbApproved || d.announced)
      ? { state: 'READY', reason: 'No workpaper has been submitted yet.', action: 'Submit workpaper', ownerRole: 'preparer', route: 'audit' }
      : { state: 'WAITING', reason: 'Workpapers unlock once evidence is ready.', ownerRole: 'preparer', route: 'audit' }));
  }

  if (!d.submittedWorkpapers.length) {
    gates.push(progressGate('review-points', 'Review points cleared', 'STAGE-06', { state: 'WAITING', reason: 'Review points unlock once workpapers are submitted.', ownerRole: 'audit_manager', route: 'reviews' }));
  } else if (!d.openReviews.length) {
    const staleCleared = snap.reviewPoints.filter((row) => Number(row.clearedGeneration || 1) < snap.inputGeneration);
    if (staleCleared.length) {
      warn('REVIEW_POINTS_STALE', staleCleared.length + ' cleared review point(s) predate accounting input g' + snap.inputGeneration + '; re-confirm them against the current input.');
      gates.push(progressGate('review-points', 'Review points cleared', 'STAGE-06', { state: 'BLOCKED', reason: 'Cleared points predate the current accounting input.', action: 'Reconfirm review points', ownerRole: 'audit_manager', route: 'reviews', sourceIds: staleCleared.slice(0, 5).map((row) => row.id) }));
    } else {
      gates.push(progressGate('review-points', 'Review points cleared', 'STAGE-06', { state: 'APPROVED', reason: 'No review point remains open.', ownerRole: 'audit_manager', route: 'reviews' }));
    }
  } else {
    gates.push(progressGate('review-points', 'Review points cleared', 'STAGE-06', { state: 'READY', reason: d.openReviews.length + ' point(s) open (' + d.openSignificant.length + ' significant).', action: d.openSignificant.length ? 'Clear significant review point' : 'Clear review point', ownerRole: 'audit_manager', route: 'reviews', sourceIds: d.openReviews.slice(0, 5).map((row) => row.id) }));
  }

  if (!d.latestDraft) {
    gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', d.submittedWorkpapers.length
      ? { state: 'READY', reason: 'No Draft FS has been published yet.', action: 'Publish Draft FS', ownerRole: 'audit_senior', route: 'accounting' }
      : { state: 'WAITING', reason: 'Draft FS unlocks once workpapers are submitted.', ownerRole: 'audit_senior', route: 'accounting' }));
  } else {
    if (!d.tbApproved) {
      warn('DRAFT_BEFORE_VALIDATED_TB', 'Draft ' + d.latestDraft + ' was published with no validated TB source on this engagement record.');
    }
    if (d.draftAccepted && decisionGeneration(d.draftDecision) < snap.inputGeneration) {
      warn('DRAFT_STALE_INPUT', 'Draft ' + d.latestDraft + ' was accepted against input g' + decisionGeneration(d.draftDecision) + '; re-confirm it against g' + snap.inputGeneration + '.');
      gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', { state: 'BLOCKED', reason: 'The acceptance predates the current accounting input.', action: 'Re-respond to Draft FS', ownerRole: 'management_approver', route: 'accounting' }));
    } else if (d.draftAccepted) {
      gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', { state: 'APPROVED', reason: 'Management accepted draft ' + d.latestDraft + '.', ownerRole: 'management_approver', route: 'accounting', sourceIds: [d.latestDraft] }));
    } else if (d.draftDecision && d.draftDecision.version !== d.latestDraft) {
      warn('DRAFT_SUPERSEDED', 'Management responded to ' + d.draftDecision.version + ' but the current draft is ' + d.latestDraft + '; a fresh response is required.');
      gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', { state: 'READY', reason: 'Draft ' + d.latestDraft + ' supersedes the earlier response.', action: 'Respond to Draft FS', ownerRole: 'management_approver', route: 'accounting' }));
    } else if (d.draftDecision && d.draftDecision.decision !== 'ACCEPT') {
      gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', { state: 'REJECTED', reason: 'Management did not accept draft ' + d.latestDraft + '; the file must be revised.', action: 'Revise Draft FS', ownerRole: 'audit_senior', route: 'accounting' }));
    } else {
      gates.push(progressGate('draft-fs', 'Draft FS response', 'STAGE-06', { state: 'READY', reason: 'Draft ' + d.latestDraft + ' awaits the management response.', action: 'Respond to Draft FS', ownerRole: 'management_approver', route: 'accounting' }));
    }
  }

  const managerCompletion = snap.decisions.MANAGER_COMPLETION || null;
  const managerCurrent = Boolean(managerCompletion && managerCompletion.decision === 'RECOMMEND_COMPLETE' && decisionGeneration(managerCompletion) >= snap.inputGeneration);
  if (!managerCompletion) {
    gates.push(progressGate('manager-completion', 'Manager completion recommendation', 'STAGE-07', (!d.openReviews.length && d.submittedWorkpapers.length)
      ? { state: 'READY', reason: 'The file is reviewed; the manager can recommend completion.', action: 'Recommend completion', ownerRole: 'audit_manager', route: 'reviews' }
      : { state: 'WAITING', reason: 'Completion unlocks once workpapers are submitted and points are cleared.', ownerRole: 'audit_manager', route: 'reviews' }));
  } else if (managerCompletion.decision === 'RECOMMEND_COMPLETE' && decisionGeneration(managerCompletion) < snap.inputGeneration) {
    warn('MANAGER_COMPLETION_STALE', 'The completion recommendation evaluated input g' + decisionGeneration(managerCompletion) + '; re-record it against g' + snap.inputGeneration + '.');
    gates.push(progressGate('manager-completion', 'Manager completion recommendation', 'STAGE-07', { state: 'BLOCKED', reason: 'The recommendation predates the current accounting input.', action: 'Re-record completion', ownerRole: 'audit_manager', route: 'reviews' }));
  } else if (managerCompletion.decision === 'RECOMMEND_COMPLETE') {
    gates.push(progressGate('manager-completion', 'Manager completion recommendation', 'STAGE-07', { state: 'APPROVED', reason: 'Manager recommended completion with a recorded basis.', ownerRole: 'audit_manager', route: 'reviews' }));
  } else {
    gates.push(progressGate('manager-completion', 'Manager completion recommendation', 'STAGE-07', { state: 'BLOCKED', reason: 'Manager recorded ' + managerCompletion.decision + '; the file returns to the team.', action: 'Resolve manager hold', ownerRole: 'audit_manager', route: 'reviews' }));
  }

  const partnerCompletionReview = snap.decisions.PARTNER_COMPLETION_REVIEW || null;
  if (!partnerCompletionReview) {
    gates.push(progressGate('partner-review', 'Partner completion review', 'STAGE-07', managerCurrent
      ? { state: 'READY', reason: 'Manager completion is current; the partner can review now.', action: 'Record partner review', ownerRole: 'engagement_partner', route: 'reviews' }
      : { state: 'WAITING', reason: 'Partner review unlocks after manager completion.', ownerRole: 'engagement_partner', route: 'reviews' }));
  } else if (partnerCompletionReview.decision === 'APPROVE_FOR_OPINION' && decisionGeneration(partnerCompletionReview) < snap.inputGeneration) {
    warn('PARTNER_REVIEW_STALE', 'The partner review evaluated input g' + decisionGeneration(partnerCompletionReview) + '; re-record it against g' + snap.inputGeneration + '.');
    gates.push(progressGate('partner-review', 'Partner completion review', 'STAGE-07', { state: 'BLOCKED', reason: 'The review predates the current accounting input.', action: 'Re-record partner review', ownerRole: 'engagement_partner', route: 'reviews' }));
  } else if (partnerCompletionReview.decision === 'APPROVE_FOR_OPINION') {
    gates.push(progressGate('partner-review', 'Partner completion review', 'STAGE-07', { state: 'APPROVED', reason: 'Partner approved the file for opinion.', ownerRole: 'engagement_partner', route: 'reviews' }));
  } else {
    gates.push(progressGate('partner-review', 'Partner completion review', 'STAGE-07', { state: 'BLOCKED', reason: 'Partner recorded ' + partnerCompletionReview.decision + '; the file returns to the manager.', action: 'Resolve partner hold', ownerRole: 'engagement_partner', route: 'reviews' }));
  }

  if (!d.eqr) {
    gates.push(progressGate('eqr', 'Independent EQR', 'STAGE-07', d.draftAccepted
      ? { state: 'READY', reason: 'Draft FS is accepted; EQR can review now.', action: 'Complete EQR', ownerRole: 'eqr_reviewer', route: 'reviews' }
      : { state: 'WAITING', reason: 'EQR unlocks once Draft FS is accepted.', ownerRole: 'eqr_reviewer', route: 'reviews' }));
  } else if (d.eqr.decision === 'APPROVE') {
    gates.push(progressGate('eqr', 'Independent EQR', 'STAGE-07', { state: 'APPROVED', reason: 'EQR approved the file.', ownerRole: 'eqr_reviewer', route: 'reviews' }));
  } else {
    gates.push(progressGate('eqr', 'Independent EQR', 'STAGE-07', { state: 'BLOCKED', reason: 'EQR recorded ' + d.eqr.decision + '; the file cannot proceed until EQR approves.', action: 'Resolve EQR hold', ownerRole: 'eqr_reviewer', route: 'reviews' }));
  }

  if (!d.opinion) {
    gates.push(progressGate('opinion', 'Audit opinion', 'STAGE-07', d.eqrApproved
      ? { state: 'READY', reason: 'EQR is approved; the opinion can be formed.', action: 'Record audit opinion', ownerRole: 'engagement_partner', route: 'reviews' }
      : { state: 'WAITING', reason: 'The opinion unlocks once EQR approves.', ownerRole: 'engagement_partner', route: 'reviews' }));
  } else {
    const staleOpinion = Boolean(d.latestDraft && d.opinion.version !== d.latestDraft);
    const significantAtOpinion = d.openSignificant.length > 0;
    if (staleOpinion) {
      contradict('OPINION_STALE_VERSION', 'The opinion binds to ' + (d.opinion.version || 'no version') + ' but the current draft is ' + d.latestDraft + '.', [d.opinion.version || 'opinion']);
    }
    if (significantAtOpinion) {
      contradict('OPINION_WITH_OPEN_SIGNIFICANT_POINTS', d.openSignificant.length + ' significant review point(s) remain open against the opinion.', d.openSignificant.slice(0, 5).map((row) => row.id));
    }
    if (!d.eqrApproved) {
      warn('OPINION_BEFORE_EQR', 'The opinion is recorded while EQR approval is still pending.');
    }
    const opinionManagerCurrent = Boolean(managerCompletion && managerCompletion.decision === 'RECOMMEND_COMPLETE' && decisionGeneration(managerCompletion) >= snap.inputGeneration);
    const opinionPartnerCurrent = Boolean(partnerCompletionReview && partnerCompletionReview.decision === 'APPROVE_FOR_OPINION' && decisionGeneration(partnerCompletionReview) >= snap.inputGeneration);
    const opinionPbcEvaluated = snap.pbcRequests.length > 0 && snap.pbcRequests.every((request) => String(request.state || '').toUpperCase() === 'ACCEPTED');
    const opinionAssessmentBlocking = snap.assessment ? snap.assessment.holds.filter((hold) => hold.code === 'HARD_STOP_RESPONSE' || String(hold.code || '').indexOf('PROHIBITION') !== -1) : [];
    const opinionInputCurrent = snap.evaluatedGeneration === snap.inputGeneration;
    function opinionBlocked(reason, action) {
      gates.push(progressGate('opinion', 'Audit opinion', 'STAGE-07', { state: 'BLOCKED', reason: reason, action: action, ownerRole: 'engagement_partner', route: 'reviews' }));
    }
    if (staleOpinion || significantAtOpinion) {
      gates.push(progressGate('opinion', 'Audit opinion', 'STAGE-07', { state: 'BLOCKED', reason: 'The recorded opinion is not sound against the current file.', action: 'Reconcile audit opinion', ownerRole: 'engagement_partner', route: 'reviews' }));
    } else if (!d.draftAccepted) {
      opinionBlocked('No current management acceptance of the latest draft exists.', 'Respond to Draft FS');
    } else if (!opinionManagerCurrent) {
      opinionBlocked('No current manager completion recommendation exists.', 'Recommend completion');
    } else if (!opinionPartnerCurrent) {
      opinionBlocked('No current partner completion review exists.', 'Record partner review');
    } else if (!d.submittedWorkpapers.length) {
      opinionBlocked('No submitted workpaper is on record.', 'Submit workpaper');
    } else if (!opinionPbcEvaluated) {
      opinionBlocked('Information requests are not all evaluated.', 'Evaluate PBC requests');
    } else if (opinionAssessmentBlocking.length) {
      opinionBlocked('Blocking evaluation holds remain unresolved.', 'Resolve evaluation holds');
    } else if (!opinionInputCurrent) {
      opinionBlocked('Accounting input g' + snap.inputGeneration + ' is not yet evaluated (g' + snap.evaluatedGeneration + ').', 'Evaluate accounting input');
    } else {
      gates.push(progressGate('opinion', 'Audit opinion', 'STAGE-07', { state: 'APPROVED', reason: 'Opinion ' + (d.opinion.decision || '') + ' binds to draft ' + (d.opinion.version || '') + ' with every precondition current.', ownerRole: 'engagement_partner', route: 'reviews', sourceIds: [d.opinion.version || 'opinion'] }));
    }
  }

  const discussionCurrent = Boolean(snap.finalDiscussion) && Number(snap.finalDiscussion.generation || 1) >= snap.inputGeneration;
  if (snap.finalDiscussion && !discussionCurrent) {
    warn('FINAL_DISCUSSION_STALE', 'The final discussion evaluated input g' + Number(snap.finalDiscussion.generation || 1) + '; re-record it against g' + snap.inputGeneration + '.');
    gates.push(progressGate('final-discussion', 'Final client discussion', 'STAGE-07', { state: 'BLOCKED', reason: 'The discussion predates the current accounting input.', action: 'Re-record final discussion', ownerRole: 'engagement_partner', route: 'release' }));
  } else if (snap.finalDiscussion) {
    gates.push(progressGate('final-discussion', 'Final client discussion', 'STAGE-07', { state: 'APPROVED', reason: 'Final discussion recorded ' + (snap.finalDiscussion.at || '') + '.', ownerRole: 'engagement_partner', route: 'release' }));
  } else {
    const opinionGateState = (gates.find((gate) => gate.id === 'opinion') || {}).state;
    const opinionSound = opinionGateState === 'APPROVED';
    gates.push(progressGate('final-discussion', 'Final client discussion', 'STAGE-07', d.opinion && opinionSound
      ? { state: 'READY', reason: 'Opinion is sound; the final discussion can be held.', action: 'Record final discussion', ownerRole: 'engagement_partner', route: 'release' }
      : { state: 'WAITING', reason: d.opinion ? 'Final discussion unlocks once the opinion is sound.' : 'Final discussion unlocks once the opinion is recorded.', ownerRole: 'engagement_partner', route: 'release' }));
  }

  const releaseManagerCurrent = Boolean(managerCompletion && managerCompletion.decision === 'RECOMMEND_COMPLETE' && decisionGeneration(managerCompletion) >= snap.inputGeneration);
  const releasePartnerCurrent = Boolean(partnerCompletionReview && partnerCompletionReview.decision === 'APPROVE_FOR_OPINION' && decisionGeneration(partnerCompletionReview) >= snap.inputGeneration);
  const releaseOpinionCurrent = Boolean(d.opinion && d.latestDraft && d.opinion.version === d.latestDraft);
  const releaseDiscussion = Boolean(snap.finalDiscussion);
  const releaseInputCurrent = snap.evaluatedGeneration === snap.inputGeneration;
  if (d.release) {
    if (!d.opinion) {
      contradict('RELEASE_WITHOUT_OPINION', 'The final report was released with no audit opinion on record.', []);
    }
    if (!d.eqrApproved) {
      contradict('RELEASE_WITHOUT_EQR', 'The final report was released without EQR approval.', []);
    }
    if (d.openSignificant.length) {
      contradict('RELEASE_WITH_OPEN_SIGNIFICANT_POINTS', d.openSignificant.length + ' significant review point(s) are open against the release.', d.openSignificant.slice(0, 5).map((row) => row.id));
    }
    const releaseStaleReasons = [];
    if (!releaseManagerCurrent) releaseStaleReasons.push('manager completion is not current');
    if (!releasePartnerCurrent) releaseStaleReasons.push('partner review is not current');
    if (!releaseOpinionCurrent) releaseStaleReasons.push('opinion is not bound to the final FS');
    if (d.opinion && decisionGeneration(d.opinion) < snap.inputGeneration) releaseStaleReasons.push('opinion evaluated an older input');
    if (!d.draftAccepted) releaseStaleReasons.push('client response is not current');
    if (!releaseDiscussion) releaseStaleReasons.push('final discussion is missing');
    if (snap.finalDiscussion && Number(snap.finalDiscussion.generation || 1) < snap.inputGeneration) releaseStaleReasons.push('final discussion evaluated an older input');
    if (!releaseInputCurrent) releaseStaleReasons.push('accounting input is not current');
    if (releaseStaleReasons.length) {
      warn('RELEASE_PREREQUISITES_STALE', 'The release stands on outdated prerequisites: ' + releaseStaleReasons.join('; ') + '.');
      gates.push(progressGate('release', 'Final release', 'STAGE-08', { state: 'BLOCKED', reason: 'Prerequisites changed after release: ' + releaseStaleReasons.join('; ') + '.', action: 'Re-validate release prerequisites', ownerRole: 'engagement_partner', route: 'release' }));
    } else {
      gates.push(progressGate('release', 'Final release', 'STAGE-08', { state: 'APPROVED', reason: 'The final report and FS pair were released with every prerequisite current.', ownerRole: 'engagement_partner', route: 'release' }));
    }
  } else {
    const releaseOpinionGenCurrent = Boolean(d.opinion) && decisionGeneration(d.opinion) >= snap.inputGeneration;
    gates.push(progressGate('release', 'Final release', 'STAGE-08', (d.opinion && d.eqrApproved && !d.openSignificant.length && releaseManagerCurrent && releasePartnerCurrent && releaseOpinionCurrent && releaseOpinionGenCurrent && d.draftAccepted && discussionCurrent && releaseInputCurrent)
      ? { state: 'READY', reason: 'Every release prerequisite is current.', action: 'Release final report', ownerRole: 'engagement_partner', route: 'release' }
      : { state: 'WAITING', reason: 'Release unlocks after completion reviews, opinion, EQR, response, discussion and current input.', ownerRole: 'engagement_partner', route: 'release' }));
  }

  if (d.invoiceIssued && !d.release) {
    contradict('INVOICE_BEFORE_RELEASE', 'The invoice was generated before the final report was released.', [d.commercial.invoiceId || 'invoice']);
    gates.push(progressGate('invoice', 'Final invoice', 'STAGE-08', { state: 'BLOCKED', reason: 'Invoicing precedes the required release.', action: 'Reconcile invoice before release', ownerRole: 'finance_team', route: 'release' }));
  } else {
    gates.push(progressGate('invoice', 'Final invoice', 'STAGE-08', d.invoiceIssued
      ? { state: 'APPROVED', reason: 'Invoice ' + (d.commercial.invoiceId || '') + ' was issued.', ownerRole: 'finance_team', route: 'release', sourceIds: [d.commercial.invoiceId || 'invoice'] }
      : (d.release
        ? { state: 'READY', reason: 'Release is complete; the invoice can be generated.', action: 'Generate final invoice', ownerRole: 'finance_team', route: 'release' }
        : { state: 'WAITING', reason: 'Invoicing unlocks after release.', ownerRole: 'finance_team', route: 'release' })));
  }

  if (d.commerciallyClosed && !d.invoiceIssued) {
    contradict('CLOSE_BEFORE_INVOICE', 'The commercial record was closed with no issued invoice.', []);
    gates.push(progressGate('commercial-close', 'Commercial close', 'STAGE-08', { state: 'BLOCKED', reason: 'Close precedes the required invoice.', action: 'Reconcile close before invoice', ownerRole: 'finance_team', route: 'release' }));
  } else {
    gates.push(progressGate('commercial-close', 'Commercial close', 'STAGE-08', d.commerciallyClosed
      ? { state: 'APPROVED', reason: 'The commercial record is closed; archive remains a separate records action.', ownerRole: 'finance_team', route: 'release' }
      : (d.invoiceIssued
        ? { state: 'READY', reason: 'The invoice is issued; the commercial record can be closed.', action: 'Close commercial record', ownerRole: 'finance_team', route: 'release' }
        : { state: 'WAITING', reason: 'Close unlocks after invoicing. Close never substitutes for archive.', ownerRole: 'finance_team', route: 'release' })));
  }

  return { gates: gates, contradictions: contradictions, warnings: warnings };
}

// Public prerequisite engine: one call folds any snapshot into gates,
// contradictions and warnings.
export function evaluateProgressGates(rawSnapshot) {
  return finishProgressGates(evaluateProgressGatesHead(rawSnapshot));
}

// Folds gates into the eight accountable stages. The derived stage is the
// first incomplete stage; current_stage is reported only as a cached
// projection alongside a drift flag.
export function deriveProgressFromSnapshot(rawSnapshot) {
  const snap = normalizeProgressSnapshot(rawSnapshot);
  const evaluated = evaluateProgressGates(snap);
  const gates = evaluated.gates;
  const contradictions = evaluated.contradictions;
  const warnings = evaluated.warnings.slice();

  const authoritative = gates.filter((gate) => !gate.advisory);
  const byStage = {};
  for (const id of PROGRESS_STAGE_ORDER) byStage[id] = [];
  for (const gate of authoritative) {
    if (!byStage[gate.stage]) byStage[gate.stage] = [];
    byStage[gate.stage].push(gate);
  }

  const stages = [];
  let currentStage = 'STAGE-08';
  let foundCurrent = false;
  let priorsComplete = true;
  for (const id of PROGRESS_STAGE_ORDER) {
    const list = byStage[id] || [];
    const approved = list.filter((gate) => gate.state === 'APPROVED').length;
    let state;
    if (list.length > 0 && approved === list.length) {
      state = 'COMPLETE';
    } else if (list.some((gate) => gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED')) {
      state = 'BLOCKED';
    } else if (!priorsComplete) {
      state = 'NOT_STARTED';
    } else if (!list.some((gate) => gate.state === 'WAITING')) {
      state = 'READY';
    } else {
      const actionable = list.find((gate) => gate.state !== 'APPROVED') || list[0];
      state = actionable ? progressWaitingState(actionable.ownerRole) : 'NOT_STARTED';
    }
    stages.push({ id: id, title: PROGRESS_STAGE_TITLES[id] || id, state: state });
    if (state !== 'COMPLETE' && !foundCurrent) {
      currentStage = id;
      foundCurrent = true;
    }
    if (state !== 'COMPLETE') priorsComplete = false;
  }

  const skippedStages = [];
  for (let i = 0; i < PROGRESS_STAGE_ORDER.length; i += 1) {
    const id = PROGRESS_STAGE_ORDER[i];
    const missing = (byStage[id] || []).filter((gate) => gate.state !== 'APPROVED').map((gate) => gate.id);
    if (!missing.length) continue;
    let laterApproved = false;
    for (let j = i + 1; j < PROGRESS_STAGE_ORDER.length; j += 1) {
      if ((byStage[PROGRESS_STAGE_ORDER[j]] || []).some((gate) => gate.state === 'APPROVED')) {
        laterApproved = true;
        break;
      }
    }
    if (laterApproved) skippedStages.push({ stage: id, title: PROGRESS_STAGE_TITLES[id] || id, missingGateIds: missing });
  }
  if (skippedStages.length) {
    warnings.push({ code: 'SKIPPED_STAGES', message: skippedStages.length + ' stage(s) skipped: later evidence exists while ' + skippedStages.map((entry) => entry.stage).join(', ') + ' remain incomplete.' });
  }

  const approvedCount = authoritative.filter((gate) => gate.state === 'APPROVED').length;
  const readyCount = authoritative.filter((gate) => gate.state === 'READY' || gate.state === 'OVERDUE').length;
  const blockedCount = authoritative.filter((gate) => gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED').length;
  const waitingCount = authoritative.filter((gate) => gate.state === 'WAITING').length;
  const completionPercent = authoritative.length ? Math.round((approvedCount / authoritative.length) * 100) : 0;
  const valid = contradictions.length === 0 && blockedCount === 0;

  const nextGate = authoritative.find((gate) => gate.state === 'READY' || gate.state === 'OVERDUE' || gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED') || null;

  const blockers = [];
  for (const gate of authoritative) {
    if (gate.state === 'BLOCKED' || gate.state === 'REJECTED' || gate.state === 'ESCALATED') {
      blockers.push({
        code: 'GATE_' + String(gate.id).toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        ownerRole: gate.ownerRole,
        ownerLabel: gate.ownerLabel,
        message: gate.label + ': ' + gate.reason,
        route: gate.route,
      });
    }
  }
  for (const entry of contradictions) {
    blockers.push({ code: entry.code, ownerRole: '', ownerLabel: '', message: entry.message, route: 'pipeline' });
  }

  const cachedNumber = progressStageNumber(snap.cachedStage);
  const derivedNumber = progressStageNumber(currentStage);
  const stageDrift = Boolean(cachedNumber && derivedNumber && cachedNumber !== derivedNumber);
  if (cachedNumber && derivedNumber && cachedNumber > derivedNumber) {
    warnings.push({ code: 'CACHED_STAGE_AHEAD', message: 'Cached ' + snap.cachedStage + ' is ahead of derived ' + currentStage + '; the cache is a projection, not the authority.' });
  }

  const openTasks = snap.tasks.filter((task) => ['COMPLETE', 'CANCELLED'].indexOf(String(task.state || '').toUpperCase()) === -1);
  const overdueTasks = openTasks.filter((task) => String(task.dueDate || '').slice(0, 10) && String(task.dueDate || '').slice(0, 10) < snap.today);
  const currentEntry = stages.find((entry) => entry.id === currentStage) || {};

  return {
    engagementId: snap.engagementId,
    inputGeneration: snap.inputGeneration,
    evaluatedGeneration: snap.evaluatedGeneration,
    // Raw D1 records the presenters and the pipeline projection need in order to
    // stay authoritative in SHARED_DEMO: who is staffed, whether fieldwork has
    // commenced, the staffing policy, and the accounting tracker behind the
    // accounting→audit handoff card.
    team: snap.team,
    workpapers: snap.workpapers,
    pbcRequests: snap.pbcRequests,
    reviewPoints: snap.reviewPoints,
    auditCommenced: snap.auditCommenced,
    smallFirmMode: snap.smallFirmMode,
    eqrRequired: snap.eqrRequired,
    accounting: snap.accounting,
    valid: valid,
    currentStage: currentStage,
    cachedStage: snap.cachedStage || null,
    stageDrift: stageDrift,
    completionPercent: completionPercent,
    nextOwner: nextGate ? nextGate.ownerLabel : '',
    nextAction: nextGate ? { ownerRole: nextGate.ownerRole, ownerLabel: nextGate.ownerLabel, title: nextGate.action, route: nextGate.route, gateId: nextGate.id } : null,
    stage: {
      id: currentStage,
      title: PROGRESS_STAGE_TITLES[currentStage] || currentStage,
      state: currentEntry.state || 'NOT_STARTED',
      completionPercent: completionPercent,
    },
    stages: stages,
    gates: { ready: readyCount, total: authoritative.length, blocked: blockedCount, waiting: waitingCount, approved: approvedCount },
    gateDetails: gates,
    skippedStages: skippedStages,
    blockers: blockers,
    warnings: warnings,
    contradictions: contradictions,
    approvalSummary: { complete: approvedCount, required: authoritative.length, advisoryPending: gates.filter((gate) => gate.advisory && gate.state !== 'APPROVED').length },
    documents: { created: snap.artifactCount, published: snap.publishedArtifactCount },
    tasks: { open: openTasks.length, overdue: overdueTasks.length },
  };
}
