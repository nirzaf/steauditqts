import test from 'node:test'
import assert from 'node:assert/strict'
import { cycleFailureCheckpoints, cycleJourneySteps } from '../src/data.js'

const destinationRoutes = new Set(['architecture', 'clients', 'engagements', 'pbc', 'accounting', 'audit', 'reviews', 'release'])

test('complete-cycle walkthrough covers ordered gates and valid destination screens', () => {
  assert.equal(cycleJourneySteps.length, 30)
  assert.equal(new Set(cycleJourneySteps.map((step) => step.number)).size, 30)
  assert.deepEqual(cycleJourneySteps.map((step) => step.number), Array.from({ length: 30 }, (_, index) => String(index + 1).padStart(2, '0')))
  assert.equal(cycleJourneySteps.every((step) => destinationRoutes.has(step.route)), true)
  assert.equal(cycleJourneySteps.every((step) => step.action && step.outcome && step.control), true)
  assert.deepEqual([...new Set(cycleJourneySteps.map((step) => step.phase))], ['Acquire & accept', 'Execute', 'Conclude', 'Renewal'])
})

test('failure-boundary overlays stay explicit and distinct from workflow gates', () => {
  assert.equal(cycleFailureCheckpoints.length, 5)
  assert.equal(new Set(cycleFailureCheckpoints.map((checkpoint) => checkpoint.id)).size, 5)
  assert.equal(cycleFailureCheckpoints.every((checkpoint) => checkpoint.title && checkpoint.detail && checkpoint.guard), true)
})
