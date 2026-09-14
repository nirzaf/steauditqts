import test from 'node:test'
import assert from 'node:assert/strict'
import { LOCAL_STATE_KEY } from '../src/localState.js'

class FakeStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.failWrite = false }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { if (this.failWrite) throw new Error('quota'); this.values.set(key, String(value)) }
}

const storage = new FakeStorage()
global.window = { localStorage: storage }
let fetchCalls = 0
global.fetch = async () => { fetchCalls += 1; throw new Error('network should not be called in local-only mode') }

const api = await import('../src/api.js')

test('normal prototype mode is local-only and does not contact /api', async () => {
  assert.equal(api.isSharedDemoEnabled, false)
  assert.equal(api.demoStorageMode, 'LOCAL_ONLY')
  await api.saveClientProfile({ engagementId: 'ENG-A', legalName: 'Northstar Trading', registration: 'CR 1', contactName: 'Nadia', contactEmail: 'nadia@example.test', phone: '1', servicePeriod: '2026', serviceRequested: 'Audit' })
  await api.addWorkflowComment({ engagementId: 'ENG-A', pageKey: 'client-home', stepKey: 'client-home', authorName: 'Nadia', authorRole: 'Client contact', body: 'Local note' })
  const loaded = await api.loadClientProfile('ENG-A')
  assert.equal(loaded.profile.legalName, 'Northstar Trading')
  assert.equal(loaded.profile.submittedAt, loaded.profile.submittedAt)
  assert.equal(loaded.syncState, 'LOCAL_ONLY')
  assert.equal(loaded.evidenceLevel, 'SIMULATION')
  assert.equal(fetchCalls, 0)
})

test('intervening local writes preserve the profile and its original submittedAt', async () => {
  const first = await api.loadClientProfile('ENG-A')
  const submittedAt = first.profile.submittedAt
  await api.saveWorkflowPreference({ engagementId: 'ENG-A', stepKey: 'client-home', isOptional: true, updatedBy: 'Nadia' })
  await api.addWorkflowComment({ engagementId: 'ENG-A', pageKey: 'client-home', stepKey: 'client-home', authorName: 'Nadia', authorRole: 'Client contact', body: 'Second note' })
  const after = await api.loadClientProfile('ENG-A')
  assert.equal(after.profile.legalName, 'Northstar Trading')
  assert.equal(after.profile.submittedAt, submittedAt)
  assert.ok(JSON.parse(storage.getItem(LOCAL_STATE_KEY)).profiles['ENG-A'])
})

test('storage quota failure is not reported as a committed save', async () => {
  storage.failWrite = true
  const result = await api.saveWorkflowPreference({ engagementId: 'ENG-A', stepKey: 'client-home', isOptional: false, updatedBy: 'Nadia' })
  storage.failWrite = false
  assert.equal(result.outcome, 'UNAVAILABLE')
  assert.equal(result.preference, null)
  assert.equal(result.error.code, 'LOCAL_STORAGE_WRITE_FAILED')
})

test('HTTP denial, validation, and conflict metadata remain distinguishable', () => {
  const cases = [
    [400, 'BAD_REQUEST', 'VALIDATION_FAILED'],
    [401, 'AUTHENTICATION_REQUIRED', 'AUTHENTICATION_REQUIRED'],
    [403, 'ACCESS_DENIED', 'ACCESS_DENIED'],
    [409, 'REVISION_CONFLICT', 'REVISION_CONFLICT'],
  ]
  for (const [status, fallbackCode, expectedCode] of cases) {
    const response = { status, headers: new Headers({ 'X-Correlation-Id': `corr-${status}` }) }
    const payload = { ok: false, error: { code: status === 400 ? 'VALIDATION_FAILED' : status === 401 ? 'AUTHENTICATION_REQUIRED' : undefined, message: `status ${status}` } }
    const error = api.apiErrorFromResponse(response, payload, `request-${status}`)
    assert.equal(error.status, status)
    assert.equal(error.code, expectedCode || fallbackCode)
    assert.equal(error.correlationId, `corr-${status}`)
  }
})
