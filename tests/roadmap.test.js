import test from 'node:test'
import assert from 'node:assert/strict'
import { localActivityProjection, localNotificationProjection, localTaskProjection } from '../src/domain/localProjections.js'
import { LOCAL_SCENARIO_PRESETS } from '../src/domain/localPresets.js'
import { recordTargetFor, targetIsInScope } from '../src/navigation/recordTargets.js'
import { clearNotificationState, markNotificationRead, readNotificationState, writeNotificationState } from '../src/notificationState.js'
import { deriveStageSummary } from '../src/demoContext.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function fixtureState() {
  return {
    engagements: [{ id: 'ENG-LOCAL-01' }, { id: 'ENG-LOCAL-02' }],
    actors: [
      { id: 'ACT-CLIENT', personaId: 'client-demo', roles: ['client_contributor'] },
      { id: 'ACT-SENIOR', personaId: 'audit-senior-demo', roles: ['audit_senior'] },
    ],
    pbcRequests: [{ id: 'PBC-LOCAL-01', engagementId: 'ENG-LOCAL-01', state: 'OPEN', ownerActorId: 'ACT-CLIENT', title: 'Trial balance' }],
    events: [{ id: 'evt-1', engagementId: 'ENG-LOCAL-01', action: 'PBC_REQUESTED', actor: 'Audit senior', createdAt: '2026-09-01T10:00:00.000Z' }],
    outbox: [{ id: 'out-1', engagementId: 'ENG-LOCAL-01', subject: 'Evidence request', state: 'READY', createdAt: '2026-09-01T11:00:00.000Z' }],
  }
}

test('record targets resolve the intended destination and scope checks are exact', () => {
  assert.deepEqual(recordTargetFor('', 'PBC-LOCAL-01'), { routeKey: 'pbc', recordId: 'PBC-LOCAL-01', matched: true, targetType: 'pbc' })
  assert.equal(recordTargetFor('', 'MIR-LOCAL-01').routeKey, 'client-communications')
  assert.equal(recordTargetFor('reviews', 'RP-LOCAL-01').routeKey, 'reviews')
  assert.equal(recordTargetFor('', 'unknown-record').matched, false)
  assert.equal(targetIsInScope('PBC-LOCAL-01', [{ id: 'PBC-LOCAL-01' }]), true)
  assert.equal(targetIsInScope('PBC-LOCAL-02', [{ id: 'PBC-LOCAL-01' }]), false)
})

test('local projections are engagement-scoped and populate tasks, activity, and notifications', () => {
  const state = fixtureState()
  const tasks = localTaskProjection(state, 'ENG-LOCAL-01')
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].taskId, 'PBC-LOCAL-01')
  assert.equal(localTaskProjection(state, 'ENG-LOCAL-02').length, 0)
  assert.equal(localActivityProjection(state, 'ENG-LOCAL-01')[0].eventId, 'evt-1')
  const notifications = localNotificationProjection({ state, engagementId: 'ENG-LOCAL-01' })
  assert.deepEqual(notifications.map((item) => item.id), ['msg-out-1', 'event-evt-1', 'task-PBC-LOCAL-01'])
  assert.equal(localNotificationProjection({ state, engagementId: 'ENG-LOCAL-02' }).length, 0)
})

test('stage next action keeps the projected record target and route', () => {
  const state = fixtureState()
  const [task] = localTaskProjection(state, 'ENG-LOCAL-01')
  const summary = deriveStageSummary({ id: 'ENG-LOCAL-01', currentStage: 'STAGE-01', revision: 1 }, [task])
  assert.equal(summary.nextAction.route, 'pbc')
  assert.equal(summary.nextAction.targetId, 'PBC-LOCAL-01')
})

test('the six local presets have stable keys and supported engagement scopes', () => {
  assert.deepEqual(LOCAL_SCENARIO_PRESETS.map((preset) => preset.key), [
    'CLEAN_START',
    'CLIENT_ACTION_REQUIRED',
    'ACCOUNTING_PREPARATION',
    'MANAGER_REVIEW',
    'PARTNER_EQR_REVIEW',
    'READY_FOR_RELEASE',
  ])
  assert.ok(LOCAL_SCENARIO_PRESETS.every((preset) => preset.engagementId && preset.label && preset.description))
})

test('notification read state is scoped, bounded, and resettable', () => {
  const storage = memoryStorage()
  const scope = { personaId: 'admin-demo', engagementId: 'ENG-LOCAL-01' }
  writeNotificationState(scope, ['task-1', 'task-1'], storage)
  assert.deepEqual([...readNotificationState(scope, storage)], ['task-1'])
  markNotificationRead(scope, 'event-1', storage)
  assert.deepEqual([...readNotificationState(scope, storage)].sort(), ['event-1', 'task-1'])
  assert.equal(readNotificationState({ ...scope, engagementId: 'ENG-LOCAL-02' }, storage).size, 0)
  clearNotificationState(scope, storage)
  assert.equal(readNotificationState(scope, storage).size, 0)
})
