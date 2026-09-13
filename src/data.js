export const formatMoney = (value) => new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 0,
}).format(value)

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value)

export const statusLabels = {
  good: 'On track',
  warn: 'Needs attention',
  danger: 'Blocked',
  neutral: 'Planned',
}

export const navItems = [
  { key: 'dashboard', label: 'Overview', icon: 'grid', section: 'Workspace' },
  { key: 'clients', label: 'Clients & acceptance', icon: 'users', section: 'Workspace' },
  { key: 'engagements', label: 'Engagements', icon: 'briefcase', section: 'Workspace', badge: '12' },
  { key: 'pbc', label: 'PBC portal', icon: 'inbox', section: 'Delivery', badge: '4' },
  { key: 'accounting', label: 'Accounting & TB', icon: 'calculator', section: 'Delivery' },
  { key: 'audit', label: 'Audit & fieldwork', icon: 'clipboard', section: 'Delivery' },
  { key: 'reviews', label: 'Reviews & approvals', icon: 'check-circle', section: 'Control', badge: '3' },
  { key: 'release', label: 'Release & archive', icon: 'lock', section: 'Control' },
  { key: 'integration', label: 'Integration health', icon: 'pulse', section: 'Operations' },
]

export const client = {
  id: 'CLI-0018',
  name: 'Northstar Trading W.L.L.',
  shortName: 'Northstar Trading',
  country: 'Qatar',
  registration: 'CR 82419',
  owner: 'Maya Rahman',
  segment: 'Wholesale distribution',
  status: 'Recurring client',
  risk: 'Medium',
  services: ['Financial-statement audit', 'Accounting package handoff'],
  period: 'Year ended 31 Dec 2026',
  currency: 'QAR',
  team: [
    { name: 'Maya Rahman', role: 'Engagement partner', initials: 'MR', color: 'navy' },
    { name: 'Omar Aziz', role: 'Audit manager', initials: 'OA', color: 'blue' },
    { name: 'Leila Noor', role: 'Accounting reviewer', initials: 'LN', color: 'green' },
  ],
}

export const portfolioClients = [
  { id: 'CLI-0018', name: 'Northstar Trading W.L.L.', service: 'Audit + accounting handoff', owner: 'Maya Rahman', risk: 'Medium', status: 'Fieldwork', next: '14 Sep 2026', tone: 'blue' },
  { id: 'CLI-0009', name: 'Cedar & Coast Logistics', service: 'Accounting only', owner: 'Leila Noor', risk: 'Low', status: 'Statements review', next: '18 Sep 2026', tone: 'green' },
  { id: 'CLI-0024', name: 'Al Noor Medical Supplies', service: 'Financial-statement audit', owner: 'Omar Aziz', risk: 'High', status: 'Acceptance hold', next: 'Today', tone: 'red' },
  { id: 'CLI-0011', name: 'Blue Dhow Hospitality Group', service: 'Internal audit', owner: 'Maya Rahman', risk: 'Medium', status: 'Planning', next: '22 Sep 2026', tone: 'amber' },
  { id: 'CLI-0005', name: 'Meridian Technology W.L.L.', service: 'Review engagement', owner: 'Omar Aziz', risk: 'Low', status: 'Continuance', next: '29 Sep 2026', tone: 'green' },
]

export const gateMeta = [
  { id: 'G0', title: 'Firm ready', detail: 'Methods, access and repositories' },
  { id: 'G1', title: 'Accepted / continued', detail: 'Assessment, ethics and clearances' },
  { id: 'G2', title: 'Work authorized', detail: 'Terms, team, access and dates' },
  { id: 'G3', title: 'Data usable', detail: 'Validated source and control totals' },
  { id: 'G4', title: 'Accounting ready', detail: 'Mapping, journals and statements' },
  { id: 'G5', title: 'Audit plan ready', detail: 'Risks, materiality and procedures' },
  { id: 'G6', title: 'Conclusions complete', detail: 'Evidence, exceptions and evaluation' },
  { id: 'G7', title: 'Final package approved', detail: 'Management, partner and EQR' },
  { id: 'G8', title: 'Release authorized', detail: 'Matched report and recipients' },
  { id: 'G9', title: 'Archive complete', detail: 'Manifest, retention and recovery' },
  { id: 'G10', title: 'Next period allowed', detail: 'Fresh continuance and terms' },
]

export const gateStatuses = ['good', 'good', 'good', 'good', 'warn', 'warn', 'danger', 'danger', 'danger', 'danger', 'neutral']

export const pbcRequests = [
  { id: 'PBC-014', title: 'Bank statements and reconciliations', area: 'Cash & bank', owner: 'Sara Khan', due: '09 Sep 2026', status: 'Accepted', tone: 'good', files: 6, progress: 100, note: 'Accepted against QAR 150,000 closing balance.' },
  { id: 'PBC-019', title: 'Receivables ageing and subsequent receipts', area: 'Receivables', owner: 'Nadia Faris', due: '11 Sep 2026', status: 'Under review', tone: 'warn', files: 3, progress: 72, note: 'AR-019 needs contradictory-evidence follow-up.' },
  { id: 'PBC-023', title: 'Inventory count sheets', area: 'Inventory', owner: 'Khalid Mansour', due: '12 Sep 2026', status: 'Clarification required', tone: 'danger', files: 2, progress: 48, note: 'Count date does not match the requested period.' },
  { id: 'PBC-031', title: 'Management representation inputs', area: 'Completion', owner: 'Nadia Faris', due: '24 Sep 2026', status: 'Not started', tone: 'neutral', files: 0, progress: 0, note: 'Portal request will open after final draft review.' },
]

export const tbRows = [
  // TB v03 is the replacement source after AJ-001 is reflected. The source
  // fixture in the architecture document is TB v02 (QAR 1.82m per side);
  // the approved QAR 5,000 depreciation entry increases both sides to QAR
  // 1.825m while preserving a zero signed-balance total.
  { code: '100101', account: 'Bank', area: 'Cash', opening: 150000, debit: 150000, credit: 0, closing: 150000, mapped: 'Cash & cash equivalents', status: 'Mapped' },
  { code: '110100', account: 'Trade receivables', area: 'Receivables', opening: 300000, debit: 300000, credit: 0, closing: 300000, mapped: 'Trade receivables', status: 'Mapped' },
  { code: '120100', account: 'Inventory', area: 'Inventory', opening: 200000, debit: 200000, credit: 0, closing: 200000, mapped: 'Inventories', status: 'Mapped' },
  { code: '150100', account: 'PPE cost', area: 'Fixed assets', opening: 150000, debit: 150000, credit: 0, closing: 150000, mapped: 'Property, plant & equipment', status: 'Mapped' },
  { code: '159100', account: 'Accumulated depreciation', area: 'Fixed assets', opening: -55000, debit: 0, credit: 55000, closing: -55000, mapped: 'PPE accumulated depreciation', status: 'Mapped' },
  { code: '200100', account: 'Trade payables', area: 'Payables', opening: -240000, debit: 0, credit: 240000, closing: -240000, mapped: 'Trade payables', status: 'Mapped' },
  { code: '220100', account: 'Loan', area: 'Non-current liabilities', opening: -30000, debit: 0, credit: 30000, closing: -30000, mapped: 'Non-current borrowings', status: 'Mapped' },
  { code: '300100', account: 'Share capital', area: 'Equity', opening: -250000, debit: 0, credit: 250000, closing: -250000, mapped: 'Share capital', status: 'Mapped' },
  { code: '310100', account: 'Opening retained earnings', area: 'Equity', opening: -50000, debit: 0, credit: 50000, closing: -50000, mapped: 'Retained earnings', status: 'Mapped' },
  { code: '400100', account: 'Revenue', area: 'Revenue', opening: -1200000, debit: 0, credit: 1200000, closing: -1200000, mapped: 'Revenue', status: 'Mapped' },
  { code: '500100', account: 'Cost of sales', area: 'Cost of sales', opening: 800000, debit: 800000, credit: 0, closing: 800000, mapped: 'Cost of sales', status: 'Mapped' },
  { code: '510100', account: 'Payroll expense', area: 'Operating expenses', opening: 190000, debit: 190000, credit: 0, closing: 190000, mapped: 'Employee benefits', status: 'Mapped' },
  { code: '520100', account: 'Depreciation expense', area: 'Fixed assets', opening: 25000, debit: 25000, credit: 0, closing: 25000, mapped: 'Depreciation', status: 'Adjusted' },
  { code: '530100', account: 'Finance costs', area: 'Finance', opening: 10000, debit: 10000, credit: 0, closing: 10000, mapped: 'Finance costs', status: 'Mapped' },
]

export const reconciliationAreas = [
  { name: 'Cash & bank', source: 'Bank statements', balance: 150000, difference: 0, owner: 'Leila Noor', status: 'Cleared', tone: 'good' },
  { name: 'Receivables', source: 'Ageing + receipts', balance: 300000, difference: 12500, owner: 'Omar Aziz', status: 'Review required', tone: 'warn' },
  { name: 'Inventory', source: 'Count sheets', balance: 200000, difference: 0, owner: 'Leila Noor', status: 'Cleared', tone: 'good' },
  { name: 'Fixed assets', source: 'Asset register', balance: 95000, difference: 0, owner: 'Leila Noor', status: 'Cleared', tone: 'good' },
]

export const practiceJournals = [
  { id: 'AJ-001', purpose: 'Depreciation catch-up', amount: 5000, origin: 'AUDITOR', layer: 'Reporting adjustment', status: 'Reflected in source', tone: 'good', support: 'TB v03 source bridge' },
  { id: 'AJ-002', purpose: 'Receivables provision', amount: 12500, origin: 'AUDITOR', layer: 'Proposed correction', status: 'Management discussion', tone: 'warn', support: 'AR-019 follow-up' },
]

export const risks = [
  { id: 'R-001', area: 'Receivables', assertion: 'Valuation', rating: 'High', tone: 'danger', driver: 'Disputed AR-019 balance after year end', response: 'Ageing, subsequent receipts, dispute confirmation', owner: 'Omar Aziz', status: 'Follow-up open' },
  { id: 'R-002', area: 'Management override', assertion: 'Occurrence / cut-off', rating: 'High', tone: 'danger', driver: 'Manual journals near period end', response: 'Journal population, approval trail, unusual-entry testing', owner: 'Maya Rahman', status: 'Planned' },
  { id: 'R-003', area: 'Inventory', assertion: 'Existence', rating: 'Medium', tone: 'warn', driver: 'Count sheets arrived after count date', response: 'Roll-back / roll-forward and count reconciliation', owner: 'Leila Noor', status: 'Ready for review' },
  { id: 'R-004', area: 'Revenue', assertion: 'Cut-off', rating: 'Medium', tone: 'warn', driver: 'Export includes late-December shipments', response: 'Dispatch note sample and credit-note scan', owner: 'Omar Aziz', status: 'Planned' },
]

export const workpapers = [
  { id: 'WP-CASH-01', title: 'Cash and bank lead schedule', area: 'Cash & bank', stage: 'Reviewed for version', reviewer: 'Maya Rahman', evidence: 8, status: 'Reviewed', tone: 'good' },
  { id: 'WP-AR-01', title: 'Receivables valuation testing', area: 'Receivables', stage: 'Changes required', reviewer: 'Omar Aziz', evidence: 6, status: 'Open', tone: 'danger' },
  { id: 'WP-INV-01', title: 'Inventory existence and cut-off', area: 'Inventory', stage: 'Submitted snapshot', reviewer: 'Leila Noor', evidence: 4, status: 'In review', tone: 'warn' },
  { id: 'WP-COMP-01', title: 'Completion analytics', area: 'Completion', stage: 'Working', reviewer: 'Maya Rahman', evidence: 2, status: 'Not submitted', tone: 'neutral' },
]

export const reviewPoints = [
  { id: 'RP-042', title: 'AR-019 evidence conflict', area: 'Receivables', severity: 'Significant', tone: 'danger', status: 'Open', assignee: 'Omar Aziz', blocks: true, due: 'Today', detail: 'Disputed balance differs between ageing and subsequent receipt evidence.' },
  { id: 'RP-045', title: 'Cash-flow note cross-reference', area: 'Financial statements', severity: 'Routine', tone: 'good', status: 'Cleared', assignee: 'Leila Noor', blocks: false, due: '12 Sep 2026', detail: 'Note 7 totals agree to the reviewed statement package.' },
  { id: 'RP-047', title: 'Impairment provision rationale', area: 'Accounting package', severity: 'Significant', tone: 'warn', status: 'Ready for review', assignee: 'Maya Rahman', blocks: true, due: '15 Sep 2026', detail: 'Management response is attached; technical treatment still needs approval.' },
]

export const approvals = [
  { role: 'Management responsibility', person: 'Nadia Faris', object: 'FS v05', status: 'Approved', tone: 'good', date: '13 Sep 2026' },
  { role: 'Accounting technical review', person: 'Leila Noor', object: 'FS v05', status: 'Approved', tone: 'good', date: '13 Sep 2026' },
  { role: 'Engagement partner conclusion', person: 'Maya Rahman', object: 'Release candidate RC-026', status: 'Pending', tone: 'warn', date: 'Due 15 Sep 2026' },
  { role: 'Engagement quality review', person: 'Yusuf Ali', object: 'Release candidate RC-026', status: 'Not started', tone: 'neutral', date: 'Required before report date' },
]

export const archiveItems = [
  { label: 'Signed auditor report', type: 'PDF + source DOCX', state: 'Ready', tone: 'good', detail: 'Hash verified against signed output' },
  { label: 'Financial-statement package', type: 'FS v05 + TB v04', state: 'Ready', tone: 'good', detail: 'Management-approved version' },
  { label: 'Working-paper and evidence export', type: 'Structured JSON + files', state: 'Assembly pending', tone: 'warn', detail: '2 workpapers still have open review points' },
  { label: 'Approval and dependency manifest', type: 'Manifest digest', state: 'Ready', tone: 'good', detail: '3 historical approvals marked stale' },
  { label: 'Delivery evidence', type: 'Recipient log', state: 'Not started', tone: 'neutral', detail: 'Created only after release authorization' },
  { label: 'Purview protection observation', type: 'Records profile RP-2026-AUD', state: 'Pending', tone: 'warn', detail: 'Records administrator verification required' },
]

export const integrationOperations = [
  { id: 'OP-884', name: 'Graph delta reconciliation', system: 'SharePoint / Graph', started: '13 Sep 2026 · 09:42', duration: '18 sec', status: 'Succeeded', tone: 'good', detail: '41 items reconciled; no missing snapshots.' },
  { id: 'OP-879', name: 'PBC-023 upload transfer', system: 'Portal → SharePoint', started: '12 Sep 2026 · 16:10', duration: '—', status: 'Needs retry', tone: 'warn', detail: 'Client connection ended after 2 of 4 chunks.' },
  { id: 'OP-873', name: 'Entra group membership check', system: 'Microsoft Entra ID', started: '12 Sep 2026 · 12:05', duration: '3 sec', status: 'Succeeded', tone: 'good', detail: '12 staff roles and 4 portal users checked.' },
  { id: 'OP-861', name: 'Purview label observation', system: 'Purview / SharePoint', started: '11 Sep 2026 · 17:25', duration: '—', status: 'Awaiting admin', tone: 'neutral', detail: 'Records administrator action is outside the document worker.' },
]

export const timeline = [
  { date: '04 Aug', title: 'Continuance assessment opened', detail: '30 annual revalidation questions seeded from the approved template.', tone: 'good' },
  { date: '12 Aug', title: 'G1 and G2 approved', detail: 'Acceptance, independence, terms and team authority recorded.', tone: 'good' },
  { date: '29 Aug', title: 'TB v02 held', detail: 'Opening-equity bridge did not reconcile; client query issued.', tone: 'warn' },
  { date: '03 Sep', title: 'TB v03 validated', detail: '14 accounts, QAR 1.82m control totals and zero signed balance.', tone: 'good' },
  { date: '09 Sep', title: 'AR-019 exception raised', detail: 'Contradictory evidence retained; alternative procedures assigned.', tone: 'danger' },
  { date: '13 Sep', title: 'FS v05 generated', detail: 'AJ-001 reflected in source; prior approvals remain historical.', tone: 'warn' },
]
