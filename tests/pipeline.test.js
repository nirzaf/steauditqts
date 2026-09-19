import test from 'node:test'
import assert from 'node:assert/strict'
import { pipelineLanes, pipelineLifecycles, pipelineStages } from '../src/pipelineData.js'

test('pipeline represents the full 11-stage lead-to-archive lifecycle', () => {
  // Expanded from 8 (engagement only) to 11 (relationship + engagement combined)
  assert.equal(pipelineStages.length, 11)
  assert.deepEqual(
    pipelineStages.map((stage) => stage.number),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'],
  )
  assert.equal(new Set(pipelineStages.map((stage) => stage.id)).size, pipelineStages.length)
  for (const stage of pipelineStages) {
    assert.ok(stage.title, `${stage.id} missing title`)
    assert.ok(stage.actor, `${stage.id} missing actor`)
    assert.ok(stage.owner, `${stage.id} missing owner`)
    assert.ok(stage.route, `${stage.id} missing route`)
    assert.ok(stage.humanAction, `${stage.id} missing humanAction`)
    assert.ok(stage.portalAction, `${stage.id} missing portalAction`)
    assert.ok(stage.documents.length >= 2, `${stage.id} should have at least 2 documents`)
    assert.ok(stage.lifecycle === 'relationship' || stage.lifecycle === 'engagement', `${stage.id} must have a lifecycle`)
    for (const role of ['admin', 'accountant', 'client']) {
      assert.ok(stage.destinations[role]?.route, `${stage.id} is missing a ${role} destination`)
      assert.ok(stage.destinations[role]?.label, `${stage.id} is missing a ${role} destination label`)
    }
  }
})

test('relationship lifecycle contains the four pre-engagement stages', () => {
  const relStages = pipelineStages.filter((s) => s.lifecycle === 'relationship')
  assert.equal(relStages.length, 4)
  assert.deepEqual(
    relStages.map((s) => s.id),
    ['lead', 'qualify', 'convert', 'intake'],
  )
})

test('engagement lifecycle contains the seven execution stages', () => {
  const engStages = pipelineStages.filter((s) => s.lifecycle === 'engagement')
  assert.equal(engStages.length, 7)
  assert.ok(engStages.some((s) => s.id === 'commercial'))
  assert.ok(engStages.some((s) => s.id === 'staffing'))
  assert.ok(engStages.some((s) => s.id === 'release'))
})

test('every pipeline stage is represented in the swimlane model', () => {
  const stageIds = new Set(pipelineStages.map((stage) => stage.id))
  assert.deepEqual(pipelineLanes.map((lane) => lane.id), ['client', 'portal', 'audit', 'finance'])
  for (const lane of pipelineLanes) {
    assert.ok(lane.label)
    assert.ok(lane.detail)
    for (const stageId of lane.stages) assert.ok(stageIds.has(stageId), `${lane.id} references unknown stage ${stageId}`)
  }
  // The portal lane covers all stages
  assert.equal(pipelineLanes.find((lane) => lane.id === 'portal').stages.length, pipelineStages.length)
  assert.ok(pipelineLanes.find((lane) => lane.id === 'client').stages.includes('release'))
  assert.ok(pipelineLanes.find((lane) => lane.id === 'finance').stages.includes('commercial'))
})

test('pipeline lifecycle metadata is consistent', () => {
  assert.equal(pipelineLifecycles.length, 2)
  const stageIds = new Set(pipelineStages.map((s) => s.id))
  for (const lc of pipelineLifecycles) {
    assert.ok(lc.id)
    assert.ok(lc.label)
    assert.ok(lc.stages.length > 0, `${lc.id} has no stages`)
    for (const stageId of lc.stages) {
      assert.ok(stageIds.has(stageId), `Lifecycle ${lc.id} references unknown stage ${stageId}`)
    }
  }
  // All pipeline stages are covered by exactly one lifecycle
  const allLifecycleStages = pipelineLifecycles.flatMap((lc) => lc.stages)
  assert.equal(allLifecycleStages.length, pipelineStages.length)
  assert.equal(new Set(allLifecycleStages).size, pipelineStages.length)
})

test('intake stage (client acceptance) is preserved in the expanded pipeline', () => {
  const intakeStage = pipelineStages.find((s) => s.id === 'intake')
  assert.ok(intakeStage)
  assert.equal(intakeStage.lifecycle, 'relationship')
  assert.ok(intakeStage.lanes.includes('portal'))
  assert.ok(intakeStage.documents.includes('Acceptance questionnaire'))
})
