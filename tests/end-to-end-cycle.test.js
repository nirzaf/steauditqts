import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeActor,
  actorById,
  assignEngagementTeam,
  auditCommencementBlockers,
  canViewEngagement,
  clientGroupById,
  clientGroups,
  convertLeadToClient,
  createClientGroup,
  createLead,
  engagementById,
  qualifyLead,
  recordAssessmentDecision,
  recordSeniorReview,
  resetScenario,
  scenario,
  startAudit,
} from '../src/domain/scenario.js'

test.beforeEach(() => {
  resetScenario()
})

test('end-to-end cycle: lead qualification, conversion, and client grouping', () => {
  // 1. Initial state has default client groups
  const initialGroups = clientGroups()
  assert.ok(initialGroups.length >= 1)
  assert.equal(initialGroups[0].id, 'GRP-0001')

  // 2. Create lead
  const leadRes = createLead({
    name: 'Doha Maritime Services',
    company: 'Doha Maritime Services W.L.L.',
    email: 'cfo@dohamaritime.demo',
    phone: '+974 4455 8899',
    value: '95000',
    service: 'Financial-statement audit',
    source: 'Referral',
    assignedActorId: 'ACT-OMAR',
  })
  assert.equal(leadRes.outcome, 'COMMITTED')
  const leadId = leadRes.data.id
  const lead = scenario.leads.find((l) => l.id === leadId)
  assert.ok(lead)
  assert.equal(lead.status, 'PENDING')

  // 3. Lead cannot be converted before qualification
  const earlyConvert = convertLeadToClient({
    leadId,
    clientName: 'Doha Maritime Services W.L.L.',
    service: 'Financial-statement audit',
    period: 'FY2026',
  })
  assert.equal(earlyConvert.outcome, 'BLOCKED')
  assert.equal(earlyConvert.code, 'LEAD_NOT_QUALIFIED')

  // 4. Qualify lead
  const qualifyRes = qualifyLead({ leadId, rationale: 'Qualified through initial commercial review.' })
  assert.equal(qualifyRes.outcome, 'COMMITTED')
  assert.equal(lead.status, 'QUALIFIED')

  // 5. Create new Client Group
  const groupRes = createClientGroup({ name: 'Maritime Holdings Group' })
  assert.equal(groupRes.outcome, 'COMMITTED')
  const newGroupId = groupRes.data.id
  assert.ok(clientGroupById(newGroupId))

  // 6. Convert lead to client with group association
  const convertRes = convertLeadToClient({
    leadId,
    clientName: 'Doha Maritime Services W.L.L.',
    registration: 'CR-88219-QA',
    groupId: newGroupId,
    service: 'Financial-statement audit',
    period: 'FY2026',
  })
  assert.equal(convertRes.outcome, 'COMMITTED')
  assert.equal(lead.status, 'CONVERTED')

  // 7. Verify Client entity and group association
  const clientId = convertRes.data.client.id
  const clientEntity = scenario.clients.find((c) => c.id === clientId)
  assert.ok(clientEntity)
  assert.equal(clientEntity.name, 'Doha Maritime Services W.L.L.')
  assert.equal(clientEntity.groupId, newGroupId)

  // 8. Verify Client Contact created
  const contact = clientEntity.contact
  assert.ok(contact)
  assert.equal(contact.name, 'Doha Maritime Services')
  assert.equal(contact.email, 'cfo@dohamaritime.demo')

  // 9. Verify Engagement shell created
  const engagement = convertRes.data.engagement
  assert.ok(engagement)
  assert.equal(engagement.clientId, clientId)
  assert.equal(engagement.service, 'audit')
  assert.equal(engagement.auditCommenced, false)

  // 10. Verify Acceptance case is unaccepted (CRITICAL: never auto-accept!)
  const assessment = convertRes.data.assessment
  assert.ok(assessment)
  assert.equal(assessment.type, 'acceptance')
  assert.equal(assessment.decision, null, 'Acceptance assessment must remain unaccepted upon lead conversion')
})

test('desk isolation rule: client group membership does not grant cross-client access', () => {
  // CLI-0018 belongs to GRP-0001
  const cli18 = scenario.clients.find((c) => c.id === 'CLI-0018')
  assert.ok(cli18)
  assert.equal(cli18.groupId, 'GRP-0001')

  // Qualify & convert a sibling client in GRP-0001
  const leadRes = createLead({
    name: 'Northstar Logistics',
    company: 'Northstar Logistics W.L.L.',
    email: 'ops@northstar-logistics.demo',
    value: '60000',
  })
  qualifyLead({ leadId: leadRes.data.id })
  const convertRes = convertLeadToClient({
    leadId: leadRes.data.id,
    clientName: 'Northstar Logistics W.L.L.',
    groupId: 'GRP-0001',
    service: 'Financial-statement audit',
    period: 'FY2026',
  })
  assert.equal(convertRes.outcome, 'COMMITTED')
  const newEngagementId = convertRes.data.engagement.id

  // Omar is assigned to ENG-0018-AUD-2026
  assert.ok(canViewEngagement('ACT-OMAR', 'ENG-0018-AUD-2026'))

  // Omar is NOT assigned to the new engagement yet -> must be denied access
  assert.equal(
    canViewEngagement('ACT-OMAR', newEngagementId),
    false,
    'Group membership must never grant cross-entity engagement desk access'
  )

  // Explicitly assign Omar to new engagement
  const assignResult = assignEngagementTeam({
    engagementId: newEngagementId,
    actorPersonaId: 'partner-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '25' },
    ],
  })
  assert.equal(assignResult.outcome, 'COMMITTED')

  // Now Omar has access to the new engagement
  assert.ok(canViewEngagement('ACT-OMAR', newEngagementId))
})

test('engagement staffing: assignEngagementTeam with planned hours and responsibilities', () => {
  const engagementId = 'ENG-0018-AUD-2026'

  const assignRes = assignEngagementTeam({
    engagementId,
    actorPersonaId: 'partner-demo',
    assignments: [
      {
        role: 'preparer',
        actorId: 'ACT-JUNIOR',
        plannedHours: '45',
        startDate: '2026-09-01',
        endDate: '2026-09-20',
        responsibility: 'Fieldwork workpaper preparation & sample testing',
      },
      {
        role: 'audit_senior',
        actorId: 'ACT-OMAR-SENIOR',
        plannedHours: '35',
        startDate: '2026-09-01',
        endDate: '2026-09-22',
        responsibility: 'Senior detailed review and sign-off',
      },
      {
        role: 'audit_manager',
        actorId: 'ACT-OMAR',
        plannedHours: '20',
        startDate: '2026-09-05',
        endDate: '2026-09-24',
        responsibility: 'Audit file completion and consultation',
      },
      {
        role: 'engagement_partner',
        actorId: 'ACT-PARTNER',
        plannedHours: '15',
        startDate: '2026-09-10',
        endDate: '2026-09-25',
        responsibility: 'Engagement leadership and opinion sign-off',
      },
      {
        role: 'eqr_reviewer',
        actorId: 'ACT-YUSUF',
        plannedHours: '10',
        startDate: '2026-09-18',
        endDate: '2026-09-25',
        responsibility: 'Independent engagement quality review',
      },
      {
        role: 'accounting_reviewer',
        actorId: 'ACT-LEILA',
        plannedHours: '12',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        responsibility: 'Accounting package review',
      },
    ],
  })

  assert.equal(assignRes.outcome, 'COMMITTED')
  const engagement = engagementById(engagementId)
  assert.equal(engagement.team.length, 6)
  const senior = engagement.team.find((t) => t.role === 'audit_senior')
  assert.equal(senior.actorId, 'ACT-OMAR-SENIOR')
  assert.equal(senior.plannedHours, '35')
  assert.equal(senior.responsibility, 'Senior detailed review and sign-off')

  // Verify actor assignments updated
  const omarSenior = actorById('ACT-OMAR-SENIOR')
  assert.ok(omarSenior.assignments.includes(engagementId))
})

test('audit commencement: prerequisite checks and START_AUDIT transition', () => {
  // Test with a newly converted engagement that has no acceptance or terms
  const leadRes = createLead({ name: 'Test Entity', company: 'Test Entity W.L.L.', email: 'test@entity.demo' })
  qualifyLead({ leadId: leadRes.data.id })
  const convertRes = convertLeadToClient({ leadId: leadRes.data.id, clientName: 'Test Entity W.L.L.' })
  const newEngagementId = convertRes.data.engagement.id

  // 1. Audit commencement should be blocked on unaccepted engagement
  const blockers = auditCommencementBlockers(newEngagementId)
  assert.ok(blockers.length >= 2, 'Unaccepted engagement must have commencement blockers')
  assert.ok(blockers.some((b) => b.code === 'ACCEPTANCE_REQUIRED'))
  assert.ok(blockers.some((b) => b.code === 'TERMS_REQUIRED'))

  const earlyStart = startAudit({ engagementId: newEngagementId, actorPersonaId: 'admin-demo' })
  assert.equal(earlyStart.outcome, 'BLOCKED')

  // 2. Satisfy all 6 prerequisites on the new engagement
  // a) Partner acceptance
  const assessment = scenario.assessments.find((a) => a.engagementId === newEngagementId && a.type === 'acceptance')
  assessment.decision = {
    decision: 'ACCEPT',
    rationale: 'Client acceptance approved.',
    actorId: 'ACT-MAYA',
    recordedAt: new Date().toISOString(),
    revision: 1,
  }

  // b) Engagement letter / terms accepted by client management
  scenario.terms.push({
    id: `TERMS-${newEngagementId}`,
    engagementId: newEngagementId,
    version: 'EL-2026-01',
    state: 'SIGNED',
    clientDecision: {
      decision: 'ACCEPT',
      version: 'EL-2026-01',
      actorId: 'ACT-NADIA',
      recordedAt: new Date().toISOString(),
    },
  })

  // c) Advance payment verified
  const commercial = scenario.commercialRecords.find((c) => c.engagementId === newEngagementId)
  if (commercial) commercial.advanceState = 'VERIFIED'

  // d) Engagement team assigned (partner and manager/senior)
  assignEngagementTeam({
    engagementId: newEngagementId,
    actorPersonaId: 'admin-demo',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-MAYA', plannedHours: '20' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '30' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '40' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '50' },
    ],
  })

  // Verify all blockers cleared
  const clearedBlockers = auditCommencementBlockers(newEngagementId)
  assert.equal(clearedBlockers.length, 0, 'All 6 commencement prerequisites must be satisfied')

  // Start audit
  const startRes = startAudit({ engagementId: newEngagementId, actorPersonaId: 'admin-demo' })
  assert.equal(startRes.outcome, 'COMMITTED')
  const newEng = engagementById(newEngagementId)
  assert.equal(newEng.auditCommenced, true)
  assert.ok(newEng.commencedAt)
  assert.equal(newEng.commencedBy, 'ACT-MAYA')
})

test('senior review: recordSeniorReview precedes manager completion', () => {
  const engagementId = 'ENG-0018-AUD-2026'
  const workpaperId = 'WP-AR-01'

  const reviewRes = recordSeniorReview({
    engagementId,
    workpaperId,
    actorPersonaId: 'audit-senior-demo',
    decision: 'PASSED',
    notes: 'Senior review complete: audit procedure verified against sampling evidence.',
  })

  assert.equal(reviewRes.outcome, 'COMMITTED')
  const workpaper = scenario.workpapers.find((w) => w.id === workpaperId && w.engagementId === engagementId)
  assert.ok(workpaper)
  assert.equal(workpaper.seniorReviewed, true)
  assert.equal(workpaper.reviewState, 'SENIOR_CLEARED')
  assert.equal(workpaper.seniorReviewNotes, 'Senior review complete: audit procedure verified against sampling evidence.')
  assert.ok(workpaper.seniorReviewedAt)
})

