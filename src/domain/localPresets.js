import {
  createWorkpaperDraft,
  replaceAccountingSource,
  resetScenario,
  scenario,
  selectEngagement,
  setActivePersona,
} from './scenario.js'
import { replacementFixture } from './accounting.js'

export const LOCAL_SCENARIO_PRESETS = Object.freeze([
  { key: 'CLEAN_START', label: 'Clean start', description: 'Restore the opening queue and start from the first handoff.', engagementId: 'ENG-0018-AUD-2026' },
  { key: 'CLIENT_ACTION_REQUIRED', label: 'Client action required', description: 'Open the client evidence and management response handoffs.', engagementId: 'ENG-0018-AUD-2026' },
  { key: 'ACCOUNTING_PREPARATION', label: 'Accounting preparation', description: 'Open the accounting package with the source and mapping work visible.', engagementId: 'ENG-0018-ACC-2026' },
  { key: 'MANAGER_REVIEW', label: 'Manager review', description: 'Leave a workpaper snapshot ready for an audit manager review.', engagementId: 'ENG-0018-AUD-2026' },
  { key: 'PARTNER_EQR_REVIEW', label: 'Partner / EQR review', description: 'Show the final professional review and EQR handoff.', engagementId: 'ENG-0018-AUD-2026' },
  { key: 'READY_FOR_RELEASE', label: 'Ready for release', description: 'Open the positive accounting candidate at the release boundary.', engagementId: 'ENG-0009-ACC-2026' },
])

function result(outcome, data = null, code = '', message = '') {
  return { ok: outcome === 'COMMITTED', outcome, data, code, message }
}
/**
 * Reset + replay a deterministic, browser-local walkthrough focus. Commands
 * are intentionally reused from the domain contract; no status fields are
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
  // Some presenters may not be assigned to the positive accounting fixture;
  // use the administrator as the scoped selector while preserving sign-in.
  if (selected.outcome !== 'COMMITTED') {
    setActivePersona('admin-demo')
    const fallback = selectEngagement(preset.engagementId, { actorPersonaId: 'admin-demo' })
    setActivePersona(preservedPersona)
    if (fallback.outcome !== 'COMMITTED') return result('REJECTED', null, 'PRESET_SCOPE_FAILED', fallback.message || 'The selected engagement is unavailable.')
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
  if (preset.key === 'MANAGER_REVIEW') {
    const command = createWorkpaperDraft({
      engagementId: preset.engagementId,
      actorPersonaId: 'audit-senior-demo',
      expectedSessionEpoch: 1,
      idempotencyKey: 'local-preset-manager-review-v1',
      title: 'Manager review walkthrough snapshot',
      procedureId: 'AR-VAL-01',
      reviewerActorId: 'ACT-OMAR',
      detail: 'Deterministic review handoff created by the walkthrough preset.',
    })
    if (command.outcome !== 'COMMITTED') {
      resetScenario(); setActivePersona(preservedPersona)
      return result('REJECTED', null, 'PRESET_APPLY_FAILED', command.message || 'Manager review could not be staged.')
    }
  }
  setActivePersona(preservedPersona)
  return result('COMMITTED', { ...preset, personaId: preservedPersona, engagementId: scenario.selectedEngagementId })
}
