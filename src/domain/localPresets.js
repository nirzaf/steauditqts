import {
  assignEngagementTeam,
  clearReviewPoint,
  createLead,
  createWorkpaperDraft,
  qualifyLead,
  recordAssessmentDecision,
  recordCompletionRecommendation,
  recordSeniorReview,
  replaceAccountingSource,
  resetScenario,
  scenario,
  selectEngagement,
  setActivePersona,
  submitWorkpaper,
} from './scenario.js'
import { replacementFixture } from './accounting.js'

/**
 * LOCAL_SCENARIO_PRESETS — The full lifecycle-covering preset catalogue.
 *
 * Presets are grouped into three layers:
 *   - Relationship lifecycle (lead through acceptance)
 *   - Engagement lifecycle (commercial through release)
 *   - Negative demo paths (blocked / stale scenarios)
 *
 * Each preset is deterministic: applying the same key twice produces the same
 * state. No status fields are patched directly; domain commands are used.
 */
export const LOCAL_SCENARIO_PRESETS = Object.freeze([
  // ── Relationship lifecycle ─────────────────────────────────────────────────
  {
    key: 'NEW_LEAD',
    label: 'New lead',
    group: 'Relationship',
    description: 'Show the CRM pipeline with a fresh lead in PENDING state awaiting qualification.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'QUALIFIED_LEAD',
    label: 'Qualified lead',
    group: 'Relationship',
    description: 'Show a qualified lead ready for conversion to a client record.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'ACCEPTANCE_PENDING',
    label: 'Acceptance pending',
    group: 'Relationship',
    description: 'Show a converted client awaiting partner acceptance decision.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  // ── Engagement lifecycle ────────────────────────────────────────────────────
  {
    key: 'CLEAN_START',
    label: 'Clean start',
    group: 'Engagement',
    description: 'Restore the opening queue and start from the first engagement handoff.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'CLIENT_ACTION_REQUIRED',
    label: 'Client action required',
    group: 'Engagement',
    description: 'Open the client evidence and management response handoffs.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'STAFFING_READY',
    label: 'Staffing ready',
    group: 'Engagement',
    description: 'Show the team assignment panel with a complete staffing profile ready to START AUDIT.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'AUDIT_COMMENCED',
    label: 'Audit commenced',
    group: 'Engagement',
    description: 'Show an engagement that has been formally commenced with team assigned and audit announced.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'ACCOUNTING_PREPARATION',
    label: 'Accounting preparation',
    group: 'Engagement',
    description: 'Open the accounting package with the source and mapping work visible.',
    engagementId: 'ENG-0018-ACC-2026',
  },
  {
    key: 'SENIOR_REVIEW_IN_PROGRESS',
    label: 'Senior review in progress',
    group: 'Engagement',
    description: 'Show workpapers submitted and Senior review partially complete.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'MANAGER_REVIEW',
    label: 'Manager review',
    group: 'Engagement',
    description: 'Show all workpapers senior-cleared and the audit file ready for Manager completion.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'READY_FOR_PARTNER',
    label: 'Ready for Partner',
    group: 'Engagement',
    description: 'Show Manager completion done, awaiting Partner review and opinion.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'PARTNER_EQR_REVIEW',
    label: 'Partner / EQR review',
    group: 'Engagement',
    description: 'Show the final professional review and EQR handoff.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'READY_FOR_RELEASE',
    label: 'Ready for release',
    group: 'Release',
    description: 'Show the positive accounting candidate at the release boundary.',
    engagementId: 'ENG-0009-ACC-2026',
  },
  // ── Negative demo paths (blocked / stale scenarios) ─────────────────────────
  {
    key: 'RELEASE_BLOCKED',
    label: 'Release blocked',
    group: 'Negative',
    description: 'Show how the portal blocks a premature release attempt when Senior review is incomplete.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'STAFFING_BLOCKED',
    label: 'Staffing blocked',
    group: 'Negative',
    description: 'Show the START AUDIT gate blocked because the team is missing required roles.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'ACCEPTANCE_DECLINED',
    label: 'Acceptance declined',
    group: 'Negative',
    description: 'Show a declined client acceptance and the engagement status after a DECLINE decision.',
    engagementId: 'ENG-0018-AUD-2026',
  },
  {
    key: 'ROLE_MISMATCH',
    label: 'Role mismatch',
    group: 'Negative',
    description: 'Demonstrate ACTOR_ROLE_MISMATCH when a preparer is erroneously assigned as Audit Senior.',
    engagementId: 'ENG-0018-AUD-2026',
  },
])

function result(outcome, data = null, code = '', message = '') {
  return { ok: outcome === 'COMMITTED', outcome, data, code, message }
}

/**
 * Helper — resolve and log a domain command result without halting
 * for blocked results when `allowBlocked` is true.
 */
function applyCommand(command, { allowBlocked = false, label = '' } = {}) {
  if (!command || (!['COMMITTED', 'CONFLICT'].includes(command.outcome) && !(allowBlocked && command.outcome === 'BLOCKED'))) {
    return { ok: false, code: command?.code || 'PRESET_APPLY_FAILED', message: `${label}: ${command?.message || 'Command failed'}` }
  }
  return { ok: true }
}

/**
 * Reset + replay a deterministic, browser-local walkthrough focus.
 *
 * Every professional state a preset needs is reached through the same domain
 * commands a user triggers, so a preset can never fabricate a file condition the
 * application itself would refuse to record. Presets are async because
 * submitting a workpaper captures a real snapshot.
 */
export async function applyLocalPreset(presetKey, { personaId = scenario.activePersonaId } = {}) {
  const preset = LOCAL_SCENARIO_PRESETS.find((item) => item.key === presetKey)
  if (!preset) return result('REJECTED', null, 'PRESET_NOT_FOUND', 'Choose one of the supported walkthrough focuses.')

  const preservedPersona = personaId || 'admin-demo'
  const reset = resetScenario()
  if (reset.outcome !== 'COMMITTED') return result('REJECTED', null, 'PRESET_RESET_FAILED', reset.message || 'The scenario could not be restored.')
  setActivePersona(preservedPersona)

  const selected = selectEngagement(preset.engagementId, { actorPersonaId: preservedPersona })
  if (selected.outcome !== 'COMMITTED') {
    setActivePersona('admin-demo')
    const fallback = selectEngagement(preset.engagementId, { actorPersonaId: 'admin-demo' })
    setActivePersona(preservedPersona)
    if (fallback.outcome !== 'COMMITTED') return result('REJECTED', null, 'PRESET_SCOPE_FAILED', fallback.message || 'The selected engagement is unavailable.')
  }

  // ── Relationship presets ───────────────────────────────────────────────────

  if (preset.key === 'NEW_LEAD') {
    createLead({
      name: 'Doha New Lead Co',
      company: 'Doha New Lead W.L.L.',
      email: 'cfo@dohanewidemo.demo',
      value: '85000',
      service: 'Financial-statement audit',
      source: 'Referral',
      actorPersonaId: preservedPersona,
      idempotencyKey: 'preset-new-lead-v1',
    })
  }

  if (preset.key === 'QUALIFIED_LEAD') {
    const leadRes = createLead({
      name: 'Ras Laffan Marine',
      company: 'Ras Laffan Marine W.L.L.',
      email: 'cfo@rlmarine.demo',
      value: '110000',
      service: 'Financial-statement audit',
      source: 'Conference',
      actorPersonaId: preservedPersona,
      idempotencyKey: 'preset-qualified-lead-v1',
    })
    if (leadRes.outcome === 'COMMITTED') {
      qualifyLead({ leadId: leadRes.data.id, actorPersonaId: preservedPersona, idempotencyKey: 'preset-qualified-lead-qualify-v1' })
    }
  }

  if (preset.key === 'ACCEPTANCE_PENDING') {
    // Just navigate to the default engagement with an unaccepted acceptance
    // (the fixture already has a blank acceptance case)
  }

  // ── Engagement presets ─────────────────────────────────────────────────────

  if (preset.key === 'STAFFING_READY' || preset.key === 'AUDIT_COMMENCED') {
    assignEngagementTeam({
      engagementId: preset.engagementId,
      actorPersonaId: 'admin-demo',
      idempotencyKey: `preset-${preset.key}-staffing-v1`,
      assignments: [
        { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '20', responsibility: 'Engagement leadership' },
        { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '35', responsibility: 'Senior detailed review' },
        { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '25', responsibility: 'File completion and consultation' },
        { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '50', responsibility: 'Workpaper preparation' },
        { role: 'eqr_reviewer', actorId: 'ACT-YUSUF', plannedHours: '10', responsibility: 'Quality review' },
        { role: 'accounting_reviewer', actorId: 'ACT-LEILA', plannedHours: '12', responsibility: 'Accounting package review' },
      ],
    })
  }

  if (preset.key === 'ACCOUNTING_PREPARATION') {
    const command = replaceAccountingSource({
      engagementId: preset.engagementId,
      actorPersonaId: 'accountant-demo',
      expectedRevision: scenario.engagements.find((entry) => entry.id === preset.engagementId)?.revision,
      idempotencyKey: 'local-preset-accounting-preparation-v1',
      sourceId: 'TB-LOCAL-PRESET-001',
      sourceLabel: 'TB v03 · prepared walkthrough source',
      rows: replacementFixture,
    })
    if (!['COMMITTED', 'BLOCKED'].includes(command.outcome)) {
      resetScenario(); setActivePersona(preservedPersona)
      return result('REJECTED', null, 'PRESET_APPLY_FAILED', command.message || 'Accounting preparation could not be staged.')
    }
  }

  if (['SENIOR_REVIEW_IN_PROGRESS', 'MANAGER_REVIEW', 'READY_FOR_PARTNER', 'PARTNER_EQR_REVIEW', 'RELEASE_BLOCKED'].includes(preset.key)) {
    // For these presets, establish a complete staffing profile first
    assignEngagementTeam({
      engagementId: preset.engagementId,
      actorPersonaId: 'admin-demo',
      idempotencyKey: `preset-${preset.key}-staffing-v1`,
      assignments: [
        { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '20', responsibility: 'Engagement leadership' },
        { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '35', responsibility: 'Senior detailed review' },
        { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '25', responsibility: 'File completion and consultation' },
        { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '50', responsibility: 'Workpaper preparation' },
        { role: 'eqr_reviewer', actorId: 'ACT-YUSUF', plannedHours: '10', responsibility: 'Quality review' },
        { role: 'accounting_reviewer', actorId: 'ACT-LEILA', plannedHours: '12', responsibility: 'Accounting package review' },
      ],
    })
  }

  if (preset.key === 'MANAGER_REVIEW') {
    const wpResult = createWorkpaperDraft({
      engagementId: preset.engagementId,
      actorPersonaId: 'audit-senior-demo',
      expectedSessionEpoch: 1,
      idempotencyKey: 'local-preset-manager-review-v1',
      title: 'Manager review walkthrough snapshot',
      procedureId: 'AR-VAL-01',
      reviewerActorId: 'ACT-OMAR',
      detail: 'Deterministic review handoff created by the walkthrough preset.',
    })
    if (wpResult.outcome !== 'COMMITTED') {
      resetScenario(); setActivePersona(preservedPersona)
      return result('REJECTED', null, 'PRESET_APPLY_FAILED', wpResult.message || 'Manager review could not be staged.')
    }
  }

  if (preset.key === 'SENIOR_REVIEW_IN_PROGRESS' || preset.key === 'MANAGER_REVIEW' || preset.key === 'RELEASE_BLOCKED') {
    // Submit the seeded workpapers through the domain command, so every snapshot
    // a later review points at really exists.
    const engagementWps = (scenario.workpapers || []).filter((wp) => wp.engagementId === preset.engagementId)
    for (const wp of engagementWps) {
      if (wp.state !== 'DRAFT') continue
      const submitted = await submitWorkpaper({
        workpaperId: wp.id,
        actorPersonaId: 'preparer-demo',
        expectedRevision: wp.revision,
        expectedSessionEpoch: 1,
        content: `Preset ${preset.key} evidence for ${wp.title || wp.id}`,
        idempotencyKey: `preset-submit-${wp.id}-v1`,
      })
      const handled = applyCommand(submitted, { label: 'workpaper submission' })
      if (!handled.ok) {
        resetScenario(); setActivePersona(preservedPersona)
        return result('REJECTED', null, handled.code, handled.message)
      }
    }
    // For MANAGER_REVIEW: senior-clear all; for SENIOR_REVIEW_IN_PROGRESS and
    // RELEASE_BLOCKED: leave the review outstanding, which is the demo point.
    if (preset.key === 'MANAGER_REVIEW') {
      for (const wp of engagementWps.filter((entry) => entry.state !== 'DRAFT')) {
        recordSeniorReview({
          engagementId: preset.engagementId,
          workpaperId: wp.id,
          actorPersonaId: 'audit-senior-demo',
          decision: 'PASSED',
          notes: 'Senior review complete — preset walkthrough.',
          idempotencyKey: `preset-senior-review-${wp.id}-v1`,
        })
      }
    }
  }

  if (['READY_FOR_PARTNER', 'PARTNER_EQR_REVIEW'].includes(preset.key)) {
    // Submit, senior-clear and resolve review points, then record the manager
    // recommendation with the command that enforces those same prerequisites.
    const engagementWps = (scenario.workpapers || []).filter((wp) => wp.engagementId === preset.engagementId)
    for (const wp of engagementWps) {
      if (wp.state === 'DRAFT') {
        const submitted = await submitWorkpaper({
          workpaperId: wp.id,
          actorPersonaId: 'preparer-demo',
          expectedRevision: wp.revision,
          expectedSessionEpoch: 1,
          content: `Preset ${preset.key} evidence for ${wp.title || wp.id}`,
          idempotencyKey: `preset-submit-${wp.id}-rp-v1`,
        })
        const handled = applyCommand(submitted, { label: 'workpaper submission' })
        if (!handled.ok) {
          resetScenario(); setActivePersona(preservedPersona)
          return result('REJECTED', null, handled.code, handled.message)
        }
      }
      recordSeniorReview({
        engagementId: preset.engagementId,
        workpaperId: wp.id,
        actorPersonaId: 'audit-senior-demo',
        decision: 'PASSED',
        notes: 'Preset: senior-cleared.',
        idempotencyKey: `preset-sr-${wp.id}-rp-v1`,
      })
    }
    for (const point of (scenario.reviews || []).filter((entry) => entry.engagementId === preset.engagementId && entry.status !== 'CLEARED')) {
      const cleared = clearReviewPoint({
        pointId: point.id,
        actorPersonaId: 'independent-reviewer-demo',
        expectedRevision: point.revision,
        expectedSessionEpoch: 1,
        response: 'Preset walkthrough: independently re-performed; the supporting evidence is attached to the current snapshot.',
        idempotencyKey: `preset-clear-${point.id}-v1`,
      })
      const handled = applyCommand(cleared, { label: 'review point clearance' })
      if (!handled.ok) {
        resetScenario(); setActivePersona(preservedPersona)
        return result('REJECTED', null, handled.code, handled.message)
      }
    }
    const recommended = recordCompletionRecommendation({
      engagementId: preset.engagementId,
      actorPersonaId: 'audit-manager-demo',
      expectedSessionEpoch: 1,
      decision: 'RECOMMEND',
      rationale: 'Preset walkthrough: every submitted workpaper is senior-cleared and all review points are resolved against the current package.',
      idempotencyKey: `preset-completion-${preset.key}-v1`,
    })
    const handled = applyCommand(recommended, { label: 'manager completion recommendation' })
    if (!handled.ok) {
      resetScenario(); setActivePersona(preservedPersona)
      return result('REJECTED', null, handled.code, handled.message)
    }
  }

  // ── Acceptance presets ─────────────────────────────────────────────────────

  if (preset.key === 'ACCEPTANCE_DECLINED') {
    // Record the decline through the acceptance decision command, so the declining
    // partner, rationale and revision are the real command's output.
    const assessment = scenario.assessments?.find((a) => a.engagementId === preset.engagementId && a.type === 'acceptance')
    if (assessment) {
      const declined = recordAssessmentDecision({
        engagementId: preset.engagementId,
        type: 'acceptance',
        actorPersonaId: 'partner-demo',
        expectedRevision: assessment.revision,
        expectedSessionEpoch: 1,
        decision: 'DECLINE',
        rationale: 'Conflict of interest identified during pre-acceptance review. Engagement declined per independence policy.',
        idempotencyKey: `preset-${preset.key}-decision-v1`,
      })
      const handled = applyCommand(declined, { label: 'acceptance decision' })
      if (!handled.ok) {
        resetScenario(); setActivePersona(preservedPersona)
        return result('REJECTED', null, handled.code, handled.message)
      }
    }
  }

  // ── Negative path: staffing blocked ────────────────────────────────────────

  if (preset.key === 'STAFFING_BLOCKED') {
    // Replace the roster with only a preparer — no partner, senior or manager.
    // Merging would silently keep the seeded profile and the demo would show a
    // team that is not actually blocked.
    assignEngagementTeam({
      engagementId: preset.engagementId,
      actorPersonaId: 'admin-demo',
      replaceRoster: true,
      idempotencyKey: `preset-${preset.key}-partial-v1`,
      assignments: [
        { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40', responsibility: 'Incomplete team for demo' },
      ],
    })
  }

  setActivePersona(preservedPersona)
  return result('COMMITTED', { ...preset, personaId: preservedPersona, engagementId: scenario.selectedEngagementId })
}
