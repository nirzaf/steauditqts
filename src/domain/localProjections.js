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
