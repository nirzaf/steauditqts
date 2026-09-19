/**
 * Tests for P6: Lead Lineage, Duplicate Detection, and Client Group Overview.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clientGroupOverview,
  convertLeadToClient,
  createClientGroup,
  createLead,
  getLeadLineage,
  qualifyLead,
  resetScenario,
  scenario,
} from '../src/domain/scenario.js'

test.beforeEach(() => {
  resetScenario()
})

// ─── Lead lineage on creation ─────────────────────────────────────────────────

test('P6: lead record has qualifiedAt set after qualification', () => {
  const leadRes = createLead({
    name: 'Gulf Ports Ltd',
    company: 'Gulf Ports Ltd W.L.L.',
    email: 'cfo@gulfports.demo',
    source: 'Conference',
  })
  const lead = scenario.leads.find((l) => l.id === leadRes.data.id)
  assert.equal(lead.qualifiedAt, null) // not yet qualified

  qualifyLead({ leadId: lead.id })
  assert.ok(lead.qualifiedAt, 'qualifiedAt should be set after qualification')
})

test('P6: converted lead gets convertedAt and back-references to client and engagement', () => {
  const leadRes = createLead({
    name: 'Gulf Ports Ltd',
    company: 'Gulf Ports Ltd W.L.L.',
    email: 'cfo@gulfports.demo',
    source: 'Conference',
  })
  const lead = scenario.leads.find((l) => l.id === leadRes.data.id)
  qualifyLead({ leadId: lead.id })
  const convertRes = convertLeadToClient({
    leadId: lead.id,
    clientName: 'Gulf Ports Ltd W.L.L.',
    registration: 'CR-99002-QA',
  })
  assert.equal(convertRes.outcome, 'COMMITTED')
  assert.ok(lead.convertedAt, 'Lead should have convertedAt set')
  assert.ok(lead.clientId, 'Lead should have clientId back-reference')
  assert.ok(lead.engagementId, 'Lead should have engagementId back-reference')
})

test('P6: getLeadLineage returns full lineage for converted client', () => {
  const leadRes = createLead({
    name: 'Ras Laffan Shipping',
    company: 'Ras Laffan Shipping Co.',
    email: 'finance@raslaffan.demo',
    source: 'Cold call',
  })
  const lead = scenario.leads.find((l) => l.id === leadRes.data.id)
  qualifyLead({ leadId: lead.id })
  const convertRes = convertLeadToClient({
    leadId: lead.id,
    clientName: 'Ras Laffan Shipping Co.',
    registration: 'CR-88005-QA',
  })
  const clientId = convertRes.data.client.id
  const lineage = getLeadLineage(clientId)
  assert.ok(lineage)
  assert.equal(lineage.leadId, lead.id)
  assert.equal(lineage.source, 'Cold call')
  assert.ok(lineage.qualifiedAt)
  assert.ok(lineage.convertedAt)
  assert.equal(lineage.clientId, clientId)
  assert.ok(lineage.engagementId)
})

test('P6: getLeadLineage returns null for existing fixture client without lineage', () => {
  // CLI-0018 is a fixture client without leadLineage field
  const lineage = getLeadLineage('CLI-0018')
  assert.equal(lineage, null)
})

// ─── Duplicate detection by registration number ────────────────────────────────

test('P6: CLIENT_REGISTRATION_DUPLICATE blocked when registration already exists', () => {
  // Create first client with a specific registration
  const lead1 = createLead({ name: 'Alpha Co', company: 'Alpha Co W.L.L.', email: 'cfo@alphaco.demo' })
  qualifyLead({ leadId: lead1.data.id })
  const conv1 = convertLeadToClient({
    leadId: lead1.data.id,
    clientName: 'Alpha Co W.L.L.',
    registration: 'CR-77001-QA',
  })
  assert.equal(conv1.outcome, 'COMMITTED')

  // Attempt to convert a second lead with same registration
  const lead2 = createLead({ name: 'Alpha Co 2', company: 'Alpha Co Holdings W.L.L.', email: 'ceo@alphaco2.demo', source: 'Referral' })
  qualifyLead({ leadId: lead2.data.id })
  const conv2 = convertLeadToClient({
    leadId: lead2.data.id,
    clientName: 'Alpha Co Holdings W.L.L.',
    registration: 'CR-77001-QA', // same registration
  })
  assert.equal(conv2.outcome, 'CONFLICT')
  assert.equal(conv2.code, 'CLIENT_REGISTRATION_DUPLICATE')
})

test('P6: registration duplicate detection is case and whitespace insensitive', () => {
  const lead1 = createLead({ name: 'Beta Corp', company: 'Beta Corp W.L.L.', email: 'cfo@betacorp.demo' })
  qualifyLead({ leadId: lead1.data.id })
  convertLeadToClient({
    leadId: lead1.data.id,
    clientName: 'Beta Corp W.L.L.',
    registration: 'cr 77002 qa',
  })

  const lead2 = createLead({ name: 'Beta Corp 2', company: 'Beta Corp 2 W.L.L.', email: 'ceo@betacorp2.demo', source: 'Referral' })
  qualifyLead({ leadId: lead2.data.id })
  const conv2 = convertLeadToClient({
    leadId: lead2.data.id,
    clientName: 'Beta Corp 2 W.L.L.',
    registration: 'CR77002QA', // same, different casing and spacing
  })
  assert.equal(conv2.outcome, 'CONFLICT')
  assert.equal(conv2.code, 'CLIENT_REGISTRATION_DUPLICATE')
})

test('P6: conversion proceeds when registration is unique', () => {
  const lead1 = createLead({ name: 'Gamma Ltd', company: 'Gamma Ltd W.L.L.', email: 'cfo@gammaltd.demo' })
  qualifyLead({ leadId: lead1.data.id })
  convertLeadToClient({ leadId: lead1.data.id, clientName: 'Gamma Ltd W.L.L.', registration: 'CR-77003-QA' })

  const lead2 = createLead({ name: 'Delta Ltd', company: 'Delta Ltd W.L.L.', email: 'cfo@deltaltd.demo', source: 'Referral' })
  qualifyLead({ leadId: lead2.data.id })
  const conv2 = convertLeadToClient({
    leadId: lead2.data.id,
    clientName: 'Delta Ltd W.L.L.',
    registration: 'CR-77004-QA', // unique
  })
  assert.equal(conv2.outcome, 'COMMITTED')
})

// ─── Client Group Overview ────────────────────────────────────────────────────

test('P6: clientGroupOverview returns null for unknown group', () => {
  const result = clientGroupOverview('GRP-DOES-NOT-EXIST')
  assert.equal(result, null)
})

test('P6: clientGroupOverview returns group with member clients and engagements', () => {
  const overview = clientGroupOverview('GRP-0001')
  assert.ok(overview)
  assert.equal(overview.groupId, 'GRP-0001')
  assert.ok(overview.groupName)
  assert.ok(typeof overview.memberCount === 'number')
  assert.ok(Array.isArray(overview.members))
  assert.ok(typeof overview.activeEngagementCount === 'number')
  // CLI-0018 is in GRP-0001
  const cli18 = overview.members.find((m) => m.clientId === 'CLI-0018')
  assert.ok(cli18, 'CLI-0018 should be in GRP-0001 overview')
  assert.ok(Array.isArray(cli18.engagements))
})

test('P6: clientGroupOverview does not expose sibling engagement data to non-assigned actors', () => {
  // This is a domain-level isolation check: the overview contains only
  // structural metadata (IDs, service, period, auditCommenced).
  // It must not expose sensitive review notes, workpapers, or team data.
  const overview = clientGroupOverview('GRP-0001')
  assert.ok(overview)
  for (const member of overview.members) {
    for (const eng of member.engagements) {
      assert.ok(!('team' in eng), 'Group overview must not expose team data')
      assert.ok(!('evidence' in eng), 'Group overview must not expose evidence details')
    }
  }
})

test('P6: newly converted client with group appears in group overview', () => {
  const lead = createLead({ name: 'QGroup Member Co', company: 'QGroup Member Co W.L.L.', email: 'cfo@qgroupmember.demo' })
  qualifyLead({ leadId: lead.data.id })
  convertLeadToClient({ leadId: lead.data.id, clientName: 'QGroup Member Co W.L.L.', groupId: 'GRP-0001' })
  const overview = clientGroupOverview('GRP-0001')
  const newMember = overview.members.find((m) => m.clientName === 'QGroup Member Co W.L.L.')
  assert.ok(newMember, 'Newly converted client should appear in group overview')
  assert.ok(newMember.leadLineage, 'New member should have lead lineage')
})

test('P6: clientGroupOverview shows group created via createClientGroup', () => {
  const grpRes = createClientGroup({ name: 'Marina Holdings Group' })
  assert.equal(grpRes.outcome, 'COMMITTED')
  const groupId = grpRes.data.id
  const overview = clientGroupOverview(groupId)
  assert.ok(overview)
  assert.equal(overview.groupName, 'Marina Holdings Group')
  assert.equal(overview.memberCount, 0)
  assert.deepEqual(overview.members, [])
})
