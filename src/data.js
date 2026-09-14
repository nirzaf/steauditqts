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
  { key: 'architecture', label: 'Architecture map', icon: 'workflow', section: 'Operations' },
  { key: 'blueprint', label: 'V5 operating model', icon: 'layers', section: 'Operations', badge: '26' },
  { key: 'cycle', label: 'Complete cycle', icon: 'workflow', section: 'Operations' },
  { key: 'pipeline', label: 'Pipeline visualizer', icon: 'workflow', section: 'Operations' },
  { key: 'readiness', label: 'Phase 0 readiness', icon: 'list-check', section: 'Operations', badge: '12' },
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
    checks: ['Every amber or red item has an owner and due date.', 'The next action belongs to the correct service track.', 'No release or commercial-close action is attempted while an earlier gate is blocked.'],
    next: 'Clients & acceptance',
    nextHint: 'Open the client relationship before delivery work begins; acceptance is a separate professional decision.',
  },
  clients: {
    id: 'clients-guide',
    step: '02 / 09',
    phase: 'Accept',
    title: 'Separate the relationship from the acceptance decision',
    summary: 'Use this page to capture a prospect in the lead register, then decide whether the firm can accept or continue a service-period relationship. A lead, client record, quote, or portal login never grants professional acceptance.',
    steps: [
      { title: 'Start with the lead register', body: 'Search, filter, or import bounded demo leads first. Assign a named owner, then keep qualification separate from creating a client and engagement.' },
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
    checks: ['G0–G4 are complete before portal or fieldwork operations are treated as ready.', 'The accounting package is a versioned input, never the auditor’s ledger.', 'The partner and preparer roles remain distinct.'],
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
  pipeline: {
    id: 'pipeline-guide',
    step: 'VISUALIZER 01',
    phase: 'Explain',
    title: 'Play the handoff, then open the supporting page',
    summary: 'Use this page as the client-friendly map of the audit portal. It compresses the full workflow into eight accountable stages while keeping each document, owner, visibility boundary, and detailed workspace link explicit.',
    steps: [
      { title: 'Select a stage', body: 'Click a stage card or use the arrow keys to inspect the human action, portal handoff, documents, next owner, and client-visible boundary.' },
      { title: 'Play or step', body: 'Use Play to move through the sequence at a steady teaching pace. Pause, Previous, Next, Reset, Home, and End keep the walkthrough interruptible and easy to present.' },
      { title: 'Trace the lanes', body: 'Read down the highlighted column for the handoff, then across a role row to see who acts, what the portal stores, and what stays internal.' },
    ],
    checks: ['Every stage names a human owner and a destination page.', 'Client-visible documents are separated from internal review and professional decisions.', 'The animation is a synthetic explanation and never performs an external action.'],
    next: 'Complete cycle',
    nextHint: 'Open Complete cycle for the detailed v5 G0–G10 walkthrough, failure-boundary rehearsal, and 36-step chronology.',
  },
  blueprint: {
    id: 'v5-blueprint-guide',
    step: 'V5 SPEC 01',
    phase: 'Operating model',
    title: 'Use the v5 blueprint to explain the whole practice',
    summary: 'This page translates the v5 specification into a stakeholder-friendly map: eleven independent gates, twenty-six named outputs, one commercial fixture, role boundaries, notifications, and the Worker/Frappe deployment split.',
    steps: [
      { title: 'Read the gate rail', body: 'Start with G0–G10. Each gate has its own evidence and owner; a paid invoice, portal login, or green status cannot substitute for another gate.' },
      { title: 'Open a named output', body: 'Use the 26-output catalogue to see when each form, letter, statement, report, invoice, time record, and cost summary is created and who owns it.' },
      { title: 'Walk the architecture boundary', body: 'The current demo uses a Cloudflare Worker for scoped server functions. The v5 production target remains a Frappe modular monolith with MariaDB and bounded Frappe workers.' },
    ],
    checks: ['Every status has an owner, trigger, version and evidence expectation.', 'Commercial cost, fee, advance, invoice and contribution are shown separately.', 'Unknown firm templates, rates, policies and tenant capability remain clearly marked as inputs—not invented defaults.'],
    next: 'Complete cycle',
    nextHint: 'Use the complete-cycle walkthrough to see how the v5 gates and outputs connect in chronological order.',
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
  architecture: {
    id: 'architecture-guide',
    step: 'ARCH 01',
    phase: 'Architecture',
    title: 'Read the platform as connected control planes',
    summary: 'Use this map to understand which system owns each fact, how work crosses the Frappe boundary, and where identity, documents, records, and recovery are deliberately separated.',
    steps: [
      { title: 'Start with identity', body: 'Entra authenticates staff. The temporary Frappe Website User baseline onboards a named client contact until an approved Entra B2B route is configured. Frappe then checks the firm, client, engagement, role, visibility, state, and separation-of-duties rules before revealing a record.' },
      { title: 'Follow the source of truth', body: 'MariaDB owns structured business records and durable outbox intent. SharePoint owns Office files, evidence, snapshots, and issued artifacts.' },
      { title: 'Trace the control planes', body: 'Graph workers reconcile external changes, Purview observes records protection, and independent checkpoints make recovery and release evidence reconstructable.' },
    ],
    checks: ['A client, engagement, Entra tenant, Frappe site, and SharePoint site are separate identifiers.', 'The public web process never receives a broad records credential or arbitrary Graph target.', 'A SharePoint status projection never becomes a second approval authority.'],
    next: 'Phase 0 readiness',
    nextHint: 'Use the proof register to see which architecture assumptions must be tested with synthetic records before production capability is enabled.',
  },
  readiness: {
    id: 'readiness-guide',
    step: 'PROOF 01',
    phase: 'Phase 0 proof',
    title: 'Turn architecture into evidence before production',
    summary: 'Use this register as the sponsor-friendly view of the v5 decision: a small synthetic vertical slice, explicit failure tests, and a go/no-go decision before expanding the service scope.',
    steps: [
      { title: 'Run the smallest complete slice', body: 'Use two synthetic clients and separate preparer, reviewer, partner, records, and client identities to exercise intake, accounting, audit, release, archive, and renewal.' },
      { title: 'Inject the hard failures', body: 'Pause workers, expire leases, change a source during evaluation, revoke access, simulate provider timeouts, and restore an older database without allowing duplicate release.' },
      { title: 'Record the decision', body: 'Keep the capability matrix, evidence package, defects, retests, owner approvals, measured costs, and known gaps together. A green screen is not readiness evidence.' },
    ],
    checks: ['Identity and client isolation negative tests pass.', 'Exact snapshots, journal source reflection, release guards, records protection, and recovery are evidenced.', 'Unsupported service routes remain disabled instead of being enabled by a renamed template.'],
    next: 'Architecture map',
    nextHint: 'Return to the architecture map when a proof result needs a clear system owner or boundary explanation.',
  },
  'admin-architecture': {
    id: 'admin-architecture-guide',
    step: 'ADMIN ARCH 01',
    phase: 'Control plane',
    title: 'Explain the whole platform before opening a gate',
    summary: 'Use the admin architecture view to orient a sponsor or control owner. It separates identity, structured records, documents, professional authority, records protection, and recovery.',
    steps: [
      { title: 'Start with ownership', body: 'Read each step as a system-of-record decision: who owns the fact, who may change it, and what evidence proves the handoff.' },
      { title: 'Trace one command', body: 'Follow a request from Entra identity through Frappe, MariaDB, bounded workers, SharePoint, and the final approval or hold.' },
      { title: 'Use the boundary notes', body: 'Open the detailed architecture map and Phase 0 register when a capability needs proof, a retry needs an owner, or a decision must remain human.' },
    ],
    checks: ['Every external effect has a typed command, receipt, and accountable owner.', 'Systems of record do not compete or silently overwrite each other.', 'A restored or changed state stays quarantined until evidence reconciles.'],
    next: 'Phase 0 readiness',
    nextHint: 'Use the proof register to replace architecture assumptions with synthetic test evidence before enabling production capability.',
  },
  'accountant-architecture': {
    id: 'accountant-architecture-guide',
    step: 'ACCOUNTANT ARCH 01',
    phase: 'Prepare',
    title: 'See the source-to-package handoff before you prepare',
    summary: 'Use this accountant-specific diagram to understand which facts you can prepare, which records are authoritative, and when a package must move to a named reviewer or partner.',
    steps: [
      { title: 'Confirm your scope', body: 'Open client context first. The role assignment controls what you can read and prepare; a visible screen never grants approval authority.' },
      { title: 'Preserve exact inputs', body: 'Follow PBC receipts, file versions, TB generations, and adjustment lineage so the package can be reconstructed after a replacement source arrives.' },
      { title: 'Hand off the decision', body: 'Submit the exact package to the named reviewer. Acceptance, audit conclusion, report date, and release remain separate professional decisions.' },
    ],
    checks: ['The client and period match the package you are preparing.', 'The source generation and adjustment plan are visible before submission.', 'Open conflicts are escalated instead of hidden in a revised spreadsheet.'],
    next: 'Accounting & TB',
    nextHint: 'Open the accounting workspace to inspect balances, mappings, journal reflection, and package readiness.',
  },
  'client-architecture': {
    id: 'client-architecture-guide',
    step: 'CLIENT ARCH 01',
    phase: 'Submit',
    title: 'Understand what happens after you press submit',
    summary: 'Use the client portal architecture view to see where your facts, files, and questions go—and why internal risk notes and professional approvals are not shown in the portal.',
    steps: [
      { title: 'Complete temporary onboarding', body: 'Use the named, short-lived Frappe Website User setup handoff, complete the required setup and MFA, then check the period before completing a form or attaching evidence. An approved Entra B2B route is an explicit alternative—not an invisible fallback.' },
      { title: 'Keep evidence with its request', body: 'Upload to the matching PBC item so the receipt, version, hash, and team response stay together.' },
      { title: 'Read the safe projection', body: 'Portal status tells you what is received, under review, accepted, or needs clarification; it is not a professional conclusion.' },
    ],
    checks: ['Each submission is tied to the correct client and engagement.', 'A file receipt or retry state is visible after upload.', 'Questions stay in the shared engagement thread with their context.'],
    next: 'Portal overview',
    nextHint: 'Return to the portal to review open requests, messages, due dates, and the next action for your team.',
  },
  cycle: {
    id: 'cycle-guide',
    step: 'V5 WALKTHROUGH 01',
    phase: 'Complete cycle',
    title: 'Trace the v5 cycle from acceptance to renewal',
    summary: 'Use this walkthrough as the shared map for a client conversation. It follows one Northstar engagement through the v5 gates, 26 named outputs, commercial close, archive, recovery, and fresh continuation.',
    steps: [
      { title: 'Start at the gate', body: 'Read the journey from G0 to G10. Commercial ready, terms accepted, portal eligible, fieldwork ready, completion, release, commercial close, and archive are separate gates.' },
      { title: 'Open the destination', body: 'Select a journey row to see the action, outcome, control, and a link to the corresponding prototype screen.' },
      { title: 'Run the rehearsal last', body: 'Use the local rehearsal to exercise the negative paths and record synthetic evidence. It never turns a prototype state into a production claim.' },
    ],
    checks: ['A human owner is named for every decision or handoff.', 'Synthetic outcomes are read as demonstrations, not live integration evidence.', 'A hold, stale generation, invoice retry, or non-renewal path remains visible instead of being skipped.'],
    next: 'V5 operating model',
    nextHint: 'Use the readiness register after the walkthrough to see which assumptions still need tenant, provider, records, or recovery proof.',
  },
}

// Role-specific architecture explainers. These deliberately describe the same
// platform through the boundary each persona needs to understand. Values are
// synthetic walkthrough content, not tenant configuration or production proof.
export const roleArchitecturePages = {
  admin: {
    key: 'admin',
    guideKey: 'admin-architecture',
    eyebrow: 'Admin architecture · high-level diagram',
    title: 'See the whole control plane at a glance',
    description: 'Use this view to explain how identity, Cloudflare edge functions, structured records, documents, approvals, records protection, and recovery connect without sharing ownership.',
    initials: 'MR',
    avatarTone: 'navy',
    audience: 'Admin · control owner',
    scope: 'All firms, clients, and gates',
    diagramTitle: 'From a user request to a controlled business event',
    diagramHint: 'Read left to right. Each step names the system of record and the guardrail that must be evidenced before the next handoff.',
    flow: [
      { id: 'admin-access', number: '01', label: 'Identity + policy', system: 'Entra ID / Website User → Frappe', icon: 'key', tone: 'blue', action: 'Authenticate staff with Entra and onboard a named client contact through the temporary Website User baseline until an approved B2B route exists, then resolve firm, client, engagement, role, and separation-of-duties scope.', control: 'Tenant / issuer checks, setup expiry, session epoch, role assignment', output: 'Scoped actor session' },
      { id: 'admin-command', number: '02', label: 'Server-side boundary', system: 'Cloudflare Worker → Frappe', icon: 'pulse', tone: 'green', action: 'Accept only a bounded server command from the browser. The Worker can protect the edge route, but it is not the Frappe application host or the system of record.', control: 'Access gate, correlation ID, typed route and fail-closed mode', output: 'Validated request boundary' },
      { id: 'admin-command-firstrate', number: '03', label: 'Guarded command', system: 'Frappe application plane', icon: 'workflow', tone: 'navy', action: 'Route a typed business command instead of exposing a provider URL or an unrestricted integration token.', control: 'Command receipt, state guard, owner and idempotency key', output: 'Auditable business intent' },
      { id: 'admin-records', number: '04', label: 'Structured records', system: 'MariaDB + durable outbox', icon: 'database', tone: 'navy', action: 'Persist client, engagement, gate, approval, generation, and retry state where the firm can query it consistently.', control: 'Versioned rows, outbox intent, lease and fencing token', output: 'Durable application state' },
      { id: 'admin-documents', number: '05', label: 'Documents + snapshots', system: 'Graph → SharePoint', icon: 'folder', tone: 'amber', action: 'Move selected files through working, restricted, and records repositories while retaining IDs, versions, bytes, and hashes.', control: 'Allowlisted calls, exact snapshot, receipt hash', output: 'Reconstructable evidence package' },
      { id: 'admin-release', number: '06', label: 'Decision + recovery', system: 'Approvals → Purview → checkpoint', icon: 'shield', tone: 'purple', action: 'Keep professional approval, protection observation, release authorization, delivery, and recovery evidence as separate events.', control: 'Named authority, manifest, protection attestation, external checkpoint', output: 'Controlled release or visible hold' },
    ],
    userSurface: [
      { title: 'Supervise boundaries', detail: 'See every workspace, gate, retry, approval dependency, and integration health signal.' },
      { title: 'Route work to owners', detail: 'Send acceptance, review, records, or recovery decisions to the named accountable person.' },
      { title: 'Inspect proof', detail: 'Open the architecture map and Phase 0 register to explain what is known, assumed, or blocked.' },
    ],
    platformSurface: [
      { title: 'Keep sources distinct', detail: 'Frappe owns workflow state, MariaDB owns structured records, and SharePoint owns document bytes and revisions.' },
      { title: 'Fence external effects', detail: 'Workers use bounded identities, durable operations, retries, and reconciliation rather than hidden browser side effects.' },
      { title: 'Preserve decisions', detail: 'A changed input creates a new generation or linked case; historical approvals and issued packages remain immutable.' },
    ],
    facts: [
      { label: 'Command authority', value: 'Frappe + named owner', detail: 'Admin visibility does not make an administrator the engagement partner.' },
      { label: 'Document plane', value: 'Three SharePoint sites', detail: 'Working, restricted compliance, and records duties use separate scopes.' },
      { label: 'Recovery posture', value: 'Quarantine first', detail: 'Restored deployments disable outward effects until checkpoints reconcile.' },
      { label: 'Proof status', value: 'Phase 0 required', detail: 'Synthetic experiments replace assumptions before live capability is enabled.' },
    ],
    checklist: ['Start with the system of record, not the screen that happens to display a value.', 'Treat every external write as an operation with an owner, receipt, and retry state.', 'Keep professional conclusions and records actions outside an automatic rule path.'],
    next: { label: 'Phase 0 readiness', route: 'readiness', detail: 'Open the experiment register to see which boundaries still need evidence.' },
  },
  accountant: {
    key: 'accountant',
    guideKey: 'accountant-architecture',
    eyebrow: 'Accountant architecture · preparation view',
    title: 'How your accounting work moves through AuditFlow',
    description: 'This view shows the safe path from client evidence to a versioned accounting package—and where approval authority changes hands.',
    initials: 'LN',
    avatarTone: 'green',
    audience: 'Accountant · prepare + review',
    scope: 'Northstar accounting handoff',
    diagramTitle: 'From source evidence to a controlled handoff',
    diagramHint: 'Read left to right. You prepare and reconcile the package; the named partner or reviewer owns acceptance, approval, release, and conclusion decisions.',
    flow: [
      { id: 'accountant-login', number: '01', label: 'Sign in', system: 'Entra ID + Frappe', icon: 'key', tone: 'blue', action: 'Use the named accountant identity and open only the assigned client and engagement context.', control: 'OIDC session, actor mapping, client scope', output: 'Preparation access' },
      { id: 'accountant-context', number: '02', label: 'Confirm context', system: 'Frappe client + engagement', icon: 'users', tone: 'navy', action: 'Check entity, period, service route, owner, and current gate before touching a file or row.', control: 'Assignment and read-only fact projection', output: 'Known engagement boundary' },
      { id: 'accountant-evidence', number: '03', label: 'Review evidence', system: 'Graph → SharePoint working site', icon: 'folder', tone: 'amber', action: 'Review accepted PBC files and their exact versions. Ask for clarification without changing the source silently.', control: 'Receipt, item ID, version, hash and request thread', output: 'Usable source inputs' },
      { id: 'accountant-package', number: '04', label: 'Build package', system: 'Frappe + MariaDB', icon: 'calculator', tone: 'navy', action: 'Validate the TB, map accounts, document adjustments, and show whether an entry is already reflected in the source.', control: 'Decimal totals, source generation, adjustment lineage', output: 'Versioned accounting package' },
      { id: 'accountant-handoff', number: '05', label: 'Handoff for decision', system: 'Review queue → audit team', icon: 'check-circle', tone: 'green', action: 'Submit the exact package for technical, partner, or audit review; do not self-approve a professional conclusion.', control: 'Snapshot, reviewer assignment, stale-generation guard', output: 'Traceable handoff or hold' },
    ],
    userSurface: [
      { title: 'Prepare the package', detail: 'Validate rows, mappings, journals, statements, and the bridge from source to reported numbers.' },
      { title: 'Clarify evidence', detail: 'Review accepted PBC items and keep questions attached to the relevant request or period.' },
      { title: 'See the next owner', detail: 'Use gate and review cues to hand decisions to the partner, EQR, or audit team.' },
    ],
    platformSurface: [
      { title: 'Protect the source', detail: 'A new upload or source revision creates a new generation; prior approvals remain historical.' },
      { title: 'Prevent double application', detail: 'Adjustment plans show whether AJ-001 is proposed, approved, or already reflected in a replacement TB.' },
      { title: 'Keep approvals separate', detail: 'Preparation status never implies acceptance, audit approval, report-date authorization, or release.' },
    ],
    facts: [
      { label: 'Your workspace', value: 'View + prepare', detail: 'Client facts are visible; acceptance and release controls remain restricted.' },
      { label: 'Authoritative numbers', value: 'Versioned TB + package', detail: 'Use the exact source generation and Decimal control totals, not a copied spreadsheet.' },
      { label: 'External files', value: 'SharePoint working site', detail: 'Office files stay in the document plane and open in a separate human session.' },
      { label: 'Decision owner', value: 'Named reviewer / partner', detail: 'Escalate judgment calls instead of turning a preparation screen into approval.' },
    ],
    checklist: ['Confirm client, period, and service route before preparing rows.', 'Use exact file versions and preserve source-to-adjustment lineage.', 'Submit the package to the named reviewer; do not cross the approval boundary.'],
    next: { label: 'Accounting & TB', route: 'accounting', detail: 'Open the live prototype view to inspect balances, mappings, adjustments, and handoff status.' },
  },
  client: {
    key: 'client',
    guideKey: 'client-architecture',
    eyebrow: 'Client architecture · portal view',
    title: 'How your portal connects to the engagement team',
    description: 'This view explains what happens when you submit company facts, upload evidence, or ask a question—and what remains private to the audit team.',
    initials: 'NF',
    avatarTone: 'blue',
    audience: 'Client · submit + communicate',
    scope: 'Northstar Trading portal',
    diagramTitle: 'From your submission to a visible team response',
    diagramHint: 'Read left to right. The portal gives you a clear status and communication trail while professional decisions and internal notes stay with authorized firm roles.',
    flow: [
      { id: 'client-invite', number: '01', label: 'Temporary onboarding', system: 'Frappe Website User → client portal', icon: 'key', tone: 'blue', action: 'Use the named, short-lived onboarding username/password delivered through the approved secure handoff, then complete setup and MFA before any engagement read/write access.', control: 'Stable person mapping, expiry, setup-only session, revocation', output: 'Private client workspace' },
      { id: 'client-facts', number: '02', label: 'Submit facts', system: 'Frappe client record', icon: 'users', tone: 'navy', action: 'Complete or confirm entity details, contact information, period, and service requests in the form provided.', control: 'Field validation, revision and submit receipt', output: 'Versioned client input' },
      { id: 'client-upload', number: '03', label: 'Upload evidence', system: 'Portal → Graph → SharePoint', icon: 'upload', tone: 'amber', action: 'Add the requested file to the right PBC item. The system records the transfer and preserves the exact bytes and version.', control: 'Selected-resource grant, receipt, hash and retry', output: 'Traceable evidence item' },
      { id: 'client-thread', number: '04', label: 'Ask + clarify', system: 'Frappe communication thread', icon: 'message', tone: 'green', action: 'Keep each question with its request, period, and team response so everyone can see the next action.', control: 'Client-visible thread, timestamps and ownership', output: 'Shared clarification record' },
      { id: 'client-status', number: '05', label: 'See status', system: 'Portal projection ← firm controls', icon: 'eye', tone: 'purple', action: 'See whether a request is received, under review, accepted, or needs clarification without exposing internal risk notes. An approved Entra B2B route is an explicit alternative, not an invisible fallback.', control: 'Safe projection of state, not a second approval', output: 'Clear next step for you' },
    ],
    userSurface: [
      { title: 'Submit once, track clearly', detail: 'Use Client details and requests to keep facts, files, and due dates in one engagement context.' },
      { title: 'Ask in the right place', detail: 'Use Communications for questions or clarification so the engagement team can respond with context.' },
      { title: 'Know what is due', detail: 'The portal shows accepted, under-review, and clarification-required states without hidden jargon.' },
    ],
    platformSurface: [
      { title: 'Isolate your workspace', detail: 'Client IDs, engagement scope, filters, exports, and portal links are checked before data is shown.' },
      { title: 'Preserve your evidence', detail: 'Uploads are recorded with request, version, receipt, and hash; retries do not silently create a second file.' },
      { title: 'Protect professional notes', detail: 'Internal risks, review points, approvals, and records actions never appear in the client projection.' },
    ],
    facts: [
      { label: 'You can see', value: 'Your facts + requests', detail: 'Client details, PBC items, shared messages, due dates, and safe status projections.' },
      { label: 'Your files live in', value: 'Working SharePoint site', detail: 'The portal records the handoff; the document repository preserves the bytes.' },
      { label: 'Team decisions live in', value: 'Private Frappe workspace', detail: 'Acceptance, risks, approvals, release, and conclusions remain with authorized roles.' },
      { label: 'Your next action', value: 'Respond or clarify', detail: 'A portal status tells you what the engagement team needs next.' },
    ],
    checklist: ['Use the organization invitation and confirm the period before submitting.', 'Attach each file to the matching request and wait for the receipt or retry status.', 'Keep questions in the engagement thread; never email a replacement that loses context.'],
    next: { label: 'Portal overview', route: 'client-home', detail: 'Return to the portal to review open requests, messages, and the next due item.' },
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
  { id: 'G1', title: 'Accept / continue', detail: 'Assessment, evidence, clearances and partner decision' },
  { id: 'G2', title: 'Commercial ready', detail: 'Estimate, fee approvals and quotation' },
  { id: 'G3', title: 'Terms accepted', detail: 'Exact EL and verified acceptance' },
  { id: 'G4', title: 'Portal eligible', detail: 'Advance, identity and restricted binding' },
  { id: 'G5', title: 'Fieldwork ready', detail: 'Plan, announcement, team and critical items' },
  { id: 'G6', title: 'Review submission ready', detail: 'Workpapers and conclusion summary' },
  { id: 'G7', title: 'Completion ready', detail: 'Responses, review, representation and EQR' },
  { id: 'G8', title: 'Release ready', detail: 'Opinion, discussion, signatures and protection' },
  { id: 'G9', title: 'Commercial close', detail: 'Invoice, advance, time and cost snapshot' },
  { id: 'G10', title: 'Archive / renewal', detail: 'Retained file, recovery and fresh decision' },
]

export const gateStatuses = ['good', 'good', 'good', 'good', 'good', 'good', 'warn', 'danger', 'danger', 'neutral', 'neutral']

// V5 architecture map: each node is a deliberately small, human-readable
// description of the system of record, boundary, and control it represents.
// These are synthetic demo values, not live tenant configuration.
export const architectureNodes = [
  { id: 'actors', label: 'Staff + named clients', kind: 'People', icon: 'users', tone: 'blue', detail: 'Staff use the internal workspace; baseline clients use named temporary onboarding credentials and only the restricted portal surface.', owner: 'Entra staff identity + Frappe website user', rule: 'A login is not professional acceptance or a document permission.' },
  { id: 'entra', label: 'Microsoft Entra ID', kind: 'Identity plane', icon: 'key', tone: 'blue', detail: 'Tenant-scoped OIDC authentication, MFA/Conditional Access and stable object mappings.', owner: 'Microsoft Entra', rule: 'Validate issuer, tenant, audience, state, nonce and session epoch.' },
  { id: 'cloudflare-worker', label: 'Cloudflare Worker boundary', kind: 'Prototype server functions', icon: 'pulse', tone: 'green', detail: 'The current Vue prototype can opt into a separately protected Worker for narrow API commands, correlation IDs and D1 demo persistence.', owner: 'Cloudflare Worker · steaudit-api', rule: 'Edge functions are fail-closed and never replace the Frappe application or provider authorization boundary.' },
  { id: 'frappe', label: 'Frappe + audit_practice', kind: 'Application plane', icon: 'workflow', tone: 'navy', detail: 'One custom modular app owns commands, assignments, gates, approvals, findings and projections.', owner: 'Firm-managed application', rule: 'Authorize scope and operation before resolving any provider file.' },
  { id: 'mariadb', label: 'MariaDB + durable outbox', kind: 'Structured records', icon: 'database', tone: 'navy', detail: 'Versioned professional records, safety generations, command receipts, events and retryable intent.', owner: 'Frappe database', rule: 'Structured client data never mixes with the firm ledger.' },
  { id: 'workers', label: 'Frappe workers', kind: 'Execution groups', icon: 'pulse', tone: 'green', detail: 'General, processing and restricted records jobs run with bounded scopes and attempt fencing.', owner: 'Scheduler + workers', rule: 'Long work is leased and reconciled; Redis is not the only copy of intent.' },
  { id: 'graph', label: 'Microsoft Graph adapter', kind: 'Integration boundary', icon: 'link', tone: 'blue', detail: 'Allowlisted metadata, upload, version and delta calls with selected-resource grants.', owner: 'Dedicated integration identity', rule: 'No arbitrary URL, path, token or consent expansion from the browser.' },
  { id: 'sharepoint', label: 'SharePoint Online', kind: 'Document plane', icon: 'folder', tone: 'amber', detail: 'Working files, raw receipts, evidence snapshots, issued packages and completed-file artifacts.', owner: 'Microsoft document repository', rule: 'Stable site/drive/item IDs and exact hashes outrank filenames or “latest”.' },
  { id: 'office', label: 'Microsoft 365 Office', kind: 'Human editing', icon: 'file', tone: 'blue', detail: 'Word and Excel open in an authenticated separate tab for controlled human editing.', owner: 'User session + SharePoint', rule: 'Saved Office edits are submitted as a new revision; Office is not the unattended calculation engine.' },
  { id: 'purview', label: 'Purview records plane', kind: 'Records control', icon: 'shield', tone: 'purple', detail: 'Retention labels, records policy and protection observations are administered separately.', owner: 'Records administrator', rule: 'Desired protection is not reported as enforced until observed and verified.' },
  { id: 'recovery', label: 'Protected recovery checkpoints', kind: 'Recovery plane', icon: 'archive', tone: 'green', detail: 'Independent manifests and release checkpoints support restore reconciliation across MariaDB and Microsoft stores.', owner: 'Recovery / records custodians', rule: 'Restored deployments start quarantined with outward effects disabled.' },
]

export const architectureFlowRows = [
  { id: 'access', label: 'Access', icon: 'users', hint: 'Authenticate, then authorize', nodeIds: ['actors', 'entra', 'frappe'], arrows: ['OIDC + PKCE', 'Scoped commands'] },
  { id: 'server', label: 'Server functions', icon: 'pulse', hint: 'Keep the edge boundary narrow', nodeIds: ['actors', 'cloudflare-worker', 'frappe'], arrows: ['HTTPS request', 'Fail-closed API'] },
  { id: 'records', label: 'Structured records', icon: 'database', hint: 'Own business state locally', nodeIds: ['frappe', 'mariadb', 'workers'], arrows: ['Guarded transaction', 'Durable jobs'] },
  { id: 'documents', label: 'Documents', icon: 'folder', hint: 'Preserve and reconcile content', nodeIds: ['workers', 'graph', 'sharepoint'], arrows: ['Selected Graph calls', 'Versioned artifacts'] },
  { id: 'editing', label: 'Office editing', icon: 'file', hint: 'Human edits stay outside the app', nodeIds: ['frappe', 'office', 'sharepoint'], arrows: ['Authenticated launch', 'Saved revision'] },
  { id: 'protection', label: 'Protection + recovery', icon: 'shield', hint: 'Observe and reconstruct', nodeIds: ['purview', 'sharepoint', 'recovery'], arrows: ['Policy observation', 'Protected checkpoint'] },
]

export const systemsOfRecord = [
  { information: 'Staff and client onboarding identity', system: 'Entra ID + Frappe Website User', icon: 'key', tone: 'blue', projection: 'Staff use tenant-scoped identity; the temporary client baseline is named, short-lived and explicitly separate from an optional Entra B2B route.' },
  { information: 'Prototype server commands', system: 'Cloudflare Worker (steaudit-api)', icon: 'pulse', tone: 'green', projection: 'The Worker is an optional, fail-closed edge boundary for demo API calls; it is not the v5 Frappe system of record.' },
  { information: 'Client, engagement and professional authority', system: 'Frappe audit_practice', icon: 'workflow', tone: 'navy', projection: 'Assignments and commands define business access; a customer or invoice never implies acceptance.' },
  { information: 'TB, GL imports, mappings and approvals', system: 'MariaDB structured records', icon: 'database', tone: 'navy', projection: 'Rows, revisions, safety generations and manifests are versioned with Decimal arithmetic.' },
  { information: 'Office files and evidence', system: 'SharePoint Online', icon: 'folder', tone: 'amber', projection: 'Frappe stores IDs, versions, hashes and links—not a competing document repository.' },
  { information: 'Retention and record protection', system: 'Purview + records admin', icon: 'shield', tone: 'purple', projection: 'Observed protection is stored separately from desired labels and application status.' },
  { information: 'Recovery evidence', system: 'Independent checkpoint store', icon: 'archive', tone: 'green', projection: 'Release identity and canonical manifest bytes remain reconstructable after restore.' },
]

export const architectureGuardrails = [
  { title: 'One firm site, explicit client scope', icon: 'building', tone: 'navy', detail: 'The initial topology is one Frappe site for the operating firm; client and engagement IDs remain first-class confidentiality boundaries.' },
  { title: 'Authorize before resolving files', icon: 'lock', tone: 'blue', detail: 'Role, assignment, object visibility, current state, holds and separation of duties are checked before a SharePoint reference is read.' },
  { title: 'Three Microsoft repositories', icon: 'folder', tone: 'amber', detail: 'Working, restricted compliance and records sites are separately administered; the routine document worker has no records credential.' },
  { title: 'No automatic professional decisions', icon: 'user', tone: 'green', detail: 'Rules calculate, flag and route. Partners, reviewers, management and records owners retain their named authority.' },
]

export const serviceRoutes = [
  { name: 'Accounting only', icon: 'calculator', tone: 'green', state: 'Enabled in slice', detail: 'Management and technical accounting approval with service-specific release wording; no audit opinion.' },
  { name: 'Financial-statement audit only', icon: 'clipboard', tone: 'blue', state: 'Supported route', detail: 'Use a versioned management-prepared accounting package; do not force bookkeeping into the practice ledger.' },
  { name: 'Accounting + external auditor', icon: 'users', tone: 'blue', state: 'Controlled handoff', detail: 'Accounting and audit scopes remain separate, sharing only an explicitly authorized package or snapshot.' },
  { name: 'Same firm accounting + audit', icon: 'shield', tone: 'amber', state: 'Professional gate', detail: 'Both tracks activate only after an affirmative service-permissibility decision; separate teams alone are not enough.' },
]

export const integrationIdentities = [
  { id: 'audit-web-login', purpose: 'Interactive OIDC sign-in', scope: 'Identity scopes only', icon: 'key', tone: 'blue', state: 'Ready for proof', note: 'No automatic document-wide access.' },
  { id: 'audit-doc-worker', purpose: 'Working upload / read / delta', scope: 'Selected working sites', icon: 'folder', tone: 'green', state: 'Bounded', note: 'Routine content operations only.' },
  { id: 'audit-records-worker', purpose: 'Snapshots + release artifacts', scope: 'Restricted records site', icon: 'shield', tone: 'amber', state: 'Restricted', note: 'Separate process and credential.' },
  { id: 'provisioning-admin', purpose: 'Groups, grants and exceptional records setup', scope: 'Admin-run tooling', icon: 'settings', tone: 'purple', state: 'Manual first', note: 'Time-limited reviewed privilege.' },
]

export const capabilityMatrix = [
  { capability: 'Working file upload + exact version read', route: 'Routine Graph adapter', state: 'Synthetic proof path', tone: 'good', evidence: 'Selected-resource grant and receipt hash' },
  { capability: 'Office opening', route: 'User browser → Microsoft 365', state: 'Separate tab', tone: 'good', evidence: 'Human permission and license check' },
  { capability: 'Snapshot creation + readback', route: 'Restricted records executor', state: 'Gate before release', tone: 'warn', evidence: 'Stored bytes, manifest and protection attestation' },
  { capability: 'Record label / protection', route: 'Records-admin route', state: 'Manual verification', tone: 'warn', evidence: 'Observed edit, move, unlock and delete behavior' },
  { capability: 'Webhook notifications', route: 'Optional acceleration', state: 'Disabled baseline', tone: 'neutral', evidence: 'Scheduled delta remains the safety control' },
  { capability: 'App-only Excel calculation', route: 'Not required', state: 'Intentionally excluded', tone: 'neutral', evidence: 'Server-side Decimal engine is authoritative' },
]

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

export const phase0Experiments = [
  { id: 'P0-01', title: 'Reproducible build', phase: 'Foundation', icon: 'workflow', tone: 'good', state: 'Fixture ready', owner: 'Technical lead', action: 'Build the pinned Frappe/app/runtime set from a clean environment.', pass: 'Clean build, migration smoke and restart evidence.' },
  { id: 'P0-02', title: 'Identity and lifecycle', phase: 'Identity', icon: 'key', tone: 'warn', state: 'Needs evidence', owner: 'Identity + security', action: 'Exercise staff, invited client, unknown tenant, changed email and disabled actor.', pass: 'Stable mapping, no silent merge, session revocation.' },
  { id: 'P0-03', title: 'Client isolation', phase: 'Security', icon: 'shield', tone: 'warn', state: 'Needs evidence', owner: 'QA + security', action: 'Guess IDs, filters, exports, direct links and realtime channels across two clients.', pass: 'No cross-client metadata, files, counts or links.' },
  { id: 'P0-04', title: 'Microsoft capability matrix', phase: 'Microsoft', icon: 'link', tone: 'warn', state: 'In progress', owner: 'M365 owner', action: 'Test selected Graph metadata, upload, versions, delta and denied repositories.', pass: 'Exact grant, endpoint, license and denied-scope evidence.' },
  { id: 'P0-05', title: 'Receipt and snapshot', phase: 'Documents', icon: 'archive', tone: 'good', state: 'Fixture ready', owner: 'Technical + records', action: 'Upload known bytes, create a native copy, capture a snapshot and read it back after a later edit.', pass: 'Original, stored and approved hashes are distinct and reconstructable.' },
  { id: 'P0-06', title: 'Local release race', phase: 'Release safety', icon: 'lock', tone: 'neutral', state: 'Planned', owner: 'Technical + QA', action: 'Pause impact evaluation, change an input and authorize concurrently.', pass: 'Generation guard blocks stale release deterministically.' },
  { id: 'P0-07', title: 'Accounting bridge', phase: 'Accounting', icon: 'calculator', tone: 'good', state: 'Fixture ready', owner: 'Accounting lead', action: 'Run Appendix D, apply AJ-001, then re-upload a source where AJ-001 is already reflected.', pass: 'Profit remains QAR 175,000; no double application.' },
  { id: 'P0-08', title: 'Privileged execution', phase: 'Security', icon: 'shield', tone: 'neutral', state: 'Planned', owner: 'Security + records', action: 'Submit forged Graph paths, labels, targets and stale operations to the records executor.', pass: 'Typed operation and trusted binding deny the request.' },
  { id: 'P0-09', title: 'Records enforcement', phase: 'Records', icon: 'folder', tone: 'danger', state: 'Blocked until tenant proof', owner: 'Records owner', action: 'Test edit, delete, move, unlock, label removal and role access on synthetic records.', pass: 'Protection meets the approved profile; no unsupported claim.' },
  { id: 'P0-10', title: 'Retry and revocation', phase: 'Reliability', icon: 'refresh', tone: 'neutral', state: 'Planned', owner: 'Technical + QA', action: 'Fail after remote success, expire a lease and revoke the requester while an export is queued.', pass: 'Same artifact reconciles; stale attempt cannot publish or deliver.' },
  { id: 'P0-11', title: 'Release and recovery', phase: 'Recovery', icon: 'archive', tone: 'danger', state: 'Blocked until checkpoint proof', owner: 'Operations', action: 'Restore an older database while the protected release checkpoint remains external.', pass: 'Quarantine holds outward effects; one release identity is reconstructed.' },
  { id: 'P0-12', title: 'Scope and economics', phase: 'Decision', icon: 'chart', tone: 'neutral', state: 'Owner workshop', owner: 'Sponsor + product', action: 'Run the synthetic slice with professional leads and replace planning assumptions with measured values.', pass: 'Supported service profile, backlog and feasibility decision are signed.' },
]

export const phase0Tracks = [
  { label: 'Experiments', value: '12', note: 'Named proof scenarios', icon: 'list-check', tone: 'blue' },
  { label: 'Critical blockers', value: '3', note: 'Identity, isolation, records/recovery', icon: 'warning', tone: 'amber' },
  { label: 'Live data', value: '0', note: 'Synthetic fixtures only', icon: 'shield', tone: 'green' },
  { label: 'Effort range', value: '8–12', note: 'Focused person-weeks for Phase 0', icon: 'calendar', tone: 'navy' },
]

export const phase0Stages = [
  { label: 'Proof setup', icon: 'settings', detail: 'Pin versions, identities, repositories and synthetic fixtures.', state: 'Current', tone: 'blue' },
  { label: 'Complete vertical slice', icon: 'workflow', detail: 'Run intake → accounting → audit → release → archive → renewal.', state: 'Next', tone: 'amber' },
  { label: 'Sponsor decision', icon: 'check-circle', detail: 'Proceed, narrow, rework or stop using evidence—not screen count.', state: 'Pending', tone: 'neutral' },
]

export const verticalSliceSteps = [
  { gate: 'G0', title: 'Firm and method ready', detail: 'Synthetic users, capability profile, pinned build and repository bindings.', icon: 'settings' },
  { gate: 'G1', title: 'Accept or hold relationship', detail: '62-question assessment, specialist clearance and partner decision.', icon: 'users' },
  { gate: 'G2', title: 'Commercial ready', detail: 'Staff-level estimate, fee approvals, quotation and approved scope.', icon: 'calculator' },
  { gate: 'G3', title: 'Terms accepted', detail: 'Exact EL review, delivery and electronic or wet-sign verification.', icon: 'file' },
  { gate: 'G4', title: 'Portal eligible', detail: 'Verified advance allocation, named client identity and scoped activation.', icon: 'key' },
  { gate: 'G5', title: 'Fieldwork ready', detail: 'Plan, announcement, PBC readiness, validated TB and audit preparation.', icon: 'clipboard' },
  { gate: 'G6', title: 'Review submission ready', detail: 'Exact workpapers, conclusion summary and next-level package.', icon: 'check-circle' },
  { gate: 'G7', title: 'Completion ready', detail: 'Draft response, information follow-up, representation, review and EQR.', icon: 'users' },
  { gate: 'G8', title: 'Release ready', detail: 'Opinion, final discussion, signatures, protection and checkpoint.', icon: 'lock' },
  { gate: 'G9', title: 'Commercial close', detail: 'Final invoice, advance allocation, canonical time and cost reconciliation.', icon: 'chart' },
  { gate: 'G10', title: 'Archive / renewal', detail: 'Complete archive, recovery rehearsal and fresh continuation decision.', icon: 'refresh' },
]

// A reference-prototype-inspired, human-readable journey. The routes point to
// existing screens in this demonstrator; outcomes deliberately say synthetic
// so the map cannot be mistaken for proof of a live provider integration.
export const cycleJourneySteps = [
  { number: '01', gate: 'G0', phase: 'Acquire & accept', title: 'Configure the firm baseline', action: 'Admin pins the build, method, users, service profile, and repository bindings.', outcome: 'Synthetic outcome: G0 is derived from the configured access and control records.', control: 'Version pin, tenant boundary, named system owner', route: 'architecture', routeLabel: 'Open architecture map', icon: 'settings', tone: 'blue' },
  { number: '02', gate: 'G1', phase: 'Acquire & accept', title: 'Create the prospect record', action: 'The team registers Northstar Trading as a prospect with an owner and requested service.', outcome: 'Synthetic outcome: the relationship exists without implying acceptance or portal access.', control: 'Client identity, service route, relationship owner', route: 'clients', routeLabel: 'Open clients & acceptance', icon: 'users', tone: 'blue' },
  { number: '03', gate: 'G1', phase: 'Acquire & accept', title: 'Start the CRM relationship', action: 'The owner records the contact, scope conversation, and next decision date.', outcome: 'Synthetic outcome: commercial activity stays separate from professional acceptance.', control: 'Scoped client record and activity history', route: 'clients', routeLabel: 'Open clients & acceptance', icon: 'message', tone: 'navy' },
  { number: '04', gate: 'G1', phase: 'Acquire & accept', title: 'Open the 62-question acceptance', action: 'Compliance opens the current acceptance template and assigns the questions to accountable owners.', outcome: 'Synthetic outcome: unanswered or unknown responses create visible holds.', control: 'Template version, revision, response owner', route: 'clients', routeLabel: 'Open clients & acceptance', icon: 'list-check', tone: 'blue' },
  { number: '05', gate: 'G1', phase: 'Acquire & accept', title: 'Resolve evidence and specialist holds', action: 'Compliance records the missing UBO, independence, and specialist evidence before a partner decision.', outcome: 'Synthetic outcome: the hold clears only when the required response is recorded.', control: 'Evidence status, explanation, specialist clearance', route: 'clients', routeLabel: 'Open clients & acceptance', icon: 'shield', tone: 'amber' },
  { number: '06', gate: 'G1', phase: 'Acquire & accept', title: 'Record the partner decision', action: 'The authorized partner accepts, declines, or escalates the current relationship scope.', outcome: 'Synthetic outcome: a decision is committed with rationale; confirmed prohibitions remain non-overridable.', control: 'Named authority, expected revision, idempotency', route: 'clients', routeLabel: 'Open clients & acceptance', icon: 'check-circle', tone: 'green' },
  { number: '07', gate: 'G2', phase: 'Acquire & accept', title: 'Sign terms and authorize work', action: 'Management signs the scoped terms and the partner activates the eligible engagement.', outcome: 'Synthetic outcome: activation follows terms, assignment, and direct-access checks.', control: 'Terms version, team authority, activation blockers', route: 'engagements', routeLabel: 'Open engagement workspace', icon: 'briefcase', tone: 'navy' },
  { number: '08', gate: 'G2', phase: 'Acquire & accept', title: 'Publish the evidence request set', action: 'The team publishes PBC requests with period, owner, due date, and acceptance criteria.', outcome: 'Synthetic outcome: the client sees scoped requests, not internal risk or review notes.', control: 'Client projection, request scope, due date', route: 'pbc', routeLabel: 'Open PBC portal', icon: 'inbox', tone: 'blue' },
  { number: '09', gate: 'G2', phase: 'Acquire & accept', title: 'Confirm planning context', action: 'The team checks entity, period, service route, owner, and the current gate before collecting source data.', outcome: 'Synthetic outcome: the next track is visible and no downstream work starts from an unknown scope.', control: 'Engagement assignment and gate applicability', route: 'engagements', routeLabel: 'Open engagement workspace', icon: 'briefcase', tone: 'navy' },
  { number: '10', gate: 'G3', phase: 'Execute', title: 'Receive and preserve the raw trial balance', action: 'The client uploads the requested source and the accountant reviews the receipt before parsing.', outcome: 'Synthetic outcome: the raw receipt, identity, period, and source bridge are preserved.', control: 'Receipt ID, bytes, entity, period, currency', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'upload', tone: 'amber' },
  { number: '11', gate: 'G3', phase: 'Execute', title: 'Hold the opening difference', action: 'The accountant compares control totals and raises the unresolved opening-equity difference.', outcome: 'Synthetic outcome: the package remains held; an accepted-looking screen cannot bypass reconciliation.', control: 'Signed balance, control totals, query owner', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'warning', tone: 'danger' },
  { number: '12', gate: 'G3', phase: 'Execute', title: 'Promote the corrected source', action: 'The client supplies a corrected source and the accountant promotes it as a new generation.', outcome: 'Synthetic outcome: the prior receipt remains historical and the new generation is the current candidate.', control: 'Source generation, replacement reason, hash', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'refresh', tone: 'blue' },
  { number: '13', gate: 'G4', phase: 'Execute', title: 'Map the chart of accounts', action: 'The accountant maps every accepted row to the reporting taxonomy and reviews unmapped areas.', outcome: 'Synthetic outcome: mapping coverage and exceptions are visible before statements are prepared.', control: 'Taxonomy version, mapping status, exception owner', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'workflow', tone: 'navy' },
  { number: '14', gate: 'G4', phase: 'Execute', title: 'Stage the accounting adjustment', action: 'The accountant documents AJ-001 and shows whether it is proposed, approved, or already reflected.', outcome: 'Synthetic outcome: adjustment lineage points back to the source generation and avoids a second application.', control: 'Adjustment ID, layer, source bridge', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'calculator', tone: 'amber' },
  { number: '15', gate: 'G4', phase: 'Execute', title: 'Re-upload without double applying AJ-001', action: 'A replacement TB arrives with AJ-001 already reflected in the source.', outcome: 'Synthetic outcome: the package recognizes the reflection and does not apply the entry twice.', control: 'Reflection marker, Decimal totals, idempotency', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'check-circle', tone: 'green' },
  { number: '16', gate: 'G4', phase: 'Execute', title: 'Prepare the statement package', action: 'The accountant produces FS v05 from the validated source and documented adjustments.', outcome: 'Synthetic outcome: profit, assets, liabilities, equity, and source lineage are shown together.', control: 'Exact source version, package revision, totals', route: 'accounting', routeLabel: 'Open Accounting & TB', icon: 'file', tone: 'navy' },
  { number: '17', gate: 'G5', phase: 'Execute', title: 'Submit an exact workpaper snapshot', action: 'The audit team freezes the submitted workpaper and linked evidence for review.', outcome: 'Synthetic outcome: the reviewer sees a fixed snapshot, not a mutable working draft.', control: 'Snapshot ID, evidence versions, submitted timestamp', route: 'audit', routeLabel: 'Open Audit & fieldwork', icon: 'clipboard', tone: 'blue' },
  { number: '18', gate: 'G5', phase: 'Execute', title: 'Return a review point with the history intact', action: 'The reviewer documents an exception, response, owner, and due date.', outcome: 'Synthetic outcome: returning work does not erase the prior submission or reviewer identity.', control: 'Review point, response, stale dependency', route: 'reviews', routeLabel: 'Open Reviews & approvals', icon: 'message', tone: 'amber' },
  { number: '19', gate: 'G5', phase: 'Execute', title: 'Resubmit the corrected snapshot', action: 'The preparer fixes the workpaper and submits a new exact snapshot for review.', outcome: 'Synthetic outcome: the new snapshot links to the prior one and carries a fresh revision.', control: 'Snapshot lineage, reviewer assignment, revision', route: 'audit', routeLabel: 'Open Audit & fieldwork', icon: 'refresh', tone: 'blue' },
  { number: '20', gate: 'G5', phase: 'Execute', title: 'Set materiality and the audit plan', action: 'The audit manager records materiality, performance materiality, risks, assertions, and responses.', outcome: 'Synthetic outcome: thresholds and procedures are documented as professional selections.', control: 'Rationale, population source, risk owner', route: 'audit', routeLabel: 'Open Audit & fieldwork', icon: 'chart', tone: 'navy' },
  { number: '21', gate: 'G5', phase: 'Execute', title: 'Freeze the population and sample', action: 'The team selects a population revision and sample plan from the accepted source.', outcome: 'Synthetic outcome: the sample remains tied to the exact population and source generation.', control: 'Population revision, sampling rationale, evidence', route: 'audit', routeLabel: 'Open Audit & fieldwork', icon: 'list-check', tone: 'blue' },
  { number: '22', gate: 'G6', phase: 'Execute', title: 'Evaluate misstatement and alternative work', action: 'The team records the AR-019 exception, contradictory evidence, and the next procedure.', outcome: 'Synthetic outcome: the exception is routed for human evaluation rather than auto-concluded.', control: 'Exception status, alternative procedure, owner', route: 'audit', routeLabel: 'Open Audit & fieldwork', icon: 'warning', tone: 'danger' },
  { number: '23', gate: 'G6', phase: 'Conclude', title: 'Capture management response', action: 'Management accepts or declines the proposed correction and provides the response used in review.', outcome: 'Synthetic outcome: management responsibility is recorded separately from the auditor conclusion.', control: 'Response, approval authority, object version', route: 'reviews', routeLabel: 'Open Reviews & approvals', icon: 'users', tone: 'amber' },
  { number: '24', gate: 'G6', phase: 'Conclude', title: 'Invalidate stale approvals after a source change', action: 'A linked FS or TB generation changes after a prior review or approval.', outcome: 'Synthetic outcome: stale dependencies block release until the exact new snapshot is re-evaluated.', control: 'Generation guard, stale approval reason', route: 'reviews', routeLabel: 'Open Reviews & approvals', icon: 'lock', tone: 'danger' },
  { number: '25', gate: 'G7', phase: 'Conclude', title: 'Complete final feedback and the management letter', action: 'The partner closes final review points and records any management-letter communication.', outcome: 'Synthetic outcome: unresolved significant items keep completion and release visibly held.', control: 'Completion checklist, findings, response history', route: 'reviews', routeLabel: 'Open Reviews & approvals', icon: 'check-circle', tone: 'amber' },
  { number: '26', gate: 'G7', phase: 'Conclude', title: 'Capture exact statements and representations', action: 'The team binds the representation, final statement package, and completion evidence to exact versions.', outcome: 'Synthetic outcome: the completion bundle is reconstructable and not “latest file” based.', control: 'Exact versions, representation date, manifest', route: 'release', routeLabel: 'Open Release & archive', icon: 'file', tone: 'navy' },
  { number: '27', gate: 'G7', phase: 'Conclude', title: 'Record partner conclusion and EQR', action: 'The engagement partner concludes and the independent quality reviewer completes the required review.', outcome: 'Synthetic outcome: EQR remains a separate authority gate before report dating.', control: 'Named authority, independence, approval snapshot', route: 'reviews', routeLabel: 'Open Reviews & approvals', icon: 'shield', tone: 'purple' },
  { number: '28', gate: 'G8', phase: 'Conclude', title: 'Authorize the signed issue', action: 'The authorized partner dates and issues the signed report after the release checks pass.', outcome: 'Synthetic outcome: the signed artifact, recipients, and manifest become an immutable release event.', control: 'Report date, signature hash, recipient set', route: 'release', routeLabel: 'Open Release & archive', icon: 'lock', tone: 'green' },
  { number: '29', gate: 'G9', phase: 'Conclude', title: 'Protect, deliver, archive, and recover', action: 'The records owner verifies protection, delivery evidence, structured archive, and an independent recovery checkpoint.', outcome: 'Synthetic outcome: release is complete only when artifacts can be reconstructed; recovery stays quarantined until reconciled.', control: 'Protection observation, delivery log, checkpoint', route: 'release', routeLabel: 'Open Release & archive', icon: 'archive', tone: 'purple' },
  { number: '30', gate: 'G10', phase: 'Renewal', title: 'Open the next-period shell and fresh 30Q', action: 'The team starts a new continuance shell and tests both renewal and non-renewal outcomes.', outcome: 'Synthetic outcome: prior conclusions remain historical; the next period begins with UNKNOWN responses.', control: 'Fresh template, new period, explicit renewal decision', route: 'engagements', routeLabel: 'Open engagement workspace', icon: 'refresh', tone: 'blue' },
]

export const cycleFailureCheckpoints = [
  { id: 'FB-01', title: 'Verify both access systems before direct Office work', detail: 'Confirm the application scope and the human Microsoft session before opening a document. Preserve the original receipt before parsing.', guard: 'Access proof + receipt hash' },
  { id: 'FB-02', title: 'Promote a source as a synchronous generation change', detail: 'Verify the new source is reflected before selecting an adjustment plan. A pending parse cannot become the release base by implication.', guard: 'Source generation + reflection state' },
  { id: 'FB-03', title: 'Freeze the snapshot before review', detail: 'Reviewers evaluate an exact saved submission. Candidate evaluation runs only over unchanged input generations.', guard: 'Snapshot ID + generation guard' },
  { id: 'FB-04', title: 'Complete EQR before report dating', detail: 'Protect and verify signed artifacts before release, then persist the external release checkpoint before the first delivery.', guard: 'EQR + signed hash + checkpoint' },
  { id: 'FB-05', title: 'Restore-test archive and both renewal outcomes', detail: 'Restore structured archive and artifacts before production adoption, then test accepted renewal and non-renewal/withdrawal as separate paths.', guard: 'Recovery proof + G10 decision' },
]

export const feasibilityCards = [
  { label: 'Technical feasibility', value: 'Conditional positive', detail: 'Proceed with a bounded Phase 0 and synthetic vertical slice.', icon: 'workflow', tone: 'green' },
  { label: 'Operational / professional', value: 'Owner validation required', detail: 'Methodology, records, access and reviewer evidence are still decision gates.', icon: 'users', tone: 'amber' },
  { label: 'Financial feasibility', value: 'Not established', detail: 'Replace illustrative costs and benefits with measured firm inputs before funding.', icon: 'chart', tone: 'blue' },
]

export const timeline = [
  { date: '04 Aug', title: 'Continuance assessment opened', detail: '30 annual revalidation questions seeded from the approved template.', tone: 'good' },
  { date: '12 Aug', title: 'G1 and G2 approved', detail: 'Acceptance, independence, terms and team authority recorded.', tone: 'good' },
  { date: '29 Aug', title: 'TB v02 held', detail: 'Opening-equity bridge did not reconcile; client query issued.', tone: 'warn' },
  { date: '03 Sep', title: 'TB v03 validated', detail: '14 accounts, QAR 1.82m control totals and zero signed balance.', tone: 'good' },
  { date: '09 Sep', title: 'AR-019 exception raised', detail: 'Contradictory evidence retained; alternative procedures assigned.', tone: 'danger' },
  { date: '13 Sep', title: 'FS v05 generated', detail: 'AJ-001 reflected in source; prior approvals remain historical.', tone: 'warn' },
]
