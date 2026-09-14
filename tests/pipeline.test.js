import test from 'node:test'
import assert from 'node:assert/strict'
import { pipelineLanes, pipelineStages } from '../src/pipelineData.js'

test('high-level pipeline preserves the eight PDF-derived handoffs', () => {
  assert.equal(pipelineStages.length, 8)
  assert.deepEqual(pipelineStages.map((stage) => stage.number), ['01', '02', '03', '04', '05', '06', '07', '08'])
  assert.equal(new Set(pipelineStages.map((stage) => stage.id)).size, pipelineStages.length)
  for (const stage of pipelineStages) {
    assert.ok(stage.title)
    assert.ok(stage.actor)
    assert.ok(stage.owner)
    assert.ok(stage.route)
    assert.ok(stage.humanAction)
    assert.ok(stage.portalAction)
    assert.ok(stage.documents.length >= 2)
    assert.ok(stage.lanes.includes('portal'))
    for (const role of ['admin', 'accountant', 'client']) {
      assert.ok(stage.destinations[role]?.route, `${stage.id} is missing a ${role} destination`)
      assert.ok(stage.destinations[role]?.label, `${stage.id} is missing a ${role} destination label`)
    }
  }
})

test('every pipeline stage is represented in the swimlane model', () => {
  const stageIds = new Set(pipelineStages.map((stage) => stage.id))
  assert.deepEqual(pipelineLanes.map((lane) => lane.id), ['client', 'portal', 'audit', 'finance'])
  for (const lane of pipelineLanes) {
    assert.ok(lane.label)
    assert.ok(lane.detail)
    for (const stageId of lane.stages) assert.ok(stageIds.has(stageId), `${lane.id} references unknown stage ${stageId}`)
  }
  assert.equal(pipelineLanes.find((lane) => lane.id === 'portal').stages.length, pipelineStages.length)
  assert.ok(pipelineLanes.find((lane) => lane.id === 'client').stages.includes('release'))
  assert.ok(pipelineLanes.find((lane) => lane.id === 'finance').stages.includes('commercial'))
})
