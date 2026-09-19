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
