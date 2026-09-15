// M7 STATE-03 — form-scoped local drafts for shared demo forms.
// Wraps infrastructure/localDrafts.js: only allow-listed free-text fields are
// ever persisted (never decision values, tokens or gate state), the storage
// scope key prevents cross-actor/cross-generation inheritance, and storage
// failures stay visible at form level instead of faking a committed save.
import { createDraftStore } from '../infrastructure/localDrafts.js'

const DRAFT_ID = /^[A-Za-z0-9_-]{1,80}$/

function validScope(scope) {
  return ['runId', 'generationId', 'actorId', 'engagementId', 'formId'].every((key) => typeof scope?.[key] === 'string' && DRAFT_ID.test(scope[key]));
}

/**
 * Build a draft store bound to one page's allow-list. Returns null when no
 * storage is available (for example server-side rendering or tests without
 * a DOM); callers must treat a null store as "drafts disabled", never as a
 * silent failure.
 */
export function useDraftForms(allowedFieldsByForm, storage = null) {
  let impl = storage;
  if (!impl) {
    try { impl = typeof localStorage !== 'undefined' ? localStorage : null } catch { impl = null }
  }
  if (!impl) return null;
  let store = null;
  try { store = createDraftStore(impl, allowedFieldsByForm) } catch { return null }

  return {
    save(scope, values, baseRevision) {
      if (!validScope(scope)) return { ok: false, outcome: 'UNAVAILABLE', code: 'DRAFT_SCOPE_INVALID', message: 'Draft scope is incomplete; local drafts stay disabled until the shared context loads.' };
      return store.save(scope, values, baseRevision);
    },
    restore(scope, currentRevision) {
      if (!validScope(scope) || !Number.isSafeInteger(Number(currentRevision)) || Number(currentRevision) < 1) {
        return { ok: true, outcome: 'NO_DRAFT', draft: null, stale: false };
      }
      return store.load(scope, Number(currentRevision));
    },
    clear(scope) {
      if (!validScope(scope)) return { ok: true, outcome: 'DRAFT_REMOVED' };
      return store.remove(scope);
    },
  };
}
