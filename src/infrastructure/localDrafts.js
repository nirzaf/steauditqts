// M7 STATE-03 — isolated, allow-listed drafts.
// Drafts are convenience state only. They are never used for authentication,
// approvals, credentials, gate status or authoritative workflow projections.

const PREFIX = 'auditflow-draft-v3:'
const MAX_BYTES = 64_000
const ID = /^[A-Za-z0-9_-]{1,80}$/

function draftKey(scope = {}) {
  const values = ['runId', 'generationId', 'actorId', 'engagementId', 'formId'].map((key) => scope[key])
  if (values.some((value) => typeof value !== 'string' || !ID.test(value))) {
    throw new TypeError('Every draft scope field must be a valid ID.')
  }
  return PREFIX + values.map(encodeURIComponent).join(':')
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength
}

export function createDraftStore(storage, allowedFieldsByForm = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A storage implementation is required.')
  }
  const failure = (error) => ({ ok: false, outcome: 'UNAVAILABLE', code: 'DRAFT_STORAGE_ERROR', message: error?.message || 'Draft storage failed.' })

  return {
    save(scope, values = {}, baseRevision) {
      try {
        const fields = allowedFieldsByForm[scope?.formId]
        if (!Array.isArray(fields) || !Number.isSafeInteger(baseRevision) || baseRevision < 1) throw new TypeError('Unsupported draft form or revision.')
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Draft values must be an object.')
        const clean = {}
        for (const name of fields) {
          if (Object.hasOwn(values, name)) {
            if (typeof values[name] !== 'string') throw new TypeError('Draft fields must be text.')
            clean[name] = values[name]
          }
        }
        const safeScope = Object.fromEntries(['runId', 'generationId', 'actorId', 'engagementId', 'formId'].map((key) => [key, scope[key]]))
        const record = { version: 3, scope: safeScope, baseRevision, values: clean, savedAt: new Date().toISOString() }
        const raw = JSON.stringify(record)
        if (byteLength(raw) > MAX_BYTES) throw new RangeError('Draft is too large.')
        storage.setItem(draftKey(scope), raw)
        return { ok: true, outcome: 'SAVED_LOCAL_DRAFT', savedAt: record.savedAt, scope: safeScope, baseRevision }
      } catch (error) {
        return failure(error)
      }
    },

    load(scope, currentRevision) {
      try {
        if (!Number.isSafeInteger(currentRevision) || currentRevision < 1) throw new TypeError('A current revision is required.')
        const raw = storage.getItem(draftKey(scope))
        if (raw == null) return { ok: true, outcome: 'NO_DRAFT', draft: null, stale: false }
        if (byteLength(raw) > MAX_BYTES) throw new RangeError('Draft is too large.')
        const record = JSON.parse(raw)
        if (record?.version !== 3 || draftKey(record.scope) !== draftKey(scope)
          || !Number.isSafeInteger(record.baseRevision) || record.baseRevision < 1
          || !record.values || typeof record.values !== 'object' || Array.isArray(record.values)) {
          throw new TypeError('Unsupported or malformed draft. Original storage was not changed.')
        }
        const fields = allowedFieldsByForm[scope.formId]
        if (!Array.isArray(fields) || Object.entries(record.values).some(([key, value]) => !fields.includes(key) || typeof value !== 'string')) {
          throw new TypeError('Invalid fields in stored draft.')
        }
        return { ok: true, outcome: 'DRAFT_LOADED', draft: record, stale: record.baseRevision !== currentRevision }
      } catch (error) {
        return failure(error)
      }
    },

    remove(scope) {
      try {
        storage.removeItem(draftKey(scope))
        return { ok: true, outcome: 'DRAFT_REMOVED' }
      } catch (error) {
        return failure(error)
      }
    },
  }
}

export { draftKey as getDraftStorageKey, MAX_BYTES as MAX_DRAFT_BYTES }

