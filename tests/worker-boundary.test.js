import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

const disabledEnv = {
  DB: { prepare() { throw new Error('DB must not be touched while shared mode is disabled') } },
  SHARED_DEMO_ENABLED: 'false',
  SHARED_DEMO_IDENTITY_MODE: 'disabled',
  SHARED_DEMO_BINDING: 'none',
}

test('public health exposes mode and evidence without client records', async () => {
  const response = await worker.fetch(new Request('https://ste.quadrate.lk/api/health'), disabledEnv)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.mode, 'local-only')
  assert.equal(body.sharedDemoEnabled, false)
  assert.equal(body.evidenceLevel, 'SIMULATION')
  assert.equal('comments' in body, false)
  assert.equal('profile' in body, false)
})

test('legacy data routes fail closed without trusted shared-demo configuration', async () => {
  const response = await worker.fetch(new Request('https://ste.quadrate.lk/api/comments?engagementId=ENG-A&pageKey=home'), disabledEnv)
  const body = await response.json()
  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'SHARED_DEMO_DISABLED')
  assert.equal(body.evidenceLevel, 'SIMULATION')
  assert.ok(body.error.correlationId)
})

