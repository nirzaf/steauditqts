import { LEGACY_LOCAL_STATE_KEY, LOCAL_STATE_KEY } from './localState.js';
import { resetScenario, scenario, setActivePersona } from './domain/scenario.js';
import { clearDemoSession } from './auth.js';

/**
 * Demo-only reset. Clears the synthetic scenario plus browser-local drafts
 * (comments / preferences / profiles) while keeping the signed-in persona
 * so a tester can immediately re-run the tour.
 * Returns a short human-readable summary for toasts.
 */
export function resetDemoData() {
  // resetScenario() intentionally restores the canonical seed, whose default
  // active persona is admin-demo. Preserve the caller's current demo persona
  // so the shell, role projection, and domain command context remain aligned
  // after a restart that deliberately keeps the user signed in.
  const activePersonaId = scenario?.activePersonaId || null;
  try { resetScenario(); } catch { /* scenario reset is best-effort */ }
  try { if (activePersonaId) setActivePersona(activePersonaId); } catch { /* fall back to the reset seed persona */ }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LOCAL_STATE_KEY);
      window.localStorage.removeItem(LEGACY_LOCAL_STATE_KEY);
    }
  } catch { /* storage may be unavailable in private mode */ }
  return 'Demo data reset. Scenario and local drafts cleared; you are still signed in.';
}

export function hardResetDemo() {
  resetDemoData();
  try { clearDemoSession(); } catch { /* ignore */ }
}
