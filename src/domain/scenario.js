import { reactive } from 'vue'
import { canonicalManifestDigest, createSnapshot } from './documents.js'
import { createAssessment, evaluateAssessment, recordPartnerDecision as recordAssessmentPartnerDecision, updateAssessmentResponse } from './assessments.js'
import { clientEvaluationQuestions } from './questionBanks.js'
import { baselineFixture, fixtureRows, registerJournalRevision, replacementFixture, sourceReflection, summarizeRows } from './accounting.js'
import { auditRiskFixture, calculateMateriality, evaluateAuditChain, findingFixture, inventoryPopulationFixture, materialityFixture, populationFixture, sampleFixture } from './audit.js'

export const SCENARIO_VERSION = 2
export const SCENARIO_STORAGE_KEY = 'auditflow-scenario-v2'
export const DEFAULT_SCENARIO_ENGAGEMENT_ID = 'ENG-0018-AUD-2026'
export const EVIDENCE_LEVEL = 'SIMULATION'

const clone = (value) => JSON.parse(JSON.stringify(value))

export const gateDefinitions = [
  { id: 'G0', title: 'Firm ready', detail: 'Methods, access and repositories', scope: 'all', period: 'current' },
  { id: 'G1', title: 'Accepted / continued', detail: 'Assessment, ethics and clearances', scope: 'all', period: 'current' },
  { id: 'G2', title: 'Work authorized', detail: 'Terms, team, access and dates', scope: 'all', period: 'current' },
  { id: 'G3', title: 'Data usable', detail: 'Validated source and control totals', scope: 'accounting-or-audit', period: 'current' },
  { id: 'G4', title: 'Accounting ready', detail: 'Mapping, journals and statements', scope: 'accounting-or-audit', period: 'current' },
  { id: 'G5', title: 'Audit plan ready', detail: 'Risks, materiality and procedures', scope: 'audit', period: 'current' },
  { id: 'G6', title: 'Conclusions complete', detail: 'Evidence, exceptions and evaluation', scope: 'audit', period: 'current' },
  { id: 'G7', title: 'Final package approved', detail: 'Management, partner and EQR', scope: 'all', period: 'current' },
  { id: 'G8', title: 'Release authorized', detail: 'Matched report and recipients', scope: 'all', period: 'current' },
  { id: 'G9', title: 'Archive complete', detail: 'Manifest, retention and recovery', scope: 'all', period: 'current' },
  { id: 'G10', title: 'Next period allowed', detail: 'Fresh continuance and terms', scope: 'all', period: 'next' },
]

const roleDefinitions = [
  { id: 'system_admin', label: 'System administrator', professional: false },
  { id: 'compliance_reviewer', label: 'Compliance / onboarding reviewer', professional: true },
  { id: 'preparer', label: 'Preparer', professional: true },
  { id: 'accounting_reviewer', label: 'Accounting technical reviewer', professional: true },
  { id: 'client_finance', label: 'Client finance user', professional: false },
  { id: 'management_approver', label: 'Management approver', professional: false },
  { id: 'engagement_partner', label: 'Engagement partner', professional: true },
  { id: 'signatory', label: 'Partner / signatory', professional: true },
  { id: 'independent_reviewer', label: 'Independent reviewer', professional: true },
  { id: 'eqr_reviewer', label: 'EQR reviewer', professional: true },
  { id: 'records_custodian', label: 'Records custodian', professional: true },
]

export const scenarioRoles = roleDefinitions

function accountingPackageFixture({ id, engagementId, entityId = 'CLI-0018', period = 'FY2026', currency = 'QAR', sourceId, sourceLabel, rows, baselineSourceId = 'TB-BASELINE-001', statementId = `FS-${id.replace(/^PKG-/, '')}-V05` }) {
  const scopedRows = fixtureRows(rows, { entityId, period, currency, sourceId })
  const baselineRows = fixtureRows(baselineFixture, { entityId, period, currency, sourceId: baselineSourceId })
  const summary = summarizeRows(scopedRows)
  return {
    schemaVersion: 1,
    id,
    engagementId,
    revision: 1,
    source: {
      sourceId,
      sourceLabel,
      entityId,
      period,
      currency,
      rows: scopedRows,
      baselineRows,
      summary,
      validationState: 'VALIDATED',
      reflection: sourceReflection(baselineRows, scopedRows),
      receivedAt: '2026-09-09T10:00:00.000Z',
    },
    mappings: { version: 3, state: 'REVIEWED', coverage: scopedRows.length, total: scopedRows.length, reviewedBy: 'ACT-LEILA' },
    journalRevisions: [
      { id: 'AJ-001-R1', logicalJournalId: 'AJ-001', layer: 'REPORTING', state: 'REFLECTED', sourceReflection: 'REFLECTED', amount: '5000.00', debitAccount: '520100', creditAccount: '159100', reason: 'Depreciation correction is already included in TB v03.' },
    ],
    proposedJournals: [
      { id: 'AJ-002-R1', logicalJournalId: 'AJ-002', layer: 'REPORTING', state: 'PROPOSED', sourceReflection: 'NOT_REFLECTED', amount: '12500.00', debitAccount: '510100', creditAccount: '210100', reason: 'Receivables provision discussion; management response required.' },
    ],
    statement: {
      id: statementId,
      revision: 5,
      state: 'INCOMPLETE',
      engineVersion: 'synthetic-decimal-1',
      methodologyVersion: 'FS-METHOD-2026-01',
      taxonomyVersion: 'QAR-COA-2026-01',
      summary,
      components: { balanceSheet: 'DERIVED', incomeStatement: 'DERIVED', cashFlow: 'NOT_PROVIDED', comparatives: 'NOT_PROVIDED', disclosures: 'NOT_PROVIDED' },
      managementApproval: null,
      submittedSnapshotId: null,
    },
    history: [],
  }
}

function initialScenario() {
  const acceptanceSeed = {
    'CE-001': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-002': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-003': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-004': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-005': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-006': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-011': { answer: 'UNKNOWN', verification: 'UNVERIFIED' },
    'CE-032': { answer: 'NO_MATCH', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' },
    'CE-071': { answer: 'NO', verification: 'VERIFIED', respondentActorId: 'ACT-MAYA' },
    'CE-075': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-MAYA' },
  }
  // Seed the walkthrough with a complete synthetic review while keeping one
  // deliberately unresolved UBO item visible as the commencement hold.
  clientEvaluationQuestions.forEach((question) => {
    if (!acceptanceSeed[question.id]) acceptanceSeed[question.id] = { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-SARA' }
  })
  delete acceptanceSeed['CE-011']
  const acceptanceAssessment = createAssessment({ id: 'ASMT-0018-ACCEPT-2026', engagementId: 'ENG-0018-AUD-2026', type: 'acceptance', revision: 4, seed: acceptanceSeed })
  const continuanceAssessment = createAssessment({ id: 'ASMT-0018-CONT-2027', engagementId: 'ENG-0018-AUD-2026', type: 'continuance', revision: 1, seed: { 'RV-001': { answer: 'NO', verification: 'VERIFIED', respondentActorId: 'ACT-NADIA' }, 'RV-023': { answer: 'YES', verification: 'VERIFIED', respondentActorId: 'ACT-MAYA' } } })
  const cedarAssessment = createAssessment({ id: 'ASMT-0009-ACCEPT-2026', engagementId: 'ENG-0009-ACC-2026', type: 'acceptance', revision: 2, seed: acceptanceSeed })
  cedarAssessment.decision = { decision: 'ACCEPT', rationale: 'Synthetic accounting-only relationship accepted for the fixture cycle.', actorId: 'ACT-MAYA', recordedAt: '2026-09-01T09:00:00.000Z', revision: cedarAssessment.revision }
  const initialTerms = [
    { id: 'TERMS-0018-AUD-2026', engagementId: 'ENG-0018-AUD-2026', version: 'EL-2026-01', state: 'SIGNED', signedBy: 'ACT-NADIA', signedAt: '2026-09-04T09:00:00.000Z', responsibilitiesVersion: 'RESP-2026-01', scopeVersion: 'SCOPE-AUD-2026' },
    { id: 'TERMS-0018-ACC-2026', engagementId: 'ENG-0018-ACC-2026', version: 'EL-2026-01', state: 'SIGNED', signedBy: 'ACT-NADIA', signedAt: '2026-09-04T09:05:00.000Z', responsibilitiesVersion: 'RESP-2026-01', scopeVersion: 'SCOPE-ACC-2026' },
    { id: 'TERMS-0009-ACC-2026', engagementId: 'ENG-0009-ACC-2026', version: 'EL-2026-01', state: 'SIGNED', signedBy: 'ACT-NADIA', signedAt: '2026-09-02T09:00:00.000Z', responsibilitiesVersion: 'RESP-2026-01', scopeVersion: 'SCOPE-ACC-2026' },
  ]
  const initialAccountingPackages = [
    accountingPackageFixture({ id: 'PKG-0018-ACC-2026', engagementId: 'ENG-0018-ACC-2026', sourceId: 'TB-REPLACEMENT-001', sourceLabel: 'TB v03 · reflected replacement fixture', rows: replacementFixture }),
    accountingPackageFixture({ id: 'PKG-0009-ACC-2026', engagementId: 'ENG-0009-ACC-2026', entityId: 'CLI-0009', sourceId: 'TB-BASELINE-0009', sourceLabel: 'TB v02 · accounting-only baseline fixture', rows: baselineFixture, baselineSourceId: 'TB-BASELINE-0009' }),
  ]
  return {
    version: SCENARIO_VERSION,
    firm: { id: 'FIRM-QA-001', name: 'Quadrate Audit Practice', country: 'Qatar' },
    clients: [
      {
        id: 'CLI-0018',
        name: 'Northstar Trading W.L.L.',
        registration: 'CR 82419',
        contact: { name: 'Nadia Faris', email: 'nadia@northstar.demo' },
        services: ['audit', 'accounting'],
        safetyGeneration: 3,
      },
      {
        id: 'CLI-0009',
        name: 'Cedar & Coast Logistics',
        registration: 'CR 66102',
        contact: { name: 'Hassan Saleh', email: 'hassan@cedar.demo' },
        services: ['accounting'],
        safetyGeneration: 1,
      },
    ],
    engagements: [
      {
        id: 'ENG-0018-AUD-2026',
        clientId: 'CLI-0018',
        service: 'audit',
        serviceLabel: 'Financial-statement audit',
        period: 'FY2026',
        periodLabel: 'Year ended 31 Dec 2026',
        currency: 'QAR',
        revision: 4,
        inputGeneration: 3,
        policyGeneration: 1,
        linkedEngagementId: 'ENG-0018-ACC-2026',
        evidence: {
          firmReady: true,
          accepted: true,
          termsSigned: true,
          assignmentsEligible: true,
          workspaceVerified: true,
          sourceValidated: true,
          mappingReviewed: true,
          statementApproved: false,
          auditPlanReady: true,
          conclusionsComplete: false,
          managementApproved: true,
          partnerApproved: false,
          eqrRequired: true,
          eqrComplete: false,
          protection: 'UNKNOWN',
          archiveVerified: false,
        },
        holds: [
          { id: 'HOLD-AR-019', code: 'EVIDENCE_CONFLICT', message: 'AR-019 has contradictory ageing and subsequent-receipt evidence.', action: 'Independent reviewer disposition required.' },
        ],
      },
      {
        id: 'ENG-0018-ACC-2026',
        clientId: 'CLI-0018',
        service: 'accounting',
        serviceLabel: 'Accounting package handoff',
        period: 'FY2026',
        periodLabel: 'Year ended 31 Dec 2026',
        currency: 'QAR',
        revision: 3,
        inputGeneration: 2,
        policyGeneration: 1,
        linkedEngagementId: 'ENG-0018-AUD-2026',
        evidence: {
          firmReady: true,
          accepted: true,
          termsSigned: true,
          assignmentsEligible: true,
          workspaceVerified: true,
          sourceValidated: true,
          mappingReviewed: true,
          statementApproved: false,
          auditPlanReady: null,
          conclusionsComplete: null,
          managementApproved: false,
          partnerApproved: false,
          eqrRequired: false,
          eqrComplete: null,
          protection: 'UNKNOWN',
          archiveVerified: false,
        },
        holds: [],
      },
      {
        id: 'ENG-0009-ACC-2026',
        clientId: 'CLI-0009',
        service: 'accounting',
        serviceLabel: 'Accounting only',
        period: 'FY2026',
        periodLabel: 'Year ended 31 Dec 2026',
        currency: 'QAR',
        revision: 1,
        inputGeneration: 1,
        policyGeneration: 1,
        linkedEngagementId: null,
        evidence: {
          firmReady: true,
          accepted: true,
          termsSigned: true,
          assignmentsEligible: true,
          workspaceVerified: true,
          sourceValidated: true,
          mappingReviewed: true,
          statementApproved: true,
          auditPlanReady: null,
          conclusionsComplete: null,
          managementApproved: true,
          partnerApproved: true,
          eqrRequired: false,
          eqrComplete: null,
          protection: 'VERIFIED_SIMULATION',
          archiveVerified: false,
        },
        holds: [],
      },
    ],
    actors: [
      { id: 'ACT-MAYA', personaId: 'admin-demo', name: 'Maya Rahman', roles: ['system_admin', 'engagement_partner', 'signatory'], assignments: ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-LEILA', personaId: 'accountant-demo', name: 'Leila Noor', roles: ['preparer', 'accounting_reviewer'], assignments: ['ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-NADIA', personaId: 'client-demo', name: 'Nadia Faris', roles: ['client_finance', 'management_approver'], assignments: ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-OMAR', personaId: 'audit-manager-demo', name: 'Omar Aziz', roles: ['preparer', 'independent_reviewer'], assignments: ['ENG-0018-AUD-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-YUSUF', personaId: 'eqr-demo', name: 'Yusuf Ali', roles: ['eqr_reviewer'], assignments: ['ENG-0018-AUD-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-FATIMA', personaId: 'independent-reviewer-demo', name: 'Fatima Saleh', roles: ['independent_reviewer'], assignments: ['ENG-0018-AUD-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-SAMIR', personaId: 'system-admin-only-demo', name: 'Samir Khan', roles: ['system_admin'], assignments: ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'], sessionEpoch: 1, active: true },
      { id: 'ACT-SARA', personaId: 'compliance-demo', name: 'Sara Khan', roles: ['compliance_reviewer', 'records_custodian'], assignments: ['ENG-0018-AUD-2026', 'ENG-0009-ACC-2026'], sessionEpoch: 1, active: true },
    ],
    activePersonaId: 'admin-demo',
    selectedEngagementId: DEFAULT_SCENARIO_ENGAGEMENT_ID,
    assessments: [acceptanceAssessment, continuanceAssessment, cedarAssessment],
    terms: initialTerms,
    activation: [
      { engagementId: 'ENG-0018-AUD-2026', state: 'PENDING', activatedBy: null, activatedAt: null, eventId: null },
      { engagementId: 'ENG-0018-ACC-2026', state: 'PENDING', activatedBy: null, activatedAt: null, eventId: null },
      { engagementId: 'ENG-0009-ACC-2026', state: 'ACTIVE', activatedBy: 'ACT-MAYA', activatedAt: '2026-09-02T10:00:00.000Z', eventId: 'EV-ACT-0009' },
    ],
    accountingPackages: initialAccountingPackages,
    renewalCases: [],
    audit: {
      fixtureVersion: 'AUDIT-FIXTURE-2026-01',
      risks: clone(auditRiskFixture),
      materiality: clone(materialityFixture),
      populations: [clone(populationFixture), clone(inventoryPopulationFixture)],
      samples: clone(sampleFixture),
      findings: clone(findingFixture),
      chainRevision: 1,
    },
    archivePackages: [],
    legalHolds: [
      { id: 'LH-0018-AR', engagementId: 'ENG-0018-AUD-2026', type: 'LITIGATION', state: 'ACTIVE', blocksDisposal: true, reason: 'Synthetic receivables dispute preservation', createdBy: 'ACT-SARA', createdAt: '2026-09-01T08:30:00.000Z', revision: 1, releasedBy: null, releasedAt: null },
    ],
    amendments: [],
    safety: {
      firm: { generation: 1, state: 'CURRENT' },
      client: { 'CLI-0018': { generation: 3, state: 'CURRENT' }, 'CLI-0009': { generation: 1, state: 'CURRENT' } },
      aggregate: { generation: 3, state: 'CURRENT' },
      impactProcessing: 'RUNNING',
    },
    pbcRequests: [
      { id: 'PBC-019', engagementId: 'ENG-0018-AUD-2026', title: 'Receivables ageing and subsequent receipts', classification: 'AUDIT_EVIDENCE', period: 'FY2026', ownerActorId: 'ACT-NADIA', reviewerActorId: 'ACT-OMAR', due: '2026-09-11', state: 'UNDER_REVIEW', receipts: ['REC-019-01'], revision: 2 },
      { id: 'PBC-023', engagementId: 'ENG-0018-AUD-2026', title: 'Inventory count sheets', classification: 'AUDIT_EVIDENCE', period: 'FY2026', ownerActorId: 'ACT-NADIA', reviewerActorId: 'ACT-OMAR', due: '2026-09-12', state: 'CLARIFICATION_REQUIRED', receipts: [], revision: 1 },
    ],
    documents: [
      { id: 'DOC-AR-019', engagementId: 'ENG-0018-AUD-2026', requestId: 'PBC-019', sourceReceiptId: 'REC-019-01', workingHash: 'sha256:synthetic-ar-working', storedHash: 'sha256:synthetic-ar-stored', snapshotId: 'SNAP-AR-019-01', snapshotHash: 'sha256:synthetic-ar-snapshot', providerVersion: 'spv-019-01', captureState: 'STABLE', classification: 'AUDIT_EVIDENCE' },
    ],
    workpapers: [
      { id: 'WP-AR-01', engagementId: 'ENG-0018-AUD-2026', title: 'Receivables valuation testing', revision: 1, state: 'DRAFT', submittedSnapshotId: null, submittedBy: null, reviewerActorId: 'ACT-OMAR', reviewState: 'OPEN' },
      { id: 'WP-INV-01', engagementId: 'ENG-0018-AUD-2026', title: 'Inventory existence and cut-off', revision: 1, state: 'DRAFT', submittedSnapshotId: null, submittedBy: null, reviewerActorId: 'ACT-OMAR', reviewState: 'OPEN' },
    ],
    reviews: [
      { id: 'RP-042', engagementId: 'ENG-0018-AUD-2026', title: 'AR-019 evidence conflict', severity: 'SIGNIFICANT', assigneeActorId: 'ACT-OMAR', responseReady: false, status: 'OPEN', revision: 1, detail: 'Disputed balance differs between ageing and subsequent receipt evidence.' },
      { id: 'RP-047', engagementId: 'ENG-0018-AUD-2026', title: 'Impairment provision rationale', severity: 'SIGNIFICANT', assigneeActorId: 'ACT-MAYA', responseReady: false, status: 'OPEN', revision: 1, detail: 'Management response is attached; technical treatment still needs approval.' },
    ],
    releaseCandidates: [
      { id: 'RC-026', engagementId: 'ENG-0018-AUD-2026', revision: 2, inputGeneration: 2, evaluatedInputGeneration: 1, policyGeneration: 1, manifestDigest: 'sha256:blocked-candidate', state: 'CANDIDATE', stepIndex: 0, requiredEqr: true, eqrComplete: false, managementApproved: true, partnerApproved: false, protection: 'UNKNOWN', releaseEventId: null, checkpointId: null, deliveryState: 'NOT_STARTED', archiveState: 'NOT_STARTED' },
      { id: 'RC-READY-001', engagementId: 'ENG-0009-ACC-2026', revision: 1, inputGeneration: 1, evaluatedInputGeneration: 1, policyGeneration: 1, manifestDigest: 'sha256:ready-accounting-candidate', state: 'CANDIDATE', stepIndex: 0, requiredEqr: false, eqrComplete: null, managementApproved: true, partnerApproved: true, protection: 'VERIFIED_SIMULATION', releaseEventId: null, checkpointId: null, deliveryState: 'NOT_STARTED', archiveState: 'NOT_STARTED' },
    ],
    snapshots: [],
    operations: [
      { id: 'OP-884', type: 'DELTA_RECONCILIATION', engagementId: 'ENG-0018-AUD-2026', state: 'SUCCEEDED', attempt: 1, fence: 1, authorityMode: 'SYSTEM_RECONCILE', requestDigest: 'sha256:op-884', expectedResult: '41 items observed', evidenceLevel: EVIDENCE_LEVEL },
      { id: 'OP-879', type: 'UPLOAD_TRANSFER', engagementId: 'ENG-0018-AUD-2026', state: 'RETRY_REQUIRED', attempt: 2, fence: 2, authorityMode: 'SCOPED_UPLOAD', requestDigest: 'sha256:op-879', expectedResult: '4 chunks; 2 stored', evidenceLevel: EVIDENCE_LEVEL },
    ],
    checkpoints: [],
    events: [],
    commandReceipts: [],
    cycleRuns: [],
    provider: { connected: false, nextFault: '429_RETRY_AFTER', cursor: 'cursor-41', enableExternalEffects: false },
    recovery: { state: 'NOT_RUN', externalCheckpointIndependent: true, outwardEffectsEnabled: false, activeEpoch: 1, backup: null, externalCheckpointStore: [{ releaseEventId: 'REL-EXTERNAL-001', candidateId: 'RC-READY-001', manifestDigest: 'sha256:ready-accounting-candidate', artifactHash: 'sha256:issued-simulated-artifact', state: 'VERIFIED_SIMULATION', preservedAt: '2026-09-06T11:00:00.000Z' }], reconciliation: null, case: null },
  }
}

function browserStorage() {
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

function mergeScenarioState(defaults, parsed) {
  const merged = { ...defaults, ...parsed }
  // The prototype keeps a browser-local scenario so a tab can stay open while
  // the bundle evolves. Merge newly-added control planes into an older saved
  // object instead of letting a shallow spread erase fields such as the
  // recovery epoch or audit fixtures.
  for (const key of ['firm', 'provider', 'recovery', 'audit']) {
    if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) merged[key] = { ...defaults[key], ...(parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {}) }
  }
  if (defaults.safety) {
    merged.safety = { ...defaults.safety, ...(parsed.safety && typeof parsed.safety === 'object' ? parsed.safety : {}) }
    merged.safety.firm = { ...defaults.safety.firm, ...(parsed.safety?.firm || {}) }
    merged.safety.client = { ...defaults.safety.client, ...(parsed.safety?.client || {}) }
    merged.safety.aggregate = { ...defaults.safety.aggregate, ...(parsed.safety?.aggregate || {}) }
  }
  const appendMissingById = (defaultsList, currentList) => {
    if (!Array.isArray(currentList)) return clone(defaultsList || [])
    const currentIds = new Set(currentList.map((entry) => entry?.id).filter(Boolean))
    const additions = (defaultsList || []).filter((entry) => entry?.id && !currentIds.has(entry.id)).map(clone)
    return [...currentList, ...additions]
  }
  for (const key of ['clients', 'engagements', 'actors', 'assessments', 'terms', 'activation', 'accountingPackages', 'renewalCases', 'documents', 'workpapers', 'reviews', 'releaseCandidates', 'snapshots', 'operations', 'checkpoints', 'events', 'commandReceipts', 'cycleRuns', 'legalHolds', 'amendments']) {
    merged[key] = appendMissingById(defaults[key], merged[key])
  }
  merged.audit.risks = appendMissingById(defaults.audit.risks, merged.audit.risks)
  merged.audit.populations = appendMissingById(defaults.audit.populations, merged.audit.populations)
  merged.audit.samples = appendMissingById(defaults.audit.samples, merged.audit.samples)
  merged.audit.findings = appendMissingById(defaults.audit.findings, merged.audit.findings)
  if (!Array.isArray(merged.recovery.externalCheckpointStore)) merged.recovery.externalCheckpointStore = clone(defaults.recovery.externalCheckpointStore)
  if (!Number.isInteger(merged.recovery.activeEpoch) || merged.recovery.activeEpoch < 1) merged.recovery.activeEpoch = defaults.recovery.activeEpoch
  if (typeof merged.recovery.outwardEffectsEnabled !== 'boolean') merged.recovery.outwardEffectsEnabled = defaults.recovery.outwardEffectsEnabled
  return merged
}

function loadScenario() {
  const storage = browserStorage()
  if (!storage) return { state: initialScenario(), error: null }
  try {
    const raw = storage.getItem(SCENARIO_STORAGE_KEY)
    if (!raw) return { state: initialScenario(), error: null }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SCENARIO_VERSION) return { state: initialScenario(), error: { code: 'SCENARIO_STATE_MALFORMED', message: 'The saved scenario is not a supported version.' } }
    return { state: mergeScenarioState(initialScenario(), parsed), error: null }
  } catch (error) {
    return { state: initialScenario(), error: { code: 'SCENARIO_STATE_UNAVAILABLE', message: 'The saved scenario could not be read.', cause: error } }
  }
}

const loaded = loadScenario()
export const scenarioDiagnostics = loaded.error
export const scenario = reactive(loaded.state)

function persistScenario() {
  const storage = browserStorage()
  if (!storage) return { ok: true }
  try {
    storage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenario))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: { code: 'SCENARIO_STORAGE_WRITE_FAILED', message: 'The scenario could not be saved locally.', cause: error } }
  }
}

export function resetScenario() {
  const next = initialScenario()
  Object.keys(scenario).forEach((key) => { delete scenario[key] })
  Object.assign(scenario, next)
  const persisted = persistScenario()
  return commandResult(persisted.ok ? 'COMMITTED' : 'UNAVAILABLE', { message: persisted.error?.message, code: persisted.error?.code })
}

export function scenarioState() { return scenario }

export function actorForPersona(personaId) {
  return scenario.actors.find((actor) => actor.personaId === personaId) || null
}

export function setActivePersona(personaId) {
  scenario.activePersonaId = personaId || null
  persistScenario()
  return actorForPersona(scenario.activePersonaId)
}

export function activeActor() {
  return actorForPersona(scenario.activePersonaId)
}

export function actorById(actorId) {
  return scenario.actors.find((actor) => actor.id === actorId) || null
}

export function engagementById(engagementId) {
  return scenario.engagements.find((engagement) => engagement.id === engagementId) || null
}

export function clientById(clientId) {
  return scenario.clients.find((client) => client.id === clientId) || null
}

export function selectedEngagement() { return engagementById(scenario.selectedEngagementId) || scenario.engagements[0] }

export function selectedClient() { return clientById(selectedEngagement()?.clientId) || scenario.clients[0] }

export function selectedScope() {
  const engagement = selectedEngagement()
  const client = engagement ? clientById(engagement.clientId) : null
  return engagement && client ? { firmId: scenario.firm.id, clientId: client.id, engagementId: engagement.id, service: engagement.service, period: engagement.period, currency: engagement.currency } : null
}

export function termsFor(engagementId = scenario.selectedEngagementId) {
  return scenario.terms?.find((terms) => terms.engagementId === engagementId) || null
}

export function activationFor(engagementId = scenario.selectedEngagementId) {
  return scenario.activation?.find((item) => item.engagementId === engagementId) || null
}

export function accountingPackageFor(engagementId = scenario.selectedEngagementId) {
  return scenario.accountingPackages?.find((item) => item.engagementId === engagementId) || null
}

export function renewalCaseFor(engagementId = scenario.selectedEngagementId) {
  return scenario.renewalCases?.find((item) => item.shellEngagementId === engagementId || item.sourceEngagementId === engagementId) || null
}

export function auditRiskFor(riskId = 'RISK-AR-019') {
  return scenario.audit?.risks?.find((item) => item.id === riskId) || null
}

export function auditPopulationFor(populationId = 'POP-AR-2026-01') {
  return scenario.audit?.populations?.find((item) => item.id === populationId) || null
}

export function auditSampleFor(sampleId = 'SMP-AR-03-019') {
  return scenario.audit?.samples?.find((item) => item.id === sampleId) || null
}

export function auditFindingFor(findingId = 'FND-AR-019') {
  return scenario.audit?.findings?.find((item) => item.id === findingId) || null
}

export function auditChainSummary(engagementId = scenario.selectedEngagementId) {
  const audit = scenario.audit || {}
  const risks = (audit.risks || []).filter((risk) => risk.engagementId === engagementId || !risk.engagementId)
  const populations = (audit.populations || []).filter((population) => population.engagementId === engagementId || !population.engagementId)
  const samples = (audit.samples || []).filter((sample) => populations.some((population) => population.id === sample.populationId))
  const findings = (audit.findings || []).filter((finding) => finding.engagementId === engagementId)
  const materiality = audit.materiality?.engagementId === engagementId ? audit.materiality : null
  const evaluation = evaluateAuditChain({ risks, populations, samples, findings, materiality: materiality || materialityFixture })
  return { ...evaluation, risks, populations, samples, findings, materialityRecord: materiality || null }
}

export function assessmentFor(engagementId = scenario.selectedEngagementId, type = 'acceptance') {
  const assessment = scenario.assessments?.find((item) => item.engagementId === engagementId && item.type === type) || null
  if (assessment) assessment.holds = evaluateAssessment(assessment).holds
  return assessment
}

export function assessmentSummary(engagementId = scenario.selectedEngagementId, type = 'acceptance') {
  const assessment = assessmentFor(engagementId, type)
  const evaluation = evaluateAssessment(assessment)
  return { assessment, ...evaluation }
}

export function saveAssessmentResponse({ engagementId = scenario.selectedEngagementId, type = 'acceptance', questionId, actorPersonaId, expectedRevision, idempotencyKey, answer, applicability, explanation, evidenceSnapshotId } = {}) {
  const assessment = assessmentFor(engagementId, type)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'SAVE_ASSESSMENT_RESPONSE', targetId: questionId, engagementId, payload: { type, expectedRevision, answer, applicability, explanation, evidenceSnapshotId } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!assessment || !actor?.active || !canViewEngagement(actor.id, engagementId)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot edit this assessment scope.' }))
  const result = updateAssessmentResponse(assessment, { questionId, actor, expectedRevision, answer, applicability, explanation, evidenceSnapshotId })
  if (!result.ok) return rememberReceipt(idempotencyKey, fingerprint, commandResult(result.code === 'REVISION_CONFLICT' ? 'CONFLICT' : 'DENIED', { code: result.code, message: result.message, revision: assessment.revision, data: result.evaluation || null }))
  persistScenario()
  return rememberReceipt(idempotencyKey, fingerprint, commandResult('COMMITTED', { data: result.response, revision: result.revision }))
}

export function recordAssessmentDecision({ engagementId = scenario.selectedEngagementId, type = 'acceptance', actorPersonaId, expectedRevision, idempotencyKey, decision, rationale } = {}) {
  const assessment = assessmentFor(engagementId, type)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_ASSESSMENT_DECISION', targetId: assessment?.id, engagementId, payload: { type, expectedRevision, decision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!assessment || !actor?.active || !canViewEngagement(actor.id, engagementId)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot decide this assessment scope.' }))
  const result = recordAssessmentPartnerDecision(assessment, { actor, expectedRevision, decision, rationale })
  if (!result.ok) return rememberReceipt(idempotencyKey, fingerprint, commandResult(result.code === 'REVISION_CONFLICT' ? 'CONFLICT' : 'BLOCKED', { code: result.code, message: result.message, data: result.evaluation || null, revision: assessment.revision, blockers: result.evaluation?.holds || [] }))
  persistScenario()
  return rememberReceipt(idempotencyKey, fingerprint, commandResult('COMMITTED', { data: result.decision, revision: result.revision }))
}

export function recordMaterialitySelection({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, normalizedBenchmark = '360000.00', selectedRate = '0.05', performanceRate = '0.70', trivialRate = '0.05', rationale = '' } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const current = scenario.audit?.materiality
  const fingerprint = commandFingerprint({ action: 'RECORD_MATERIALITY_SELECTION', targetId: current?.id || engagementId, engagementId, payload: { expectedRevision, normalizedBenchmark, selectedRate, performanceRate, trivialRate, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || engagement.service !== 'audit' || !current || current.engagementId !== engagementId || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot update materiality for this audit scope.' }))
  if (!actorHasRole(actor, 'engagement_partner', engagementId)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'The engagement partner must own the materiality selection.' }))
  if (expectedRevision != null && expectedRevision !== current.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected materiality revision ${expectedRevision}, current revision is ${current.revision}.`, revision: current.revision }))
  let calculated
  try { calculated = calculateMateriality({ ...current, normalizedBenchmark: String(normalizedBenchmark), selectedRate: String(selectedRate), performanceRate: String(performanceRate), trivialRate: String(trivialRate) }) } catch (error) { return finish(commandResult('BLOCKED', { code: 'MATERIALITY_INVALID', message: error.message, revision: current.revision })) }
  current.normalizedBenchmark = String(normalizedBenchmark)
  current.selectedRate = String(selectedRate)
  current.performanceRate = String(performanceRate)
  current.trivialRate = String(trivialRate)
  current.rationale = String(rationale).trim()
  current.selectedBy = actor.id
  current.revision += 1
  engagement.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'MATERIALITY_SELECTED', engagementId, materialityId: current.id, actorId: actor.id, revision: current.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: { record: current, calculated }, revision: current.revision }))
}

export function createPopulationRevision({ engagementId = scenario.selectedEngagementId, populationId = 'POP-AR-2026-01', actorPersonaId, expectedRevision, idempotencyKey, sourceId, controlTotal = '300000.00', rowCount = 218, selectionMethod = 'SPECIFIC_HIGH_VALUE_AND_MANUAL' } = {}) {
  const engagement = engagementById(engagementId)
  const population = scenario.audit?.populations?.find((item) => item.id === populationId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CREATE_POPULATION_REVISION', targetId: populationId, engagementId, payload: { expectedRevision, sourceId, controlTotal, rowCount, selectionMethod } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || engagement.service !== 'audit' || !population || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot revise this audit population.' }))
  if (!actor.roles.some((role) => ['preparer', 'accounting_reviewer', 'engagement_partner'].includes(role))) return finish(commandResult('DENIED', { code: 'POPULATION_AUTHORITY_REQUIRED', message: 'An assigned preparer, reviewer, or partner must revise a population.' }))
  if (expectedRevision != null && expectedRevision !== population.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected population revision ${expectedRevision}, current revision is ${population.revision}.`, revision: population.revision }))
  if (!sourceId || !Number.isInteger(rowCount) || rowCount <= 0) return finish(commandResult('BLOCKED', { code: 'POPULATION_INVALID', message: 'A population revision needs a source identity and positive row count.' }))
  population.revision += 1
  population.sourceId = String(sourceId)
  population.sourceRevision = population.revision
  population.rowCount = rowCount
  population.controlTotal = String(controlTotal)
  population.selectionMethod = String(selectionMethod)
  population.reconciliationState = 'REVIEW_REQUIRED'
  population.fingerprint = `sha256:population-${population.revision}-${population.sourceId}`
  engagement.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'POPULATION_REVISION_CREATED', engagementId, populationId, actorId: actor.id, revision: population.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: population, revision: population.revision, operationId: population.id }))
}

export function recordAlternativeWork({ engagementId = scenario.selectedEngagementId, sampleId = 'SMP-AR-03-019', actorPersonaId, expectedRevision, idempotencyKey, evidence, conclusion } = {}) {
  const engagement = engagementById(engagementId)
  const sample = scenario.audit?.samples?.find((item) => item.id === sampleId)
  const population = sample ? scenario.audit?.populations?.find((item) => item.id === sample.populationId) : null
  const risk = scenario.audit?.risks?.find((item) => item.populationId === sample?.populationId || (sample?.id && item.samplePlanId && sample.id.startsWith(`${item.samplePlanId}-`)))
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_ALTERNATIVE_WORK', targetId: sampleId, engagementId, payload: { expectedRevision, evidence, conclusion } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || engagement.service !== 'audit' || !sample || !population || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot update this audit sample.' }))
  if (!actor.roles.some((role) => ['independent_reviewer', 'engagement_partner'].includes(role))) return finish(commandResult('DENIED', { code: 'INDEPENDENT_REVIEW_REQUIRED', message: 'Alternative work needs an independent reviewer or partner.' }))
  if (risk?.ownerActorId === actor.id) return finish(commandResult('DENIED', { code: 'SEGREGATION_OF_DUTIES', message: 'The risk responder cannot independently disposition the same selected item.' }))
  if (expectedRevision != null && expectedRevision !== sample.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected sample revision ${expectedRevision}, current revision is ${sample.revision}.`, revision: sample.revision }))
  if (!String(evidence || '').trim() || !String(conclusion || '').trim()) return finish(commandResult('BLOCKED', { code: 'SUPPORTED_RESPONSE_REQUIRED', message: 'Alternative work needs a supported evidence reference and conclusion.' }))
  sample.alternativeWork = { evidence: String(evidence).trim(), recordedBy: actor.id, recordedAt: new Date().toISOString() }
  sample.conclusion = String(conclusion).trim()
  sample.status = 'ALTERNATIVE_WORK_RECORDED'
  sample.revision += 1
  engagement.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'ALTERNATIVE_WORK_RECORDED', engagementId, sampleId, populationId: population.id, actorId: actor.id, revision: sample.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: sample, revision: sample.revision, operationId: sample.id }))
}

export function recordFindingDisposition({ engagementId = scenario.selectedEngagementId, findingId = 'FND-AR-019', actorPersonaId, expectedRevision, idempotencyKey, decision = 'ACCEPT_EXCEPTION', rationale = '' } = {}) {
  const engagement = engagementById(engagementId)
  const finding = scenario.audit?.findings?.find((item) => item.id === findingId)
  const sample = finding ? scenario.audit?.samples?.find((item) => item.id === finding.sampleId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_FINDING_DISPOSITION', targetId: findingId, engagementId, payload: { expectedRevision, decision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !finding || !sample || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot disposition this finding.' }))
  if (!actorHasRole(actor, 'engagement_partner', engagementId)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'The engagement partner must own the professional finding disposition.' }))
  if (expectedRevision != null && expectedRevision !== finding.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected finding revision ${expectedRevision}, current revision is ${finding.revision}.`, revision: finding.revision }))
  if (!['ACCEPT_EXCEPTION', 'ADJUSTMENT_RECORDED', 'CARRY_FORWARD'].includes(decision)) return finish(commandResult('DENIED', { code: 'DECISION_INVALID', message: 'Choose ACCEPT_EXCEPTION, ADJUSTMENT_RECORDED, or CARRY_FORWARD.' }))
  if (sample.status !== 'ALTERNATIVE_WORK_RECORDED' && !sample.conclusion) return finish(commandResult('BLOCKED', { code: 'EVIDENCE_DISPOSITION_REQUIRED', message: 'Complete alternative work or a supported conclusion before disposition.' }))
  finding.state = 'DISPOSED'
  finding.professionalDisposition = { decision, rationale: String(rationale).trim(), actorId: actor.id, recordedAt: new Date().toISOString(), sampleRevision: sample.revision }
  finding.revision += 1
  const allDisposed = (scenario.audit?.findings || []).filter((item) => item.engagementId === engagementId).every((item) => item.state === 'DISPOSED')
  engagement.evidence.conclusionsComplete = allDisposed
  engagement.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'FINDING_DISPOSITION_RECORDED', engagementId, findingId, actorId: actor.id, decision, revision: finding.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: finding, revision: finding.revision, operationId: finding.id }))
}

export function canViewEngagement(actorId, engagementId) {
  const actor = actorById(actorId)
  return Boolean(actor?.active && actor.assignments.includes(engagementId))
}

function actorHasRole(actor, role, engagementId) {
  return Boolean(actor?.active && actor.roles.includes(role) && actor.assignments.includes(engagementId))
}

function commandFingerprint({ action, targetId, engagementId, payload }) {
  const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    return JSON.stringify(value)
  }
  return stable({ action, targetId, engagementId, payload: payload || {} })
}

function commandResult(outcome, { code = '', message = '', data = null, scope = selectedScope(), revision = null, operationId = null, receiptId = null, blockers = [] } = {}) {
  return { outcome, code, message, data, scope, revision, operationId, receiptId, blockers, evidenceLevel: EVIDENCE_LEVEL, correlationId: `sim-${Date.now()}-${Math.random().toString(16).slice(2)}` }
}

function existingReceipt(idempotencyKey, fingerprint) {
  if (!idempotencyKey) return null
  const receipt = scenario.commandReceipts.find((item) => item.idempotencyKey === idempotencyKey)
  if (!receipt) return null
  if (receipt.fingerprint !== fingerprint) return commandResult('CONFLICT', { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT', message: 'The idempotency key is already bound to a different payload.', receiptId: receipt.id })
  return receipt.result
}

function rememberReceipt(idempotencyKey, fingerprint, result) {
  if (!idempotencyKey) return result
  const receipt = { id: `CMD-${scenario.commandReceipts.length + 1}`, idempotencyKey, fingerprint, result }
  scenario.commandReceipts.push(receipt)
  persistScenario()
  return result
}

export function selectEngagement(engagementId, { actorPersonaId } = {}) {
  const actor = actorForPersona(actorPersonaId)
  const engagement = engagementById(engagementId)
  if (!engagement) return commandResult('DENIED', { code: 'SCOPE_NOT_FOUND', message: 'That engagement does not exist.' })
  if (!canViewEngagement(actor?.id, engagementId)) return commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'This scenario actor is not assigned to that engagement.' })
  scenario.selectedEngagementId = engagementId
  persistScenario()
  return commandResult('COMMITTED', { data: selectedScope(), revision: engagement.revision })
}

export function recordTerms({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, version = 'EL-2026-01', scopeVersion, responsibilitiesVersion = 'RESP-2026-01' } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_SIGNED_TERMS', targetId: engagementId, engagementId, payload: { expectedRevision, version, scopeVersion, responsibilitiesVersion } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot sign terms for this engagement.' }))
  if (!actorHasRole(actor, 'management_approver', engagementId) && !actorHasRole(actor, 'engagement_partner', engagementId)) return finish(commandResult('DENIED', { code: 'TERMS_AUTHORITY_REQUIRED', message: 'Signed terms must be recorded by the scoped management approver or engagement partner.' }))
  if (expectedRevision != null && expectedRevision !== engagement.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected engagement revision ${expectedRevision}, current revision is ${engagement.revision}.`, revision: engagement.revision }))
  const terms = termsFor(engagementId) || { id: `TERMS-${engagementId}`, engagementId }
  terms.version = String(version)
  terms.scopeVersion = String(scopeVersion || (engagement.service === 'audit' ? 'SCOPE-AUD-2026' : 'SCOPE-ACC-2026'))
  terms.responsibilitiesVersion = String(responsibilitiesVersion)
  terms.state = 'SIGNED'
  terms.signedBy = actor.id
  terms.signedAt = new Date().toISOString()
  if (!scenario.terms) scenario.terms = []
  if (!scenario.terms.some((item) => item.engagementId === engagementId)) scenario.terms.push(terms)
  engagement.evidence.termsSigned = true
  engagement.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'TERMS_SIGNED', engagementId, termsId: terms.id, actorId: actor.id, revision: engagement.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: terms, revision: engagement.revision }))
}

export function activationBlockers(engagementId = scenario.selectedEngagementId) {
  const engagement = engagementById(engagementId)
  if (!engagement) return [{ code: 'SCOPE_NOT_FOUND', message: 'That engagement does not exist.' }]
  const blockers = []
  const assessment = assessmentFor(engagement.id, 'acceptance')
  const evaluation = evaluateAssessment(assessment)
  if (!assessment?.decision || !['ACCEPT', 'CONTINUE'].includes(assessment.decision.decision)) blockers.push({ code: 'ACCEPTANCE_DECISION_REQUIRED', message: 'A scoped partner acceptance decision is required before activation.' })
  if (evaluation.holds.length) blockers.push(...evaluation.holds.map((hold) => ({ code: hold.code, message: hold.message })))
  if (!termsFor(engagement.id)?.state || termsFor(engagement.id).state !== 'SIGNED' || !engagement.evidence.termsSigned) blockers.push({ code: 'SIGNED_TERMS_REQUIRED', message: 'Signed terms and management responsibilities must be recorded.' })
  if (!engagement.evidence.assignmentsEligible) blockers.push({ code: 'ASSIGNMENTS_INELIGIBLE', message: 'All assigned staff must be eligible for this service and scope.' })
  if (!engagement.evidence.workspaceVerified) blockers.push({ code: 'WORKSPACE_UNVERIFIED', message: 'The scoped working workspace must be verified before work starts.' })
  if (engagement.service === 'audit' && !engagement.evidence.firmReady) blockers.push({ code: 'FIRM_NOT_READY', message: 'Firm methods and access are not ready for the audit route.' })
  return blockers
}

export function activateEngagement({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'ACTIVATE_ENGAGEMENT', targetId: engagementId, engagementId, payload: { expectedRevision } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot activate this engagement.' }))
  if (!actorHasRole(actor, 'engagement_partner', engagementId)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'Only the scoped engagement partner can activate work.' }))
  if (expectedRevision != null && expectedRevision !== engagement.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected engagement revision ${expectedRevision}, current revision is ${engagement.revision}.`, revision: engagement.revision }))
  const existing = activationFor(engagementId)
  if (existing?.state === 'ACTIVE') return finish(commandResult('COMMITTED', { data: existing, revision: engagement.revision, operationId: existing.eventId }))
  const blockers = activationBlockers(engagementId)
  if (blockers.length) return finish(commandResult('BLOCKED', { code: blockers[0].code, message: blockers[0].message, blockers, revision: engagement.revision }))
  const activation = existing || { engagementId }
  activation.state = 'ACTIVE'
  activation.activatedBy = actor.id
  activation.activatedAt = new Date().toISOString()
  activation.eventId = `EV-ACT-${scenario.events.length + 1}`
  if (!scenario.activation) scenario.activation = []
  if (!scenario.activation.some((item) => item.engagementId === engagementId)) scenario.activation.push(activation)
  engagement.evidence.accepted = true
  engagement.revision += 1
  scenario.events.push({ id: activation.eventId, type: 'ENGAGEMENT_ACTIVATED', engagementId, actorId: actor.id, revision: engagement.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: activation, revision: engagement.revision, operationId: activation.eventId }))
}

function copyContinuanceResponses(sourceAssessment, targetAssessment) {
  if (!sourceAssessment || !targetAssessment) return
  Object.values(targetAssessment.responses).forEach((response) => {
    const previous = sourceAssessment.responses?.[response.questionId]
    if (!previous) return
    response.priorAnswer = previous.answer
    response.priorVerification = previous.verification
    response.priorEvidenceSnapshotId = previous.evidenceSnapshotId || null
    response.answer = 'UNKNOWN'
    response.verification = 'UNVERIFIED'
    response.respondentActorId = null
    response.respondedAt = null
    response.explanation = ''
  })
}

export function createContinuanceShell({ sourceEngagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, nextPeriod = 'FY2027' } = {}) {
  const source = engagementById(sourceEngagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CREATE_CONTINUANCE_SHELL', targetId: sourceEngagementId, engagementId: sourceEngagementId, payload: { expectedRevision, nextPeriod } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!source || !actor?.active || !canViewEngagement(actor.id, sourceEngagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot create a continuance shell for this scope.' }))
  if (!actorHasRole(actor, 'engagement_partner', sourceEngagementId)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'Only the scoped engagement partner can create the next-period shell.' }))
  if (expectedRevision != null && expectedRevision !== source.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected engagement revision ${expectedRevision}, current revision is ${source.revision}.`, revision: source.revision }))
  const existingCase = scenario.renewalCases?.find((item) => item.sourceEngagementId === sourceEngagementId && item.nextPeriod === nextPeriod)
  if (existingCase) return finish(commandResult('COMMITTED', { data: existingCase, operationId: existingCase.shellEngagementId }))
  const suffix = source.service === 'audit' ? 'AUD' : 'ACC'
  const shellId = `${source.clientId.replace('CLI-', 'ENG-')}-${suffix}-${String(nextPeriod).replace(/\D/g, '') || 'NEXT'}`
  const shell = {
    ...clone(source),
    id: shellId,
    period: nextPeriod,
    periodLabel: `Year ended 31 Dec ${String(nextPeriod).replace(/\D/g, '') || 'next period'}`,
    revision: 1,
    inputGeneration: 1,
    policyGeneration: source.policyGeneration,
    linkedEngagementId: null,
    isNextPeriodShell: true,
    sourceEngagementId,
    evidence: { firmReady: source.evidence.firmReady, accepted: false, termsSigned: false, assignmentsEligible: false, workspaceVerified: false, sourceValidated: false, mappingReviewed: false, statementApproved: false, auditPlanReady: source.service === 'audit' ? false : null, conclusionsComplete: source.service === 'audit' ? false : null, managementApproved: false, partnerApproved: false, eqrRequired: source.evidence.eqrRequired, eqrComplete: source.evidence.eqrRequired ? false : null, protection: 'UNKNOWN', archiveVerified: false },
    holds: [{ id: `HOLD-${shellId}-CONT`, code: 'CONTINUANCE_REQUIRED', message: 'Fresh annual continuance responses and partner decision are required for this next-period shell.', action: 'Complete RV-001…RV-030 and record renewal outcome.' }],
  }
  const sourceContinuance = assessmentFor(sourceEngagementId, 'continuance')
  const nextAssessment = createAssessment({ id: `ASMT-${shellId}-CONT`, engagementId: shellId, type: 'continuance', revision: 1 })
  copyContinuanceResponses(sourceContinuance, nextAssessment)
  if (!scenario.engagements.some((item) => item.id === shellId)) scenario.engagements.push(shell)
  scenario.actors.forEach((scenarioActor) => {
    if (scenarioActor.assignments.includes(sourceEngagementId) && !scenarioActor.assignments.includes(shellId)) scenarioActor.assignments.push(shellId)
  })
  if (!scenario.assessments) scenario.assessments = []
  scenario.assessments.push(nextAssessment)
  if (!scenario.terms) scenario.terms = []
  scenario.terms.push({ id: `TERMS-${shellId}`, engagementId: shellId, version: 'EL-2027-01', state: 'DRAFT', signedBy: null, signedAt: null, responsibilitiesVersion: 'RESP-2027-01', scopeVersion: source.service === 'audit' ? 'SCOPE-AUD-2027' : 'SCOPE-ACC-2027' })
  if (!scenario.activation) scenario.activation = []
  scenario.activation.push({ engagementId: shellId, state: 'PENDING', activatedBy: null, activatedAt: null, eventId: null })
  const renewalCase = { id: `RENEW-${scenario.renewalCases.length + 1}`, sourceEngagementId, shellEngagementId: shellId, clientId: source.clientId, service: source.service, priorPeriod: source.period, nextPeriod, state: 'PENDING_ASSESSMENT', copiedFacts: Object.values(nextAssessment.responses).filter((response) => response.priorAnswer).map((response) => ({ questionId: response.questionId, priorAnswer: response.priorAnswer, priorVerification: response.priorVerification, currentState: 'UNVERIFIED' })), decision: null, closeout: null }
  scenario.renewalCases.push(renewalCase)
  source.nextPeriodEngagementId = shellId
  source.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'CONTINUANCE_SHELL_CREATED', sourceEngagementId, shellEngagementId: shellId, actorId: actor.id, revision: source.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: renewalCase, revision: source.revision, operationId: shellId }))
}

export function recordRenewalDecision({ shellEngagementId, actorPersonaId, expectedRevision, idempotencyKey, decision, rationale = '' } = {}) {
  const shell = engagementById(shellEngagementId)
  const actor = actorForPersona(actorPersonaId)
  const renewalCase = scenario.renewalCases?.find((item) => item.shellEngagementId === shellEngagementId)
  const fingerprint = commandFingerprint({ action: 'RECORD_RENEWAL_DECISION', targetId: shellEngagementId, engagementId: shellEngagementId, payload: { expectedRevision, decision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!shell || !renewalCase || !actor?.active || !canViewEngagement(actor.id, renewalCase.sourceEngagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot record this continuance decision.' }))
  if (!actorHasRole(actor, 'engagement_partner', renewalCase.sourceEngagementId)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'Only the scoped engagement partner can record renewal or non-renewal.' }))
  if (!['RENEW', 'NON_RENEW', 'WITHDRAW'].includes(decision)) return finish(commandResult('DENIED', { code: 'DECISION_INVALID', message: 'Choose RENEW, NON_RENEW, or WITHDRAW.' }))
  if (expectedRevision != null && expectedRevision !== shell.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected shell revision ${expectedRevision}, current revision is ${shell.revision}.`, revision: shell.revision }))
  if (decision === 'RENEW') {
    const evaluation = evaluateAssessment(assessmentFor(shellEngagementId, 'continuance'))
    if (evaluation.holds.length) return finish(commandResult('BLOCKED', { code: 'CONTINUANCE_HOLDS', message: 'Resolve every current-period continuance hold before renewal.', blockers: evaluation.holds, revision: shell.revision }))
  }
  renewalCase.decision = { decision, rationale: String(rationale).trim(), actorId: actor.id, recordedAt: new Date().toISOString(), sourceEngagementId: renewalCase.sourceEngagementId, shellEngagementId }
  renewalCase.state = decision === 'RENEW' ? 'RENEWED_PENDING_TERMS' : 'NON_RENEWED'
  renewalCase.closeout = decision === 'RENEW' ? null : { state: 'REQUIRED', preserveRecords: true, deletion: 'DISABLED', ownerActorId: actor.id }
  shell.revision += 1
  shell.holds = shell.holds.filter((hold) => !['CONTINUANCE_REQUIRED', 'CONTINUANCE_DECISION_REQUIRED'].includes(hold.code))
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: decision === 'RENEW' ? 'RENEWAL_APPROVED' : 'RELATIONSHIP_CLOSEOUT_REQUIRED', shellEngagementId, sourceEngagementId: renewalCase.sourceEngagementId, actorId: actor.id, decision, revision: shell.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: renewalCase, revision: shell.revision, operationId: renewalCase.id }))
}

function applicable(definition, engagement) {
  if (definition.period === 'next') return true
  if (definition.scope === 'audit') return engagement.service === 'audit'
  if (definition.scope === 'accounting-or-audit') return ['accounting', 'audit'].includes(engagement.service)
  return true
}

function openReviewBlockers(engagementId) {
  return scenario.reviews.filter((point) => point.engagementId === engagementId && point.status !== 'CLEARED' && point.severity === 'SIGNIFICANT').map((point) => ({ id: point.id, code: 'REVIEW_POINT_OPEN', message: point.title }))
}

export function deriveGates(engagementId = scenario.selectedEngagementId) {
  const engagement = engagementById(engagementId) || selectedEngagement()
  const evidence = engagement.evidence
  const reviewBlockers = openReviewBlockers(engagement.id)
  const acceptance = assessmentFor(engagement.id, 'acceptance')
  const acceptanceEvaluation = evaluateAssessment(acceptance)
  const acceptanceReady = Boolean(acceptance?.decision && ['ACCEPT', 'CONTINUE'].includes(acceptance.decision.decision) && !acceptanceEvaluation.holds.length)
  const packageRecord = accountingPackageFor(engagement.id)
  const auditChain = engagement.service === 'audit' ? auditChainSummary(engagement.id) : { blockers: [] }
  const sourceReady = packageRecord ? packageRecord.source.validationState === 'VALIDATED' : evidence.sourceValidated
  const mappingReady = packageRecord ? packageRecord.mappings.state === 'REVIEWED' : evidence.mappingReviewed
  const statementReady = packageRecord ? packageRecord.statement.state === 'APPROVED' : evidence.statementApproved
  const statuses = {
    G0: evidence.firmReady ? 'good' : 'danger',
    G1: acceptanceReady || (evidence.accepted && !acceptance) ? 'good' : 'danger',
    G2: evidence.termsSigned && evidence.assignmentsEligible && evidence.workspaceVerified ? 'good' : 'danger',
    G3: sourceReady ? 'good' : 'danger',
    G4: mappingReady && statementReady ? 'good' : mappingReady ? 'warn' : 'danger',
    G5: engagement.service === 'audit' ? (evidence.auditPlanReady && !auditChain.blockers.some((item) => item.code === 'RISK_RESPONSE_MISSING' || item.code === 'MATERIALITY_SELECTION_INCOMPLETE') ? 'good' : 'warn') : 'neutral',
    G6: engagement.service === 'audit' ? (evidence.conclusionsComplete && !reviewBlockers.length && !auditChain.blockers.length ? 'good' : 'danger') : 'neutral',
    G7: evidence.managementApproved && evidence.partnerApproved && (!evidence.eqrRequired || evidence.eqrComplete) ? 'good' : 'danger',
    G8: engagement.releaseEventId ? 'good' : 'danger',
    G9: evidence.archiveVerified ? 'good' : 'danger',
    G10: 'neutral',
  }
  return gateDefinitions.map((definition) => ({
    ...definition,
    applicable: applicable(definition, engagement),
    status: statuses[definition.id],
    blockers: definition.id === 'G6' ? [...reviewBlockers, ...auditChain.blockers] : definition.id === 'G8' ? releaseBlockers(engagement) : [],
    nextPeriodNote: definition.id === 'G10' ? 'This is a fresh continuance permission for the next period, not a current-year completion gate.' : '',
  }))
}

export function gateSummary(engagementId = scenario.selectedEngagementId) {
  const gates = deriveGates(engagementId)
  const current = gates.filter((gate) => gate.applicable && gate.period === 'current')
  const next = gates.filter((gate) => gate.applicable && gate.period === 'next')
  return {
    gates,
    currentDenominator: current.length,
    currentReady: current.filter((gate) => gate.status === 'good').length,
    nextDenominator: next.length,
    nextReady: next.filter((gate) => gate.status === 'good').length,
  }
}

function releaseBlockers(engagement) {
  const candidate = scenario.releaseCandidates.find((item) => item.engagementId === engagement.id && item.state !== 'ARCHIVED')
  if (!candidate) return [{ code: 'CANDIDATE_NOT_FOUND', message: 'No release candidate is selected.' }]
  const blockers = []
  if (candidate.inputGeneration !== engagement.inputGeneration || candidate.evaluatedInputGeneration !== engagement.inputGeneration) blockers.push({ code: 'INPUTS_NOT_EVALUATED', message: 'The candidate was evaluated against an older input generation.' })
  const clientSafety = scenario.safety.client[engagement.clientId]
  if (clientSafety && clientSafety.state !== 'CURRENT') blockers.push({ code: 'CLIENT_SAFETY_UNEVALUATED', message: `Client Safety State is ${clientSafety.state.toLowerCase()}; linked impacts must be evaluated before release.` })
  if (engagement.holds.length) blockers.push(...engagement.holds.map((hold) => ({ code: hold.code, message: hold.message })))
  if (openReviewBlockers(engagement.id).length) blockers.push(...openReviewBlockers(engagement.id))
  if (!candidate.managementApproved) blockers.push({ code: 'MANAGEMENT_APPROVAL_REQUIRED', message: 'Management responsibility is not bound to this exact candidate.' })
  if (!candidate.partnerApproved) blockers.push({ code: 'PARTNER_APPROVAL_REQUIRED', message: 'Partner conclusion is not bound to this exact candidate.' })
  if (candidate.requiredEqr && !candidate.eqrComplete) blockers.push({ code: 'EQR_INCOMPLETE', message: 'Required EQR must complete before report dating.' })
  if (candidate.protection !== 'VERIFIED_SIMULATION') blockers.push({ code: 'RECORD_PROTECTION_UNVERIFIED', message: 'Exact signed artifacts do not have verified simulated protection.' })
  return blockers
}

export function pauseImpactProcessing({ actorPersonaId } = {}) {
  const actor = actorForPersona(actorPersonaId)
  if (!actor?.roles.includes('system_admin')) return commandResult('DENIED', { code: 'AUTHORITY_REQUIRED', message: 'Only the system-admin simulation actor can pause impact processing.' })
  scenario.safety.impactProcessing = 'PAUSED'
  persistScenario()
  return commandResult('COMMITTED', { data: { impactProcessing: scenario.safety.impactProcessing } })
}

export function resumeImpactProcessing({ actorPersonaId } = {}) {
  const actor = actorForPersona(actorPersonaId)
  if (!actor?.roles.includes('system_admin')) return commandResult('DENIED', { code: 'AUTHORITY_REQUIRED', message: 'Only the system-admin simulation actor can resume impact processing.' })
  scenario.safety.impactProcessing = 'RUNNING'
  persistScenario()
  return commandResult('COMMITTED', { data: { impactProcessing: scenario.safety.impactProcessing } })
}

export function mutateAccountingInput({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, reason = 'Linked source changed' } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'MUTATE_ACCOUNTING_INPUT', targetId: engagementId, engagementId, payload: { expectedRevision, reason } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!engagement || !actor?.active || !canViewEngagement(actor.id, engagementId)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot change this engagement input.' }))
  if (expectedRevision != null && expectedRevision !== engagement.revision) return rememberReceipt(idempotencyKey, fingerprint, commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected revision ${expectedRevision}, current revision is ${engagement.revision}.`, revision: engagement.revision }))
  engagement.revision += 1
  engagement.inputGeneration += 1
  const clientSafety = scenario.safety.client[engagement.clientId] || { generation: 0, state: 'CURRENT' }
  clientSafety.generation += 1
  clientSafety.state = 'UNEVALUATED'
  scenario.safety.client[engagement.clientId] = clientSafety
  scenario.safety.aggregate.generation += 1
  scenario.safety.aggregate.state = 'UNEVALUATED'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'INPUT_GENERATION_CHANGED', engagementId, actorId: actor.id, revision: engagement.revision, inputGeneration: engagement.inputGeneration, reason, evidenceLevel: EVIDENCE_LEVEL })
  // The impact case is recorded synchronously even if its worker is paused.
  engagement.impactCase = { id: `IMPACT-${engagement.inputGeneration}`, inputGeneration: engagement.inputGeneration, state: scenario.safety.impactProcessing === 'PAUSED' ? 'PENDING_WORKER' : 'QUEUED', createdBy: actor.id }
  // Accounting and audit engagements for the same client share a conservative
  // dependency generation. A source mutation therefore invalidates the linked
  // track immediately; a background impact worker may enrich the projection
  // later, but it can never make the stale candidate current by itself.
  const linkedEngagement = engagement.linkedEngagementId ? engagementById(engagement.linkedEngagementId) : null
  if (linkedEngagement) {
    linkedEngagement.revision += 1
    linkedEngagement.inputGeneration += 1
    linkedEngagement.dependencyState = 'STALE_FROM_LINKED_INPUT'
    scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'LINKED_INPUT_INVALIDATED', engagementId: linkedEngagement.id, sourceEngagementId: engagement.id, actorId: actor.id, revision: linkedEngagement.revision, inputGeneration: linkedEngagement.inputGeneration, evidenceLevel: EVIDENCE_LEVEL })
  }
  const result = commandResult('COMMITTED', { data: { engagementId, inputGeneration: engagement.inputGeneration, impactCase: engagement.impactCase }, revision: engagement.revision })
  return rememberReceipt(idempotencyKey, fingerprint, result)
}

export function clearReviewPoint({ pointId, actorPersonaId, expectedRevision, idempotencyKey, response = '' } = {}) {
  const point = scenario.reviews.find((item) => item.id === pointId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CLEAR_REVIEW_POINT', targetId: pointId, engagementId: point?.engagementId, payload: { expectedRevision, response } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!point) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'OBJECT_NOT_FOUND', message: 'That review point does not exist.' }))
  if (!actor?.active || !canViewEngagement(actor.id, point.engagementId)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot view this review point.' }))
  if (!actorHasRole(actor, 'independent_reviewer', point.engagementId)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'AUTHORITY_REQUIRED', message: 'An independent reviewer must clear a significant review point.' }))
  if (point.assigneeActorId === actor.id) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SEGREGATION_OF_DUTIES', message: 'The assigned responder cannot self-clear this review point.' }))
  if (point.status === 'CLEARED') return rememberReceipt(idempotencyKey, fingerprint, commandResult('COMMITTED', { data: point, revision: point.revision }))
  if (expectedRevision != null && expectedRevision !== point.revision) return rememberReceipt(idempotencyKey, fingerprint, commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected revision ${expectedRevision}, current revision is ${point.revision}.`, revision: point.revision }))
  if (!point.responseReady && !String(response).trim()) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: 'SUPPORTED_RESPONSE_REQUIRED', message: 'A supported response or alternative-work reference is required before clearance.' }))
  point.status = 'CLEARED'
  point.revision += 1
  point.clearedBy = actor.id
  point.clearedAt = new Date().toISOString()
  point.responseReady = true
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'REVIEW_POINT_CLEARED', pointId, engagementId: point.engagementId, actorId: actor.id, revision: point.revision, evidenceLevel: EVIDENCE_LEVEL })
  const result = commandResult('COMMITTED', { data: point, revision: point.revision })
  return rememberReceipt(idempotencyKey, fingerprint, result)
}

export async function assembleArchive({ candidateId, actorPersonaId, expectedRevision, idempotencyKey, purpose = 'INTERNAL_RECORDS' } = {}) {
  const candidate = candidateFor(candidateId)
  const engagement = candidate ? engagementById(candidate.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'ASSEMBLE_ARCHIVE', targetId: candidateId, engagementId: candidate?.engagementId, payload: { expectedRevision, purpose } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!candidate || !engagement) return finish(commandResult('DENIED', { code: 'CANDIDATE_NOT_FOUND', message: 'No release candidate is selected.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot assemble this archive.' }))
  if (!actor.roles.includes('records_custodian')) return finish(commandResult('DENIED', { code: 'RECORDS_AUTHORITY_REQUIRED', message: 'A scoped records custodian must assemble the archive.' }))
  if (expectedRevision != null && expectedRevision !== candidate.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected candidate revision ${expectedRevision}, current revision is ${candidate.revision}.`, revision: candidate.revision }))
  if (!candidate.releaseEventId || candidate.stepIndex < 9) return finish(commandResult('BLOCKED', { code: 'RELEASE_NOT_ARCHIVE_READY', message: 'Archive assembly requires a committed release event and completed delivery state.' }))
  const docs = (scenario.documents || []).filter((item) => item.engagementId === engagement.id)
  const snapshots = (scenario.snapshots || []).filter((item) => item.engagementId === engagement.id)
  const dangling = docs.filter((doc) => doc.snapshotId && !snapshots.some((snapshot) => snapshot.id === doc.snapshotId))
  if (dangling.length) return finish(commandResult('BLOCKED', { code: 'SNAPSHOT_MISSING', message: `Archive references ${dangling.length} document snapshot(s) that are not available in the current state.`, blockers: dangling.map((doc) => ({ code: 'SNAPSHOT_MISSING', message: doc.snapshotId })) }))
  const archiveManifest = {
    schema: 'auditflow.synthetic.archive.v1',
    candidateId,
    engagementId: engagement.id,
    clientId: engagement.clientId,
    period: engagement.period,
    purpose: String(purpose),
    releaseEventId: candidate.releaseEventId,
    checkpointId: candidate.checkpointId,
    references: {
      snapshots: snapshots.map((snapshot) => ({ id: snapshot.id, snapshotHash: snapshot.snapshotHash, manifestDigest: snapshot.manifestDigest })).sort((left, right) => left.id.localeCompare(right.id)),
      documents: docs.map((doc) => ({ id: doc.id, snapshotId: doc.snapshotId || null, snapshotHash: doc.snapshotHash || null })).sort((left, right) => left.id.localeCompare(right.id)),
      assessments: (scenario.assessments || []).filter((item) => item.engagementId === engagement.id).map((item) => ({ id: item.id, revision: item.revision, decision: item.decision?.decision || null })),
      accountingPackages: (scenario.accountingPackages || []).filter((item) => item.engagementId === engagement.id).map((item) => ({ id: item.id, revision: item.revision, sourceId: item.source.sourceId, statementId: item.statement.id })),
      risks: (scenario.audit?.risks || []).filter((item) => !item.engagementId || item.engagementId === engagement.id).map((item) => ({ id: item.id, revision: item.revision, conclusionState: item.conclusionState })),
      findings: (scenario.audit?.findings || []).filter((item) => item.engagementId === engagement.id).map((item) => ({ id: item.id, revision: item.revision, state: item.state })),
      reviews: (scenario.reviews || []).filter((item) => item.engagementId === engagement.id).map((item) => ({ id: item.id, revision: item.revision, status: item.status })),
      events: (scenario.events || []).filter((item) => item.engagementId === engagement.id || item.candidateId === candidate.id).map((item) => ({ id: item.id, type: item.type, revision: item.revision || null })),
    },
  }
  const manifestData = await canonicalManifestDigest(archiveManifest)
  const archive = { id: `ARCH-${candidate.id}`, candidateId, engagementId: engagement.id, manifest: archiveManifest, canonicalManifest: manifestData.canonicalBytesBase64, manifestDigest: manifestData.digest, desiredProtection: 'RECORDS_LOCK', observedProtection: candidate.protection, protectionState: candidate.protection === 'VERIFIED_SIMULATION' ? 'OBSERVED_SIMULATION' : 'UNVERIFIED', state: 'VERIFIED_SIMULATION', assembledBy: actor.id, assembledAt: new Date().toISOString(), purpose: String(purpose), evidenceLevel: EVIDENCE_LEVEL }
  const existing = scenario.archivePackages?.find((item) => item.candidateId === candidateId)
  if (existing) return finish(commandResult('COMMITTED', { data: existing, revision: candidate.revision, operationId: existing.id }))
  scenario.archivePackages.push(archive)
  candidate.archiveState = 'VERIFIED'
  engagement.evidence.archiveVerified = true
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'ARCHIVE_ASSEMBLED', candidateId, engagementId: engagement.id, archiveId: archive.id, manifestDigest: archive.manifestDigest, actorId: actor.id, revision: candidate.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: archive, revision: candidate.revision, operationId: archive.id }))
}

export function recordLegalHold({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, type = 'LITIGATION', reason = 'Synthetic preservation requirement' } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_LEGAL_HOLD', targetId: engagementId, engagementId, payload: { expectedRevision, type, reason } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot record a legal hold for this scope.' }))
  if (!actorHasRole(actor, 'records_custodian', engagementId)) return finish(commandResult('DENIED', { code: 'RECORDS_AUTHORITY_REQUIRED', message: 'A scoped records custodian must record a legal hold.' }))
  if (expectedRevision != null && expectedRevision !== engagement.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected engagement revision ${expectedRevision}, current revision is ${engagement.revision}.`, revision: engagement.revision }))
  const hold = { id: `LH-${engagement.clientId}-${scenario.legalHolds.length + 1}`, engagementId, type: String(type), state: 'ACTIVE', blocksDisposal: true, reason: String(reason).trim(), createdBy: actor.id, createdAt: new Date().toISOString(), revision: 1, releasedBy: null, releasedAt: null }
  scenario.legalHolds.push(hold)
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'LEGAL_HOLD_RECORDED', engagementId, holdId: hold.id, actorId: actor.id, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: hold, revision: engagement.revision, operationId: hold.id }))
}

export function releaseLegalHold({ holdId, actorPersonaId, expectedRevision, idempotencyKey, rationale = '' } = {}) {
  const hold = scenario.legalHolds?.find((item) => item.id === holdId)
  const engagement = hold ? engagementById(hold.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RELEASE_LEGAL_HOLD', targetId: holdId, engagementId: hold?.engagementId, payload: { expectedRevision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!hold || !engagement || !actor?.active || !canViewEngagement(actor.id, engagement.id)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot release this legal hold.' }))
  if (!actorHasRole(actor, 'records_custodian', engagement.id)) return finish(commandResult('DENIED', { code: 'RECORDS_AUTHORITY_REQUIRED', message: 'A scoped records custodian must release a legal hold.' }))
  if (expectedRevision != null && expectedRevision !== hold.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected hold revision ${expectedRevision}, current revision is ${hold.revision}.`, revision: hold.revision }))
  if (hold.state !== 'ACTIVE') return finish(commandResult('COMMITTED', { data: hold, revision: hold.revision, operationId: hold.id }))
  hold.state = 'RELEASED'
  hold.blocksDisposal = false
  hold.releasedBy = actor.id
  hold.releasedAt = new Date().toISOString()
  hold.rationale = String(rationale).trim()
  hold.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'LEGAL_HOLD_RELEASED', engagementId: engagement.id, holdId, actorId: actor.id, revision: hold.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: hold, revision: hold.revision, operationId: hold.id }))
}

export function createAmendmentCase({ candidateId, actorPersonaId, expectedRevision, idempotencyKey, reason = 'Post-issuance fact requires a new assessment.' } = {}) {
  const candidate = candidateFor(candidateId)
  const engagement = candidate ? engagementById(candidate.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CREATE_AMENDMENT_CASE', targetId: candidateId, engagementId: candidate?.engagementId, payload: { expectedRevision, reason } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!candidate || !engagement) return finish(commandResult('DENIED', { code: 'CANDIDATE_NOT_FOUND', message: 'The issued candidate does not exist.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot create an amendment for this scope.' }))
  if (!actorHasRole(actor, 'engagement_partner', engagement.id)) return finish(commandResult('DENIED', { code: 'PARTNER_AUTHORITY_REQUIRED', message: 'An engagement partner must open an amendment assessment.' }))
  if (candidate.stepIndex < 9 || !candidate.releaseEventId) return finish(commandResult('BLOCKED', { code: 'ISSUED_PACKAGE_REQUIRED', message: 'An amendment can only link to an issued package.' }))
  if (expectedRevision != null && expectedRevision !== candidate.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected candidate revision ${expectedRevision}, current revision is ${candidate.revision}.`, revision: candidate.revision }))
  const existing = scenario.amendments?.find((item) => item.originalCandidateId === candidateId && item.state !== 'CLOSED')
  if (existing) return finish(commandResult('COMMITTED', { data: existing, revision: candidate.revision, operationId: existing.id }))
  const amendment = { id: `AMD-${scenario.amendments.length + 1}`, originalCandidateId: candidateId, engagementId: engagement.id, originalReleaseEventId: candidate.releaseEventId, originalManifestDigest: candidate.manifestDigest, state: 'ASSESSMENT_REQUIRED', reason: String(reason).trim(), preserveOriginal: true, createdBy: actor.id, createdAt: new Date().toISOString(), revision: 1 }
  scenario.amendments.push(amendment)
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'AMENDMENT_CASE_CREATED', engagementId: engagement.id, candidateId, amendmentId: amendment.id, actorId: actor.id, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: amendment, revision: candidate.revision, operationId: amendment.id }))
}

export const releaseSteps = [
  ['Candidate selected', 'Exact client, period and dependencies are pinned.'],
  ['Snapshots frozen', 'Stable source snapshots and canonical manifest are preserved.'],
  ['Decisions bound', 'Management, partner and required professional decisions match the candidate.'],
  ['EQR complete', 'Required engagement quality review is complete before report dating.'],
  ['Report dated', 'Pre-sign content and signature verification are bound to the candidate.'],
  ['Artifacts protected', 'Exact signed artifacts have simulated protection evidence.'],
  ['Release event committed', 'One atomic release event and delivery intent exist.'],
  ['Checkpoint verified', 'Independent external checkpoint is verified before delivery.'],
  ['Delivered', 'The exact package was delivered or remains in a retryable state.'],
  ['Archive assembled', 'Structured and document records are assembled and verified.'],
]

function candidateFor(candidateId) {
  return scenario.releaseCandidates.find((candidate) => candidate.id === candidateId) || null
}

export function releaseCandidateBlockers(candidateId) {
  const candidate = candidateFor(candidateId)
  const engagement = candidate ? engagementById(candidate.engagementId) : null
  return candidate && engagement ? releaseBlockers(engagement) : [{ code: 'CANDIDATE_NOT_FOUND', message: 'No release candidate is selected.' }]
}

export function advanceRelease({ candidateId, actorPersonaId, expectedRevision, idempotencyKey } = {}) {
  const candidate = candidateFor(candidateId)
  const engagement = candidate ? engagementById(candidate.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'ADVANCE_RELEASE', targetId: candidateId, engagementId: candidate?.engagementId, payload: { expectedRevision } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!candidate || !engagement) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'CANDIDATE_NOT_FOUND', message: 'No release candidate is selected.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot release this client scope.' }))
  if (!actorHasRole(actor, 'signatory', engagement.id)) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SIGNATORY_AUTHORITY_REQUIRED', message: 'Only the scoped signatory can run the release command.' }))
  if (expectedRevision != null && expectedRevision !== candidate.revision) return rememberReceipt(idempotencyKey, fingerprint, commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected candidate revision ${expectedRevision}, current revision is ${candidate.revision}.`, revision: candidate.revision }))
  const blockers = releaseCandidateBlockers(candidate.id)
  // A candidate cannot advance until every current guard is satisfied. This
  // check also runs at the release-event boundary: a new hold or generation
  // change cannot slip through merely because the candidate reached step 6.
  if (candidate.stepIndex <= 6 && blockers.length) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: blockers[0].code, message: blockers[0].message, blockers }))
  if (candidate.stepIndex === 6 && !candidate.releaseEventId) {
    const releaseEvent = { id: `REL-${scenario.events.length + 1}`, candidateId: candidate.id, engagementId: engagement.id, revision: candidate.revision, manifestDigest: candidate.manifestDigest, createdBy: actor.id, state: 'COMMITTED', evidenceLevel: EVIDENCE_LEVEL }
    scenario.events.push(releaseEvent)
    candidate.releaseEventId = releaseEvent.id
    candidate.state = 'RELEASE_COMMITTED'
    engagement.releaseEventId = releaseEvent.id
  }
  if (candidate.stepIndex === 7 && !candidate.releaseEventId) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: 'RELEASE_EVENT_REQUIRED', message: 'Create the release event before its external checkpoint.' }))
  if (candidate.stepIndex === 7 && !candidate.checkpointId) {
    return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: 'CHECKPOINT_REQUIRED', message: 'Verify the independent checkpoint before first delivery.' }))
  }
  if (candidate.stepIndex === 8 && !candidate.checkpointId) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: 'CHECKPOINT_REQUIRED', message: 'Delivery is blocked until the release checkpoint is verified.' }))
  if (candidate.stepIndex === 8 && blockers.length) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: blockers[0].code, message: blockers[0].message, blockers }))
  candidate.stepIndex = Math.min(candidate.stepIndex + 1, releaseSteps.length - 1)
  candidate.revision += 1
  if (candidate.stepIndex === 9) candidate.archiveState = 'PENDING_ASSEMBLY'
  if (candidate.stepIndex === 8) candidate.deliveryState = 'DELIVERED_SIMULATION'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'RELEASE_STEP_ADVANCED', candidateId: candidate.id, stepIndex: candidate.stepIndex, actorId: actor.id, revision: candidate.revision, evidenceLevel: EVIDENCE_LEVEL })
  const result = commandResult('COMMITTED', { data: candidate, revision: candidate.revision, operationId: candidate.releaseEventId })
  return rememberReceipt(idempotencyKey, fingerprint, result)
}

export function createReleaseCheckpoint({ candidateId, actorPersonaId, expectedRevision, idempotencyKey } = {}) {
  const candidate = candidateFor(candidateId)
  const engagement = candidate ? engagementById(candidate.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CREATE_RELEASE_CHECKPOINT', targetId: candidateId, engagementId: candidate?.engagementId, payload: { expectedRevision } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!candidate || !engagement) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'CANDIDATE_NOT_FOUND', message: 'No release candidate is selected.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id) || !actor.roles.includes('records_custodian')) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'RECORDS_AUTHORITY_REQUIRED', message: 'A scoped records custodian must verify the checkpoint.' }))
  if (!candidate.releaseEventId) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: 'RELEASE_EVENT_REQUIRED', message: 'The release event must exist before a checkpoint can be created.' }))
  if (candidate.checkpointId) return rememberReceipt(idempotencyKey, fingerprint, commandResult('COMMITTED', { data: candidate, revision: candidate.revision, operationId: candidate.checkpointId }))
  if (expectedRevision != null && expectedRevision !== candidate.revision) return rememberReceipt(idempotencyKey, fingerprint, commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: 'The release candidate changed while the checkpoint was being prepared.', revision: candidate.revision }))
  const blockers = releaseCandidateBlockers(candidate.id)
  if (blockers.length) return rememberReceipt(idempotencyKey, fingerprint, commandResult('BLOCKED', { code: blockers[0].code, message: blockers[0].message, blockers }))
  const checkpoint = { id: `CHK-${scenario.checkpoints.length + 1}`, releaseEventId: candidate.releaseEventId, manifestDigest: candidate.manifestDigest, state: 'VERIFIED_SIMULATION', createdBy: actor.id, evidenceLevel: EVIDENCE_LEVEL }
  scenario.checkpoints.push(checkpoint)
  candidate.checkpointId = checkpoint.id
  candidate.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'EXTERNAL_CHECKPOINT_VERIFIED', candidateId: candidate.id, checkpointId: checkpoint.id, actorId: actor.id, evidenceLevel: EVIDENCE_LEVEL })
  const result = commandResult('COMMITTED', { data: checkpoint, revision: candidate.revision, operationId: checkpoint.id })
  return rememberReceipt(idempotencyKey, fingerprint, result)
}

export function runIntegrationReconciliation({ actorPersonaId, engagementId = scenario.selectedEngagementId, idempotencyKey } = {}) {
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RUN_RECONCILIATION', targetId: engagementId, engagementId, payload: {} })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  if (!actor?.active || !actor.roles.includes('system_admin')) return rememberReceipt(idempotencyKey, fingerprint, commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the system-admin simulation actor can run reconciliation.' }))
  const operationNumber = scenario.operations.length + 1
  const fault = scenario.provider.connected ? (scenario.provider.nextFault || 'NONE') : 'NOT_CONNECTED'
  const faultMap = {
    NONE: { state: 'SUCCEEDED', code: null, message: 'Synthetic provider delta reconciled without outward effects.' },
    '429_RETRY_AFTER': { state: 'RETRY_REQUIRED', code: 'PROVIDER_429', message: 'Provider requested retry after a bounded delay; no permission was expanded.' },
    '403_FORBIDDEN': { state: 'FAILED', code: 'PROVIDER_403', message: 'Provider denied the selected resource; no broader consent is attempted.' },
    '500_SERVER_ERROR': { state: 'RETRY_REQUIRED', code: 'PROVIDER_5XX', message: 'Provider server error is retryable with the same request digest.' },
    TIMEOUT_AFTER_UPLOAD_SUCCESS: { state: 'UNCERTAIN_REMOTE_SUCCESS', code: 'REMOTE_SUCCESS_LOCAL_TIMEOUT', message: 'The remote simulator may have stored the artifact; reconcile the same deterministic target before retrying.' },
    EXPIRED_LEASE: { state: 'FENCED', code: 'LEASE_EXPIRED', message: 'The attempt lease expired; its fence cannot publish completion.' },
    CURSOR_EXPIRED: { state: 'CURSOR_EXPIRED', code: 'CURSOR_EXPIRED', message: 'The delta cursor expired; a full bounded reconciliation is required.' },
    NOT_CONNECTED: { state: 'NOT_CONNECTED', code: 'PROVIDER_NOT_CONNECTED', message: 'No live provider is connected; no success is claimed.' },
  }
  const selectedFault = faultMap[fault] || faultMap.NOT_CONNECTED
  const attemptId = `ATT-SIM-${String(operationNumber).padStart(3, '0')}-01`
  const operation = { id: `OP-SIM-${String(operationNumber).padStart(3, '0')}`, type: 'DELTA_RECONCILIATION', schemaVersion: 1, engagementId, state: selectedFault.state, code: selectedFault.code, attempt: 1, attemptId, fence: operationNumber, leaseId: `LEASE-${operationNumber}`, leaseExpiresAt: fault === 'EXPIRED_LEASE' ? 'EXPIRED' : `synthetic+${operationNumber}m`, authorityMode: 'SYSTEM_RECONCILE', requestDigest: `sha256:sim-reconcile-${operationNumber}`, artifactTarget: `delta://${engagementId}/cursor-${scenario.provider.cursor}`, retryAfterSeconds: fault === '429_RETRY_AFTER' ? 30 : null, remoteEffect: fault === 'TIMEOUT_AFTER_UPLOAD_SUCCESS' ? 'POSSIBLE_ARTIFACT_STORED' : 'NONE', expectedResult: selectedFault.message, attempts: [{ id: attemptId, number: 1, state: selectedFault.state, fence: operationNumber, code: selectedFault.code }], evidenceLevel: EVIDENCE_LEVEL }
  scenario.operations.unshift(operation)
  const result = commandResult(operation.state === 'SUCCEEDED' ? 'COMMITTED' : operation.state === 'NOT_CONNECTED' ? 'PENDING' : 'BLOCKED', { code: operation.code || '', message: operation.expectedResult, data: operation, operationId: operation.id })
  return rememberReceipt(idempotencyKey, fingerprint, result)
}

export async function recordPbcUpload({ requestId, actorPersonaId, expectedRevision, period, content = 'synthetic-evidence-fixture', idempotencyKey } = {}) {
  const request = scenario.pbcRequests.find((item) => item.id === requestId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_PBC_UPLOAD', targetId: requestId, engagementId: request?.engagementId, payload: { expectedRevision, period, content: typeof content === 'string' ? content : '[bytes]' } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!request) return finish(commandResult('DENIED', { code: 'OBJECT_NOT_FOUND', message: 'That PBC request does not exist.' }))
  if (!actor?.active || !canViewEngagement(actor.id, request.engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot upload to this request.' }))
  if (!actor.roles.includes('client_finance') && !actor.roles.includes('preparer') && !actor.roles.includes('independent_reviewer') && !actor.roles.includes('engagement_partner')) return finish(commandResult('DENIED', { code: 'UPLOAD_AUTHORITY_REQUIRED', message: 'Only the assigned client finance user, preparer, reviewer, or engagement partner can record this upload.' }))
  if (expectedRevision != null && expectedRevision !== request.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: 'The PBC request changed before this receipt was recorded.', revision: request.revision }))
  const engagement = engagementById(request.engagementId)
  const client = clientById(engagement.clientId)
  const uploadPeriod = String(period || request.period)
  if (uploadPeriod !== request.period) return finish(commandResult('BLOCKED', { code: 'PERIOD_MISMATCH', message: 'The uploaded evidence period does not match the request; clarification is required.' }))
  try {
    const supersedesReceiptId = request.receipts.at(-1) || null
    const snapshot = await createSnapshot({ receiptId: `REC-${request.id}-${request.receipts.length + 1}`, engagementId: request.engagementId, entityId: client.id, period: request.period, classification: request.classification, providerVersion: `spv-${request.id}-${request.receipts.length + 1}`, content })
    request.receipts.push(snapshot.receiptId)
    request.revision += 1
    request.state = supersedesReceiptId ? 'REPLACEMENT_RECEIVED' : 'RECEIVED'
    request.supersedesReceiptId = supersedesReceiptId
    scenario.snapshots.push(snapshot)
    scenario.documents.push({ id: `DOC-${request.id}-${request.receipts.length}`, engagementId: request.engagementId, requestId: request.id, sourceReceiptId: snapshot.receiptId, supersedesReceiptId, snapshotId: snapshot.id, originalHash: snapshot.originalHash, storedHash: snapshot.storedHash, snapshotHash: snapshot.snapshotHash, manifestDigest: snapshot.manifestDigest, providerVersion: snapshot.providerVersion, captureState: snapshot.captureState, classification: snapshot.classification, evidenceLevel: EVIDENCE_LEVEL })
    scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'PBC_RECEIPT_RECORDED', requestId: request.id, receiptId: snapshot.receiptId, actorId: actor.id, revision: request.revision, evidenceLevel: EVIDENCE_LEVEL })
    persistScenario()
    return finish(commandResult('COMMITTED', { data: snapshot, revision: request.revision }))
  } catch (error) {
    return finish(commandResult('UNAVAILABLE', { code: error.code || 'SOURCE_CAPTURE_UNSTABLE', message: error.message || 'The synthetic upload could not be captured.' }))
  }
}

export function requestPbcClarification({ requestId, actorPersonaId, expectedRevision, idempotencyKey, message = 'Please provide a complete source for the requested entity and period.' } = {}) {
  const request = scenario.pbcRequests.find((item) => item.id === requestId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'REQUEST_PBC_CLARIFICATION', targetId: requestId, engagementId: request?.engagementId, payload: { expectedRevision, message } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!request) return finish(commandResult('DENIED', { code: 'OBJECT_NOT_FOUND', message: 'That PBC request does not exist.' }))
  if (!actor?.active || !canViewEngagement(actor.id, request.engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot update this request.' }))
  const allowed = actor.roles.some((role) => ['client_finance', 'preparer', 'accounting_reviewer', 'independent_reviewer', 'engagement_partner'].includes(role))
  if (!allowed) return finish(commandResult('DENIED', { code: 'PBC_AUTHORITY_REQUIRED', message: 'Only an assigned client or engagement reviewer can request clarification.' }))
  if (expectedRevision != null && expectedRevision !== request.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: 'The PBC request changed before clarification was recorded.', revision: request.revision }))
  request.state = 'CLARIFICATION_REQUIRED'
  request.clarifications = [...(request.clarifications || []), { id: `CLAR-${request.id}-${(request.clarifications || []).length + 1}`, message: String(message).trim(), actorId: actor.id, createdAt: new Date().toISOString(), state: 'OPEN' }]
  request.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'PBC_CLARIFICATION_REQUESTED', requestId, actorId: actor.id, revision: request.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: request.clarifications.at(-1), revision: request.revision }))
}

export function reviewPbcReceipt({ requestId, receiptId, actorPersonaId, expectedRevision, idempotencyKey, decision = 'ACCEPT', response = '' } = {}) {
  const request = scenario.pbcRequests.find((item) => item.id === requestId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'REVIEW_PBC_RECEIPT', targetId: receiptId || requestId, engagementId: request?.engagementId, payload: { expectedRevision, decision, response } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!request) return finish(commandResult('DENIED', { code: 'OBJECT_NOT_FOUND', message: 'That PBC request does not exist.' }))
  if (!actor?.active || !canViewEngagement(actor.id, request.engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot review this request.' }))
  if (!actor.roles.some((role) => ['independent_reviewer', 'accounting_reviewer', 'engagement_partner'].includes(role))) return finish(commandResult('DENIED', { code: 'PBC_REVIEW_AUTHORITY_REQUIRED', message: 'An assigned engagement reviewer must record PBC suitability.' }))
  if (expectedRevision != null && expectedRevision !== request.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: 'The PBC request changed before suitability was recorded.', revision: request.revision }))
  const targetReceipt = receiptId || request.receipts.at(-1)
  const snapshot = scenario.snapshots.find((item) => item.receiptId === targetReceipt)
  if (!targetReceipt || !request.receipts.includes(targetReceipt) || !snapshot) return finish(commandResult('BLOCKED', { code: 'RECEIPT_NOT_FOUND', message: 'Suitability review requires a stored receipt with a stable snapshot.' }))
  if (snapshot.captureState !== 'STABLE') return finish(commandResult('BLOCKED', { code: 'SOURCE_CAPTURE_UNSTABLE', message: 'The captured source is not stable enough for suitability review.' }))
  if (!['ACCEPT', 'CLARIFICATION_REQUIRED'].includes(decision)) return finish(commandResult('DENIED', { code: 'DECISION_INVALID', message: 'Choose ACCEPT or CLARIFICATION_REQUIRED.' }))
  request.state = decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION_REQUIRED'
  request.acceptedReceiptId = decision === 'ACCEPT' ? targetReceipt : null
  request.suitability = { decision, receiptId: targetReceipt, snapshotId: snapshot.id, response: String(response).trim(), actorId: actor.id, recordedAt: new Date().toISOString() }
  request.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'PBC_SUITABILITY_RECORDED', requestId, receiptId: targetReceipt, decision, actorId: actor.id, revision: request.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: request.suitability, revision: request.revision }))
}

function bumpLinkedInputGeneration(engagement, actor, reason) {
  engagement.revision += 1
  engagement.inputGeneration += 1
  const clientSafety = scenario.safety.client[engagement.clientId] || { generation: 0, state: 'CURRENT' }
  clientSafety.generation += 1
  clientSafety.state = 'UNEVALUATED'
  scenario.safety.client[engagement.clientId] = clientSafety
  scenario.safety.aggregate.generation += 1
  scenario.safety.aggregate.state = 'UNEVALUATED'
  engagement.impactCase = { id: `IMPACT-${engagement.inputGeneration}`, inputGeneration: engagement.inputGeneration, state: scenario.safety.impactProcessing === 'PAUSED' ? 'PENDING_WORKER' : 'QUEUED', createdBy: actor.id }
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'INPUT_GENERATION_CHANGED', engagementId: engagement.id, actorId: actor.id, revision: engagement.revision, inputGeneration: engagement.inputGeneration, reason, evidenceLevel: EVIDENCE_LEVEL })
  const linkedEngagement = engagement.linkedEngagementId ? engagementById(engagement.linkedEngagementId) : null
  if (linkedEngagement) {
    linkedEngagement.revision += 1
    linkedEngagement.inputGeneration += 1
    linkedEngagement.dependencyState = 'STALE_FROM_LINKED_INPUT'
    scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'LINKED_INPUT_INVALIDATED', engagementId: linkedEngagement.id, sourceEngagementId: engagement.id, actorId: actor.id, revision: linkedEngagement.revision, inputGeneration: linkedEngagement.inputGeneration, evidenceLevel: EVIDENCE_LEVEL })
  }
  return { engagement, linkedEngagement }
}

export function replaceAccountingSource({ engagementId = 'ENG-0018-ACC-2026', actorPersonaId, expectedRevision, idempotencyKey, sourceId, sourceLabel = 'Synthetic CSV upload', rows = [] } = {}) {
  const engagement = engagementById(engagementId)
  const packageRecord = accountingPackageFor(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'REPLACE_ACCOUNTING_SOURCE', targetId: sourceId || engagementId, engagementId, payload: { expectedRevision, sourceId, sourceLabel, rows } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !packageRecord || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot replace this accounting source.' }))
  if (!actor.roles.some((role) => ['preparer', 'accounting_reviewer', 'engagement_partner'].includes(role))) return finish(commandResult('DENIED', { code: 'ACCOUNTING_AUTHORITY_REQUIRED', message: 'Only the assigned preparer, accounting reviewer, or partner can select a source.' }))
  if (expectedRevision != null && expectedRevision !== engagement.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected engagement revision ${expectedRevision}, current revision is ${engagement.revision}.`, revision: engagement.revision }))
  if (!Array.isArray(rows) || rows.length !== 14) return finish(commandResult('BLOCKED', { code: 'SOURCE_INCOMPLETE', message: 'The synthetic accounting source must contain all 14 fixture rows.' }))
  const entityId = rows[0]?.entityId
  const period = rows[0]?.period
  const currency = rows[0]?.currency
  if (entityId !== engagement.clientId || period !== engagement.period || currency !== engagement.currency || rows.some((row) => row.entityId !== entityId || row.period !== period || row.currency !== currency)) return finish(commandResult('BLOCKED', { code: 'SOURCE_SCOPE_MISMATCH', message: 'Entity, period, and currency must match the selected engagement.' }))
  let summary
  try { summary = summarizeRows(rows) } catch (error) { return finish(commandResult('BLOCKED', { code: 'SOURCE_INVALID', message: error.message })) }
  if (summary.debitTotal !== summary.creditTotal || summary.signedTotal !== '0.00') return finish(commandResult('BLOCKED', { code: 'UNBALANCED_SOURCE', message: 'Debit, credit, and signed control totals must reconcile before promotion.' }))
  packageRecord.history.push({ source: packageRecord.source, packageRevision: packageRecord.revision, preservedAt: new Date().toISOString(), preservedBy: actor.id })
  const baselineRows = packageRecord.source.baselineRows || fixtureRows(baselineFixture, { entityId, period, currency, sourceId: 'TB-BASELINE-001' })
  packageRecord.source = { sourceId: String(sourceId || `TB-UPLOAD-${Date.now()}`), sourceLabel: String(sourceLabel), entityId, period, currency, rows, baselineRows, summary, validationState: 'VALIDATED', reflection: sourceReflection(baselineRows, rows), receivedAt: new Date().toISOString() }
  packageRecord.mappings.state = 'REVIEW_REQUIRED'
  packageRecord.statement.summary = summary
  packageRecord.statement.state = 'INCOMPLETE'
  packageRecord.statement.managementApproval = null
  packageRecord.revision += 1
  bumpLinkedInputGeneration(engagement, actor, 'Accounting source replaced with a new validated revision')
  persistScenario()
  return finish(commandResult('COMMITTED', { data: packageRecord.source, revision: engagement.revision, operationId: packageRecord.source.sourceId }))
}

export function stageAccountingJournal({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, journal = {} } = {}) {
  const engagement = engagementById(engagementId)
  const packageRecord = accountingPackageFor(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'STAGE_ACCOUNTING_JOURNAL', targetId: journal.logicalJournalId || journal.id, engagementId, payload: { expectedRevision, journal } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !packageRecord || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot stage a journal for this engagement.' }))
  if (!actor.roles.some((role) => ['preparer', 'accounting_reviewer'].includes(role))) return finish(commandResult('DENIED', { code: 'ACCOUNTING_REVIEW_AUTHORITY_REQUIRED', message: 'An assigned preparer or accounting reviewer must stage the journal.' }))
  if (expectedRevision != null && expectedRevision !== packageRecord.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected package revision ${expectedRevision}, current revision is ${packageRecord.revision}.`, revision: packageRecord.revision }))
  const requested = { id: journal.id || `${journal.logicalJournalId}-R${packageRecord.journalRevisions.length + 1}`, logicalJournalId: journal.logicalJournalId, layer: journal.layer || 'REPORTING', amount: journal.amount || '0.00', debitAccount: journal.debitAccount, creditAccount: journal.creditAccount, reason: journal.reason || '', state: 'STAGED', technicallyReviewedBy: actor.id }
  const reflection = requested.logicalJournalId === 'AJ-001' ? packageRecord.source.reflection : 'NOT_REFLECTED'
  const result = registerJournalRevision(packageRecord.journalRevisions, requested, { reflection, layer: requested.layer })
  if (!result.ok) return finish(commandResult('BLOCKED', { code: result.code, message: result.message, revision: packageRecord.revision }))
  packageRecord.journalRevisions = result.revisions
  packageRecord.revision += 1
  packageRecord.history.push({ type: 'JOURNAL_STAGED', journalId: requested.id, actorId: actor.id, packageRevision: packageRecord.revision, recordedAt: new Date().toISOString() })
  bumpLinkedInputGeneration(engagement, actor, `Journal ${requested.logicalJournalId} staged for discussion`)
  persistScenario()
  return finish(commandResult('COMMITTED', { data: result.revisions.at(-1), revision: packageRecord.revision, operationId: requested.id }))
}

export function authorizeAccountingJournal({ engagementId = scenario.selectedEngagementId, journalId, actorPersonaId, expectedRevision, idempotencyKey, decision = 'AUTHORIZE', rationale = '' } = {}) {
  const engagement = engagementById(engagementId)
  const packageRecord = accountingPackageFor(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'AUTHORIZE_ACCOUNTING_JOURNAL', targetId: journalId, engagementId, payload: { expectedRevision, decision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !packageRecord || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot authorize this journal.' }))
  if (!actorHasRole(actor, 'management_approver', engagementId)) return finish(commandResult('DENIED', { code: 'MANAGEMENT_AUTHORITY_REQUIRED', message: 'Management authorization must come from the scoped client approver.' }))
  if (expectedRevision != null && expectedRevision !== packageRecord.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected package revision ${expectedRevision}, current revision is ${packageRecord.revision}.`, revision: packageRecord.revision }))
  const revision = packageRecord.journalRevisions.find((item) => item.id === journalId)
  if (!revision) return finish(commandResult('DENIED', { code: 'JOURNAL_NOT_FOUND', message: 'That journal revision is not in the selected package.' }))
  if (revision.state !== 'STAGED' && revision.state !== 'PROPOSED') return finish(commandResult('BLOCKED', { code: 'JOURNAL_NOT_STAGED', message: 'Only a staged journal can receive management authorization.' }))
  if (!['AUTHORIZE', 'REJECT'].includes(decision)) return finish(commandResult('DENIED', { code: 'DECISION_INVALID', message: 'Choose AUTHORIZE or REJECT.' }))
  revision.state = decision === 'AUTHORIZE' ? 'MANAGEMENT_AUTHORIZED' : 'REJECTED'
  revision.managementDecision = { decision, rationale: String(rationale).trim(), actorId: actor.id, recordedAt: new Date().toISOString(), packageRevision: packageRecord.revision }
  packageRecord.revision += 1
  packageRecord.history.push({ type: 'JOURNAL_MANAGEMENT_DECISION', journalId, actorId: actor.id, decision, packageRevision: packageRecord.revision, recordedAt: new Date().toISOString() })
  if (decision === 'AUTHORIZE') engagement.evidence.managementApproved = true
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'JOURNAL_MANAGEMENT_DECISION', engagementId, journalId, decision, actorId: actor.id, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: revision.managementDecision, revision: packageRecord.revision, operationId: journalId }))
}

export function submitAccountingStatement({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey } = {}) {
  const engagement = engagementById(engagementId)
  const packageRecord = accountingPackageFor(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'SUBMIT_ACCOUNTING_STATEMENT', targetId: packageRecord?.id, engagementId, payload: { expectedRevision } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !packageRecord || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot submit this statement package.' }))
  if (!actor.roles.some((role) => ['accounting_reviewer', 'engagement_partner'].includes(role))) return finish(commandResult('DENIED', { code: 'ACCOUNTING_REVIEW_AUTHORITY_REQUIRED', message: 'An accounting reviewer or partner must submit the statement package.' }))
  if (expectedRevision != null && expectedRevision !== packageRecord.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected package revision ${expectedRevision}, current revision is ${packageRecord.revision}.`, revision: packageRecord.revision }))
  const incomplete = Object.entries(packageRecord.statement.components).filter(([, state]) => state !== 'DERIVED' && state !== 'PROVIDED')
  if (incomplete.length) return finish(commandResult('BLOCKED', { code: 'FINANCIAL_COMPONENTS_INCOMPLETE', message: `Complete the missing statement inputs: ${incomplete.map(([name]) => name).join(', ')}.`, blockers: incomplete.map(([name, state]) => ({ code: 'COMPONENT_NOT_PROVIDED', message: `${name} is ${state}.` })), revision: packageRecord.revision }))
  const staged = packageRecord.journalRevisions.filter((item) => item.state === 'STAGED' || item.state === 'PROPOSED')
  if (staged.length) return finish(commandResult('BLOCKED', { code: 'JOURNAL_MANAGEMENT_AUTH_REQUIRED', message: 'A proposed journal must be separately authorized or rejected before statement submission.', blockers: staged.map((item) => ({ code: 'JOURNAL_PENDING', message: item.id })) }))
  packageRecord.statement.state = 'READY_FOR_APPROVAL'
  packageRecord.statement.submittedBy = actor.id
  packageRecord.statement.submittedAt = new Date().toISOString()
  packageRecord.revision += 1
  persistScenario()
  return finish(commandResult('COMMITTED', { data: packageRecord.statement, revision: packageRecord.revision, operationId: packageRecord.statement.id }))
}

export async function recordAccountingManagementApproval({ engagementId = scenario.selectedEngagementId, actorPersonaId, expectedRevision, idempotencyKey, decision = 'APPROVE', rationale = '' } = {}) {
  const engagement = engagementById(engagementId)
  const packageRecord = accountingPackageFor(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RECORD_ACCOUNTING_MANAGEMENT_APPROVAL', targetId: packageRecord?.statement?.id, engagementId, payload: { expectedRevision, decision, rationale } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !packageRecord || !actor?.active || !canViewEngagement(actor.id, engagementId)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot approve this statement package.' }))
  if (!actorHasRole(actor, 'management_approver', engagementId)) return finish(commandResult('DENIED', { code: 'MANAGEMENT_AUTHORITY_REQUIRED', message: 'Only the scoped client management approver can approve the presented package.' }))
  if (expectedRevision != null && expectedRevision !== packageRecord.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected package revision ${expectedRevision}, current revision is ${packageRecord.revision}.`, revision: packageRecord.revision }))
  if (packageRecord.statement.state !== 'READY_FOR_APPROVAL') return finish(commandResult('BLOCKED', { code: 'STATEMENT_SUBMISSION_REQUIRED', message: 'Submit the exact statement package before recording management approval.' }))
  if (decision !== 'APPROVE') return finish(commandResult('COMMITTED', { data: { decision, rationale: String(rationale).trim() }, revision: packageRecord.revision }))
  const snapshot = await createSnapshot({ receiptId: `FS-${packageRecord.statement.id}-R${packageRecord.statement.revision}`, engagementId, entityId: engagement.clientId, period: engagement.period, classification: 'ACCOUNTING_STATEMENT', providerVersion: `fs-sim-${packageRecord.statement.revision}`, content: JSON.stringify({ statementId: packageRecord.statement.id, revision: packageRecord.statement.revision, summary: packageRecord.statement.summary, components: packageRecord.statement.components }) })
  packageRecord.statement.managementApproval = { decision: 'APPROVE', rationale: String(rationale).trim(), actorId: actor.id, recordedAt: new Date().toISOString(), snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash }
  packageRecord.statement.state = 'APPROVED'
  packageRecord.statement.submittedSnapshotId = snapshot.id
  packageRecord.revision += 1
  scenario.snapshots.push(snapshot)
  scenario.documents.push({ id: `DOC-${packageRecord.statement.id}`, engagementId, snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash, manifestDigest: snapshot.manifestDigest, classification: 'ACCOUNTING_STATEMENT', evidenceLevel: EVIDENCE_LEVEL })
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'ACCOUNTING_MANAGEMENT_APPROVAL', engagementId, packageId: packageRecord.id, snapshotId: snapshot.id, actorId: actor.id, revision: packageRecord.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: packageRecord.statement.managementApproval, revision: packageRecord.revision, operationId: snapshot.id }))
}

export async function submitWorkpaper({ workpaperId, actorPersonaId, expectedRevision, content = 'synthetic-workpaper-fixture', idempotencyKey } = {}) {
  const workpaper = scenario.workpapers?.find((item) => item.id === workpaperId)
  const engagement = workpaper ? engagementById(workpaper.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'SUBMIT_WORKPAPER', targetId: workpaperId, engagementId: workpaper?.engagementId, payload: { expectedRevision, content: typeof content === 'string' ? content : '[bytes]' } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!workpaper || !engagement) return finish(commandResult('DENIED', { code: 'WORKPAPER_NOT_FOUND', message: 'That workpaper does not exist in this scope.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot submit this workpaper.' }))
  if (!actor.roles.includes('preparer') && !actor.roles.includes('engagement_partner')) return finish(commandResult('DENIED', { code: 'WORKPAPER_AUTHORITY_REQUIRED', message: 'Only the assigned preparer or engagement partner can submit a workpaper snapshot.' }))
  if (expectedRevision != null && expectedRevision !== workpaper.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected workpaper revision ${expectedRevision}, current revision is ${workpaper.revision}.`, revision: workpaper.revision }))
  try {
    const snapshot = await createSnapshot({ receiptId: `WP-${workpaper.id}-R${workpaper.revision + 1}`, engagementId: engagement.id, entityId: engagement.clientId, period: engagement.period, classification: 'AUDIT_WORKPAPER', providerVersion: `office-sim-${workpaper.id}-${workpaper.revision + 1}`, content })
    workpaper.revision += 1
    workpaper.state = 'SUBMITTED'
    workpaper.submittedSnapshotId = snapshot.id
    workpaper.submittedBy = actor.id
    workpaper.reviewState = 'OPEN'
    scenario.snapshots.push(snapshot)
    scenario.documents.push({ id: `DOC-${workpaper.id}-${workpaper.revision}`, engagementId: engagement.id, workpaperId: workpaper.id, snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash, manifestDigest: snapshot.manifestDigest, captureState: snapshot.captureState, classification: snapshot.classification, evidenceLevel: EVIDENCE_LEVEL })
    scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'WORKPAPER_SNAPSHOT_SUBMITTED', workpaperId: workpaper.id, snapshotId: snapshot.id, actorId: actor.id, revision: workpaper.revision, evidenceLevel: EVIDENCE_LEVEL })
    persistScenario()
    return finish(commandResult('COMMITTED', { data: { workpaper, snapshot }, revision: workpaper.revision }))
  } catch (error) {
    return finish(commandResult('UNAVAILABLE', { code: error.code || 'SNAPSHOT_CAPTURE_UNSTABLE', message: error.message || 'The workpaper snapshot could not be captured.' }))
  }
}

export function reviewWorkpaper({ workpaperId, actorPersonaId, expectedRevision, idempotencyKey, decision = 'CLEAR', response = '' } = {}) {
  const workpaper = scenario.workpapers?.find((item) => item.id === workpaperId)
  const engagement = workpaper ? engagementById(workpaper.engagementId) : null
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'REVIEW_WORKPAPER', targetId: workpaperId, engagementId: workpaper?.engagementId, payload: { expectedRevision, decision, response } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!workpaper || !engagement) return finish(commandResult('DENIED', { code: 'WORKPAPER_NOT_FOUND', message: 'That workpaper does not exist in this scope.' }))
  if (!actor?.active || !canViewEngagement(actor.id, engagement.id)) return finish(commandResult('DENIED', { code: 'SCOPE_DENIED', message: 'The actor cannot review this workpaper.' }))
  if (!actor.roles.includes('independent_reviewer') && !actor.roles.includes('accounting_reviewer')) return finish(commandResult('DENIED', { code: 'REVIEW_AUTHORITY_REQUIRED', message: 'An assigned reviewer must record the workpaper decision.' }))
  if (workpaper.submittedBy === actor.id) return finish(commandResult('DENIED', { code: 'SEGREGATION_OF_DUTIES', message: 'The submitting preparer cannot independently clear the same workpaper.' }))
  if (!workpaper.submittedSnapshotId) return finish(commandResult('BLOCKED', { code: 'SNAPSHOT_REQUIRED', message: 'Review is blocked until an exact submitted snapshot exists.' }))
  if (expectedRevision != null && expectedRevision !== workpaper.revision) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected workpaper revision ${expectedRevision}, current revision is ${workpaper.revision}.`, revision: workpaper.revision }))
  if (decision === 'CLEAR' && !String(response).trim()) return finish(commandResult('BLOCKED', { code: 'SUPPORTED_RESPONSE_REQUIRED', message: 'A supported reviewer response is required.' }))
  workpaper.reviewState = decision === 'CLEAR' ? 'CLEARED' : 'CHANGES_REQUIRED'
  workpaper.reviewedBy = actor.id
  workpaper.reviewedAt = new Date().toISOString()
  workpaper.reviewResponse = String(response).trim()
  workpaper.revision += 1
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'WORKPAPER_REVIEW_RECORDED', workpaperId: workpaper.id, actorId: actor.id, decision, revision: workpaper.revision, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: workpaper, revision: workpaper.revision }))
}

export const providerFaults = ['NONE', '429_RETRY_AFTER', '403_FORBIDDEN', '500_SERVER_ERROR', 'TIMEOUT_AFTER_UPLOAD_SUCCESS', 'EXPIRED_LEASE', 'CURSOR_EXPIRED']

export function setProviderSimulation({ actorPersonaId = scenario.activePersonaId, connected, nextFault, idempotencyKey } = {}) {
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'SET_PROVIDER_SIMULATION', targetId: 'provider', engagementId: null, payload: { actorId: actor?.id || null, connected: Boolean(connected), nextFault } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!actor?.active || !actor.roles.includes('system_admin')) return finish(commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the system-admin simulation actor can change provider fault scenarios.' }))
  if (nextFault != null && !providerFaults.includes(nextFault)) return finish(commandResult('DENIED', { code: 'PROVIDER_FAULT_INVALID', message: `Unsupported provider fault: ${nextFault}.` }))
  scenario.provider.connected = Boolean(connected)
  if (nextFault != null) scenario.provider.nextFault = nextFault
  persistScenario()
  return finish(commandResult('COMMITTED', { data: clone(scenario.provider) }))
}

export function retryIntegrationOperation({ operationId, actorPersonaId, expectedAttempt, idempotencyKey } = {}) {
  const operation = scenario.operations?.find((item) => item.id === operationId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RETRY_INTEGRATION_OPERATION', targetId: operationId, engagementId: operation?.engagementId, payload: { expectedAttempt } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!operation || !actor?.active || !actor.roles.includes('system_admin')) return finish(commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the system-admin simulation actor can retry an operation.' }))
  if (expectedAttempt != null && expectedAttempt !== operation.attempt) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected attempt ${expectedAttempt}, current attempt is ${operation.attempt}.`, revision: operation.attempt }))
  if (!['RETRY_REQUIRED', 'UNCERTAIN_REMOTE_SUCCESS', 'CURSOR_EXPIRED'].includes(operation.state)) return finish(commandResult('BLOCKED', { code: 'OPERATION_NOT_RETRYABLE', message: `Operation ${operation.id} is ${operation.state} and cannot be retried.` }))
  const nextAttempt = operation.attempt + 1
  const fault = scenario.provider.connected ? (scenario.provider.nextFault || 'NONE') : 'NOT_CONNECTED'
  const shouldSucceed = operation.state === 'UNCERTAIN_REMOTE_SUCCESS' || fault === 'NONE'
  operation.attempt = nextAttempt
  operation.attemptId = `ATT-${operation.id}-${String(nextAttempt).padStart(2, '0')}`
  operation.attempts = [...(operation.attempts || []), { id: operation.attemptId, number: nextAttempt, state: shouldSucceed ? 'SUCCEEDED' : fault === 'NOT_CONNECTED' ? 'NOT_CONNECTED' : 'RETRY_REQUIRED', fence: operation.fence, code: shouldSucceed ? null : fault }]
  operation.state = shouldSucceed ? 'SUCCEEDED' : fault === 'NOT_CONNECTED' ? 'NOT_CONNECTED' : fault === '403_FORBIDDEN' ? 'FAILED' : 'RETRY_REQUIRED'
  operation.code = shouldSucceed ? 'RECONCILED' : fault === 'NOT_CONNECTED' ? 'PROVIDER_NOT_CONNECTED' : fault === '403_FORBIDDEN' ? 'PROVIDER_403' : 'PROVIDER_RETRYABLE'
  operation.remoteEffect = operation.state === 'SUCCEEDED' && operation.remoteEffect === 'POSSIBLE_ARTIFACT_STORED' ? 'RECONCILED_SAME_TARGET' : operation.remoteEffect
  operation.expectedResult = shouldSucceed ? 'The same deterministic target and request digest reconciled successfully in simulation.' : fault === 'NOT_CONNECTED' ? 'Provider remains disconnected; no success is claimed.' : 'Retry remains pending with the same request digest and bounded authority.'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'INTEGRATION_OPERATION_RETRIED', operationId, attempt: nextAttempt, attemptId: operation.attemptId, actorId: actor.id, state: operation.state, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult(operation.state === 'SUCCEEDED' ? 'COMMITTED' : 'PENDING', { code: operation.code, message: operation.expectedResult, data: operation, operationId: operation.id }))
}

export function captureRecoveryBackup({ engagementId = scenario.selectedEngagementId, actorPersonaId, idempotencyKey } = {}) {
  const engagement = engagementById(engagementId)
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'CAPTURE_RECOVERY_BACKUP', targetId: engagementId, engagementId, payload: {} })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!engagement || !actor?.active || !actorHasRole(actor, 'system_admin', engagementId)) return finish(commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the scoped system administrator can capture a recovery backup.' }))
  const backup = { id: `BACKUP-SIM-${scenario.recovery.activeEpoch}-${scenario.events.length + 1}`, engagementId, capturedAt: new Date().toISOString(), sourceRevision: engagement.revision, inputGeneration: engagement.inputGeneration, candidateIds: scenario.releaseCandidates.filter((candidate) => candidate.engagementId === engagementId).map((candidate) => candidate.id), appEpoch: scenario.recovery.activeEpoch, state: 'CAPTURED', evidenceLevel: EVIDENCE_LEVEL }
  scenario.recovery.backup = backup
  scenario.recovery.state = 'BACKUP_CAPTURED'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'RECOVERY_BACKUP_CAPTURED', engagementId, backupId: backup.id, actorId: actor.id, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: backup, operationId: backup.id }))
}

export function restoreRecoveryBackup({ backupId = scenario.recovery.backup?.id, actorPersonaId, idempotencyKey } = {}) {
  const backup = scenario.recovery.backup
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RESTORE_RECOVERY_BACKUP', targetId: backupId, engagementId: backup?.engagementId, payload: {} })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!backup || backup.id !== backupId) return finish(commandResult('DENIED', { code: 'BACKUP_NOT_FOUND', message: 'That recovery backup is not available.' }))
  if (!actor?.active || !actor.roles.includes('system_admin')) return finish(commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the system administrator can start a restore quarantine.' }))
  scenario.recovery.activeEpoch += 1
  scenario.recovery.state = 'QUARANTINED'
  scenario.recovery.outwardEffectsEnabled = false
  scenario.recovery.case = { id: `RECOVERY-${scenario.recovery.activeEpoch}`, backupId, engagementId: backup.engagementId, state: 'QUARANTINED', oldAppEpoch: backup.appEpoch, restoredAt: new Date().toISOString(), unresolved: ['PERMISSIONS', 'RELEASE_CHECKPOINT', 'UNCERTAIN_OPERATIONS'], externalEffects: 'DISABLED' }
  scenario.recovery.reconciliation = null
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'RECOVERY_RESTORE_QUARANTINED', backupId, actorId: actor.id, activeEpoch: scenario.recovery.activeEpoch, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: scenario.recovery.case, operationId: scenario.recovery.case.id }))
}

export function reconcileRecovery({ actorPersonaId, idempotencyKey } = {}) {
  const actor = actorForPersona(actorPersonaId)
  const recoveryCase = scenario.recovery.case
  const backup = scenario.recovery.backup
  // A recovery checkpoint must prove the exact candidate set captured by the
  // backup.  A checkpoint for another engagement is useful evidence, but it
  // cannot silently satisfy this recovery case.
  const checkpoint = scenario.recovery.externalCheckpointStore?.find((item) => item.releaseEventId && backup?.candidateIds?.includes(item.candidateId))
  const fingerprint = commandFingerprint({ action: 'RECONCILE_RECOVERY', targetId: recoveryCase?.id, engagementId: recoveryCase?.engagementId, payload: {} })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!recoveryCase || scenario.recovery.state !== 'QUARANTINED') return finish(commandResult('BLOCKED', { code: 'RECOVERY_QUARANTINE_REQUIRED', message: 'Restore quarantine must be active before reconciliation.' }))
  if (!actor?.active || !actor.roles.some((role) => ['system_admin', 'records_custodian'].includes(role))) return finish(commandResult('DENIED', { code: 'RECOVERY_AUTHORITY_REQUIRED', message: 'A system administrator or records custodian must reconcile the restored state.' }))
  if (!checkpoint) { recoveryCase.unresolved = [...new Set([...recoveryCase.unresolved, 'EXTERNAL_CHECKPOINT'])]; return finish(commandResult('BLOCKED', { code: 'CHECKPOINT_MISSING', message: 'The independent external checkpoint for the backed-up candidate set is missing; outward effects remain disabled.' })) }
  scenario.recovery.reconciliation = { state: 'RECONCILED', checkpointId: checkpoint.releaseEventId, manifestDigest: checkpoint.manifestDigest, artifactHash: checkpoint.artifactHash, reconciledBy: actor.id, reconciledAt: new Date().toISOString(), source: 'INDEPENDENT_SIMULATION_CHECKPOINT' }
  recoveryCase.unresolved = recoveryCase.unresolved.filter((item) => item !== 'RELEASE_CHECKPOINT' && item !== 'UNCERTAIN_OPERATIONS')
  recoveryCase.state = 'RECONCILED'
  scenario.recovery.state = 'RECONCILED'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'RECOVERY_RECONCILED', recoveryCaseId: recoveryCase.id, actorId: actor.id, checkpointId: checkpoint.releaseEventId, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: scenario.recovery.reconciliation, operationId: recoveryCase.id }))
}

export function resumeRecovery({ actorPersonaId, expectedEpoch, idempotencyKey } = {}) {
  const actor = actorForPersona(actorPersonaId)
  const fingerprint = commandFingerprint({ action: 'RESUME_RECOVERY', targetId: scenario.recovery.case?.id, engagementId: scenario.recovery.case?.engagementId, payload: { expectedEpoch } })
  const prior = existingReceipt(idempotencyKey, fingerprint)
  if (prior) return prior
  const finish = (result) => rememberReceipt(idempotencyKey, fingerprint, result)
  if (!actor?.active || !actor.roles.includes('system_admin')) return finish(commandResult('DENIED', { code: 'SYSTEM_AUTHORITY_REQUIRED', message: 'Only the system administrator can resume a quarantined deployment.' }))
  if (expectedEpoch != null && expectedEpoch !== scenario.recovery.activeEpoch) return finish(commandResult('CONFLICT', { code: 'REVISION_CONFLICT', message: `Expected recovery epoch ${expectedEpoch}, current epoch is ${scenario.recovery.activeEpoch}.`, revision: scenario.recovery.activeEpoch }))
  if (scenario.recovery.state !== 'RECONCILED' || scenario.recovery.reconciliation?.state !== 'RECONCILED') return finish(commandResult('BLOCKED', { code: 'RECOVERY_RECONCILIATION_REQUIRED', message: 'Reconcile the restored state against the independent checkpoint before resuming.' }))
  scenario.recovery.activeEpoch += 1
  scenario.recovery.state = 'RESUMED_SIMULATION'
  scenario.recovery.outwardEffectsEnabled = false
  scenario.recovery.case.resumedBy = actor.id
  scenario.recovery.case.resumedAt = new Date().toISOString()
  scenario.recovery.case.state = 'RESUMED_SIMULATION'
  scenario.events.push({ id: `EV-${scenario.events.length + 1}`, type: 'RECOVERY_RESUMED_SIMULATION', recoveryCaseId: scenario.recovery.case.id, actorId: actor.id, activeEpoch: scenario.recovery.activeEpoch, evidenceLevel: EVIDENCE_LEVEL })
  persistScenario()
  return finish(commandResult('COMMITTED', { data: scenario.recovery.case, operationId: scenario.recovery.case.id }))
}
