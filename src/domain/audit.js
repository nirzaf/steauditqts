import { moneyString, multiplyMoney } from './money.js'

export const AUDIT_FIXTURE_VERSION = 'AUDIT-FIXTURE-2026-01'

// These records deliberately form one inspectable chain. They are not a
// statistical conclusion: the population and selection method are explicit
// so a reviewer can see exactly what the synthetic numbers represent.
export const auditRiskFixture = [
  {
    id: 'RISK-AR-019',
    area: 'Trade receivables',
    assertion: 'Valuation and existence',
    rating: 'HIGH',
    driver: 'Ageing differs from subsequent-receipt evidence for one material customer balance.',
    response: 'Inspect ageing, subsequent receipts, credit notes and alternative evidence for the selected item.',
    ownerActorId: 'ACT-OMAR',
    procedureId: 'PROC-AR-03',
    workpaperId: 'WP-AR-01',
    populationId: 'POP-AR-2026-01',
    samplePlanId: 'SMP-AR-03',
    conclusionState: 'OPEN_EXCEPTION',
    revision: 1,
  },
  {
    id: 'RISK-INV-011',
    area: 'Inventory',
    assertion: 'Existence and cut-off',
    rating: 'SIGNIFICANT',
    driver: 'Year-end count evidence must be tied to the final inventory listing.',
    response: 'Observe count, reconcile count sheets and test cut-off around the reporting date.',
    ownerActorId: 'ACT-OMAR',
    procedureId: 'PROC-INV-02',
    workpaperId: 'WP-INV-01',
    populationId: 'POP-INV-2026-01',
    samplePlanId: 'SMP-INV-02',
    conclusionState: 'IN_PROGRESS',
    revision: 1,
  },
]

export const materialityFixture = {
  id: 'MAT-0018-2026-R3',
  engagementId: 'ENG-0018-AUD-2026',
  revision: 3,
  benchmark: 'Normalized profit before tax',
  sourceId: 'TB-REPLACEMENT-001',
  sourceRevision: 1,
  normalizedBenchmark: '360000.00',
  selectedRate: '0.05',
  performanceRate: '0.70',
  trivialRate: '0.05',
  rationale: 'The approved normalization removes a one-off transaction before applying the 5% rate.',
  selectedBy: 'ACT-MAYA',
  reviewedBy: 'ACT-YUSUF',
  reviewedAt: '2026-09-05T09:00:00.000Z',
}

export const populationFixture = {
  id: 'POP-AR-2026-01',
  engagementId: 'ENG-0018-AUD-2026',
  revision: 1,
  sourceId: 'TB-REPLACEMENT-001',
  sourceRevision: 1,
  rowCount: 218,
  controlTotal: '300000.00',
  reconciliationState: 'RECONCILED',
  selectionMethod: 'SPECIFIC_HIGH_VALUE_AND_MANUAL',
  fingerprint: 'sha256:84a5syntheticpopulationc221',
  rows: ['AR-001', 'AR-002', 'AR-003', 'AR-004', 'AR-005', 'AR-006', 'AR-007', 'AR-008', 'AR-009', 'AR-010', 'AR-011', 'AR-012', 'AR-013', 'AR-014', 'AR-015', 'AR-016', 'AR-017', 'AR-018', 'AR-019', 'AR-020', 'AR-021', 'AR-022', 'AR-023', 'AR-024'],
}

// The supplied fixture covers receivables. This small inventory population is
// explicitly labelled as a synthetic assumption so the second significant
// risk has a complete, inspectable chain without pretending it came from the
// source CSVs.
export const inventoryPopulationFixture = {
  id: 'POP-INV-2026-01',
  engagementId: 'ENG-0018-AUD-2026',
  revision: 1,
  sourceId: 'INV-LIST-2026-01',
  sourceRevision: 1,
  rowCount: 120,
  controlTotal: '475000.00',
  reconciliationState: 'RECONCILED',
  selectionMethod: 'FULL_COUNT_RECONCILIATION',
  fingerprint: 'sha256:synthetic-inventory-population-2026-01',
  assumption: 'Synthetic supplementary inventory listing; not part of the supplied trial-balance CSV.',
  rows: ['INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005', 'INV-006', 'INV-007', 'INV-008', 'INV-009', 'INV-010'],
}

export const sampleFixture = [
  { id: 'SMP-AR-03-001', populationId: 'POP-AR-2026-01', rowId: 'AR-001', amount: '18000.00', selectionReason: 'High value', evidenceState: 'SUPPORTED', revision: 1, status: 'COMPLETE', alternativeWork: null, conclusion: 'No exception noted.' },
  { id: 'SMP-AR-03-019', populationId: 'POP-AR-2026-01', rowId: 'AR-019', amount: '12500.00', selectionReason: 'Specific item', evidenceState: 'CONTRADICTORY', revision: 1, status: 'EXCEPTION_OPEN', alternativeWork: null, conclusion: null },
  { id: 'SMP-AR-03-024', populationId: 'POP-AR-2026-01', rowId: 'AR-024', amount: '9600.00', selectionReason: 'Spread selection', evidenceState: 'SUPPORTED', revision: 1, status: 'COMPLETE', alternativeWork: null, conclusion: 'No exception noted.' },
  { id: 'SMP-INV-02-001', populationId: 'POP-INV-2026-01', rowId: 'INV-001', amount: '42000.00', selectionReason: 'High value and cut-off', evidenceState: 'SUPPORTED', revision: 1, status: 'IN_PROGRESS', alternativeWork: null, conclusion: null, assumption: 'Synthetic supplementary inventory sample.' },
]

export const findingFixture = [
  { id: 'FND-AR-019', engagementId: 'ENG-0018-AUD-2026', sampleId: 'SMP-AR-03-019', riskId: 'RISK-AR-019', state: 'OPEN', misstatement: '12500.00', corrected: false, managementAction: 'Management response required', professionalDisposition: null, revision: 1 },
]

export function calculateMateriality(materiality = materialityFixture) {
  const overall = multiplyMoney(materiality.normalizedBenchmark, materiality.selectedRate)
  const performance = multiplyMoney(overall, materiality.performanceRate)
  const trivial = multiplyMoney(overall, materiality.trivialRate)
  return { overall, performance, trivial, benchmark: moneyString(materiality.normalizedBenchmark), selectedRate: materiality.selectedRate, performanceRate: materiality.performanceRate, trivialRate: materiality.trivialRate }
}

export function evaluateAuditChain({ risks = auditRiskFixture, populations = [populationFixture, inventoryPopulationFixture], samples = sampleFixture, findings = findingFixture, materiality = materialityFixture } = {}) {
  const blockers = []
  for (const risk of risks) {
    if (!['HIGH', 'SIGNIFICANT'].includes(risk.rating)) continue
    const population = populations.find((item) => item.id === risk.populationId)
    const sample = samples.find((item) => item.populationId === risk.populationId && item.id.startsWith(`${risk.samplePlanId}-`))
    if (!risk.response || !risk.workpaperId || !risk.populationId || !risk.samplePlanId || !population || !sample) blockers.push({ code: 'RISK_RESPONSE_MISSING', id: risk.id, message: `${risk.id} does not have a complete response chain.` })
    if (population && population.reconciliationState !== 'RECONCILED') blockers.push({ code: 'POPULATION_NOT_RECONCILED', id: population.id, message: `${population.id} is not reconciled to its source revision.` })
  }
  const exception = risks.some((risk) => risk.id === 'RISK-AR-019') ? samples.find((item) => item.rowId === 'AR-019') : null
  if (exception && exception.status !== 'COMPLETE' && !exception.alternativeWork && !exception.conclusion) blockers.push({ code: 'EVIDENCE_DISPOSITION_REQUIRED', id: exception.id, message: 'AR-019 remains contradictory; alternative work or a supported professional conclusion is required.' })
  const calculated = calculateMateriality(materiality)
  if (!calculated.overall || materiality.sourceRevision == null || !materiality.selectedBy || !materiality.reviewedBy) blockers.push({ code: 'MATERIALITY_SELECTION_INCOMPLETE', message: 'Materiality needs a source revision, selected rate, rationale and reviewer.' })
  return { blockers, materiality: calculated }
}
