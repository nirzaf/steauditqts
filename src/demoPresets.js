// P0.3 — LOCAL_ONLY curated scenario presets. The Worker preset system
// remains authoritative for SHARED_DEMO; these 7 lenses cover the default
// browser-local demonstration without reproducing it.
//
// Principle: resetScenario() + existing domain commands (selectEngagement)
// to reach a known state. Never mutate arbitrary status fields.
import { resetScenario, scenario, selectEngagement } from './domain/scenario.js'

export const LOCAL_DEMO_PRESETS = Object.freeze([
  { key: 'clean-start', label: 'Clean Start', description: 'Reset to the deterministic fixture and open acceptance.', engagementId: 'ENG-0018-AUD-2026', routeKey: 'clients', recordId: null, resetFirst: true },
  { key: 'waiting-client', label: 'Waiting for Client', description: 'PBC inbox with the exact request needing a receipt.', engagementId: 'ENG-0018-AUD-2026', routeKey: 'pbc', recordId: 'PBC-019', resetFirst: false },
  { key: 'accounting-prep', label: 'Accounting Preparation', description: 'TB workspace on the accounting handoff engagement.', engagementId: 'ENG-0018-ACC-2026', routeKey: 'accounting', recordId: null, resetFirst: false },
  { key: 'manager-review', label: 'Manager Review', description: 'Review queue with the blocking point selected.', engagementId: 'ENG-0018-AUD-2026', routeKey: 'reviews', recordId: 'RP-048', resetFirst: false },
  { key: 'partner-eqr', label: 'Partner / EQR Review', description: 'Approval center on the partner handoff.', engagementId: 'ENG-0018-AUD-2026', routeKey: 'reviews', recordId: null, resetFirst: false },
  { key: 'ready-release', label: 'Ready for Release', description: 'Release candidate with blockers visible.', engagementId: 'ENG-0018-AUD-2026', routeKey: 'release', recordId: null, resetFirst: false },
  { key: 'completed', label: 'Completed', description: 'Closed accounting engagement as the done state.', engagementId: 'ENG-0009-ACC-2026', routeKey: 'release', recordId: null, resetFirst: false },
])

export function getDemoPresets(mode = 'local') {
  if (String(mode).toLowerCase() === 'shared') return []
  return [...LOCAL_DEMO_PRESETS]
}

export function getLocalPreset(key) {
  return LOCAL_DEMO_PRESETS.find((p) => p.key === String(key)) || null
}

// Apply a LOCAL_ONLY preset. Returns { ok, engagementId, routeKey, recordId, didReset }
// for the caller (App.vue) to switch context + navigate. Uses only
// resetScenario + selectEngagement so domain rules stay intact.
export function applyDemoPreset({ preset: presetKey, engagementId: overrideEngagementId = null, resetFirst = null } = {}) {
  const preset = getLocalPreset(presetKey)
  if (!preset) return { ok: false, error: { code: 'PRESET_NOT_FOUND', message: `Unknown local preset ${String(presetKey)}.` } }
  const shouldReset = resetFirst != null ? Boolean(resetFirst) : Boolean(preset.resetFirst)
  let didReset = false
  try {
    if (shouldReset) { resetScenario(); didReset = true }
    const targetEngagement = String(overrideEngagementId || preset.engagementId)
    const found = (scenario.engagements || []).some((e) => e.id === targetEngagement)
    const finalEngagement = found ? targetEngagement : (scenario.engagements[0]?.id || targetEngagement)
    try { selectEngagement(finalEngagement, {}) } catch { /* selection is best-effort; refresh corrects */ }
    return { ok: true, engagementId: finalEngagement, routeKey: preset.routeKey, recordId: preset.recordId || null, didReset, preset }
  } catch (error) {
    return { ok: false, error: { code: 'PRESET_FAILED', message: error?.message || 'The local preset could not be applied.' } }
  }
}
