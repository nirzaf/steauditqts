// P8A — Staffing rules shared by the browser-local domain (src/domain/scenario.js)
// and the shared Worker command boundary (worker/index.js).
//
// Pure functions only: no Vue, no Request/Response, no storage, no D1 imports.
// Both runtimes must enforce the SAME staffing contract so LOCAL_ONLY and
// SHARED_DEMO never diverge on who may be assigned or when an audit may start.

/**
 * Role-to-required-actor-role mapping for strict staffing validation.
 * An assignment of staffing role X is only valid when the target actor
 * actually holds one of the mapped actor roles.
 */
export const STAFFING_ROLE_REQUIREMENTS = Object.freeze({
  preparer: ['preparer'],
  audit_senior: ['audit_senior'],
  audit_manager: ['audit_manager'],
  engagement_partner: ['engagement_partner', 'signatory'],
  eqr_reviewer: ['eqr_reviewer'],
  accounting_reviewer: ['accounting_reviewer'],
})

export const STAFFING_ROLES = Object.freeze(Object.keys(STAFFING_ROLE_REQUIREMENTS))

/**
 * Validate a staffing hours value — must be a non-negative decimal with up to
 * two decimal places. Returns { hours } on success or { code, message }.
 */
export function validatePlannedHours(hours) {
  const raw = String(hours ?? '0').trim()
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) {
    return { code: 'HOURS_INVALID', message: `Planned hours "${raw}" must be a non-negative number with up to two decimals.` }
  }
  return { hours: raw }
}

/**
 * Validate that start date is not after end date when both are present.
 * Returns null when valid, otherwise { code, message }.
 */
export function validateDateRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) {
    return { code: 'DATE_RANGE_INVALID', message: `Start date ${startDate} cannot be after end date ${endDate}.` }
  }
  return null
}

/**
 * Validate one team assignment against a resolved actor record.
 *
 * @param {object} args
 * @param {string} args.role — engagement staffing role (e.g. 'audit_senior')
 * @param {object|null} args.actor — resolved actor { id, name, roles, active } or null when unknown
 * @returns {{ code: string, message: string } | null} — null when valid
 */
export function validateAssignmentActor({ role, actor } = {}) {
  if (!STAFFING_ROLES.includes(role)) {
    return { code: 'INVALID_ROLE', message: `Role "${role}" is not a recognized engagement staffing role.` }
  }
  if (!actor) {
    return { code: 'ACTOR_NOT_FOUND', message: 'The assigned actor was not found.' }
  }
  if (!actor.active) {
    return { code: 'ACTOR_INACTIVE', message: `Actor ${actor.name || actor.id} is not active and cannot be assigned to the engagement team.` }
  }
  const requiredActorRoles = STAFFING_ROLE_REQUIREMENTS[role] || []
  const actorHasRequiredRole = (actor.roles || []).some((r) => requiredActorRoles.includes(r))
  if (!actorHasRequiredRole) {
    return {
      code: 'ACTOR_ROLE_MISMATCH',
      message: `Actor ${actor.name || actor.id} does not hold the required role for ${role} (needs: ${requiredActorRoles.join(' or ')}).`,
    }
  }
  return null
}

/**
 * Derive precise staffing-profile blockers for audit commencement.
 *
 * Normal audit profile:
 *   Engagement Partner  — REQUIRED
 *   Audit Senior        — REQUIRED
 *   Audit Manager       — REQUIRED unless approved small-firm mode
 *   At least 1 Preparer — REQUIRED
 *   Accounting Reviewer — REQUIRED when an accounting package applies
 *   EQR Reviewer        — REQUIRED when EQR applies by policy
 *
 * @param {Array<{ role: string }>} team — assigned team members
 * @param {object} [options]
 * @param {boolean} [options.smallFirmMode] — approved small-firm mode waives the manager requirement
 * @param {boolean} [options.requiresAccountingReviewer] — accounting package is linked
 * @param {boolean} [options.eqrRequired] — EQR applies by policy
 * @returns {Array<{ code: string, message: string }>}
 */
export function staffingProfileBlockers(team, { smallFirmMode = false, requiresAccountingReviewer = false, eqrRequired = false } = {}) {
  const members = Array.isArray(team) ? team : []
  const has = (role) => members.some((m) => m && m.role === role)
  const blockers = []
  if (!has('engagement_partner')) {
    blockers.push({ code: 'PARTNER_REQUIRED', message: 'An Engagement Partner must be assigned before commencing the audit.' })
  }
  if (!has('audit_senior')) {
    blockers.push({ code: 'AUDIT_SENIOR_REQUIRED', message: 'An Audit Senior must be assigned before commencing the audit.' })
  }
  if (!has('audit_manager') && !smallFirmMode) {
    blockers.push({ code: 'AUDIT_MANAGER_REQUIRED', message: 'An Audit Manager must be assigned before commencing the audit. For small-firm engagements, set smallFirmMode: true.' })
  }
  if (!has('preparer')) {
    blockers.push({ code: 'PREPARER_REQUIRED', message: 'At least one Preparer must be assigned before commencing the audit.' })
  }
  if (requiresAccountingReviewer && !has('accounting_reviewer')) {
    blockers.push({ code: 'ACCOUNTING_REVIEWER_REQUIRED', message: 'An Accounting Technical Reviewer must be assigned because this engagement has a linked accounting package.' })
  }
  if (eqrRequired && !has('eqr_reviewer')) {
    blockers.push({ code: 'EQR_REVIEWER_REQUIRED', message: 'An EQR Reviewer must be assigned because engagement quality review applies to this engagement by policy.' })
  }
  return blockers
}
