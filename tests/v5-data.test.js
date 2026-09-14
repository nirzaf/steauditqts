import test from 'node:test'
import assert from 'node:assert/strict'
import {
  v5CommercialFixture,
  v5Documents,
  v5GateDefinitions,
  v5JourneySteps,
  v5NotificationMatrix,
  v5RoleMatrix,
  v5SystemLayers,
} from '../src/v5Data.js'

const expectedGates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']
const expectedGateTitles = [
  'Firm ready',
  'Accept / continue',
  'Commercial ready',
  'Terms accepted',
  'Portal eligible',
  'Fieldwork ready',
  'Review submission ready',
  'Completion ready',
  'Release ready',
  'Commercial close',
  'Archive / renewal',
]
const expectedPhases = [
  'Acquire & accept',
  'Commercial onboarding',
  'Plan & prepare',
  'Execute',
  'Conclude',
  'Commercial close',
  'Archive & recovery',
]
const expectedDocumentTitles = [
  'Client Acceptance Form',
  'Client Acceptance Questionnaire',
  'Client Continuation Form',
  'Client Continuation Questionnaire',
  'Estimated Cost of Service Sheet',
  'Fee Approval Record',
  'Quotation',
  'Audit Engagement Letter',
  'Audit Planning Record',
  'Audit Announcement Letter',
  'Client Document Request / Submission Record',
  'Audit Programmes',
  'Trial Balance Import',
  'Prior-Year Audited FS',
  'Audit Working Papers',
  'Working Paper Conclusion Summary',
  'Draft Financial Statements',
  'Management Information Request Letter',
  'Client Response Record',
  'Manager / Partner Review Record',
  'Audit Opinion',
  'Final Audit Report',
  'Final Financial Statements',
  'Invoice',
  'Staff Time Record',
  'Engagement Cost Summary',
]
const destinationRoutes = new Set(['architecture', 'clients', 'blueprint', 'engagements', 'pbc', 'accounting', 'audit', 'reviews', 'client-communications', 'release', 'integration'])

test('v5 gates are the ordered G0–G10 operating model', () => {
  assert.equal(v5GateDefinitions.length, 11)
  assert.deepEqual(v5GateDefinitions.map((gate) => gate.id), expectedGates)
  assert.deepEqual(v5GateDefinitions.map((gate) => gate.title), expectedGateTitles)
  assert.equal(v5GateDefinitions.every((gate) => gate.detail && gate.owner && gate.status && gate.route), true)
})

test('v5 catalogue and journey preserve the specification identity contract', () => {
  assert.equal(v5Documents.length, 26)
  assert.deepEqual(v5Documents.map((document) => document.id), Array.from({ length: 26 }, (_, index) => `DOC-${String(index + 1).padStart(2, '0')}`))
  assert.deepEqual(v5Documents.map((document) => document.title), expectedDocumentTitles)
  assert.equal(new Set(v5Documents.map((document) => document.id)).size, 26)
  assert.equal(v5Documents.every((document) => document.title && document.trigger && document.owner && document.status && document.route), true)
  assert.equal(v5Documents.every((document) => destinationRoutes.has(document.route)), true)

  assert.equal(v5JourneySteps.length, 36)
  assert.deepEqual(v5JourneySteps.map((step) => step.number), Array.from({ length: 36 }, (_, index) => String(index + 1).padStart(2, '0')))
  assert.equal(v5JourneySteps.every((step) => step.gate && step.phase && step.title && step.action && step.outcome && step.control && step.route), true)
  assert.equal(v5JourneySteps.every((step) => destinationRoutes.has(step.route)), true)
  assert.deepEqual([...new Set(v5JourneySteps.map((step) => step.phase))], expectedPhases)
  assert.equal(new Set(v5JourneySteps.map((step) => step.route)).has('blueprint'), true)
})

test('v5 commercial Appendix E fixture reconciles estimate, actuals and invoice', () => {
  const estimate = v5CommercialFixture.estimate
  const actual = v5CommercialFixture.actual
  const totalHours = v5CommercialFixture.rows.reduce((total, row) => total + row.hours, 0)
  const totalLabour = v5CommercialFixture.rows.reduce((total, row) => total + row.labourCost, 0)
  const totalSelling = v5CommercialFixture.rows.reduce((total, row) => total + row.sellingRate * row.hours, 0)

  assert.equal(totalHours, 140)
  assert.equal(totalLabour, 25000)
  assert.equal(totalSelling, 36400)
  assert.equal(estimate.serviceCost, estimate.labourCost + estimate.travel)
  assert.equal(estimate.approvedFee, 36000)
  assert.equal(estimate.advanceRequired, 9000)
  assert.equal(actual.serviceCost, actual.labourCost + actual.travel)
  assert.equal(actual.hoursVariance, actual.hours - estimate.budgetHours)
  assert.equal(actual.costVariance, actual.serviceCost - estimate.serviceCost)
  assert.equal(actual.contribution, actual.finalInvoice - actual.serviceCost)
  assert.equal(actual.remainingBalance, actual.finalInvoice - estimate.advanceAllocated)
  assert.equal(actual.contributionPercent, 20.28)
})

test('v5 boundary matrices cover system layers, roles and notifications', () => {
  assert.equal(v5SystemLayers.length, 7)
  assert.equal(new Set(v5SystemLayers.map((layer) => layer.id)).size, 7)
  assert.equal(v5SystemLayers.every((layer) => layer.label && layer.kind && layer.detail && layer.handoff), true)
  assert.equal(v5RoleMatrix.length, 8)
  assert.equal(v5RoleMatrix.every((role) => role.role && role.surface && role.boundary), true)
  assert.equal(v5NotificationMatrix.length, 18)
  assert.equal(v5NotificationMatrix.every((notification) => notification.trigger && notification.recipients && notification.action), true)
})
