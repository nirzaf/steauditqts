// M7 STATE-01 / APPROVAL-01 — canonical, permission-filtered workspace DTO.
// This module only shapes normalized repository data; it does not authorize a
// request by itself. The Worker must resolve the parent session/view first.

import { ACTION_REGISTRY } from './actions.js'

const STAFF_ONLY = new Set(['review', 'internal', 'outbox', 'workpaper'])
// auditflow_events intentionally stays append-only and does not carry a
// visibility column. The workspace projection therefore uses a conservative
// public action allow-list for client personas instead of exposing internal
// review, EQR, opinion or release deliberations merely because they share an
// engagement id.
const PUBLIC_EVENT_ACTIONS = new Set([
  'CLIENT_DETAILS_SUBMITTED',
  'FEE_APPROVED',
  'ENGAGEMENT_LETTER_ACCEPTED',
  'ENGAGEMENT_LETTER_REJECTED',
  'PORTAL_ACTIVATED',
  'ANNOUNCEMENT_ISSUED',
  'PBC_RECEIPT_SUBMITTED',
  'PBC_RECEIPT_ACCEPTED',
  'PBC_CLARIFICATION_REQUESTED',
  'DRAFT_FS_PUBLISHED',
  'DRAFT_FS_ACCEPTED',
  'DRAFT_FS_REJECTED',
  'DRAFT_FS_REVISION_REQUESTED',
  'FINAL_REPORT_DELIVERED',
  'INVOICE_ISSUED',
  'ENGAGEMENT_CLOSED',
])

export function filterWorkspaceTasks(tasks = [], { actorId = '', roles = [], includeAll = false } = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  if (includeAll || roles.includes('system_admin') || roles.includes('engagement_partner') || roles.includes('audit_manager')) return list
  return list.filter((task) => task.assigneePersona === actorId || roles.includes(task.assigneeRole))
}

export function isWorkspaceEventPublic(event = {}) {
  return event?.public === true
    || PUBLIC_EVENT_ACTIONS.has(String(event?.action || '').toUpperCase())
    || (!event?.action && !STAFF_ONLY.has(String(event?.visibility || '').toLowerCase()))
}

export function filterWorkspaceEvents(events = [], { includeInternal = false } = {}) {
  return (Array.isArray(events) ? events : []).filter((event) => includeInternal || isWorkspaceEventPublic(event))
}

// M7 §5 — published document artifacts in the workspace projection. Every
// screen reads the same server truth (which Draft-FS versions exist, what the
// final release published) instead of guessing it from local scenario state.
// Client personas see only published, client-visible rows — the same rule the
// artifact list endpoint applies for client personas.
export function serializeWorkspaceArtifacts(artifacts = [], { clientOnly = false } = {}) {
  const list = Array.isArray(artifacts) ? artifacts : []
  const visible = clientOnly
    ? list.filter((row) => String(row.state || '').toUpperCase() === 'PUBLISHED' && String(row.visibility || '').toUpperCase() === 'CLIENT_VISIBLE')
    : list
  return visible.map((row) => ({
    documentId: row.document_id || null,
    documentType: row.document_type || null,
    title: row.title || null,
    version: row.version || null,
    state: String(row.state || '').toUpperCase(),
    visibility: String(row.visibility || '').toUpperCase(),
    createdAt: row.created_at || null,
  }))
}

export function allowedActionsForRoles(roles = [], service = 'AUDIT') {
  const normalizedService = String(service || 'AUDIT').toUpperCase()
  const keys = Object.entries(ACTION_REGISTRY)
    .filter(([, definition]) => definition.roles.some((role) => roles.includes(role)))
    .map(([key]) => key)
  // The linked audit route is a separate assignment. An accounting view can
  // expose accounting commands, but it must not imply that the actor may
  // issue an audit opinion/release for the linked audit engagement.
  if (normalizedService === 'ACCOUNTING') {
    return keys.filter((key) => !['COMPLETE_EQR', 'RELEASE_FINAL_REPORT', 'DELIVER_FINAL_REPORT', 'VERIFY_RELEASE_CHECKPOINT', 'ASSEMBLE_ARCHIVE', 'RECORD_AUDIT_OPINION', 'RECORD_FINAL_DISCUSSION', 'RECORD_MANAGER_COMPLETION', 'RECORD_PARTNER_REVIEW'].includes(key))
  }
  return keys
}

export function buildWorkspaceProjection({
  view,
  context,
  progress = null,
  tasks = [],
  approvals = [],
  notifications = [],
  recentEvents = [],
  outbox = [],
  artifacts = [],
  accounting = null,
  accountingSteps = [],
  blockers = [],
  counts = {},
  mode = 'SHARED',
} = {}) {
  const safeView = view || {}
  const safeContext = context || {}
  const roles = Array.isArray(safeView.roles) ? safeView.roles : []
  const visibleTasks = filterWorkspaceTasks(tasks, { actorId: safeView.actorId, roles, includeAll: roles.includes('system_admin') })
  const clientOnly = roles.length > 0 && roles.every((role) => ['client_contributor', 'client_finance', 'management_approver'].includes(role))
  const visibleOutbox = clientOnly
    ? (Array.isArray(outbox) ? outbox.filter((row) => ['PORTAL', 'PORTAL_NOTIFICATION', 'CLIENT', 'EMAIL', 'WHATSAPP'].includes(String(row.channel || row.visibility || '').toUpperCase()) || row.client_visible === 1) : [])
    : (Array.isArray(outbox) ? outbox : [])
  return {
    viewId: safeView.viewId || null,
    contextVersion: Number(safeView.contextVersion || 1),
    actorId: safeView.actorId || null,
    personaId: safeView.personaId || null,
    engagementId: safeContext.engagementId || safeView.engagementId || null,
    generationId: safeContext.generationId || safeView.generationId || null,
    revision: Number(safeContext.revision || 0),
    mode,
    scope: {
      clientId: safeContext.clientId || null,
      clientName: safeContext.clientName || null,
      service: safeContext.service || null,
      period: safeContext.period || null,
    },
    progress,
    tasks: visibleTasks,
    approvalSummary: {
      items: Array.isArray(approvals) ? approvals : [],
      total: Array.isArray(approvals) ? approvals.length : 0,
      mine: Array.isArray(approvals) ? approvals.filter((item) => item.owner === safeView.actorId || roles.includes(item.owner)).length : 0,
      returned: Array.isArray(approvals) ? approvals.filter((item) => ['RETURNED', 'REJECTED', 'CLARIFICATION', 'REVISION'].includes(String(item.state || '').toUpperCase())).length : 0,
      stale: Array.isArray(approvals) ? approvals.filter((item) => item.stale).length : 0,
    },
    approvals: Array.isArray(approvals) ? approvals : [],
    notifications,
    recentEvents: filterWorkspaceEvents(recentEvents, { includeInternal: roles.some((role) => ['system_admin', 'engagement_partner', 'audit_manager'].includes(role)) }),
    outbox: visibleOutbox,
    artifacts: serializeWorkspaceArtifacts(artifacts, { clientOnly }),
    accounting,
    accountingSteps: Array.isArray(accountingSteps) ? accountingSteps : [],
    allowedActions: allowedActionsForRoles(roles, safeContext.service),
    blockers: Array.isArray(blockers) ? blockers : [],
    counts: { tasks: visibleTasks.length, approvals: Array.isArray(approvals) ? approvals.length : 0, ...counts },
  }
}
