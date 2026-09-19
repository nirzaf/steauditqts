// P8A — Lifecycle rules shared by the browser-local domain (src/domain/scenario.js),
// the shared Worker command boundary (worker/index.js), the derived UX projections
// (src/domain/localProjections.js, src/domain/sharedProjections.js) and the pipeline
// composable (src/composables/lifecycleProjection.js).
//
// Pure functions only: no Vue, no Request/Response, no storage, no D1 imports.
//
// Why this module exists: "submitted workpaper", "senior cleared" and "manager
// recommended" were each re-derived independently in four places with subtly
// different predicates, so LOCAL_ONLY and SHARED_DEMO could disagree about
// whether a professional gate had passed. Every runtime now asks THIS module and
// only translates its own record vocabulary into the shapes below.

const normalize = (value) => String(value == null ? '' : value).trim().toUpperCase();

// ─── Workpaper evidence states ──────────────────────────────────────────────

export const WORKPAPER_DRAFT_STATE = 'DRAFT';

// LOCAL_ONLY stores the clearance on `reviewState` and leaves `state` at
// SUBMITTED; SHARED_DEMO advances the D1 `state` column. Both are submitted
// evidence — a gate that only accepts the raw SUBMITTED row would report an
// fully senior-reviewed file as empty.
export const SUBMITTED_WORKPAPER_STATES = Object.freeze(['SUBMITTED', 'SENIOR_REVIEWED', 'SENIOR_RETURNED']);

export const SENIOR_CLEARED_WORKPAPER_STATES = Object.freeze(['SENIOR_REVIEWED']);
export const SENIOR_CLEARED_REVIEW_STATES = Object.freeze(['SENIOR_CLEARED']);
export const SENIOR_RETURNED_WORKPAPER_STATES = Object.freeze(['SENIOR_RETURNED']);
export const SENIOR_RETURNED_REVIEW_STATES = Object.freeze(['SENIOR_RETURNED', 'NEEDS_WORK', 'CHANGES_REQUIRED']);

/**
 * @param {{state?: string}|null} workpaper
 * @returns {boolean} true when the workpaper is submitted evidence (not a draft)
 */
export function isWorkpaperSubmitted(workpaper) {
  return SUBMITTED_WORKPAPER_STATES.includes(normalize(workpaper?.state));
}

/**
 * @param {{state?: string, reviewState?: string}|null} workpaper
 * @returns {boolean} true only when an Audit Senior explicitly cleared it
 */
export function isSeniorClearedWorkpaper(workpaper) {
  if (!isWorkpaperSubmitted(workpaper)) return false;
  const state = normalize(workpaper.state);
  const reviewState = normalize(workpaper.reviewState);
  if (SENIOR_CLEARED_WORKPAPER_STATES.includes(state)) return true;
  // A returned-then-re-cleared row carries the clearance on reviewState while
  // `state` stays SENIOR_RETURNED; the explicit return always wins.
  if (SENIOR_RETURNED_WORKPAPER_STATES.includes(state) && !SENIOR_CLEARED_REVIEW_STATES.includes(reviewState)) return false;
  return SENIOR_CLEARED_REVIEW_STATES.includes(reviewState);
}

/**
 * Three-state senior review outcome for one workpaper.
 * @returns {'CLEARED'|'RETURNED'|'PENDING'}
 */
export function seniorReviewStateOf(workpaper) {
  if (!isWorkpaperSubmitted(workpaper)) return 'PENDING';
  const state = normalize(workpaper.state);
  const reviewState = normalize(workpaper.reviewState);
  if (SENIOR_CLEARED_WORKPAPER_STATES.includes(state) && !SENIOR_RETURNED_REVIEW_STATES.includes(reviewState)) return 'CLEARED';
  if (SENIOR_CLEARED_REVIEW_STATES.includes(reviewState)) return 'CLEARED';
  if (SENIOR_RETURNED_WORKPAPER_STATES.includes(state) || SENIOR_RETURNED_REVIEW_STATES.includes(reviewState)) return 'RETURNED';
  return 'PENDING';
}

/**
 * The single senior-review gate. Accepts any mix of local or D1 workpaper rows.
 *
 * @param {Array<{id?: string, workpaperId?: string, workpaper_id?: string, state?: string, reviewState?: string, title?: string}>} workpapers
 * @returns {{complete: boolean, reviewed: number, returned: number, total: number, pending: object[], message: string}}
 */
export function seniorReviewGateFrom(workpapers = []) {
  const rows = Array.isArray(workpapers) ? workpapers : [];
  const submitted = rows.filter((row) => isWorkpaperSubmitted(row));
  const idOf = (row) => row.id || row.workpaperId || row.workpaper_id || '';
  if (submitted.length === 0) {
    return {
      complete: false,
      reviewed: 0,
      returned: 0,
      total: 0,
      pending: [],
      message: 'No submitted workpapers yet. Senior review cannot be complete.',
    };
  }
  const cleared = submitted.filter((row) => seniorReviewStateOf(row) === 'CLEARED');
  const returned = submitted.filter((row) => seniorReviewStateOf(row) === 'RETURNED');
  const pending = submitted.filter((row) => seniorReviewStateOf(row) !== 'CLEARED');
  const complete = pending.length === 0;
  let message;
  if (complete) {
    message = `Senior review complete: all ${submitted.length} submitted workpaper(s) cleared.`;
  } else if (returned.length) {
    message = `Senior review incomplete: ${returned.length} workpaper(s) were returned by the Audit Senior and ${pending.length - returned.length} still await senior review (${cleared.length}/${submitted.length} cleared).`;
  } else {
    message = `Senior review incomplete: ${pending.length} of ${submitted.length} workpaper(s) still need Senior review.`;
  }
  return {
    complete,
    reviewed: cleared.length,
    returned: returned.length,
    total: submitted.length,
    pending: pending.map((row) => ({ id: idOf(row), title: row.title || idOf(row), reviewState: normalize(row.reviewState) || 'OPEN', state: normalize(row.state) })),
    message,
  };
}

// ─── Senior review decisions ───────────────────────────────────────────────

// A senior review is a professional outcome, not a checkbox. Anything other
// than an explicit PASSED must never satisfy a downstream completion gate.
export const SENIOR_REVIEW_DECISIONS = Object.freeze(['PASSED', 'FAILED']);

/**
 * @param {string} [decision]
 * @returns {{decision: string} | {code: string, message: string}}
 */
export function normalizeSeniorReviewDecision(decision) {
  const value = normalize(decision);
  if (!value) return { decision: 'PASSED' };
  if (!SENIOR_REVIEW_DECISIONS.includes(value)) {
    return {
      code: 'SENIOR_REVIEW_DECISION_INVALID',
      message: `Senior review decision must be ${SENIOR_REVIEW_DECISIONS.join(' or ')}. The review was not recorded.`,
    };
  }
  return { decision: value };
}

// ─── Manager completion prerequisites ──────────────────────────────────────

/**
 * Ordered hard prerequisites for a manager completion recommendation.
 *
 * Both runtimes must emit the same codes in the same order, otherwise the same
 * engagement file reports different blockers in LOCAL_ONLY and SHARED_DEMO.
 *
 * @param {object} args
 * @param {Array<object>} args.workpapers — submitted and draft workpaper rows
 * @param {number} [args.openReviewPointCount]
 * @returns {Array<{code: string, message: string}>}
 */
export function managerCompletionGateBlockers({ workpapers = [], openReviewPointCount = 0 } = {}) {
  const rows = Array.isArray(workpapers) ? workpapers : [];
  const blockers = [];
  if (!rows.some((row) => isWorkpaperSubmitted(row))) {
    blockers.push({
      code: 'NO_SUBMITTED_WORKPAPERS',
      message: 'Recommend completion only after at least one workpaper is submitted.',
    });
    return blockers;
  }
  if (Number(openReviewPointCount || 0) > 0) {
    blockers.push({
      code: 'REVIEW_POINTS_OPEN',
      message: `${Number(openReviewPointCount)} unresolved review point(s) block a completion recommendation. Clear or return each open point first.`,
    });
  }
  const gate = seniorReviewGateFrom(rows);
  if (!gate.complete) {
    blockers.push({ code: 'SENIOR_REVIEW_REQUIRED', message: gate.message });
  }
  return blockers;
}

// ─── Manager completion recommendation shape ───────────────────────────────

/**
 * The domain records an immutable recommendation object; older fixtures carry a
 * string marker. Presenters must never re-implement this normalization, or a
 * recorded recommendation can render as "not recorded".
 *
 * @param {object|string|null} raw
 * @returns {null | {decision: string, status: string, recommended: boolean, blockers: Array<object>, legacyMarker: boolean}}
 */
export function completionRecommendationView(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return {
      decision: raw,
      status: raw === 'RECOMMEND_COMPLETE' ? 'READY' : 'CONDITIONAL',
      recommended: raw === 'RECOMMEND_COMPLETE',
      blockers: [],
      legacyMarker: true,
    };
  }
  return {
    ...raw,
    decision: normalize(raw.decision),
    status: normalize(raw.status) || (normalize(raw.decision) === 'RECOMMEND' ? 'READY' : 'CONDITIONAL'),
    recommended: normalize(raw.decision) === 'RECOMMEND' || normalize(raw.decision) === 'RECOMMEND_COMPLETE',
    blockers: Array.isArray(raw.blockers) ? raw.blockers : [],
    legacyMarker: false,
  };
}

// ─── Role authority ────────────────────────────────────────────────────────

// Staffing role validation lives in shared/staffingRules.js. These constants
// cover WHO may act, which both runtimes and the UI buttons must agree on.
export const SENIOR_REVIEW_ROLES = Object.freeze(['audit_senior', 'audit_manager']);
export const TEAM_ASSIGNMENT_ROLES = Object.freeze(['preparer', 'audit_senior', 'audit_manager', 'engagement_partner', 'eqr_reviewer', 'accounting_reviewer']);
export const TEAM_ASSIGNMENT_AUTHORITY_ROLES = Object.freeze(['engagement_partner', 'audit_manager', 'system_admin']);

/**
 * @param {{roles?: string[]}|null} actor
 * @param {readonly string[]} allowedRoles
 * @returns {boolean}
 */
export function actorHoldsAnyRole(actor, allowedRoles = []) {
  const roles = Array.isArray(actor?.roles) ? actor.roles : [];
  return roles.some((role) => allowedRoles.includes(normalize(role).toLowerCase()));
}

// ─── Staffing policy inputs ────────────────────────────────────────────────

/**
 * Normalize the staffing policy inputs of the shared commencement profile so
 * the local camelCase evidence flags and the D1 snake_case columns produce the
 * same requirement set.
 *
 * @param {object|null} engagement — local engagement or D1 engagement_state row
 */
export function staffingPolicyFor(engagement) {
  if (!engagement || typeof engagement !== 'object') return { eqrRequired: false, smallFirmMode: false };
  const truthy = (value) => value === true || value === 1 || normalize(value) === 'TRUE' || normalize(value) === 'Y';
  return {
    eqrRequired: truthy(engagement.eqr_required ?? engagement.evidence?.eqrRequired ?? engagement.requiredEqr ?? false),
    smallFirmMode: truthy(engagement.small_firm_mode ?? engagement.smallFirmMode ?? false),
  };
}

// ─── Owner waiting vocabulary ───────────────────────────────────────────

// The pipeline displays "who is holding this stage" while the Worker gates
// report an owner role. One mapping keeps a stage reading the same in both
// modes instead of each runtime inventing its own label.
const WAITING_STATE_BY_ROLE = {
  client_contributor: 'WAITING_FOR_CLIENT',
  client_finance: 'WAITING_FOR_CLIENT',
  management_approver: 'WAITING_FOR_CLIENT',
  finance_team: 'WAITING_FOR_FINANCE',
  audit_senior: 'WAITING_FOR_SENIOR',
  preparer: 'WAITING_FOR_SENIOR',
  accounting_reviewer: 'WAITING_FOR_SENIOR',
  audit_manager: 'WAITING_FOR_MANAGER',
  independent_reviewer: 'WAITING_FOR_MANAGER',
  eqr_reviewer: 'WAITING_FOR_EQR',
};

/**
 * @param {string} role — owner role holding the next action
 * @returns {string} display state from the pipeline vocabulary
 */
export function waitingDisplayStateFor(role) {
  return WAITING_STATE_BY_ROLE[String(role || '').trim().toLowerCase()] || 'WAITING_FOR_PARTNER';
}

// ─── Accounting → audit handoff ────────────────────────────────────────────

const ACCEPTED_APPROVAL_VALUES = ['APPROVE', 'ACCEPT', 'ACCEPTED'];

/**
 * Resolve the accounting engagement paired with an audit engagement.
 *
 * The pair may be linked from either side, and both the browser-local domain
 * and the derived projections have to agree on which engagements are paired —
 * otherwise the handoff card can describe a package the audit does not link.
 *
 * @param {Array<object>} engagements
 * @param {object|null} engagement — the audit engagement
 * @returns {object|null}
 */
export function linkedAccountingEngagementFrom(engagements = [], engagement) {
  if (!engagement || normalize(engagement.service) !== 'AUDIT') return null;
  return (Array.isArray(engagements) ? engagements : []).find(
    (entry) => normalize(entry.service) === 'ACCOUNTING'
      && (entry.id === engagement.linkedEngagementId || entry.linkedEngagementId === engagement.id),
  ) || null;
}

/**
 * Is the client's engagement-letter acceptance bound to the CURRENT version?
 * An acceptance of a superseded letter is not an acceptance — the domain
 * enforces this in termsAcceptedFor(), and every projection must read it the
 * same way.
 */
export function termsAcceptanceIsCurrent(terms) {
  return Boolean(terms && terms.clientDecision?.decision === 'ACCEPT' && terms.clientDecision.version === terms.version);
}

/**
 * The single accounting→audit handoff derivation.
 *
 * LOCAL_ONLY passes the paired engagement plus its package record; SHARED_DEMO
 * passes the D1 accounting tracker. One function means the card cannot tell the
 * truth in one mode and lie in the other.
 *
 * @param {object} args
 * @param {object|null} args.auditEngagement
 * @param {object|null} [args.accountingEngagement] — local paired engagement
 * @param {object|null} [args.packageRecord] — local accounting package
 * @param {object|null} [args.tracker] — D1 accounting_status row (projected)
 */
export function deriveAccountingHandoffFacts({ auditEngagement = null, accountingEngagement = null, packageRecord = null, tracker = null } = {}) {
  const id = String(auditEngagement?.id || '');
  const hasPackage = Boolean(packageRecord || tracker?.exists || accountingEngagement);
  if (!auditEngagement || normalize(auditEngagement.service) !== 'AUDIT' || !hasPackage) {
    return {
      applicable: false,
      status: 'NOT_APPLICABLE',
      engagementId: id,
      accountingEngagementId: accountingEngagement?.id || '',
      packageId: packageRecord?.id || '',
      packageLabel: '',
      managementApproval: 'NOT_APPLICABLE',
      accountingInputGeneration: 0,
      auditEvaluatedGeneration: 0,
      stale: false,
      actionLabel: '',
      message: 'No accounting package is linked to this audit engagement, so no handoff applies.',
    };
  }
  // The accounting side's own counter is authoritative: it advances whenever the
  // package changes. The audit-side mirror is only a fallback for a one-sided
  // link, so the two can never drift into a card that offers an action which the
  // evaluate command then reports as already done.
  const input = Number(accountingEngagement?.inputGeneration ?? tracker?.inputGeneration ?? auditEngagement.evidence?.accountingInputGeneration ?? 1);
  const evaluated = Number(auditEngagement.evidence?.accountingEvaluatedGeneration ?? input);
  const stale = evaluated < input;
  const approvalDecision = normalize(packageRecord?.statement?.managementApproval?.decision ?? tracker?.mgmtApprovalState ?? '');
  const managementApproval = ACCEPTED_APPROVAL_VALUES.includes(approvalDecision) ? 'ACCEPTED' : approvalDecision || 'PENDING';
  const statementApproved = normalize(packageRecord?.statement?.state) === 'APPROVED' || normalize(tracker?.fsState) === 'FINAL';
  const statementId = String(packageRecord?.statement?.id || tracker?.fsVersion || '');
  const version = statementId.match(/-?V(\d+)$/i);
  const packageLabel = version ? `FS v${version[1]}` : (packageRecord?.source?.sourceLabel || statementId || 'Accounting package');
  let status = 'CURRENT';
  if (!packageRecord && !tracker?.exists) status = 'MISSING';
  else if (stale) status = 'STALE';
  else if (managementApproval !== 'ACCEPTED' || !statementApproved) status = 'PENDING_APPROVAL';
  const messages = {
    MISSING: 'The linked accounting engagement has no package on record yet.',
    STALE: `Accounting input g${input} is ahead of the audit-evaluated g${evaluated}. Evaluate the current package before relying on it.`,
    PENDING_APPROVAL: 'Management approval of the accounting package is not on record yet.',
    CURRENT: `The audit has evaluated the current accounting input g${input}.`,
  };
  return {
    applicable: true,
    status,
    engagementId: id,
    accountingEngagementId: accountingEngagement?.id || tracker?.engagementId || '',
    packageId: packageRecord?.id || tracker?.engagementId || '',
    packageLabel,
    managementApproval,
    accountingInputGeneration: input,
    auditEvaluatedGeneration: evaluated,
    stale,
    actionLabel: stale ? `Evaluate g${input}` : '',
    message: messages[status],
  };
}

// ─── Engagement completion checklist ────────────────────────────────────

// The professional order and the prerequisites of the stakeholder-facing
// completion checklist. Each runtime only supplies the FACTS (is this step
// recorded, and what shows that); the ordering, the dependency chain and the
// tri-state meaning are defined once here so LOCAL_ONLY and SHARED_DEMO cannot
// present two different sequences for one engagement.
export const COMPLETION_CHECKLIST_STEPS = Object.freeze([
  { key: 'client-accepted', label: 'Client accepted', dependsOn: [] },
  { key: 'terms-accepted', label: 'Terms accepted', dependsOn: ['client-accepted'] },
  { key: 'advance', label: 'Advance verified', dependsOn: ['terms-accepted'] },
  { key: 'staffing', label: 'Staffing assigned', dependsOn: ['terms-accepted'] },
  { key: 'commenced', label: 'Audit commenced', dependsOn: ['staffing'] },
  { key: 'pbc', label: 'Information requests satisfied', dependsOn: ['commenced'] },
  { key: 'accounting', label: 'Accounting current', dependsOn: ['commenced'] },
  { key: 'workpapers', label: 'Workpapers submitted', dependsOn: ['commenced'] },
  { key: 'senior-review', label: 'Senior review', dependsOn: ['workpapers'] },
  { key: 'manager-completion', label: 'Manager completion', dependsOn: ['senior-review', 'pbc', 'accounting'] },
  { key: 'partner-review', label: 'Partner review', dependsOn: ['manager-completion'] },
  { key: 'eqr', label: 'EQR', dependsOn: ['partner-review'] },
  { key: 'opinion', label: 'Opinion formed', dependsOn: ['eqr'] },
  { key: 'release', label: 'Released & archived', dependsOn: ['opinion'] },
]);

/**
 * Build the checklist from per-step facts.
 *
 * Item states: COMPLETE (recorded) | ATTENTION (actionable now, every
 * prerequisite recorded) | PENDING (waiting on an upstream step).
 *
 * @param {object} args
 * @param {string} args.engagementId
 * @param {boolean} [args.applicable]
 * @param {string} [args.message] — why the checklist does not apply
 * @param {Record<string, {done: boolean, detail: string}>} args.facts
 */
export function buildCompletionChecklist({ engagementId = '', applicable = true, message = '', facts = {} } = {}) {
  if (!applicable) {
    return { engagementId, applicable: false, message, items: [], completeCount: 0, totalCount: 0, complete: false };
  }
  const resolved = []
  for (const step of COMPLETION_CHECKLIST_STEPS) {
    const fact = facts[step.key] || { done: false, detail: 'Not recorded' };
    const waiting = step.dependsOn.filter((parent) => !resolved.find((entry) => entry.key === parent)?.done);
    resolved.push({
      key: step.key,
      label: step.label,
      done: fact.done === true,
      state: fact.done === true ? 'COMPLETE' : waiting.length ? 'PENDING' : 'ATTENTION',
      detail: fact.detail || '',
    });
  }
  const completeCount = resolved.filter((item) => item.state === 'COMPLETE').length;
  return {
    engagementId,
    applicable: true,
    message: completeCount === resolved.length ? 'Every completion step is recorded for this engagement.' : `${resolved.length - completeCount} completion step(s) remain.`,
    items: resolved.map(({ done, ...item }) => item),
    completeCount,
    totalCount: resolved.length,
    complete: completeCount === resolved.length,
  };
}

// ─── Team roster merge ────────────────────────────────────────────────────

/**
 * Merge an assignment payload into an existing roster using the same key as the
 * D1 table (role, actorId): an existing row is updated in place, a new one is
 * appended, and members the payload does not mention are preserved. The local
 * domain previously REPLACED the whole roster, so the same command could drop a
 * Partner in LOCAL_ONLY while SHARED_DEMO kept them.
 *
 * @param {Array<object>} existing
 * @param {Array<{role: string, actorId: string}>} assignments
 * @returns {Array<object>}
 */
export function mergeTeamAssignments(existing = [], assignments = []) {
  const previous = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(assignments) ? assignments : [];
  const merged = previous.map((member) => ({ ...member }));
  for (const assignment of incoming) {
    const index = merged.findIndex((member) => member.role === assignment.role && member.actorId === assignment.actorId);
    const row = { ...assignment };
    if (index === -1) merged.push(row);
    else merged[index] = { ...merged[index], ...row };
  }
  return merged;
}
