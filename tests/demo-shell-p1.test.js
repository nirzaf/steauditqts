// P0.3/P0.4/P1.1 coverage: local presets, local projections, record location.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getDemoPresets, getLocalPreset, applyDemoPreset, LOCAL_DEMO_PRESETS } from '../src/demoPresets.js'
import { localTaskProjection, localActivityProjection, localOutboxProjection, buildNotifications, mapTaskToRoute } from '../src/demoContext.js'
import { decodeLocation, encodeLocation } from '../src/navigation/location.js'
import { scenario, resetScenario } from '../src/domain/scenario.js'

describe('P0.3 local presets use reset + selectEngagement only', () => {
  it('exposes 7 curated local presets', () => {
    assert.equal(LOCAL_DEMO_PRESETS.length, 7)
    assert.deepEqual(LOCAL_DEMO_PRESETS.map((p) => p.key), ['clean-start', 'waiting-client', 'accounting-prep', 'manager-review', 'partner-eqr', 'ready-release', 'completed'])
    assert.equal(getDemoPresets('shared').length, 0)
    assert.equal(getDemoPresets('local').length, 7)
  })
  it('clean-start resets to deterministic fixture', () => {
    resetScenario()
    const applied = applyDemoPreset({ preset: 'clean-start' })
    assert.equal(applied.ok, true)
    assert.equal(applied.didReset, true)
    assert.equal(applied.engagementId, 'ENG-0018-AUD-2026')
    assert.equal(applied.routeKey, 'clients')
    assert.equal(scenario.selectedEngagementId, 'ENG-0018-AUD-2026')
  })
  it('waiting-client focuses the exact PBC request without reset', () => {
    resetScenario()
    const applied = applyDemoPreset({ preset: 'waiting-client' })
    assert.equal(applied.ok, true)
    assert.equal(applied.didReset, false)
    assert.equal(applied.recordId, 'PBC-019')
    assert.equal(applied.routeKey, 'pbc')
  })
  it('unknown preset fails closed', () => {
    const res = applyDemoPreset({ preset: 'nope' })
    assert.equal(res.ok, false)
    assert.equal(res.error.code, 'PRESET_NOT_FOUND')
  })
  it('getLocalPreset returns null for unknown', () => {
    assert.equal(getLocalPreset('nope'), null)
    assert.equal(getLocalPreset('manager-review').engagementId, 'ENG-0018-AUD-2026')
  })
})

describe('P0.4 local selectors project domain state into shared shapes', () => {
  it('tasks cover PBC, reviews, workpapers with shared assignee roles', () => {
    resetScenario()
    const tasks = localTaskProjection('ENG-0018-AUD-2026')
    assert.ok(tasks.length >= 4)
    assert.ok(tasks.some((t) => t.linkedObjectId === 'PBC-023' && t.assigneeRole === 'client_contributor'))
    assert.ok(tasks.some((t) => t.linkedObjectId === 'PBC-019' && t.assigneeRole === 'audit_senior'))
    assert.ok(tasks.some((t) => t.linkedObjectId === 'RP-042'))
    assert.ok(tasks.some((t) => t.linkedObjectId === 'WP-AR-01'))
    for (const t of tasks) assert.ok(t.taskId && t.title && t.engagementId)
  })
  it('tasks feed the same notification builder as shared mode', () => {
    resetScenario()
    const tasks = localTaskProjection('ENG-0018-AUD-2026')
    const events = localActivityProjection('ENG-0018-AUD-2026')
    const outbox = localOutboxProjection('ENG-0018-AUD-2026')
    const notes = buildNotifications({ tasks, events, outbox, assignee: '' })
    assert.ok(notes.length > 0)
    assert.ok(notes.every((n) => n.route && n.recordId !== undefined))
    // Every task maps to a real route (exact-record navigation target exists).
    for (const t of tasks) assert.notEqual(mapTaskToRoute(t), '')
  })
  it('outbox projection preserves portal message identity', () => {
    resetScenario()
    const outbox = localOutboxProjection('ENG-0018-AUD-2026')
    assert.ok(outbox.length >= 2)
    assert.ok(outbox[0].message_id && outbox[0].related_id)
  })
  it('activity is never empty for the fixture engagement', () => {
    resetScenario()
    const events = localActivityProjection('ENG-0018-AUD-2026')
    assert.ok(events.length > 0)
    assert.ok(events.some((e) => e.objectId === 'PBC-019' || e.objectId?.startsWith('RP-')))
  })
})

describe('P0.1 record location round-trips through the hash', () => {
  it('encode/decode preserves route + engagement + record', () => {
    const hash = encodeLocation({ routeKey: 'reviews', engagementId: 'ENG-0018-AUD-2026', recordId: 'RP-048' })
    const loc = decodeLocation(hash)
    assert.equal(loc.routeKey, 'reviews')
    assert.equal(loc.engagementId, 'ENG-0018-AUD-2026')
    assert.equal(loc.recordId, 'RP-048')
  })
  it('rejects invalid record ids', () => {
    const loc = decodeLocation('#/reviews?engagement=ENG-0018-AUD-2026&record=DROP%20TABLE')
    assert.equal(loc.recordId, null)
  })
})
