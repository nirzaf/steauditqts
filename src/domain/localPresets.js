import {
  assignEngagementTeam,
  createLead,
  createWorkpaperDraft,
  qualifyLead,
  recordAssessmentDecision,
  recordSeniorReview,
  replaceAccountingSource,
  resetScenario,
  scenario,
  selectEngagement,
  setActivePersona,
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
 * Commands are reused from the domain contract; no status fields are
 * patched directly by the preset layer.
 */
export function applyLocalPreset(presetKey, { personaId = scenario.activePersonaId } = {}) {
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

  if (preset.key === 'SENIOR_REVIEW_IN_PROGRESS' || preset.key === 'MANAGER_REVIEW') {
    // Submit existing workpapers so that senior review is meaningful
    const engagementWps = (scenario.workpapers || []).filter((wp) => wp.engagementId === preset.engagementId)
    for (const wp of engagementWps) {
      if (wp.state === 'DRAFT') {
        wp.state = 'SUBMITTED'
        wp.submittedSnapshotId = `SNAP-${wp.id}-PRESET`
        wp.submittedBy = 'ACT-OMAR-SENIOR'
        wp.submittedAt = new Date().toISOString()
      }
    }
    // For MANAGER_REVIEW: senior-clear all; for SENIOR_REVIEW_IN_PROGRESS: clear only first
    if (preset.key === 'MANAGER_REVIEW') {
      for (const wp of engagementWps.filter((wp) => wp.state !== 'DRAFT')) {
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
    // Submit and senior-clear all workpapers, then set manager completion marker
    const engagementWps = (scenario.workpapers || []).filter((wp) => wp.engagementId === preset.engagementId)
    for (const wp of engagementWps) {
      wp.state = 'SUBMITTED'
      wp.submittedSnapshotId = `SNAP-${wp.id}-PRESET`
      recordSeniorReview({
        engagementId: preset.engagementId,
        workpaperId: wp.id,
        actorPersonaId: 'audit-senior-demo',
        decision: 'PASSED',
        notes: 'Preset: senior-cleared.',
        idempotencyKey: `preset-sr-${wp.id}-rp-v1`,
      })
    }
    const eng = scenario.engagements.find((e) => e.id === preset.engagementId)
    if (eng) {
      eng.evidence.completionRecommendation = 'RECOMMEND_COMPLETE'
      eng.revision += 1
    }
  }

  if (preset.key === 'PARTNER_EQR_REVIEW') {
    const eng = scenario.engagements.find((e) => e.id === preset.engagementId)
    if (eng) {
      eng.evidence.eqrRequired = true
    }
  }

  // ── Acceptance presets ─────────────────────────────────────────────────────

  if (preset.key === 'ACCEPTANCE_DECLINED') {
    // Record a DECLINE decision on the acceptance assessment
    const assessment = scenario.assessments?.find((a) => a.engagementId === preset.engagementId && a.type === 'acceptance')
    if (assessment) {
      assessment.decision = {
        decision: 'DECLINE',
        rationale: 'Conflict of interest identified during pre-acceptance review. Engagement declined per independence policy.',
        actorId: 'ACT-MAYA',
        recordedAt: new Date().toISOString(),
        revision: assessment.revision,
      }
      assessment.revision += 1
    }
  }

  // ── Negative path: staffing blocked ────────────────────────────────────────

  if (preset.key === 'STAFFING_BLOCKED') {
    // Only assign a preparer — no partner, no senior, no manager
    assignEngagementTeam({
      engagementId: preset.engagementId,
      actorPersonaId: 'admin-demo',
      idempotencyKey: `preset-${preset.key}-partial-v1`,
      assignments: [
        { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '40', responsibility: 'Incomplete team for demo' },
      ],
    })
  }

  // ── Negative path: release blocked ────────────────────────────────────────

  if (preset.key === 'RELEASE_BLOCKED') {
    // Workpapers exist but are NOT senior-reviewed → Senior gate is open → release is blocked
    const eng = scenario.engagements.find((e) => e.id === preset.engagementId)
    if (eng) {
      eng.evidence.completionRecommendation = 'RECOMMEND_COMPLETE'
      // Do NOT clear senior review → this creates the blocked condition
    }
  }

  setActivePersona(preservedPersona)
  return result('COMMITTED', { ...preset, personaId: preservedPersona, engagementId: scenario.selectedEngagementId })
}
