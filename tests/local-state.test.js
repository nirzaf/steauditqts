import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_LOCAL_STATE_KEY,
  LOCAL_STATE_KEY,
  LOCAL_STATE_VERSION,
  commentsFor,
  profileFor,
  readLocalState,
  writeLocalState,
} from '../src/localState.js'

class FakeStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.failRead = false; this.failWrite = false }
  getItem(key) { if (this.failRead) throw new Error('read blocked'); return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { if (this.failWrite) throw new Error('quota'); this.values.set(key, String(value)) }
}

test('migrates v1 profile without losing scope, comments, or submittedAt', () => {
  const submittedAt = '2026-09-01T10:00:00.000Z'
  const storage = new FakeStorage({
    [LEGACY_LOCAL_STATE_KEY]: JSON.stringify({
      profile: { engagementId: 'ENG-A', legalName: 'Northstar Trading', submittedAt },
      comments: [{ id: 'c1', engagementId: 'ENG-A', pageKey: 'client-home', createdAt: submittedAt }],
      preferences: [{ engagementId: 'ENG-A', stepKey: 'client-home', isOptional: false }],
    }),
  })

  const result = readLocalState(storage)
  assert.equal(result.error, null)
  assert.equal(result.migrated, true)
  assert.equal(result.state.version, LOCAL_STATE_VERSION)
  assert.equal(profileFor(result.state, 'ENG-A').submittedAt, submittedAt)
  assert.equal(commentsFor(result.state, 'ENG-A', 'client-home').length, 1)
  assert.ok(storage.getItem(LOCAL_STATE_KEY))
  // Migration is additive; the original v1 value remains recoverable.
  assert.ok(storage.getItem(LEGACY_LOCAL_STATE_KEY))
})

test('malformed state is reported instead of silently replaced', () => {
  const storage = new FakeStorage({ [LOCAL_STATE_KEY]: '{not-json' })
  const result = readLocalState(storage)
  assert.equal(result.state.version, LOCAL_STATE_VERSION)
  assert.equal(result.error.code, 'LOCAL_STATE_MALFORMED')
})

test('scoped profiles and comments do not cross engagements', () => {
  const storage = new FakeStorage()
  const state = {
    version: LOCAL_STATE_VERSION,
    profiles: {
      'ENG-A': { engagementId: 'ENG-A', legalName: 'Northstar Trading' },
      'ENG-B': { engagementId: 'ENG-B', legalName: 'Cedar Logistics' },
    },
    comments: [
      { id: 'a', engagementId: 'ENG-A', pageKey: 'pbc', createdAt: '2026-09-02' },
      { id: 'b', engagementId: 'ENG-B', pageKey: 'pbc', createdAt: '2026-09-03' },
    ],
    preferences: [],
    drafts: [],
  }
  writeLocalState(state, storage)
  const read = readLocalState(storage)
  assert.equal(profileFor(read.state, 'ENG-A').legalName, 'Northstar Trading')
  assert.equal(profileFor(read.state, 'ENG-B').legalName, 'Cedar Logistics')
  assert.deepEqual(commentsFor(read.state, 'ENG-A', 'pbc').map((item) => item.id), ['a'])
})

test('storage read failures retain an explicit error', () => {
  const storage = new FakeStorage()
  storage.failRead = true
  const result = readLocalState(storage)
  assert.equal(result.error.code, 'LOCAL_STORAGE_READ_FAILED')
})

