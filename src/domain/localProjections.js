// Read-only projections for the browser-local scenario. These selectors keep
// LOCAL_ONLY mode on the same data shape as the shared workspace without
// introducing a second workflow store or mutating scenario state.

const OPEN_STATES = new Set(['OPEN', 'PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'DRAFT', 'CANDIDATE', 'NOT_STARTED', 'RETRY_REQUIRED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'RETURNED'])

function actorFor(state, actorId) {
  return (state?.actors || []).find((actor) => actor.id === actorId) || null
}

function task({ id, engagementId, title, state = 'OPEN', actorId, route, target, linkedObjectType, due, priority = 'NORMAL', createdAt = '2026-09-01T09:00:00.000Z', detail = '' }) {
  return {
    taskId: id,
    engagementId,
    title,
    state: String(state || 'OPEN').toUpperCase(),
    assigneePersona: actorId || '',
    assigneeRole: '',
    route,
    target: target || id,
    linkedObjectType,
    linkedObjectId: target || id,
    dueDate: due || '',
    priority,
    detail,
    createdAt,
  }
}

function addTask(list, state, args) {
  const item = task(args)
  const actor = actorFor(state, args.actorId)
  item.assigneePersona = actor?.personaId || args.actorId || ''
  item.assigneeRole = actor?.roles?.[0] || ''
  list.push(item)
}

export function localTaskProjection(state, engagementId, personaId = '') {
  const id = String(engagementId || '')
  const list = []
  if (!id || !state) return list
  const engagement = (state.engagements || []).find((entry) => entry.id === id)
  if (!engagement) return list

  for (const request of (state.pbcRequests || []).filter((entry) => entry.engagementId === id)) {
    const open = OPEN_STATES.has(String(request.state || '').toUpperCase()) && String(request.state).toUpperCase() !== 'ACCEPTED'
    if (open) addTask(list, state, { id: request.id, engagementId: id, title: request.title || `PBC request ${request.id}`, state: request.state || 'OPEN', actorId: request.ownerActorId || 'ACT-NADIA', route: 'pbc', target: request.id, linkedObjectType: 'PBC_REQUEST', due: request.due, priority: 'HIGH', detail: 'Client evidence is required for this request.' })
  }
  for (const request of (state.informationRequests || []).filter((entry) => entry.engagementId === id)) {
    if (String(request.state || '').toUpperCase() !== 'CLOSED') addTask(list, state, { id: request.id, engagementId: id, title: request.title || `Information request ${request.id}`, state: request.state || 'OPEN', actorId: request.ownerActorId || 'ACT-NADIA-MGMT', route: 'client-communications', target: request.id, linkedObjectType: 'MIR', due: request.due, detail: 'Management response is needed.' })
  }
  for (const workpaper of (state.workpapers || []).filter((entry) => entry.engagementId === id)) {
    if (String(workpaper.reviewState || '').toUpperCase() !== 'CLEARED' || String(workpaper.state || '').toUpperCase() !== 'SUBMITTED') addTask(list, state, { id: workpaper.id, engagementId: id, title: workpaper.title || workpaper.id, state: workpaper.state === 'SUBMITTED' ? 'UNDER_REVIEW' : workpaper.state || 'DRAFT', actorId: workpaper.reviewerActorId || 'ACT-OMAR', route: 'audit', target: workpaper.id, linkedObjectType: 'WORKPAPER', priority: 'HIGH', detail: 'Prepare or review the next workpaper snapshot.' })
  }
  for (const review of (state.reviews || []).filter((entry) => entry.engagementId === id)) {
    if (String(review.status || '').toUpperCase() !== 'CLEARED' && String(review.status || '').toUpperCase() !== 'DISPOSED') addTask(list, state, { id: review.id, engagementId: id, title: review.title || review.id, state: review.status || 'OPEN', actorId: review.assigneeActorId || 'ACT-OMAR', route: 'reviews', target: review.id, linkedObjectType: 'REVIEW_POINT', priority: review.severity === 'SIGNIFICANT' ? 'HIGH' : 'NORMAL', detail: review.detail || 'Review point needs documented disposition.' })
  }
  const commercial = (state.commercialRecords || []).find((entry) => entry.engagementId === id)
  if (commercial && !['VERIFIED', 'CLOSED', 'CLOSED_SIMULATION'].includes(String(commercial.advanceState || '').toUpperCase())) addTask(list, state, { id: commercial.id, engagementId: id, title: 'Verify advance and commercial readiness', state: 'PENDING', actorId: 'ACT-AISHA', route: 'engagements', target: commercial.id, linkedObjectType: 'COMMERCIAL', priority: 'HIGH', detail: 'Finance needs to confirm the advance before activation.' })
  const terms = (state.terms || []).find((entry) => entry.engagementId === id)
  if (terms && !['SIGNED', 'ACCEPTED'].includes(String(terms.state || '').toUpperCase())) addTask(list, state, { id: terms.id, engagementId: id, title: 'Confirm engagement terms', state: terms.state || 'PENDING', actorId: 'ACT-NADIA-MGMT', route: 'engagements', target: terms.id, linkedObjectType: 'TERMS', priority: 'HIGH' })
  for (const candidate of (state.releaseCandidates || []).filter((entry) => entry.engagementId === id && entry.state !== 'ARCHIVED')) {
    if (candidate.deliveryState !== 'DELIVERED_SIMULATION' && candidate.archiveState !== 'VERIFIED') addTask(list, state, { id: candidate.id, engagementId: id, title: `Release candidate ${candidate.id}`, state: candidate.state || 'CANDIDATE', actorId: candidate.requiredEqr && !candidate.eqrComplete ? 'ACT-YUSUF' : candidate.partnerApproved ? 'ACT-AISHA' : 'ACT-PARTNER', route: 'release', target: candidate.id, linkedObjectType: 'RELEASE_CANDIDATE', priority: 'HIGH', detail: 'Complete the next release gate.' })
  }
  for (const [index, action] of (state.taskActions || []).filter((entry) => entry.engagementId === id && !['COMPLETE', 'CANCELLED'].includes(String(entry.state || '').toUpperCase())).entries()) {
    const actionId = action.id || action.taskId || `ROLE-${id}-${index + 1}`
    addTask(list, state, { id: actionId, engagementId: id, title: action.title || action.taskId || 'Role task', state: action.state || 'OPEN', actorId: action.actorId || '', route: action.route || 'role-workspace', target: action.targetId || action.taskId || actionId, linkedObjectType: 'ROLE_TASK', detail: action.detail || '' })
  }

  const personaActor = (state.actors || []).find((actor) => actor.personaId === personaId)
  const personaRoles = new Set(personaActor?.roles || [])
  // Presenter/admin personas are the control-room viewers: they need the
  // complete engagement queue to explain every handoff. Other personas stay
  // role-scoped just like the server projection.
  const broadViewer = personaRoles.has('system_admin') || personaRoles.has('signatory')
  const scoped = personaId && !broadViewer
    ? list.filter((item) => !item.assigneePersona || item.assigneePersona === personaId || personaRoles.has(item.assigneeRole))
    : list
  return scoped.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function localActivityProjection(state, engagementId) {
  const id = String(engagementId || '')
  if (!id || !state) return []
  const events = (state.events || []).filter((entry) => entry.engagementId === id || entry.engagement_id === id).map((entry, index) => ({
    eventId: entry.eventId || entry.id || `${entry.type || entry.action || 'WORKFLOW_UPDATE'}-${entry.engagementId || id}-${entry.revision || index + 1}`,
    action: entry.action || entry.type || 'WORKFLOW_UPDATE',
    actor: entry.actor || entry.actorId || 'Browser workspace',
    objectId: entry.objectId || entry.targetId || '',
    engagementId: id,
    createdAt: entry.createdAt || entry.at || '2026-09-01T09:00:00.000Z',
  }))
  return events.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function localOutboxProjection(state, engagementId) {
  const id = String(engagementId || '')
  return (state?.outbox || []).filter((entry) => entry.engagementId === id).map((entry) => ({
    ...entry,
    message_id: entry.message_id || entry.id,
    engagement_id: entry.engagement_id || entry.engagementId,
    subject: entry.subject || entry.reference || entry.preview || 'Portal notification',
    created_at: entry.created_at || entry.createdAt,
  }))
}

export function localArtifactProjection(state, engagementId) {
  const id = String(engagementId || '')
  return (state?.documents || []).filter((entry) => entry.engagementId === id)
}

// ── P5 — stakeholder-facing derived projections ─────────────────────────────
// Pure, read-only: these never mutate scenario state. They exist so a
// presenter can explain the accounting -> audit handoff and the consolidated
// engagement completion checklist without reading raw records.

function engagementById(state, engagementId) {
  return (state?.engagements || []).find((entry) => entry.id === engagementId) || null
}

function linkedAccountingEngagement(state, engagement) {
  if (!engagement || engagement.service !== 'audit') return null
  return (state?.engagements || []).find(
    (entry) => entry.service === 'accounting'
      && (entry.id === engagement.linkedEngagementId || entry.linkedEngagementId === engagement.id),
  ) || null
}

function accountingPackageLabel(packageRecord) {
  const statementId = packageRecord?.statement?.id || ''
  const version = statementId.match(/-V(\d+)$/i)
  return version ? `FS v${version[1]}` : (packageRecord?.source?.sourceLabel || statementId || 'Accounting package')
}

/**
 * Derive the accounting -> audit handoff card:
 *   Accounting Package: FS v05
 *   Management approval: ACCEPTED
 *   Accounting input: g5 / Audit evaluated input: g4
 *   STATUS: STALE  [Evaluate g5]
 */
export function deriveAccountingHandoff(state, engagementId) {
  const id = String(engagementId || '')
  const engagement = engagementById(state, id)
  if (!engagement) {
    return { status: 'NOT_APPLICABLE', applicable: false, message: 'That engagement is not in the local scenario.', actionLabel: '' }
  }
  const accounting = linkedAccountingEngagement(state, engagement)
  if (!accounting) {
    return {
      status: 'NOT_APPLICABLE',
      applicable: false,
      engagementId: id,
      message: 'No accounting package is linked to this engagement, so no handoff applies.',
      actionLabel: '',
    }
  }
  const packageRecord = (state.accountingPackages || []).find((entry) => entry.engagementId === accounting.id) || null
  const approvalDecision = packageRecord?.managementApproval?.decision || ''
  const managementApproval = approvalDecision === 'APPROVE' ? 'ACCEPTED' : approvalDecision ? String(approvalDecision).toUpperCase() : 'PENDING'
  const accountingInputGeneration = Number(accounting.inputGeneration ?? 1)
  const auditEvaluatedGeneration = Number(engagement.evidence?.accountingEvaluatedGeneration ?? accountingInputGeneration)
  const stale = auditEvaluatedGeneration < accountingInputGeneration
  const statementApproved = String(packageRecord?.statement?.state || '').toUpperCase() === 'APPROVED'
  let status = 'CURRENT'
  if (!packageRecord) status = 'MISSING'
  else if (stale) status = 'STALE'
  else if (managementApproval !== 'ACCEPTED' || !statementApproved) status = 'PENDING_APPROVAL'
  const messages = {
    MISSING: 'The linked accounting engagement has no package on record yet.',
    STALE: `Accounting input g${accountingInputGeneration} is ahead of the audit-evaluated g${auditEvaluatedGeneration}. Evaluate the current package before relying on it.`,
    PENDING_APPROVAL: 'Management approval of the accounting package is not on record yet.',
    CURRENT: `The audit has evaluated the current accounting input g${accountingInputGeneration}.`,
  }
  return {
    status,
    applicable: true,
    engagementId: id,
    accountingEngagementId: accounting.id,
    packageId: packageRecord?.id || '',
    packageLabel: accountingPackageLabel(packageRecord),
    managementApproval,
    accountingInputGeneration,
    auditEvaluatedGeneration,
    stale,
    actionLabel: stale ? `Evaluate g${accountingInputGeneration}` : '',
    message: messages[status],
  }
}

/**
 * Consolidated engagement completion checklist, in professional order.
 * state semantics: COMPLETE (done) | ATTENTION (actionable now) | PENDING
 * (waiting on an upstream item).
 */
export function deriveEngagementCompletionChecklist(state, engagementId) {
  const id = String(engagementId || '')
  const engagement = engagementById(state, id)
  if (!engagement) return { engagementId: id, items: [], completeCount: 0, totalCount: 0, complete: false }

  const evidence = engagement.evidence || {}
  const team = engagement.team || []
  const has = (role) => team.some((member) => member?.role === role)
  const commercial = (state.commercialRecords || []).find((entry) => entry.engagementId === id) || null
  const acceptance = (state.assessments || []).find((entry) => entry.engagementId === id && entry.type === 'acceptance') || null
  const terms = (state.terms || []).find((entry) => entry.engagementId === id) || null
  const workpapers = (state.workpapers || []).filter((entry) => entry.engagementId === id)
  const submitted = workpapers.filter((entry) => String(entry.state || '').toUpperCase() !== 'DRAFT')
  const seniorCleared = submitted.filter((entry) => entry.seniorReviewed === true || String(entry.reviewState || '').toUpperCase() === 'SENIOR_CLEARED')
  const pbcRequests = (state.pbcRequests || []).filter((entry) => entry.engagementId === id)
  const acceptedPbc = pbcRequests.filter((entry) => ['ACCEPTED', 'CLOSED'].includes(String(entry.state || '').toUpperCase()))
  const handoff = deriveAccountingHandoff(state, id)
  const recommendation = evidence.completionRecommendation
  const recommended = typeof recommendation === 'string' ? recommendation === 'RECOMMEND_COMPLETE' : recommendation?.decision === 'RECOMMEND'
  const eqrRequired = evidence.eqrRequired === true

  const items = []
  const add = (key, label, done, detail, upstreamDone = true) => {
    items.push({ key, label, state: done ? 'COMPLETE' : upstreamDone ? 'ATTENTION' : 'PENDING', detail })
  }
  const ok = (key) => {
    const item = items.find((entry) => entry.key === key)
    return item?.state === 'COMPLETE' || item?.state === 'ATTENTION'
  }

  add('client-accepted', 'Client accepted', Boolean(acceptance?.decision && ['ACCEPT', 'CONTINUE'].includes(acceptance.decision.decision)), acceptance?.decision?.decision || 'Partner acceptance decision not recorded')
  add('terms-accepted', 'Terms accepted', terms?.state === 'ACCEPTED' || terms?.clientDecision?.decision === 'ACCEPT', terms?.clientDecision?.decision || terms?.state || 'Engagement letter not accepted', ok('client-accepted'))
  const advanceVerified = !commercial?.advanceRequired || Number(commercial.advanceRequired) === 0 || commercial.advanceState === 'VERIFIED'
  add('advance', 'Advance verified', advanceVerified, advanceVerified ? 'No outstanding advance' : (commercial?.advanceState || 'Advance not verified'), ok('terms-accepted'))
  const staffingGaps = !has('engagement_partner') || !has('audit_senior') || !has('preparer')
  add('staffing', 'Staffing assigned', !staffingGaps, staffingGaps ? 'Required roles are not all assigned' : `${team.length} team member(s) assigned`, ok('terms-accepted'))
  add('commenced', 'Audit commenced', evidence.accepted === true && engagement.auditCommenced === true, engagement.auditCommenced ? 'Audit commencement recorded' : 'Audit not commenced', ok('staffing'))
  add('pbc', 'Information requests satisfied', pbcRequests.length > 0 && acceptedPbc.length === pbcRequests.length, `${acceptedPbc.length}/${pbcRequests.length} request(s) accepted`, ok('commenced'))
  add('accounting', 'Accounting current', handoff.status === 'CURRENT' || handoff.status === 'NOT_APPLICABLE', handoff.message, ok('pbc'))
  add('workpapers', 'Workpapers submitted', submitted.length > 0, `${submitted.length} submitted / ${workpapers.length} total`, ok('accounting'))
  const seniorComplete = submitted.length > 0 && seniorCleared.length === submitted.length
  add('senior-review', 'Senior review', seniorComplete, seniorComplete ? `All ${submitted.length} submitted workpaper(s) cleared` : `${seniorCleared.length}/${submitted.length} cleared by the Audit Senior`, ok('workpapers'))
  add('manager-completion', 'Manager completion', recommended, recommended ? (typeof recommendation === 'string' ? recommendation : recommendation.decision) : 'Manager recommendation not recorded', ok('senior-review'))
  add('partner-review', 'Partner review', evidence.partnerApproved === true, evidence.partnerApproved ? 'Partner approved the file' : 'Partner review outstanding', ok('manager-completion'))
  add('eqr', 'EQR', !eqrRequired || evidence.eqrComplete === true, eqrRequired ? (evidence.eqrComplete ? 'Quality review complete' : 'Quality review outstanding') : 'Not required for this engagement', ok('partner-review'))
  add('opinion', 'Opinion formed', evidence.partnerApproved === true, 'Partner opinion is recorded after EQR', ok('eqr'))
  add('release', 'Released & archived', evidence.archiveVerified === true, evidence.archiveVerified ? 'Archive verified' : 'Release and archive outstanding', ok('opinion'))

  const completeCount = items.filter((item) => item.state === 'COMPLETE').length
  return { engagementId: id, items, completeCount, totalCount: items.length, complete: completeCount === items.length }
}

export function localNotificationProjection({ state, engagementId, personaId = '' } = {}) {
  const tasks = localTaskProjection(state, engagementId, personaId)
  const events = localActivityProjection(state, engagementId)
  const outbox = localOutboxProjection(state, engagementId)
  const notifications = []
  for (const item of tasks) notifications.push({ id: `task-${item.taskId}`, kind: 'task', title: item.title, detail: `${item.assigneeRole || item.assigneePersona || 'Queue'} · ${item.state}`, route: item.route, engagementId, recordId: item.target || item.taskId, createdAt: item.createdAt })
  for (const item of events) notifications.push({ id: `event-${item.eventId}`, kind: 'event', title: String(item.action).replaceAll('_', ' '), detail: `${item.actor} · ${engagementId}`, route: 'pipeline', engagementId, recordId: item.objectId || item.eventId, createdAt: item.createdAt })
  for (const item of outbox) notifications.push({ id: `msg-${item.message_id}`, kind: 'message', title: item.subject, detail: `${item.channel || 'PORTAL'} · ${item.state || ''}`.trim(), route: 'client-communications', engagementId, recordId: item.related_id || item.message_id, createdAt: item.created_at })
  return notifications.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 20)
}
