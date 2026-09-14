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

// The guide copy is intentionally part of the demo data so every page can
// explain its purpose, decision boundary, and handoff in the same language.
export const workflowGuides = {
  dashboard: {
    id: 'overview-guide',
    step: '01 / 09',
    phase: 'Orient',
    title: 'Start with the queue, then trace one engagement',
    summary: 'Use Overview as the daily control room. It tells you what needs attention, who owns the decision, and which page contains the supporting evidence.',
    steps: [
      { title: 'Scan the four signals', body: 'Read active engagements, gate progress, blockers, and integration health before opening a record.' },
      { title: 'Open the oldest blocker', body: 'Use Next actions to follow the highest-impact item. Each row deep-links to the page where it can be resolved.' },
      { title: 'Trace the cycle rail', body: 'The gate rail shows how one Northstar engagement moves from acceptance through archive without skipping controls.' },
    ],
    checks: ['Every amber or red item has an owner and due date.', 'The next action belongs to the correct service track.', 'No release action is attempted while an earlier gate is blocked.'],
    next: 'Clients & acceptance',
    nextHint: 'Open the client relationship before delivery work begins; acceptance is a separate professional decision.',
  },
  clients: {
    id: 'clients-guide',
    step: '02 / 09',
    phase: 'Accept',
    title: 'Separate the relationship from the acceptance decision',
    summary: 'Use this page to decide whether the firm can accept or continue a service-period relationship. A client record, quote, or portal login never grants professional acceptance.',
    steps: [
      { title: 'Filter the register', body: 'Use Needs decision to focus on holds and due continuances, or search by client ID when a reviewer sends a direct link.' },
      { title: 'Read the assessment', body: 'Open a client to inspect the response count, expired evidence, specialists, and the specific condition blocking commencement.' },
      { title: 'Record the human decision', body: 'The partner owns accept, continue, decline, or escalate. The prototype keeps that decision separate from commercial activity.' },
    ],
    checks: ['Entity, service route, period, and independence questions are in scope.', 'Blocking evidence has a named owner and a replacement due date.', 'A decision is not inferred from a deposit or portal access.'],
    next: 'Engagement workspace',
    nextHint: 'Once the relationship is accepted and terms are authorized, open the engagement to manage gates and accountable tracks.',
  },
  engagements: {
    id: 'engagement-guide',
    step: '03 / 09',
    phase: 'Authorize',
    title: 'Move through gates in order, with accountable tracks',
    summary: 'Use the engagement workspace as the single cycle record. It keeps accounting preparation, audit work, client service, and release dependencies visible without merging their responsibilities.',
    steps: [
      { title: 'Select a gate', body: 'Click any gate to see its owner, evidence expectation, and current state. Green means satisfied; amber means work is in review; red means downstream work is blocked.' },
      { title: 'Follow the right track', body: 'Open Accounting package for TB, mappings, journals, and statements. Open Audit file for risks, procedures, samples, and working papers.' },
      { title: 'Use the calendar', body: 'Milestones show the next commitment, who must act, and which gate will remain blocked if the date slips.' },
    ],
    checks: ['G0–G3 are complete before the accounting or audit plan is treated as usable.', 'The accounting package is a versioned input, never the auditor’s ledger.', 'The partner and preparer roles remain distinct.'],
    next: 'PBC portal',
    nextHint: 'Request the evidence needed to make data usable. The client only sees published request fields and upload status.',
  },
  pbc: {
    id: 'pbc-guide',
    step: '04 / 09',
    phase: 'Collect',
    title: 'Turn requests into accepted, traceable evidence',
    summary: 'Use the PBC portal to manage evidence without exposing internal risk notes, review deliberations, or unrestricted repository access to the client.',
    steps: [
      { title: 'Select a request', body: 'Choose an inbox row to review the request ID, entity and period, client owner, reviewer, due date, and acceptance criteria.' },
      { title: 'Log or clarify', body: 'Log receipt when files arrive; ask for clarification when period, completeness, usability, or expected totals do not match.' },
      { title: 'Check the client view', body: 'Use the read-only preview to confirm the client sees only assigned requests, action-needed prompts, and published deliverables.' },
    ],
    checks: ['The request is scoped to the right entity and reporting period.', 'Every upload has a receipt state and acceptance decision.', 'Internal risk scores, review points, and EQR deliberations stay hidden.'],
    next: 'Accounting & TB',
    nextHint: 'When the source is received, follow its raw receipt through parsing, controls, mappings, and the versioned statement package.',
  },
  accounting: {
    id: 'accounting-guide',
    step: '05 / 09',
    phase: 'Prepare',
    title: 'Validate the source before you trust the statements',
    summary: 'Use Accounting & TB to show exactly how a preserved receipt becomes a usable dataset. The controls are visible so a client can understand why a release base is or is not ready.',
    steps: [
      { title: 'Start with control totals', body: 'Confirm the 14-account QAR fixture, equal debit and credit totals, and a zero signed balance before reviewing individual rows.' },
      { title: 'Inspect mappings and journals', body: 'Open Mappings & reconciliations to review taxonomy coverage, control accounts, and the AJ-001/AJ-002 source bridge.' },
      { title: 'Read the package impact', body: 'Open Financial statements to see how the validated source flows into FS v05, current profit, net PPE, assets, liabilities, and equity.' },
    ],
    checks: ['TB v02 remains preserved as the QAR 1.82m baseline.', 'TB v03 reflects AJ-001 once, bringing each control side to QAR 1.825m.', 'A proposed correction such as AJ-002 remains a discussion until management decides.'],
    next: 'Audit & fieldwork',
    nextHint: 'Use the validated source and statement version to plan risks, assertions, procedures, populations, and samples.',
  },
  audit: {
    id: 'audit-guide',
    step: '06 / 09',
    phase: 'Test',
    title: 'Connect each risk to evidence and a professional conclusion',
    summary: 'Use the audit workspace to see the plan respond to risks without letting automation make an audit conclusion. Every risk has an owner, response, population, and evidence trail.',
    steps: [
      { title: 'Choose a risk', body: 'Select a row in the risk register to inspect the assertion, driver, approved response, and responsible reviewer.' },
      { title: 'Show linked work', body: 'Reveal the population, sample plan, and working paper references. The AR-019 conflict remains visible rather than being silently replaced.' },
      { title: 'Review the exception', body: 'Use the sample summary to see what is complete, what needs alternative work, and what remains a human evaluation.' },
    ],
    checks: ['Materiality and sampling choices are documented as professional selections.', 'A significant risk has a procedure and supported evidence.', 'No threshold or model output is presented as an automatic conclusion.'],
    next: 'Reviews & approvals',
    nextHint: 'Send changed work, exceptions, and version dependencies to the review queue before completion or release.',
  },
  reviews: {
    id: 'reviews-guide',
    step: '07 / 09',
    phase: 'Review',
    title: 'Clear responses without erasing the audit trail',
    summary: 'Use Reviews & approvals to manage review points, approval authority, and stale dependencies. A cleared item is still part of the historical record.',
    steps: [
      { title: 'Filter the queue', body: 'Use Open, Significant, or All to focus the queue. Start with the item that blocks G6 or G7.' },
      { title: 'Inspect before clearing', body: 'Read the evidence conflict, response, assignee, and due date. Only the authorized reviewer can clear the item.' },
      { title: 'Re-check applicability', body: 'When TB, FS, risks, or evidence change, prior approvals can become stale and require a new exact snapshot.' },
    ],
    checks: ['The responder cannot self-clear a significant review point.', 'Approval records retain person, authority, object version, and date.', 'A historical approval is never rewritten to make a new package pass.'],
    next: 'Release & archive',
    nextHint: 'When completion evidence and required approvals are ready, advance the release state machine one control at a time.',
  },
  release: {
    id: 'release-guide',
    step: '08 / 09',
    phase: 'Release',
    title: 'Freeze, verify, authorize, then archive',
    summary: 'Use Release & archive as a controlled state machine. It demonstrates why a signed package is a durable event, not simply a downloaded PDF.',
    steps: [
      { title: 'Advance one control', body: 'Run the next control only after the current state is understood. The flow protects the exact FS, TB, report, approvals, recipients, and hashes.' },
      { title: 'Resolve blockers', body: 'Use the completion checklist to see why partner conclusion, EQR, or recipients still prevent report date authorization.' },
      { title: 'Verify the manifest', body: 'Review native and rendered files, structured exports, approval/dependency history, delivery evidence, and the Purview observation separately.' },
    ],
    checks: ['Release uses exact matching versions, not “latest” files.', 'EQR completion is required when the engagement profile says so.', 'Amendments create a new linked case and never overwrite an issued report.'],
    next: 'Integration health',
    nextHint: 'Use health and reconciliation evidence to confirm external writes, retries, and records observations have durable operation IDs.',
  },
  integration: {
    id: 'integration-guide',
    step: '09 / 09',
    phase: 'Operate',
    title: 'Reconcile the boundaries you do not control',
    summary: 'Use Integration health to understand what the platform knows about Frappe, Microsoft Graph, SharePoint, Entra ID, and Purview—and what still needs an administrator.',
    steps: [
      { title: 'Read system cards', body: 'Healthy means the latest check passed; Action needed means the boundary needs an explicit owner or retry, not that data can be assumed correct.' },
      { title: 'Run reconciliation', body: 'Use the primary action to create a durable operation. The new operation reports its ID, systems, duration, and missing-snapshot result.' },
      { title: 'Separate observed from desired', body: 'Purview protection is observed separately from application intent. A notification can be missed, but the next delta must still reconcile.' },
    ],
    checks: ['Every external write has an operation ID and retry state.', 'Tokens never enter download URLs or client-visible links.', 'Staging and production use separate identities, secrets, and repositories.'],
    next: 'Overview',
    nextHint: 'Return to Overview to see how the latest operation and any remaining blockers affect the practice queue.',
  },
  'client-home': {
    id: 'client-home-guide',
    step: 'PORTAL 01',
    phase: 'Client portal',
    title: 'Start with your requests, then keep the team updated',
    summary: 'This private-looking demo view is the client’s front door. Use the request list to see what is needed, Client details to submit entity information, and Communications for every question or response.',
    steps: [
      { title: 'Check what is due', body: 'Open a request to see the period, file expectation, owner, due date, and whether the engagement team accepted the last upload.' },
      { title: 'Submit once, keep the history', body: 'Complete Client details when facts change. The portal keeps the submitted version and shows when the team last reviewed it.' },
      { title: 'Use one communication thread', body: 'Ask questions or explain exceptions in Communications so the response, attachments, and follow-up remain together.' },
    ],
    checks: ['The legal entity and reporting period are correct.', 'Every action-needed request has a named client owner.', 'Questions are sent through this portal instead of informal side channels.'],
    next: 'Client details',
    nextHint: 'Submit the legal entity, contact, period, and service details before uploading evidence.',
  },
  'client-details': {
    id: 'client-details-guide',
    step: 'PORTAL 02',
    phase: 'Client portal',
    title: 'Submit the facts the engagement team can rely on',
    summary: 'Use this form for entity and contact information. It is a client submission for review—not an acceptance decision, accounting conclusion, or audit opinion.',
    steps: [
      { title: 'Complete the required facts', body: 'Enter the registered entity, company number, reporting period, primary contact, and requested service exactly as the engagement letter describes them.' },
      { title: 'Add useful context', body: 'Use the context field for changes in ownership, systems, locations, or timing that could affect the request plan.' },
      { title: 'Submit for review', body: 'Send the form when it is complete. The team sees the submission timestamp and can ask a follow-up in Communications.' },
    ],
    checks: ['Names and registration numbers match company records.', 'The contact can answer follow-up questions during the period.', 'No password, access token, or confidential credential is placed in the form.'],
    next: 'Communications',
    nextHint: 'Use the portal thread to explain changes, answer questions, and confirm what the team should review next.',
  },
  'client-communications': {
    id: 'client-communications-guide',
    step: 'PORTAL 03',
    phase: 'Client portal',
    title: 'Keep every question and response in the portal',
    summary: 'Use Communications as the shared record for client questions, clarifications, and delivery updates. The demo keeps this thread separate from internal review points and approvals.',
    steps: [
      { title: 'Choose the right topic', body: 'Start a message with the request or period it relates to. This lets the team route it without searching email threads.' },
      { title: 'Describe the decision needed', body: 'Say what changed, which file or balance is affected, and when you need a response. Avoid sending credentials or sensitive secrets.' },
      { title: 'Confirm the next action', body: 'After the team replies, use the thread to confirm the owner and due date so everyone has the same handoff.' },
    ],
    checks: ['The message names a request, file, or reporting period.', 'Attachments are shared through the requested evidence flow.', 'The final response and next action are visible to both sides.'],
    next: 'Portal overview',
    nextHint: 'Return to the overview to see whether a reply, upload, or detail submission is still outstanding.',
  },
  'accountant-home': {
    id: 'accountant-home-guide',
    step: 'ACCOUNTANT 01',
    phase: 'Prepare',
    title: 'Use the accounting workspace to move evidence forward',
    summary: 'The accountant role can view client facts and continue preparation work. It cannot accept the relationship, approve the audit, authorize release, or manage system integrations.',
    steps: [
      { title: 'Start with client context', body: 'Open Client details before preparing a package so the entity, period, contact, and requested service are visible.' },
      { title: 'Follow the source-to-package chain', body: 'Move from PBC evidence to Accounting & TB, then use the linked audit page when the validated source is ready.' },
      { title: 'Escalate decisions', body: 'Use the communication and review cues to hand judgment calls to the partner or authorized reviewer instead of self-approving them.' },
    ],
    checks: ['Client details are read before source validation starts.', 'The accounting package uses a preserved, versioned input.', 'Acceptance, release, and integration controls remain with authorized roles.'],
    next: 'View Client details',
    nextHint: 'Confirm the engagement context, then open the PBC or accounting track that owns the next task.',
  },
  'accountant-client': {
    id: 'accountant-client-guide',
    step: 'ACCOUNTANT 02',
    phase: 'Client context',
    title: 'View client details before preparing the package',
    summary: 'This read-only view gives an accountant the context needed to prepare evidence and reconcile balances without changing the client’s submitted facts.',
    steps: [
      { title: 'Confirm the identity', body: 'Check the legal name, registration, reporting period, currency, and service route against the request you are preparing.' },
      { title: 'Understand the handoff', body: 'Use the team and service cards to see who owns accounting review, audit management, and partner decisions.' },
      { title: 'Continue to the work track', body: 'Open PBC for evidence intake, Accounting & TB for validation, or Audit & fieldwork for linked procedures.' },
    ],
    checks: ['The period and currency match the source receipt.', 'The read-only client facts are not silently edited during preparation.', 'Any mismatch is raised through an authorized review or client communication.'],
    next: 'PBC portal',
    nextHint: 'Use the evidence inbox to confirm what is received, accepted, or still needs clarification.',
  },
  'admin-console': {
    id: 'admin-console-guide',
    step: 'ADMIN 01',
    phase: 'Admin portal',
    title: 'Use the admin view to supervise every boundary',
    summary: 'The admin persona can see every demo workspace and the permission model. Use it to explain ownership, auditability, and the difference between configuration access and professional approval.',
    steps: [
      { title: 'Review access', body: 'Use the persona matrix to see exactly what client, accountant, and admin users can open in the prototype.' },
      { title: 'Inspect operations', body: 'Open the existing workflow pages to trace records, versions, queues, retries, approvals, and release dependencies.' },
      { title: 'Keep decisions accountable', body: 'Administrative access does not make a person the engagement partner or reviewer; the named authority still owns each professional decision.' },
    ],
    checks: ['Each role has a clear landing page and purpose.', 'Client messages stay in the client portal record.', 'Admin visibility does not rewrite historical approvals or conclusions.'],
    next: 'Overview',
    nextHint: 'Return to Overview for the portfolio queue, or select any workspace page from the full admin navigation.',
  },
}

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
