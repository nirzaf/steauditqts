import { deriveProgressFromSnapshot } from './progress.js';
import { buildPortfolioRows, deriveProcessHealth, rankTasks, resolveScenarioPreset, SCENARIO_PRESETS } from './portfolio.js';
import { clientEvaluationQuestionIds, clientEvaluationQuestions, QUESTION_BANK_VERSION } from '../src/domain/questionBanks.js';
import { evaluateAssessment } from '../src/domain/assessments.js';
import { SHARED_ACTION_SET, validateActionPayload, validateCommandEnvelope } from '../shared/actionContracts.js';
import { questionPolicyFor, validateQuestionResponse } from '../shared/questionPolicy.js';
import { buildWorkspaceProjection, isWorkspaceEventPublic } from './application/workspace.js';
import { actionAllowed, actionDefinition } from './application/actions.js';
import { CommandInputError, readCommandEnvelope } from './http/commandEnvelope.js';
import { executeDecisionBatch } from './repositories/decisionBatch.js';

const DEFAULT_ENGAGEMENT_ID = 'ENG-0018-AUD-2026'
const MAX_REQUEST_BYTES = 16_000
const MAX_COMMENT_LENGTH = 1_200
const MAX_CONTEXT_LENGTH = 1_200
const MAX_PAGE_SIZE = 50
const MAX_UPLOAD_BYTES = 10_000_000
const UPLOAD_TTL_SECONDS = 24 * 60 * 60
const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_INVITATION_SESSIONS = 5
const MAX_MESSAGE_LENGTH = 2_000
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const SAFE_ENGAGEMENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
const SAFE_RUN_ID = /^run-[a-z0-9]{8,32}$/
const SAFE_INVITATION_ID = /^inv-[a-zA-Z0-9_-]{8,120}$/
const SAFE_RECEIPT_ID = /^rec-[a-zA-Z0-9_-]{8,120}$/
const SAFE_MESSAGE_ID = /^msg-[a-zA-Z0-9_-]{8,120}$/
const ALLOWED_ORIGINS = new Set([
  'https://ste.quadrate.lk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function originFor(request) {
  const origin = request.headers.get('Origin')
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null
}

function requestCorrelationId(request) {
  const supplied = request.headers.get('X-AuditFlow-Request-Id')
  if (supplied && /^[a-zA-Z0-9._:-]{8,120}$/.test(supplied)) return supplied
  return `af-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

function baseHeaders(request, correlationId = requestCorrelationId(request)) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Correlation-Id': correlationId,
  }
  const origin = originFor(request)
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-AuditFlow-Request-Id, X-Correlation-Id, X-AuditFlow-View, X-AuditFlow-Context-Version, X-AuditFlow-Command'
    headers.Vary = 'Origin'
  }
  return headers
}

function json(request, payload, status = 200, correlationId = requestCorrelationId(request)) {
  return Response.json(payload, { status, headers: baseHeaders(request, correlationId) })
}

function error(request, message, status = 400, code = 'BAD_REQUEST') {
  const correlationId = requestCorrelationId(request)
  return json(request, { ok: false, error: { code, message, correlationId }, evidenceLevel: 'SIMULATION' }, status, correlationId)
}

function readEngagementId(value) {
  const engagementId = String(value || '').trim()
  return SAFE_ENGAGEMENT_ID.test(engagementId) ? engagementId : null
}

// Shared routes are opt-in and must point at an isolated non-production
// binding. Access-protected deployments additionally require both Access
// identity headers. A public synthetic deployment is permitted only when the
// operator explicitly enables it; a caller-supplied role, password or
// obscured URL is never treated as identity.
function trustedSharedDemoRequest(request, env) {
  if (env.SHARED_DEMO_ENABLED !== 'true') return false
  if (env.SHARED_DEMO_BINDING !== 'isolated-non-production') return false
  const accessIdentity = Boolean(request.headers.get('Cf-Access-Jwt-Assertion') && request.headers.get('Cf-Access-Authenticated-User-Email'))
  if (accessIdentity) return true
  return env.SHARED_DEMO_IDENTITY_MODE === 'public-synthetic' && env.PUBLIC_SYNTHETIC_DEMO_ENABLED === 'true'
}

function readKey(value, fallback = '') {
  const key = String(value || fallback).trim()
  return SAFE_KEY.test(key) ? key : null
}

function parseScope(url, requirePage = false) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'))
  const pageKey = readKey(url.searchParams.get('pageKey'), requirePage ? '' : 'all')
  if (!engagementId || !pageKey || (requirePage && pageKey === 'all')) return null
  return { engagementId, pageKey }
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > MAX_REQUEST_BYTES) throw new Error('Request body is too large.')
  const text = await request.text()
  // Content-Length and JS string length count different things for non-ASCII
  // input. The Worker boundary is capped in UTF-8 bytes so a multi-byte
  // payload cannot bypass the limit.
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new Error('Request body is too large.')
  try {
    const payload = JSON.parse(text || '{}')
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  } catch {
    return null
  }
}

function cleanText(value, maxLength, fallback = '') {
  const text = String(value ?? fallback).trim()
  return text && text.length <= maxLength ? text : null
}

function hexFromBytes(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return hexFromBytes(await crypto.subtle.digest('SHA-256', bytes))
}

function randomToken(prefix = '') {
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
  return `${prefix}${token}`
}

function runScopedEngagementId(runId, logicalEngagementId) {
  const runToken = String(runId || '').replace(/^run-/, '').slice(0, 10)
  const logical = String(logicalEngagementId || '')
  const match = logical.match(/^ENG-(\d{4})-(AUD|ACC)-\d{4}$/)
  if (!SAFE_RUN_ID.test(runId) || !match) return null
  return `run-${runToken}-${match[1]}-${match[2]}-26`
}

function isClientPersona(persona) {
  return Boolean(persona?.roles?.some((role) => ['client_contributor', 'client_finance', 'management_approver'].includes(role)))
}

function isClientModeSession(session) {
  return Number(session?.clientMode || 0) === 1
}

function canWriteClientSession(session) {
  return !isClientModeSession(session) || Boolean(session.invitationId)
}

function invitationExpiresAt() {
  return new Date(Date.now() + INVITATION_TTL_SECONDS * 1000).toISOString()
}

function uploadExpiresAt() {
  return new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString()
}

function sqlDateTime(iso) {
  return String(iso || new Date().toISOString()).replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

function readBoolean(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function isStrictCommandPayload(payload) {
  return payload?.__strictCommand === true;
}

function serializeComment(row) {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    pageKey: row.page_key,
    stepKey: row.step_key,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function serializeProfile(row) {
  return {
    engagementId: row.engagement_id,
    legalName: row.legal_name,
    registration: row.registration,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    phone: row.phone,
    servicePeriod: row.service_period,
    serviceRequested: row.service_requested,
    context: row.context,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  }
}

const profileColumns = 'engagement_id, legal_name, registration, contact_name, contact_email, phone, service_period, service_requested, context, submitted_by, submitted_at, updated_at'

async function getClientProfile(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'))
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  const profile = await env.DB.prepare(`SELECT ${profileColumns} FROM auditflow_client_profiles WHERE engagement_id = ?1`).bind(engagementId).first()
  return json(request, { ok: true, profile: profile ? serializeProfile(profile) : null })
}

async function saveClientProfile(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const engagementId = readEngagementId(payload.engagementId)
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  if (!canWriteClientSession(checked.session)) return error(request, 'Open an invitation link before submitting client details.', 403, 'INVITATION_REQUIRED')
  const legalName = cleanText(payload.legalName, 160)
  const registration = cleanText(payload.registration, 80)
  const contactName = cleanText(payload.contactName, 80)
  const contactEmail = cleanText(payload.contactEmail, 160)
  const phone = cleanText(payload.phone, 40)
  const servicePeriod = cleanText(payload.servicePeriod, 120)
  const serviceRequested = cleanText(payload.serviceRequested, 160)
  const context = cleanText(payload.context, MAX_CONTEXT_LENGTH, '') ?? ''
  const submittedBy = cleanText(payload.submittedBy, 80, 'Client contact')
  if (!legalName || !registration || !contactName || !contactEmail || !phone || !servicePeriod || !serviceRequested || !submittedBy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return error(request, 'Complete each required client detail with a valid email address.')
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_client_profiles
      (engagement_id, legal_name, registration, contact_name, contact_email, phone, service_period, service_requested, context, submitted_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (engagement_id) DO UPDATE SET
       legal_name = excluded.legal_name,
       registration = excluded.registration,
       contact_name = excluded.contact_name,
       contact_email = excluded.contact_email,
       phone = excluded.phone,
       service_period = excluded.service_period,
       service_requested = excluded.service_requested,
       context = excluded.context,
       submitted_by = excluded.submitted_by,
       updated_at = datetime('now')`,
  ).bind(engagementId, legalName, registration, contactName, contactEmail, phone, servicePeriod, serviceRequested, context, submittedBy).run()
  const saved = await env.DB.prepare(`SELECT ${profileColumns} FROM auditflow_client_profiles WHERE engagement_id = ?1`).bind(engagementId).first()
  return json(request, { ok: true, profile: serializeProfile(saved) })
}

async function listComments(request, env, url) {
  const scope = parseScope(url, true)
  if (!scope) return error(request, 'A valid engagementId and pageKey are required.')
  const checked = await requireEngagementScope(request, env, scope.engagementId)
  if (checked.response) return checked.response
  const requestedLimit = Number(url.searchParams.get('limit') || 20)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE) : 20
  const result = await env.DB.prepare(
    `SELECT id, engagement_id, page_key, step_key, author_name, author_role, body, created_at, updated_at
     FROM auditflow_comments
     WHERE engagement_id = ?1 AND page_key = ?2
     ORDER BY created_at DESC
     LIMIT ?3`,
  ).bind(scope.engagementId, scope.pageKey, limit).all()
  return json(request, { ok: true, comments: (result.results || []).map(serializeComment) })
}

async function createComment(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const engagementId = readEngagementId(payload.engagementId)
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  if (!canWriteClientSession(checked.session)) return error(request, 'Open an invitation link before adding client comments.', 403, 'INVITATION_REQUIRED')
  const pageKey = readKey(payload.pageKey)
  const stepKey = readKey(payload.stepKey, pageKey || '')
  const requestedAuthorName = cleanText(payload.authorName, 80)
  const requestedAuthorRole = cleanText(payload.authorRole, 80, 'Client contact')
  const strictCommand = payload.__strictCommand === true
  // In the strict command path the effective actor comes from the verified
  // session/view.  A caller may provide a display hint in legacy/local mode,
  // but cannot spoof the author of a durable shared comment.
  const authorName = strictCommand ? checked.session.actorId : requestedAuthorName
  const authorRole = strictCommand ? (checked.session.roles?.[0] || 'Client contact') : requestedAuthorRole
  const body = cleanText(payload.body, MAX_COMMENT_LENGTH)
  if (!engagementId || !pageKey || !stepKey || !authorName || !authorRole || !body) {
    return error(request, 'Provide a valid step, author name, and comment (maximum 1,200 characters).')
  }
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO auditflow_comments
      (id, engagement_id, page_key, step_key, author_name, author_role, body)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(id, engagementId, pageKey, stepKey, authorName, authorRole, body).run()
  const created = await env.DB.prepare(
    `SELECT id, engagement_id, page_key, step_key, author_name, author_role, body, created_at, updated_at
     FROM auditflow_comments WHERE id = ?1`,
  ).bind(id).first()
  return json(request, { ok: true, comment: serializeComment(created) }, 201)
}

async function listStepPreferences(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'))
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  const result = await env.DB.prepare(
    `SELECT engagement_id, step_key, is_optional, updated_by, updated_at
     FROM auditflow_step_preferences
     WHERE engagement_id = ?1 ORDER BY step_key`,
  ).bind(engagementId).all()
  return json(request, {
    ok: true,
    preferences: (result.results || []).map((row) => ({
      engagementId: row.engagement_id,
      stepKey: row.step_key,
      isOptional: Boolean(row.is_optional),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })),
  })
}

async function saveStepPreference(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const engagementId = readEngagementId(payload.engagementId)
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  if (!canWriteClientSession(checked.session)) return error(request, 'Open an invitation link before changing client preferences.', 403, 'INVITATION_REQUIRED')
  const stepKey = readKey(payload.stepKey)
  const updatedBy = cleanText(payload.updatedBy, 80, 'Client contact')
  if (!engagementId || !stepKey || !updatedBy || typeof payload.isOptional !== 'boolean') {
    return error(request, 'Provide engagementId, stepKey, isOptional, and updatedBy.')
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_step_preferences (engagement_id, step_key, is_optional, updated_by)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (engagement_id, step_key) DO UPDATE SET
       is_optional = excluded.is_optional,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  ).bind(engagementId, stepKey, payload.isOptional ? 1 : 0, updatedBy).run()
  const saved = await env.DB.prepare(
    `SELECT engagement_id, step_key, is_optional, updated_by, updated_at
     FROM auditflow_step_preferences WHERE engagement_id = ?1 AND step_key = ?2`,
  ).bind(engagementId, stepKey).first()
  return json(request, {
    ok: true,
    preference: {
      engagementId: saved.engagement_id,
      stepKey: saved.step_key,
      isOptional: Boolean(saved.is_optional),
      updatedBy: saved.updated_by,
      updatedAt: saved.updated_at,
    },
  })
}

const DEMO_SESSION_COOKIE = 'auditflow_demo_session';
const DEMO_SESSION_TTL_SECONDS = 24 * 60 * 60;
// Server-side persona authority. The browser sends a personaId wish; the
// Worker decides the actorId + roles. Never trust a role from the client.
const DEMO_PERSONAS = {
  'admin-demo': { actorId: 'ACT-MAYA', roles: ['system_admin', 'engagement_partner', 'signatory'] },
  'partner-demo': { actorId: 'ACT-PARTNER', roles: ['engagement_partner', 'signatory'] },
  'accountant-demo': { actorId: 'ACT-LEILA', roles: ['preparer', 'accounting_reviewer'] },
  'accounting-reviewer-demo': { actorId: 'ACT-ACCOUNTING-REVIEWER', roles: ['accounting_reviewer'] },
  'client-demo': { actorId: 'ACT-NADIA', roles: ['client_contributor', 'client_finance', 'management_approver'] },
  'client-management-demo': { actorId: 'ACT-NADIA-MGMT', roles: ['management_approver'] },
  'audit-manager-demo': { actorId: 'ACT-OMAR', roles: ['audit_manager', 'preparer', 'independent_reviewer'] },
  'audit-senior-demo': { actorId: 'ACT-OMAR-SENIOR', roles: ['audit_senior', 'preparer'] },
  'preparer-demo': { actorId: 'ACT-JUNIOR', roles: ['preparer'] },
  'independent-reviewer-demo': { actorId: 'ACT-FATIMA', roles: ['independent_reviewer'] },
  'finance-demo': { actorId: 'ACT-AISHA', roles: ['finance_team'] },
  'eqr-demo': { actorId: 'ACT-YUSUF', roles: ['eqr_reviewer'] },
  'system-admin-only-demo': { actorId: 'ACT-SAMIR', roles: ['system_admin'] },
  'compliance-demo': { actorId: 'ACT-SARA', roles: ['compliance_reviewer', 'records_custodian'] },
  'records-demo': { actorId: 'ACT-RECORDS', roles: ['records_custodian'] },
};
const DEMO_RESET_ENGAGEMENTS = ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'];

function readSessionId(request) {
  const header = request.headers.get('Cookie') || '';
  const hit = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${DEMO_SESSION_COOKIE}=`));
  const value = hit ? hit.slice(DEMO_SESSION_COOKIE.length + 1) : '';
  return /^[a-zA-Z0-9_-]{16,128}$/.test(value) ? value : null;
}

function sessionCookie(sessionId) {
  return `${DEMO_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEMO_SESSION_TTL_SECONDS}`;
}

async function readSessionScope(env, sessionId) {
  if (!env.DB || !sessionId) return null
  try {
    return await env.DB.prepare(
      `SELECT session_id, run_id, invitation_id, client_mode, created_at
       FROM auditflow_demo_session_scopes WHERE session_id = ?1`,
    ).bind(sessionId).first()
  } catch {
    // The additive client-safe migration may not be present on an older local
    // Worker. Keep the legacy session path available until it is applied.
    return null
  }
}

async function resolveDemoSession(request, env) {
  const sessionId = readSessionId(request);
  if (!sessionId || !env.DB) return null;
  const row = await env.DB.prepare(
    'SELECT session_id, persona_id, actor_id, created_at, expires_at, last_activity FROM auditflow_demo_sessions WHERE session_id = ?1',
  ).bind(sessionId).first();
  if (!row || !row.session_id) return null;
  if (new Date(`${row.expires_at}Z`.replace(/ZZ$/, 'Z')).getTime() < Date.now()) return null;
  const persona = DEMO_PERSONAS[row.persona_id];
  if (!persona) return null;
  // Keep the session useful for the demo's bounded activity window without
  // turning every read/poll into a D1 write. Activity is best-effort and a
  // read must not fail only because this throttle update is unavailable.
  const lastActivity = row.last_activity ? new Date(`${row.last_activity}Z`.replace(/ZZ$/, 'Z')).getTime() : 0;
  if (!Number.isFinite(lastActivity) || Date.now() - lastActivity > 60_000) {
    void env.DB.prepare("UPDATE auditflow_demo_sessions SET last_activity = datetime('now') WHERE session_id = ?1").bind(sessionId).run().catch(() => {});
  }
  const scope = await readSessionScope(env, row.session_id)
  return {
    sessionId: row.session_id,
    personaId: row.persona_id,
    actorId: row.actor_id,
    roles: persona.roles,
    runId: scope?.run_id || '',
    invitationId: scope?.invitation_id || '',
    clientMode: Number(scope?.client_mode || 0),
  };
}

function serializeEngagementState(row) {
  if (!row) return null;
  let gStatus = {};
  try { gStatus = JSON.parse(row.g_status || '{}'); } catch { gStatus = {}; }
  return {
    engagementId: row.engagement_id,
    clientId: row.client_id,
    service: row.service,
    period: row.period,
    revision: row.revision,
    currentStage: row.current_stage,
    gStatus,
    generationId: row.generation_id,
    updatedAt: row.updated_at,
  };
}

function serializeTask(row) {
  return {
    taskId: row.task_id,
    engagementId: row.engagement_id,
    assigneePersona: row.assignee_persona,
    assigneeRole: row.assignee_role,
    title: row.title,
    state: row.state,
    dueDate: row.due_date,
    linkedObjectType: row.linked_object_type,
    linkedObjectId: row.linked_object_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    priority: row.priority || 'NORMAL',
    blockerCode: row.blocker_code || '',
    route: row.route || '',
    target: row.target || '',
    stage: row.stage || '',
    creator: row.creator || '',
    slaDueAt: row.sla_due_at || row.due_date || '',
    escalationState: row.escalation_state || 'NONE',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function serializeEvent(row) {
  return {
    eventId: row.event_id,
    engagementId: row.engagement_id,
    actor: row.actor,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    previousRevision: row.previous_revision,
    newRevision: row.new_revision,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

async function readInvitation(env, token) {
  const raw = String(token || '').trim()
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(raw)) return null
  const tokenHash = await sha256Hex(raw)
  let row
  try {
    row = await env.DB.prepare(
      `SELECT invitation_id, run_id, token_hash, persona_id, status, max_sessions, session_count, created_at, expires_at
       FROM auditflow_demo_invitations WHERE token_hash = ?1`,
    ).bind(tokenHash).first()
  } catch {
    return null
  }
  if (!row) return null
  const expiry = new Date(`${row.expires_at}Z`.replace(/ZZ$/, 'Z')).getTime()
  if (row.status !== 'ACTIVE' || !Number.isFinite(expiry) || expiry <= Date.now()) {
    if (row.status === 'ACTIVE') void env.DB.prepare("UPDATE auditflow_demo_invitations SET status = 'EXPIRED' WHERE invitation_id = ?1").bind(row.invitation_id).run().catch(() => {})
    return null
  }
  return row
}

async function createDemoInvitation(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const checked = await requireDemoSession(request, env)
  if (checked.response) return checked.response
  if (!hasAnyRole(checked.session, ['system_admin', 'engagement_partner'])) return error(request, 'Only the Admin or Partner demo persona can create a client invitation.', 403, 'INVITATION_NOT_AUTHORIZED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const personaId = String(payload.personaId || 'client-demo').trim()
  const persona = DEMO_PERSONAS[personaId]
  if (!persona || !isClientPersona(persona)) return error(request, 'Choose a client demo persona for the invitation.', 400, 'UNKNOWN_CLIENT_PERSONA')
  const invitationId = `inv-${crypto.randomUUID().replaceAll('-', '')}`
  const rawToken = randomToken('')
  const tokenHash = await sha256Hex(rawToken)
  const runId = `run-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
  const generationId = `gen-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
  const expiresAt = invitationExpiresAt()
  await ensureRunSeed(env, runId, generationId, checked.session.sessionId)
  await env.DB.prepare(
    `INSERT INTO auditflow_demo_invitations
      (invitation_id, run_id, token_hash, persona_id, status, max_sessions, session_count, expires_at)
     VALUES (?1, ?2, ?3, ?4, 'ACTIVE', ?5, 0, ?6)`,
  ).bind(invitationId, runId, tokenHash, personaId, MAX_INVITATION_SESSIONS, sqlDateTime(expiresAt)).run()
  const siteOrigin = new URL(request.url).origin.replace(/\/api$/, '')
  const inviteUrl = `${siteOrigin}/?invite=${encodeURIComponent(rawToken)}#/client-home`
  return json(request, { ok: true, invitation: { invitationId, runId, personaId, inviteUrl, expiresAt }, evidenceLevel: 'SIMULATION' }, 201)
}

async function writeSessionScope(env, sessionId, { runId = '', invitationId = '', clientMode = 0 } = {}) {
  if (!env.DB || !sessionId || !SAFE_RUN_ID.test(runId)) return
  try {
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_session_scopes (session_id, run_id, invitation_id, client_mode)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (session_id) DO UPDATE SET run_id = excluded.run_id, invitation_id = excluded.invitation_id, client_mode = excluded.client_mode`,
    ).bind(sessionId, runId, invitationId, clientMode ? 1 : 0).run()
  } catch { /* migration is additive; legacy sessions remain usable */ }
}

async function createDemoSession(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED');
  const payload = await readJson(request);
  if (!payload) return error(request, 'Send a JSON object in the request body.');
  const requestedPersonaId = String(payload.personaId || '').trim();
  const inviteToken = String(payload.inviteToken || '').trim();
  const invitation = inviteToken ? await readInvitation(env, inviteToken) : null
  if (inviteToken && !invitation) return error(request, 'This client invitation is invalid, expired, or already at its session limit.', 410, 'INVITATION_UNAVAILABLE')
  const personaId = invitation?.persona_id || requestedPersonaId;
  const persona = DEMO_PERSONAS[personaId];
  if (!persona) return error(request, 'Choose one of the demo personas.', 400, 'UNKNOWN_PERSONA');
  if (invitation && requestedPersonaId && requestedPersonaId !== invitation.persona_id) return error(request, 'This invitation is bound to the client persona it was issued for.', 403, 'INVITATION_PERSONA_MISMATCH')
  if (invitation && !isClientPersona(persona)) return error(request, 'Only a client persona can join this invitation.', 403, 'INVITATION_PERSONA_MISMATCH')
  // Keep the viewer's parent session stable across tabs. A login/persona
  // change rotates the effective actor in the new view, while existing views
  // remain bound to their own persona and cannot be changed by that tab.
  const existing = await resolveDemoSession(request, env);
  const sessionId = existing?.sessionId || (crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '').slice(0, 8));
  let runId = invitation?.run_id || existing?.runId || ''
  let generationId = ''
  let clientMode = invitation || isClientPersona(persona) ? 1 : 0
  if (clientMode && !runId) {
    runId = `run-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    generationId = `gen-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
  }
  if (invitation) {
    const alreadyJoined = existing?.invitationId === invitation.invitation_id
    if (!alreadyJoined) {
      const joined = await env.DB.prepare(
      `UPDATE auditflow_demo_invitations SET session_count = session_count + 1, last_used_at = datetime('now')
       WHERE invitation_id = ?1 AND status = 'ACTIVE' AND session_count < max_sessions`,
      ).bind(invitation.invitation_id).run()
      if (joined?.meta && !joined.meta.changes) return error(request, 'This client invitation has reached its session limit.', 410, 'INVITATION_UNAVAILABLE')
    }
    try {
      const seeded = await env.DB.prepare('SELECT generation_id FROM auditflow_demo_runs WHERE run_id = ?1').bind(invitation.run_id).first()
      generationId = seeded?.generation_id || ''
    } catch { generationId = '' }
  }
  if (clientMode && runId) await ensureRunSeed(env, runId, generationId || `gen-${runId.slice(4)}`, sessionId)
  if (existing) {
    await env.DB.prepare(
      `UPDATE auditflow_demo_sessions SET persona_id = ?1, actor_id = ?2, expires_at = datetime('now', '+1 day'), last_activity = datetime('now') WHERE session_id = ?3`,
    ).bind(personaId, persona.actorId, sessionId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_sessions (session_id, persona_id, actor_id, expires_at)
       VALUES (?1, ?2, ?3, datetime('now', '+1 day'))`,
    ).bind(sessionId, personaId, persona.actorId).run();
  }
  if (clientMode && runId) await writeSessionScope(env, sessionId, { runId, invitationId: invitation?.invitation_id || '', clientMode: 1 })
  const correlationId = requestCorrelationId(request);
  const headers = baseHeaders(request, correlationId);
  headers['Set-Cookie'] = sessionCookie(sessionId);
  let view = null;
  try {
    const session = { sessionId, personaId, actorId: persona.actorId, roles: persona.roles, runId, invitationId: invitation?.invitation_id || '', clientMode }
    const requestedEngagement = invitation ? runScopedEngagementId(runId, DEFAULT_ENGAGEMENT_ID) : DEFAULT_ENGAGEMENT_ID
    const descriptor = await ensureDemoRunAndView(env, session, { personaId, engagementId: requestedEngagement, reuse: false });
    if (descriptor) view = serializeView(descriptor.row, session, descriptor.contexts);
  } catch { /* M7 view migration can be applied independently of legacy login. */ }
  return Response.json({ ok: true, session: { personaId, actorId: persona.actorId, roles: persona.roles, runId, invitationId: invitation?.invitation_id || '', clientMode, readOnly: clientMode === 1 && !invitation }, view, evidenceLevel: 'SIMULATION' }, { status: 201, headers });
}

async function getDemoMe(request, env) {
  const session = await resolveDemoSession(request, env);
  if (!session) return error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED');
  // Never expose the HttpOnly session identifier; it is only an internal
  // parent for tab-scoped demo views and command receipts.
  const viewId = readViewId(request);
  const view = viewId ? await readDemoView(env, session, viewId) : null;
  const effective = view ? effectiveSessionForView(view, session) : session;
  return json(request, {
    ok: true,
    session: {
      personaId: effective.personaId,
      actorId: effective.actorId,
      roles: effective.roles,
      runId: effective.runId || '',
      invitationId: effective.invitationId || '',
      clientMode: Number(effective.clientMode || 0),
      readOnly: isClientModeSession(effective) && !effective.invitationId,
    },
    view: view ? serializeView(view, effective, await listAuthorizedContexts(env, effective)) : null,
    evidenceLevel: 'SIMULATION',
  });
}

async function getEngagement(request, env, engagementId) {
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  const row = await env.DB.prepare(
    'SELECT engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id, updated_at FROM auditflow_engagement_state WHERE engagement_id = ?1',
  ).bind(id).first();
  if (!row) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  return json(request, { ok: true, engagement: serializeEngagementState(row), evidenceLevel: 'SIMULATION' });
}

async function getEngagementTasks(request, env, engagementId, url) {
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  const effective = checked.session;
  const staffWide = effective.roles?.some((role) => ['system_admin', 'engagement_partner', 'audit_manager'].includes(role));
  const assignee = String(url.searchParams.get('assignee') || '').trim();
  const requestedLimit = Number(url.searchParams.get('limit') || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE) : 50;
  const result = assignee && /^[a-zA-Z0-9_-]{1,80}$/.test(assignee)
    ? await env.DB.prepare(
      'SELECT * FROM auditflow_tasks WHERE engagement_id = ?1 AND (assignee_persona = ?2 OR assignee_role = ?2) ORDER BY created_at DESC LIMIT ?3',
    ).bind(id, assignee, limit).all()
    : await env.DB.prepare(
      'SELECT * FROM auditflow_tasks WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT ?2',
    ).bind(id, limit).all();
  const visible = staffWide
    ? (result.results || [])
    : (result.results || []).filter((task) => task.assignee_persona === effective.actorId || effective.roles?.includes(task.assignee_role));
  return json(request, { ok: true, tasks: rankTasks(visible.map(serializeTask)), evidenceLevel: 'SIMULATION' });
}

async function getEngagementTimeline(request, env, engagementId, url) {
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  const requestedLimit = Number(url.searchParams.get('limit') || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE) : 50;
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_events WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT ?2',
  ).bind(id, limit).all();
  const includeInternal = checked.session.roles?.some((role) => ['system_admin', 'engagement_partner', 'audit_manager'].includes(role));
  const visible = includeInternal ? (result.results || []) : (result.results || []).filter(isWorkspaceEventPublic);
  return json(request, { ok: true, events: visible.map(serializeEvent), evidenceLevel: 'SIMULATION' });
}

async function listArtifacts(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  if (!(await isAssignedToEngagement(env, checked.session, engagementId))) return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_artifacts WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 100',
  ).bind(engagementId).all();
  const rows = result.results || [];
  // Client personas see only published, client-visible outputs; internal
  // review material, drafts and deliberations stay staff-only.
  const visible = isClientOnlySession(checked.session)
    ? rows.filter((row) => row.visibility === 'CLIENT_VISIBLE')
    : rows;
  return json(request, { ok: true, artifacts: visible, evidenceLevel: 'SIMULATION' });
}

async function listOutbox(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  if (!(await isAssignedToEngagement(env, checked.session, engagementId))) return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_outbox WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 100',
  ).bind(engagementId).all();
  const rows = result.results || [];
  const messages = isClientOnlySession(checked.session)
    ? rows.filter((row) => row.recipient === 'client' || row.channel === 'PORTAL_NOTIFICATION' || row.client_visible === 1)
    : rows;
  return json(request, { ok: true, messages, evidenceLevel: 'SIMULATION' });
}

const ACTOR_ASSIGNMENTS = {
  'ACT-MAYA': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-PARTNER': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-LEILA': ['ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-ACCOUNTING-REVIEWER': ['ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-NADIA': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026'],
  'ACT-NADIA-MGMT': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026'],
  'ACT-OMAR': ['ENG-0018-AUD-2026'],
  'ACT-OMAR-SENIOR': ['ENG-0018-AUD-2026'],
  'ACT-JUNIOR': ['ENG-0018-AUD-2026'],
  'ACT-FATIMA': ['ENG-0018-AUD-2026'],
  'ACT-AISHA': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-YUSUF': ['ENG-0018-AUD-2026'],
  'ACT-SAMIR': ['ENG-0018-AUD-2026', 'ENG-0018-ACC-2026', 'ENG-0009-ACC-2026'],
  'ACT-SARA': ['ENG-0018-AUD-2026', 'ENG-0009-ACC-2026'],
  'ACT-RECORDS': ['ENG-0018-AUD-2026', 'ENG-0009-ACC-2026'],
};

const DEMO_RUN_CONTEXT_DEFINITIONS = Object.freeze([
  { logicalEngagementId: 'ENG-0018-AUD-2026', clientId: 'CLI-0018', service: 'AUDIT', period: 'FY2026', linkedLogicalEngagementId: '' },
  { logicalEngagementId: 'ENG-0018-ACC-2026', clientId: 'CLI-0018', service: 'ACCOUNTING', period: 'FY2026', linkedLogicalEngagementId: 'ENG-0018-AUD-2026' },
  { logicalEngagementId: 'ENG-0009-ACC-2026', clientId: 'CLI-0009', service: 'ACCOUNTING', period: 'FY2026', linkedLogicalEngagementId: '' },
]);

function logicalContextFor(engagementId) {
  return DEMO_RUN_CONTEXT_DEFINITIONS.find((item) => item.logicalEngagementId === engagementId) || null;
}

function scopedRunContexts(session) {
  return Boolean(session?.runId && SAFE_RUN_ID.test(session.runId))
}

// Phase A — unified demo navigation directory. Client and service labels are
// presentation-only; authorization always comes from ACTOR_ASSIGNMENTS plus
// the live engagement_state rows. Never return an engagement the session
// actor is not assigned to.
const DEMO_CLIENT_DIRECTORY = {
  'CLI-0018': { name: 'Northstar Trading W.L.L.', shortName: 'Northstar Trading' },
  'CLI-0009': { name: 'Cedar & Coast Logistics', shortName: 'Cedar & Coast' },
};

const DEMO_SERVICE_LABELS = {
  AUDIT: 'Financial Statement Audit',
  ACCOUNTING: 'Accounting',
  ACC: 'Accounting',
};

function serializeDemoContext(row) {
  const client = DEMO_CLIENT_DIRECTORY[row.client_id] || { name: row.client_id, shortName: row.client_id };
  const service = String(row.service || '').toUpperCase();
  return {
    engagementId: row.engagement_id,
    clientId: row.client_id,
    clientName: client.name,
    clientShortName: client.shortName,
    service,
    serviceLabel: DEMO_SERVICE_LABELS[service] || row.service || service,
    period: row.period,
    currentStage: row.current_stage,
    revision: row.revision,
    generationId: row.generation_id,
    updatedAt: row.updated_at,
  };
}

const WORKER_TO_ROUTE_ROLE = Object.freeze({
  system_admin: 'admin',
  engagement_partner: 'partner',
  signatory: 'partner',
  client_contributor: 'client',
  client_finance: 'client',
  management_approver: 'client-management',
  audit_senior: 'audit-senior',
  audit_manager: 'audit-manager',
  preparer: 'preparer',
  independent_reviewer: 'audit-manager',
  accounting_reviewer: 'accounting-reviewer',
  finance_team: 'finance',
  eqr_reviewer: 'eqr',
  compliance_reviewer: 'compliance',
  records_custodian: 'records',
});

function frontendRolesForSession(session) {
  const roles = new Set((session?.roles || []).map((role) => WORKER_TO_ROUTE_ROLE[role]).filter(Boolean));
  return [...roles];
}

function routeKeysForSession(session, service = '') {
  const roles = frontendRolesForSession(session);
  const keys = new Set(['role-workspace', 'pipeline', 'artifacts']);
  const add = (key, allowedRoles) => { if (allowedRoles.some((role) => roles.includes(role))) keys.add(key); };
  add('clients', ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'compliance']);
  add('engagements', ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance']);
  add('pbc', ['admin', 'audit-senior', 'audit-manager', 'accountant', 'accounting-reviewer', 'preparer']);
  add('accounting', ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client-management']);
  add('audit', ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'audit-senior', 'audit-manager', 'partner']);
  add('reviews', ['admin', 'audit-manager', 'partner', 'accounting-reviewer', 'eqr']);
  add('release', ['admin', 'partner', 'eqr', 'records', 'finance', 'compliance']);
  add('integration', ['admin', 'system-admin', 'records']);
  add('architecture', ['admin', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance']);
  add('blueprint', ['admin', 'finance']);
  add('cycle', ['admin']);
  add('shared-demo', ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance']);
  add('portfolio', ['admin', 'audit-manager', 'partner']);
  add('admin-console', ['admin', 'system-admin']);
  if (roles.includes('client') || roles.includes('client-management')) {
    keys.add('client-home'); keys.add('client-details'); keys.add('client-communications'); keys.add('client-architecture');
    keys.delete('shared-demo');
  }
  if (roles.includes('accountant') || roles.includes('accounting-reviewer') || roles.includes('preparer')) {
    keys.add('accountant-home'); keys.add('accountant-client'); keys.add('accountant-architecture');
  }
  // Keep accounting-only users inside their service boundary; the linked audit
  // route is granted only when the assignment itself includes that audit.
  if (String(service).toUpperCase() === 'ACCOUNTING') keys.delete('release');
  return [...keys];
}

function serializeView(row, session, contexts = []) {
  if (!row) return null;
  const context = contexts.find((item) => item.engagementId === row.engagement_id) || null;
  const roleIds = frontendRolesForSession({ roles: DEMO_PERSONAS[row.persona_id]?.roles || session?.roles || [] });
  const allowedRouteKeys = routeKeysForSession({ roles: DEMO_PERSONAS[row.persona_id]?.roles || session?.roles || [] }, context?.service);
  return {
    viewId: row.view_id,
    personaId: row.persona_id,
    actorId: row.actor_id,
    roles: roleIds,
    engagementId: row.engagement_id,
    generationId: row.generation_id,
    revision: Number(context?.revision || 0),
    contextVersion: Number(row.context_version || 1),
    state: row.state,
    contexts,
    allowedRouteKeys,
    switchOptions: contexts.map((item) => ({
      key: `${row.persona_id}|${item.engagementId}`,
      personaId: row.persona_id,
      engagementId: item.engagementId,
      label: `${item.clientShortName || item.clientName} · ${item.serviceLabel} · ${item.period}`,
    })),
    scope: context ? { clientId: context.clientId, clientName: context.clientName, service: context.service, period: context.period } : null,
  };
}

async function ensureRunSeed(env, runId, generationId, hostSessionId = '') {
  if (!env.DB || !SAFE_RUN_ID.test(runId)) return false
  const generation = cleanText(generationId, 80, `gen-${runId.slice(4)}`) || `gen-${runId.slice(4)}`
  await env.DB.prepare(
    `INSERT INTO auditflow_demo_runs (run_id, name, generation_id, state, host_session_id)
     VALUES (?1, 'Client invitation demo', ?2, 'ACTIVE', ?3)
     ON CONFLICT (run_id) DO UPDATE SET generation_id = excluded.generation_id, updated_at = datetime('now')`,
  ).bind(runId, generation, hostSessionId).run()
  for (const definition of DEMO_RUN_CONTEXT_DEFINITIONS) {
    const engagementId = runScopedEngagementId(runId, definition.logicalEngagementId)
    if (!engagementId) continue
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_run_contexts
        (run_id, logical_engagement_id, engagement_id, client_id, service, period, generation_id, linked_logical_engagement_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (engagement_id) DO NOTHING`,
    ).bind(runId, definition.logicalEngagementId, engagementId, definition.clientId, definition.service, definition.period, generation, definition.linkedLogicalEngagementId).run()
    await env.DB.prepare(
      `INSERT INTO auditflow_engagement_state
        (engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id)
       VALUES (?1, ?2, ?3, ?4, 1, 'STAGE-01', '{}', ?5)
       ON CONFLICT (engagement_id) DO NOTHING`,
    ).bind(engagementId, definition.clientId, definition.service, definition.period, generation).run()
    // Seed one clearly fictional PBC request for the client walkthrough. The
    // request is run-prefixed, so uploads and replies can never collide with
    // legacy synthetic records or another invitation run.
    if (definition.service === 'AUDIT') {
      const requestId = `PBC-${runId.slice(4, 14).toUpperCase()}-TB`
      try {
        await env.DB.prepare(
          `INSERT INTO auditflow_pbc_requests
            (request_id, engagement_id, title, description, category, period, due_date, client_owner, reviewer, acceptance_criteria, state)
           VALUES (?1, ?2, 'Trial balance and ledger extract', 'Upload the fictional trial balance and supporting ledger extract for the FY2026 walkthrough.', 'Financial data', ?3, '2026-09-30', 'Client finance contact', 'Audit Senior', 'PDF, CSV, XLS or XLSX file under 10 MB', 'OPEN')
           ON CONFLICT (request_id) DO NOTHING`,
        ).bind(requestId, engagementId, definition.period).run()
      } catch { /* older local installations can apply the additive migration later */ }
    }
  }
  return true
}

async function runContextFor(env, session, engagementId) {
  if (!scopedRunContexts(session)) return null
  return env.DB.prepare(
    `SELECT run_id, logical_engagement_id, engagement_id, client_id, service, period, generation_id, linked_logical_engagement_id
     FROM auditflow_demo_run_contexts WHERE run_id = ?1 AND engagement_id = ?2`,
  ).bind(session.runId, engagementId).first()
}

async function isAssignedToEngagement(env, session, engagementId) {
  if (scopedRunContexts(session)) {
    const context = await runContextFor(env, session, engagementId)
    if (!context) return false
    const allowed = ACTOR_ASSIGNMENTS[session.actorId] || []
    return allowed.includes(context.logical_engagement_id)
  }
  return (ACTOR_ASSIGNMENTS[session.actorId] || []).includes(engagementId)
}

async function listAuthorizedContexts(env, session) {
  if (scopedRunContexts(session)) {
    const result = await env.DB.prepare(
      `SELECT c.run_id, c.logical_engagement_id, c.engagement_id, c.client_id, c.service, c.period,
        c.generation_id, c.linked_logical_engagement_id, e.revision, e.current_stage, e.updated_at
       FROM auditflow_demo_run_contexts c
       JOIN auditflow_engagement_state e ON e.engagement_id = c.engagement_id
       WHERE c.run_id = ?1 ORDER BY c.engagement_id`,
    ).bind(session.runId).all()
    const allowed = ACTOR_ASSIGNMENTS[session.actorId] || []
    const rows = (result.results || []).filter((row) => allowed.includes(row.logical_engagement_id))
    const linked = new Map(rows.map((row) => [row.logical_engagement_id, row.engagement_id]))
    return rows.map((row) => {
      const context = serializeDemoContext(row)
      return {
        ...context,
        allowedRouteKeys: routeKeysForSession(session, context.service),
        linkedEngagementId: row.linked_logical_engagement_id ? linked.get(row.linked_logical_engagement_id) || null : null,
        runId: row.run_id,
        logicalEngagementId: row.logical_engagement_id,
      }
    })
  }
  const allowed = ACTOR_ASSIGNMENTS[session?.actorId] || [];
  if (!allowed.length) return [];
  const placeholders = allowed.map((_, index) => `?${index + 1}`).join(', ');
  const result = await env.DB.prepare(
    `SELECT engagement_id, client_id, service, period, revision, current_stage, generation_id, updated_at FROM auditflow_engagement_state WHERE engagement_id IN (${placeholders}) ORDER BY engagement_id`,
  ).bind(...allowed).all();
  return (result.results || [])
    .filter((row) => row && allowed.includes(row.engagement_id))
    .map((row) => {
      const context = serializeDemoContext(row);
      return {
        ...context,
        allowedRouteKeys: routeKeysForSession(session, context.service),
        linkedEngagementId: context.service === 'ACCOUNTING' ? (context.clientId === 'CLI-0018' ? 'ENG-0018-AUD-2026' : null) : null,
      };
    });
}

async function getDemoContexts(request, env) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const viewId = readViewId(request);
  const view = viewId ? await readDemoView(env, checked.session, viewId) : null;
  const effective = view ? effectiveSessionForView(view, checked.session) : checked.session;
  const contexts = await listAuthorizedContexts(env, effective);
  return json(request, { ok: true, contexts, evidenceLevel: 'SIMULATION' });
}

function readViewId(request) {
  const value = String(request.headers.get('X-AuditFlow-View') || '').trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(value) ? value : null;
}

async function readDemoView(env, session, viewId = '') {
  if (!env.DB || !session || !viewId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT view_id, parent_session_id, run_id, persona_id, actor_id, engagement_id,
        generation_id, context_version, state, created_at, updated_at, expires_at
       FROM auditflow_demo_views WHERE view_id = ?1 AND parent_session_id = ?2 AND state = 'ACTIVE'`,
    ).bind(viewId, session.sessionId).first();
    if (!row) return null;
    const expiresAt = row.expires_at ? new Date(`${row.expires_at}Z`.replace(/ZZ$/, 'Z')).getTime() : 0;
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
    return row;
  } catch {
    // M7 tables are additive. A Worker deployed before the migration keeps
    // the legacy session path instead of leaking an internal error.
    return null;
  }
}

function canRolePlayPersona(session, personaId) {
  if (!DEMO_PERSONAS[personaId]) return false;
  if (session?.personaId === personaId) return true;
  return hasAnyRole(session, ['system_admin', 'engagement_partner']);
}

async function ensureDemoRunAndView(env, session, { personaId = session?.personaId, engagementId = '', reuse = true } = {}) {
  if (!session?.sessionId || !env.DB) return null;
  const chosenPersona = String(personaId || session.personaId || '').trim();
  if (!canRolePlayPersona(session, chosenPersona)) throw new Error('The viewer is not permitted to role-play that persona.');
  const persona = DEMO_PERSONAS[chosenPersona];
  // Resolve the selectable scope as the effective actor, not as the viewer.
  // A presenter may be allowed to role-play a persona with a narrower
  // assignment set; exposing the viewer's broader contexts would leak that
  // scope into the tab UI.
  const effectiveCandidate = { ...session, personaId: chosenPersona, actorId: persona.actorId, roles: persona.roles };
  const contexts = await listAuthorizedContexts(env, effectiveCandidate);
  const personaAssignments = ACTOR_ASSIGNMENTS[persona.actorId] || [];
  const selected = scopedRunContexts(session)
    ? contexts.find((context) => context.engagementId === engagementId) || contexts[0]
    : contexts.find((context) => context.engagementId === engagementId && personaAssignments.includes(context.engagementId))
      || contexts.find((context) => personaAssignments.includes(context.engagementId))
      || contexts[0];
  if (!selected) throw new Error('No authorized engagement is available for this demo view.');
  const runId = scopedRunContexts(session) ? session.runId : `run-${session.sessionId.slice(0, 24)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_runs (run_id, name, generation_id, state, host_session_id)
       VALUES (?1, 'Workshop demo', ?2, 'ACTIVE', ?3)
       ON CONFLICT (run_id) DO UPDATE SET generation_id = excluded.generation_id, updated_at = datetime('now')`,
    ).bind(runId, selected.generationId, session.sessionId).run();
    const existing = await env.DB.prepare(
      `SELECT view_id, parent_session_id, run_id, persona_id, actor_id, engagement_id,
        generation_id, context_version, state, created_at, updated_at, expires_at
       FROM auditflow_demo_views WHERE view_id = (SELECT view_id FROM auditflow_demo_views
        WHERE parent_session_id = ?1 AND state = 'ACTIVE' ORDER BY updated_at DESC LIMIT 1)`,
    ).bind(session.sessionId).first();
    if (reuse && existing && existing.persona_id === chosenPersona && existing.engagement_id === selected.engagementId && existing.generation_id === selected.generationId) {
      return { row: existing, contexts };
    }
    // A view switch owns only the requested tab. New tab bootstraps retain
    // sibling views under the same viewer session, so switching one cannot
    // silently change another tab's effective actor.
    if (existing && reuse) {
      await env.DB.prepare("UPDATE auditflow_demo_views SET state = 'CLOSED', updated_at = datetime('now') WHERE view_id = ?1 AND parent_session_id = ?2").bind(existing.view_id, session.sessionId).run();
    }
    const viewId = `view-${crypto.randomUUID().replaceAll('-', '')}`;
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_views
        (view_id, parent_session_id, run_id, persona_id, actor_id, engagement_id, generation_id, context_version, state, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 'ACTIVE', datetime('now', '+1 day'))`,
    ).bind(viewId, session.sessionId, runId, chosenPersona, persona.actorId, selected.engagementId, selected.generationId).run();
    const row = await env.DB.prepare(
      `SELECT view_id, parent_session_id, run_id, persona_id, actor_id, engagement_id,
        generation_id, context_version, state, created_at, updated_at, expires_at
       FROM auditflow_demo_views WHERE view_id = ?1 AND parent_session_id = ?2`,
    ).bind(viewId, session.sessionId).first();
    return { row: row || { view_id: viewId, parent_session_id: session.sessionId, run_id: runId, persona_id: chosenPersona, actor_id: persona.actorId, engagement_id: selected.engagementId, generation_id: selected.generationId, context_version: 1, state: 'ACTIVE' }, contexts };
  } catch {
    return null;
  }
}

async function createDemoView(request, env) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const payload = await readJson(request);
  if (!payload) return error(request, 'Send a JSON object in the request body.');
  const view = await ensureDemoRunAndView(env, checked.session, { personaId: payload.personaId, engagementId: readEngagementId(payload.engagementId) || '', reuse: false });
  if (!view) return error(request, 'Workspace views are not available until the M7 migration is applied.', 503, 'VIEW_STORAGE_UNAVAILABLE');
  const descriptor = serializeView(view.row, checked.session, view.contexts);
  return json(request, { ok: true, view: descriptor, evidenceLevel: 'SIMULATION' }, 201);
}

async function getDemoView(request, env, viewId) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const row = await readDemoView(env, checked.session, viewId);
  if (!row) return error(request, 'The requested workspace view is not active for this session.', 404, 'VIEW_NOT_FOUND');
  const effective = effectiveSessionForView(row, checked.session);
  const contexts = await listAuthorizedContexts(env, effective);
  return json(request, { ok: true, view: serializeView(row, effective, contexts), evidenceLevel: 'SIMULATION' });
}

async function updateDemoView(request, env, viewId) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const row = await readDemoView(env, checked.session, viewId);
  if (!row) return error(request, 'The requested workspace view is not active for this session.', 404, 'VIEW_NOT_FOUND');
  const payload = await readJson(request);
  if (!payload) return error(request, 'Send a JSON object in the request body.');
  if (payload.expectedContextVersion != null && Number(payload.expectedContextVersion) !== Number(row.context_version)) return error(request, 'The workspace view changed. Re-read it before switching.', 409, 'CONTEXT_VERSION_CONFLICT');
  const personaId = String(payload.personaId || row.persona_id).trim();
  if (!canRolePlayPersona(checked.session, personaId)) return error(request, 'The viewer is not permitted to role-play that persona.', 403, 'PERSONA_SWITCH_DENIED');
  const persona = DEMO_PERSONAS[personaId];
  const effectiveCandidate = { ...checked.session, personaId, actorId: persona.actorId, roles: persona.roles };
  const contexts = await listAuthorizedContexts(env, effectiveCandidate);
  const selected = contexts.find((context) => context.engagementId === (readEngagementId(payload.engagementId) || row.engagement_id));
  if (!selected) return error(request, 'That persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  await env.DB.prepare(
    `UPDATE auditflow_demo_views
       SET persona_id = ?1, actor_id = ?2, engagement_id = ?3, generation_id = ?4,
           context_version = context_version + 1, updated_at = datetime('now')
     WHERE view_id = ?5 AND parent_session_id = ?6 AND state = 'ACTIVE'`,
  ).bind(personaId, persona.actorId, selected.engagementId, selected.generationId, viewId, checked.session.sessionId).run();
  const updated = await readDemoView(env, checked.session, viewId);
  if (!updated) return error(request, 'The workspace view could not be confirmed after switching.', 409, 'VIEW_CONTEXT_INVALID');
  return json(request, { ok: true, view: serializeView(updated, checked.session, contexts), evidenceLevel: 'SIMULATION' });
}

async function closeDemoView(request, env, viewId) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const row = await readDemoView(env, checked.session, viewId);
  if (!row) return error(request, 'The requested workspace view is not active for this session.', 404, 'VIEW_NOT_FOUND');
  await env.DB.prepare("UPDATE auditflow_demo_views SET state = 'CLOSED', updated_at = datetime('now') WHERE view_id = ?1 AND parent_session_id = ?2").bind(viewId, checked.session.sessionId).run();
  return json(request, { ok: true, closed: true, evidenceLevel: 'SIMULATION' });
}

async function listDemoViews(request, env) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  try {
    const result = await env.DB.prepare(
      `SELECT view_id, parent_session_id, run_id, persona_id, actor_id, engagement_id,
        generation_id, context_version, state, created_at, updated_at, expires_at
       FROM auditflow_demo_views WHERE parent_session_id = ?1 AND state = 'ACTIVE' ORDER BY updated_at DESC`,
    ).bind(checked.session.sessionId).all();
    const views = [];
    for (const row of (result.results || [])) {
      const effective = effectiveSessionForView(row, checked.session);
      const contexts = await listAuthorizedContexts(env, effective);
      views.push(serializeView(row, effective, contexts));
    }
    return json(request, { ok: true, views, evidenceLevel: 'SIMULATION' });
  } catch {
    return json(request, { ok: true, views: [], evidenceLevel: 'SIMULATION' });
  }
}

function hasAnyRole(session, roles) {
  return roles.some((role) => session.roles.includes(role));
}

async function findEventByIdempotency(env, engagementId, key) {
  if (!key) return null;
  return env.DB.prepare(
    'SELECT * FROM auditflow_events WHERE engagement_id = ?1 AND idempotency_key = ?2',
  ).bind(engagementId, key).first();
}

// A receipt is the authoritative replay record.  The event lookup is only a
// reconciliation fallback for a very narrow failure window where the command
// committed its business rows but the receipt write was unavailable.  Keep the
// actor predicate in the real-D1 query so a key used by another effective actor
// can never be replayed into this view.  The fallback query keeps old migration
// fixtures (which pre-date the actor predicate) usable.
async function findScopedEventByIdempotency(env, engagementId, key, actorId = '') {
  if (!key || !actorId) return null;
  try {
    const scoped = await env.DB.prepare(
      'SELECT * FROM auditflow_events WHERE engagement_id = ?1 AND idempotency_key = ?2 AND actor = ?3 ORDER BY created_at DESC LIMIT 1',
    ).bind(engagementId, key, actorId).first();
    if (scoped) return scoped;
  } catch { /* old schema/fake DB: use the legacy lookup below */ }
  try {
    const legacy = await findEventByIdempotency(env, engagementId, key);
    // A legacy row without an actor is not safe to reconcile into a strict
    // command: returning it could expose another viewer's result. Only an
    // exact actor match is authoritative.
    return legacy && legacy.actor === actorId ? legacy : null;
  } catch { return null; }
}

async function appendEvent(env, { engagementId, actor, action, objectType = '', objectId = '', previousRevision = 0, newRevision = 1, idempotencyKey = '', correlationId = '' }) {
  const eventId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_events (event_id, engagement_id, actor, action, object_type, object_id, previous_revision, new_revision, idempotency_key, correlation_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  ).bind(eventId, engagementId, actor, action, objectType, objectId, previousRevision, newRevision, idempotencyKey, correlationId).run();
  return eventId;
}

async function readEngagementRow(env, engagementId) {
  return env.DB.prepare(
    'SELECT engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id, updated_at FROM auditflow_engagement_state WHERE engagement_id = ?1',
  ).bind(engagementId).first();
}

async function touchEngagement(env, engagementId, stage) {
  if (stage) {
    await env.DB.prepare(
      `UPDATE auditflow_engagement_state SET revision = revision + 1, current_stage = ?2, updated_at = datetime('now') WHERE engagement_id = ?1`,
    ).bind(engagementId, stage).run();
  } else {
    await env.DB.prepare(
      `UPDATE auditflow_engagement_state SET revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1`,
    ).bind(engagementId).run();
  }
  return readEngagementRow(env, engagementId);
}

// Pure task upsert statement shared by the live write path and the batched
// completion-chain commits (M7 PIPE-F11).
function taskUpsertStatement(task) {
  const routeForObjectType = {
    assessment: 'clients',
    commercial: 'blueprint',
    credential: 'role-workspace',
    pbc_request: 'pbc',
    pbc_receipt: 'pbc',
    tb_source: 'accounting',
    workpaper: 'audit',
    review_point: 'reviews',
    decision: 'reviews',
    artifact: 'artifacts',
  };
  const stageForObjectType = {
    assessment: 'STAGE-01',
    commercial: 'STAGE-02',
    credential: 'STAGE-03',
    pbc_request: 'STAGE-05',
    pbc_receipt: 'STAGE-05',
    tb_source: 'STAGE-05',
    workpaper: 'STAGE-06',
    review_point: 'STAGE-07',
    decision: 'STAGE-07',
    artifact: 'STAGE-06',
  };
  const state = task.state || 'OPEN';
  const priority = String(task.priority || (state === 'BLOCKED' ? 'CRITICAL' : ['decision', 'review_point'].includes(task.linkedObjectType) ? 'HIGH' : 'NORMAL')).toUpperCase();
  const dueDate = task.dueDate || '';
  return {
    sql: `INSERT INTO auditflow_tasks
      (task_id, engagement_id, assignee_persona, assignee_role, title, state, due_date, linked_object_type, linked_object_id,
       priority, blocker_code, route, target, stage, creator, sla_due_at, escalation_state, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, datetime('now'))
     ON CONFLICT (task_id) DO UPDATE SET
       assignee_persona = excluded.assignee_persona,
       assignee_role = excluded.assignee_role,
       title = excluded.title,
       state = excluded.state,
       due_date = excluded.due_date,
       linked_object_type = excluded.linked_object_type,
       linked_object_id = excluded.linked_object_id,
       priority = excluded.priority,
       blocker_code = excluded.blocker_code,
       route = excluded.route,
       target = excluded.target,
       stage = excluded.stage,
       creator = excluded.creator,
       sla_due_at = excluded.sla_due_at,
       escalation_state = excluded.escalation_state,
       updated_at = datetime('now')`,
    params: [
      task.taskId,
      task.engagementId,
      task.assigneePersona || '',
      task.assigneeRole || '',
      task.title,
      state,
      dueDate,
      task.linkedObjectType || '',
      task.linkedObjectId || '',
      ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(priority) ? priority : 'NORMAL',
      task.blockerCode || '',
      task.route || routeForObjectType[task.linkedObjectType] || 'role-workspace',
      task.target || task.assigneeRole || '',
      task.stage || stageForObjectType[task.linkedObjectType] || '',
      task.creator || 'WORKFLOW',
      task.slaDueAt || dueDate,
      task.escalationState || (state === 'BLOCKED' ? 'ESCALATED' : 'NONE'),
    ],
  };
}

async function upsertTask(env, task) {
  const statement = taskUpsertStatement(task);
  await env.DB.prepare(statement.sql).bind(...statement.params).run();
}

async function actionSubmitClientDetails(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['client_contributor', 'client_finance', 'management_approver', 'system_admin'])) {
    return error(request, 'Only the Client demo personas can submit business details.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const legalName = cleanText(payload.legalName, 160);
  const registration = cleanText(payload.registration, 80);
  const contactName = cleanText(payload.contactName, 80);
  const contactEmail = cleanText(payload.contactEmail, 160);
  const phone = cleanText(payload.phone, 40);
  const servicePeriod = cleanText(payload.servicePeriod, 120);
  const serviceRequested = cleanText(payload.serviceRequested, 160);
  const context = cleanText(payload.context, MAX_CONTEXT_LENGTH, '') ?? '';
  if (!legalName || !registration || !contactName || !contactEmail || !phone || !servicePeriod || !serviceRequested || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return error(request, 'Complete each required client detail with a valid email address.');
  }
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (idempotencyKey && SAFE_KEY.test(idempotencyKey)) {
    const prior = await findEventByIdempotency(env, id, idempotencyKey);
    if (prior) return json(request, { ok: true, duplicate: true, engagement: serializeEngagementState(await readEngagementRow(env, id)), evidenceLevel: 'SIMULATION' });
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_client_profiles
      (engagement_id, legal_name, registration, contact_name, contact_email, phone, service_period, service_requested, context, submitted_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (engagement_id) DO UPDATE SET
       legal_name = excluded.legal_name, registration = excluded.registration, contact_name = excluded.contact_name,
       contact_email = excluded.contact_email, phone = excluded.phone, service_period = excluded.service_period,
       service_requested = excluded.service_requested, context = excluded.context, submitted_by = excluded.submitted_by, updated_at = datetime('now')`,
  ).bind(id, legalName, registration, contactName, contactEmail, phone, servicePeriod, serviceRequested, context, session.actorId).run();
  const engagement = await touchEngagement(env, id, 'STAGE-01');
  await upsertTask(env, { taskId: `acceptance-${id}`, engagementId: id, assigneeRole: 'engagement_partner', title: 'Review acceptance assessment', state: 'OPEN', linkedObjectType: 'assessment', linkedObjectId: `ASMT-${id}` });
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'CLIENT_DETAILS_SUBMITTED', objectType: 'client_profile', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey, correlationId });
  return json(request, { ok: true, duplicate: false, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionAcceptClient(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can record the acceptance decision.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!['ACCEPT', 'DECLINE', 'ESCALATE'].includes(decision)) return error(request, 'Decision must be ACCEPT, DECLINE, or ESCALATE.');
  const rationale = cleanText(payload.rationale, MAX_CONTEXT_LENGTH);
  if (!rationale) return error(request, 'Provide a rationale for the acceptance decision (maximum 1,200 characters).');
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  if (payload.expectedRevision != null && Number(payload.expectedRevision) !== engagement.revision) {
    return error(request, 'The engagement changed since you loaded it. Reload and retry.', 409, 'REVISION_CONFLICT');
  }
  if (decision === 'ACCEPT') {
    const gate = await readAssessmentGate(env, id);
    if (!gate.started) {
      return error(request, 'Complete the shared client evaluation before acceptance: no assessment response is on record for this engagement.', 409, 'EVALUATION_NOT_STARTED');
    }
    if (gate.holds.length) {
      const names = gate.holds.slice(0, 5).map((hold) => hold.questionId + ' (' + hold.code + ')').join(', ');
      return error(request, gate.holds.length + ' evaluation hold(s) must be resolved before acceptance, starting with: ' + names + '.', 409, 'EVALUATION_HOLDS');
    }
  }
  const decisionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'ACCEPTANCE', ?3, ?4, ?5, ?6, ?7)`,
  ).bind(decisionId, id, `rev-${engagement.revision}`, decision, session.actorId, rationale, engagement.revision + 1).run();
  const next = await touchEngagement(env, id, decision === 'ACCEPT' ? 'STAGE-02' : engagement.current_stage);
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`acceptance-${id}`).run();
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: `CLIENT_${decision === 'ESCALATE' ? 'ESCALATED' : decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'}`, objectType: 'decision', objectId: decisionId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision, decidedBy: session.actorId, rationale }, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionVerifyAdvance(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['finance_team'])) {
    return error(request, 'Only the Finance demo persona can verify the advance.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const reference = cleanText(payload.reference, 40);
  if (!reference) return error(request, 'Provide the synthetic payment reference (for example PAY-SIM-0018).');
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (idempotencyKey && SAFE_KEY.test(idempotencyKey)) {
    const prior = await findEventByIdempotency(env, id, idempotencyKey);
    if (prior) {
      const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
      return json(request, { ok: true, duplicate: true, commercial: commercial || null, evidenceLevel: 'SIMULATION' });
    }
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_commercial (engagement_id, advance_required, advance_state, advance_reference, revision)
     VALUES (?1, '9000.00', 'VERIFIED', ?2, 1)
     ON CONFLICT (engagement_id) DO UPDATE SET advance_state = 'VERIFIED', advance_reference = excluded.advance_reference, revision = auditflow_commercial.revision + 1, updated_at = datetime('now')`,
  ).bind(id, reference).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ADVANCE_VERIFIED', objectType: 'commercial', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey, correlationId });
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  return json(request, { ok: true, duplicate: false, commercial: commercial || null, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionIssueTempCredential(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['engagement_partner', 'system_admin'])) {
    return error(request, 'Only the Partner or System Administrator demo persona can issue the synthetic credential.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  if (strictCommand) {
    const profile = await env.DB.prepare('SELECT contact_name, contact_email, phone FROM auditflow_client_profiles WHERE engagement_id = ?1').bind(id).first();
    if (!profile) return error(request, 'Submit complete client details before issuing a temporary credential.', 409, 'CLIENT_DETAILS_REQUIRED');
    if (!String(profile.contact_name || '').trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(profile.contact_email || '').trim()) || !String(profile.phone || '').trim()) {
      return error(request, 'A valid client contact name, email and phone are required before credential issuance.', 409, 'CLIENT_CONTACT_REQUIRED');
    }
    const acceptance = await latestDecision(env, id, 'ACCEPTANCE');
    if (!acceptance || acceptance.decision !== 'ACCEPT') return error(request, 'Partner acceptance must be current before credential issuance.', 409, 'ACCEPTANCE_REQUIRED');
    const commercialForTerms = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
    if (!commercialForTerms || commercialForTerms.el_state !== 'ACCEPTED') return error(request, 'The current Engagement Letter must be accepted before credential issuance.', 409, 'TERMS_REQUIRED');
    const terms = await latestDecision(env, id, 'ENGAGEMENT_LETTER');
    if (!terms || terms.decision !== 'ACCEPT' || terms.object_version !== commercialForTerms.el_version) return error(request, 'The credential must bind to the accepted Engagement Letter version.', 409, 'TERMS_VERSION_MISMATCH');
    const advanceRequired = moneyToCents(commercialForTerms.advance_required || '0.00');
    if (advanceRequired == null) return error(request, 'The commercial advance amount is not a valid base-10 value.', 409, 'ADVANCE_INVALID');
    if (advanceRequired > 0 && commercialForTerms.advance_state !== 'VERIFIED') return error(request, 'Verify the required advance before issuing the temporary credential.', 409, 'ADVANCE_REQUIRED');
  }
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  if (!commercial) return error(request, 'Prepare the commercial record before issuing the synthetic credential.', 409, 'PRECONDITION_FAILED');
  const commercialAdvanceCents = moneyToCents(commercial.advance_required || '0.00');
  const commercialAdvanceState = String(commercial.advance_state || '').trim().toUpperCase();
  const advanceReady = strictCommand
    ? (commercialAdvanceCents === 0
      ? ['NOT_REQUIRED', 'VERIFIED', 'ALLOCATED'].includes(commercialAdvanceState)
      : ['VERIFIED', 'ALLOCATED'].includes(commercialAdvanceState))
    : commercialAdvanceState === 'VERIFIED';
  if (!advanceReady) {
    return error(request, 'Verify the required advance before issuing the synthetic credential.', 409, 'PRECONDITION_FAILED');
  }
  const existing = await env.DB.prepare(
    `SELECT * FROM auditflow_credentials WHERE engagement_id = ?1 AND state = 'ISSUED' ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first();
  if (existing) return json(request, { ok: true, duplicate: true, credentialId: existing.credential_id, evidenceLevel: 'SIMULATION' });
  const temporaryPassword = `STE-${crypto.randomUUID().slice(0, 8)}-${crypto.randomUUID().slice(0, 4)}`;
  const credentialId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_credentials (credential_id, engagement_id, actor_id, password_hash, state)
     VALUES (?1, ?2, ?3, ?4, 'ISSUED')`,
  ).bind(credentialId, id, session.actorId, await sha256Hex(`demo:${id}:${temporaryPassword}`)).run();
  await upsertTask(env, { taskId: `activation-${id}`, engagementId: id, assigneeRole: 'client_contributor', title: 'Complete first-login portal activation', state: 'OPEN', linkedObjectType: 'credential', linkedObjectId: credentialId });
  const engagement = await touchEngagement(env, id, 'STAGE-03');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'CREDENTIAL_ISSUED', objectType: 'credential', objectId: credentialId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, credentialId, temporaryPassword, evidenceLevel: 'SIMULATION' }, 201);
}

async function actionActivatePortal(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['client_contributor', 'client_finance', 'management_approver'])) {
    return error(request, 'Only the Client demo persona can complete first-login activation.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const active = await env.DB.prepare(
    `SELECT * FROM auditflow_credentials WHERE engagement_id = ?1 AND state = 'ACTIVATED' ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first();
  if (active) return json(request, { ok: true, duplicate: true, credentialId: active.credential_id, activationState: 'ACTIVE', evidenceLevel: 'SIMULATION' });
  const issued = await env.DB.prepare(
    `SELECT * FROM auditflow_credentials WHERE engagement_id = ?1 AND state = 'ISSUED' ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first();
  if (!issued) return error(request, 'A Partner or System Administrator must issue the temporary credential first.', 409, 'PRECONDITION_FAILED');
  await env.DB.prepare(
    `UPDATE auditflow_credentials SET state = 'ACTIVATED', completed_at = datetime('now') WHERE credential_id = ?1`,
  ).bind(issued.credential_id).run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`activation-${id}`).run();
  const engagement = await touchEngagement(env, id, 'STAGE-03');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'PORTAL_ACTIVATED', objectType: 'credential', objectId: issued.credential_id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, credentialId: issued.credential_id, activationState: 'ACTIVE', engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionIssueAnnouncement(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can issue the announcement.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const subject = cleanText(payload.subject, 200) || 'Audit announcement';
  const plannedDates = cleanText(payload.plannedDates, 400) || '';
  const artifactId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by)
     VALUES (?1, ?2, 'ANNOUNCEMENT', ?3, 'v01', 'PUBLISHED', 'CLIENT_VISIBLE', ?4)`,
  ).bind(artifactId, id, subject, session.actorId).run();
  await env.DB.prepare(
    `INSERT INTO auditflow_outbox (message_id, engagement_id, channel, recipient, subject, related_type, related_id, state)
     VALUES (?1, ?2, 'PORTAL_NOTIFICATION', 'client', ?3, 'artifact', ?4, 'SENT_SIMULATION')`,
  ).bind(crypto.randomUUID(), id, subject, artifactId).run();
  const engagement = await touchEngagement(env, id, 'STAGE-04');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ANNOUNCEMENT_ISSUED', objectType: 'artifact', objectId: artifactId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, artifactId, plannedDates, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

function cleanMoney(value) {
  const text = String(value ?? '').trim();
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text) ? text : null;
}

function cleanHours(value) {
  const text = String(value ?? '').trim();
  return /^(?:0|[1-9]\d{0,5})$/.test(text) ? text : null;
}

async function actionRecordEstimate(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['finance_team'])) {
    return error(request, 'Only the Finance demo persona can record the estimate.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const estimateHours = cleanHours(payload.estimateHours);
  const estimateCost = cleanMoney(payload.estimateCost);
  const advanceRequired = cleanMoney(payload.advanceRequired);
  if (!estimateHours || !estimateCost || !advanceRequired) {
    return error(request, 'Provide estimateHours (whole hours), estimateCost and advanceRequired as base-10 money values.');
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_commercial (engagement_id, estimate_hours, estimate_cost, advance_required, advance_state, revision)
     VALUES (?1, ?2, ?3, ?4, 'PENDING', 1)
     ON CONFLICT (engagement_id) DO UPDATE SET estimate_hours = excluded.estimate_hours, estimate_cost = excluded.estimate_cost,
       advance_required = excluded.advance_required, revision = auditflow_commercial.revision + 1, updated_at = datetime('now')`,
  ).bind(id, estimateHours, estimateCost, advanceRequired).run();
  const engagement = await touchEngagement(env, id, null);
  await upsertTask(env, { taskId: `fee-approval-${id}`, engagementId: id, assigneeRole: 'engagement_partner', title: 'Approve fee and quotation', state: 'OPEN', linkedObjectType: 'commercial', linkedObjectId: id });
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ESTIMATE_RECORDED', objectType: 'commercial', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  return json(request, { ok: true, commercial: commercial || null, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionApproveFee(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can approve the fee.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const approvedFee = cleanMoney(payload.approvedFee);
  if (!approvedFee) return error(request, 'Provide approvedFee as a base-10 money value.');
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  if (!commercial || commercial.estimate_hours === '0') {
    return error(request, 'Record the Finance estimate before approving the fee.', 409, 'PRECONDITION_FAILED');
  }
  const quotationId = `Q-2026-${id.replace(/[^0-9]/g, '').slice(-4) || '0018'}`;
  await env.DB.prepare(
    `UPDATE auditflow_commercial SET approved_fee = ?2, fee_state = 'APPROVED', quotation_id = ?3, quotation_state = 'ISSUED',
       el_version = 'EL-2026-01', el_state = 'PENDING_CLIENT', revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1`,
  ).bind(id, approvedFee, quotationId).run();
  const engagement = await touchEngagement(env, id, null);
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`fee-approval-${id}`).run();
  await upsertTask(env, { taskId: `el-response-${id}`, engagementId: id, assigneeRole: 'management_approver', title: 'Respond to Engagement Letter EL-2026-01', state: 'OPEN', linkedObjectType: 'decision', linkedObjectId: 'EL-2026-01' });
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'FEE_APPROVED', objectType: 'commercial', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  const updated = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  return json(request, { ok: true, commercial: updated || null, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRespondEl(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['management_approver'])) {
    return error(request, 'Only the Client Management Approver demo persona can respond to the Engagement Letter.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!['ACCEPT', 'REJECT'].includes(decision)) return error(request, 'Decision must be ACCEPT or REJECT.');
  const version = String(payload.version || '').trim();
  const rationale = cleanText(payload.rationale, MAX_CONTEXT_LENGTH) || '';
  if (decision === 'REJECT' && !rationale) return error(request, 'Explain the rejection so Finance can revise the letter.');
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  if (!commercial || !commercial.el_version) {
    return error(request, 'No Engagement Letter is awaiting a client response yet.', 409, 'PRECONDITION_FAILED');
  }
  if (version !== commercial.el_version) {
    return error(request, `This response names ${version || 'no version'} but the current letter is ${commercial.el_version}. Reload and respond to the exact version.`, 409, 'VERSION_MISMATCH');
  }
  const decisionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'ENGAGEMENT_LETTER', ?3, ?4, ?5, ?6, ?7)`,
  ).bind(decisionId, id, version, decision, session.actorId, rationale, (commercial.revision || 0) + 1).run();
  await env.DB.prepare(`UPDATE auditflow_commercial SET el_state = ?2, revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1`).bind(id, decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED').run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`el-response-${id}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: decision === 'ACCEPT' ? 'EL_ACCEPTED' : 'EL_REJECTED', objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision, version, decidedBy: session.actorId }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCreatePbcRequest(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can create PBC requests.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const title = cleanText(payload.title, 200);
  if (!title) return error(request, 'Provide a request title (maximum 200 characters).');
  const description = cleanText(payload.description, MAX_CONTEXT_LENGTH, '') ?? '';
  const category = cleanText(payload.category, 80, '') ?? '';
  const period = cleanText(payload.period, 40, '') ?? '';
  const dueDate = cleanText(payload.dueDate, 40, '') ?? '';
  const clientOwner = cleanText(payload.clientOwner, 80, '') ?? '';
  const reviewer = cleanText(payload.reviewer, 80, '') ?? '';
  const acceptanceCriteria = cleanText(payload.acceptanceCriteria, MAX_CONTEXT_LENGTH, '') ?? '';
  const requestId = `PBC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  await env.DB.prepare(
    `INSERT INTO auditflow_pbc_requests (request_id, engagement_id, title, description, category, period, due_date, client_owner, reviewer, acceptance_criteria, state)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'OPEN')`,
  ).bind(requestId, id, title, description, category, period, dueDate, clientOwner, reviewer, acceptanceCriteria).run();
  await upsertTask(env, { taskId: `pbc-client-${requestId}`, engagementId: id, assigneeRole: 'client_contributor', title: `Respond to ${requestId}: ${title}`, state: 'OPEN', dueDate, slaDueAt: dueDate, priority: 'HIGH', route: 'pbc', stage: 'STAGE-05', creator: session.actorId, linkedObjectType: 'pbc_request', linkedObjectId: requestId });
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'PBC_REQUEST_CREATED', objectType: 'pbc_request', objectId: requestId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, requestId, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionSubmitPbcReceipt(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['client_contributor', 'client_finance', 'system_admin'])) {
    return error(request, 'Only the Client demo personas can submit PBC evidence.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const requestId = String(payload.requestId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) return error(request, 'Provide the PBC request ID this receipt answers.');
  const fileName = cleanText(payload.fileName, 240);
  if (!fileName) return error(request, 'Provide a file name or hard-copy label (maximum 240 characters).');
  const hardCopy = readBoolean(payload.hardCopy);
  const fileSize = Number(payload.fileSize || 0);
  if (!hardCopy && (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 50_000_000)) {
    return error(request, 'Provide a synthetic file size between 1 byte and 50 MB, or choose hard copy.');
  }
  const mimeType = cleanText(payload.mimeType, 120, 'application/octet-stream') ?? 'application/octet-stream';
  const syntheticHash = cleanText(payload.syntheticHash, 128, '') ?? '';
  const comment = cleanText(payload.comment, MAX_CONTEXT_LENGTH, '') ?? '';
  const parent = await env.DB.prepare('SELECT * FROM auditflow_pbc_requests WHERE request_id = ?1').bind(requestId).first();
  if (!parent || parent.engagement_id !== id) return error(request, 'That PBC request does not belong to this engagement.', 404, 'PBC_REQUEST_NOT_FOUND');
  const prior = await env.DB.prepare('SELECT COUNT(*) AS n FROM auditflow_pbc_receipts WHERE request_id = ?1').bind(requestId).first();
  const version = Number(prior?.n || 0) + 1;
  const receiptId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_pbc_receipts (receipt_id, request_id, engagement_id, file_name, file_size, mime_type, synthetic_hash, version, hard_copy, comment, state, uploaded_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'RECEIVED', ?11)`,
  ).bind(receiptId, requestId, id, fileName, hardCopy ? 0 : fileSize, mimeType, syntheticHash, version, hardCopy ? 1 : 0, comment, session.actorId).run();
  await env.DB.prepare(`UPDATE auditflow_pbc_requests SET state = 'RECEIVED', updated_at = datetime('now') WHERE request_id = ?1`).bind(requestId).run();
  await upsertTask(env, { taskId: `pbc-review-${requestId}`, engagementId: id, assigneeRole: 'audit_senior', title: `Review ${requestId} receipt v${version}`, state: 'OPEN', linkedObjectType: 'pbc_receipt', linkedObjectId: receiptId });
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'PBC_RECEIPT_SUBMITTED', objectType: 'pbc_receipt', objectId: receiptId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, receiptId, version, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRespondPbcReceipt(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can review PBC receipts.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const receiptId = String(payload.receiptId || '').trim();
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(receiptId)) return error(request, 'Provide the receipt ID to review.');
  if (!['ACCEPT', 'CLARIFY'].includes(decision)) return error(request, 'Decision must be ACCEPT or CLARIFY.');
  const note = cleanText(payload.note, MAX_CONTEXT_LENGTH) || '';
  if (decision === 'CLARIFY' && !note) return error(request, 'Explain what the client must clarify.');
  const receipt = await env.DB.prepare('SELECT * FROM auditflow_pbc_receipts WHERE receipt_id = ?1').bind(receiptId).first();
  if (!receipt || receipt.engagement_id !== id) return error(request, 'That receipt does not belong to this engagement.', 404, 'PBC_RECEIPT_NOT_FOUND');
  const strictCommand = isStrictCommandPayload(payload);
  if (strictCommand) {
    // A replacement receipt supersedes every prior version.  Looking up the
    // selected row alone would let a late review of v1 move the parent request
    // back to ACCEPTED after the client had already uploaded v2.
    const latest = await env.DB.prepare(
      `SELECT receipt_id, version, state FROM auditflow_pbc_receipts
       WHERE request_id = ?1 ORDER BY version DESC, uploaded_at DESC, receipt_id DESC LIMIT 1`,
    ).bind(receipt.request_id).first();
    if (!latest || latest.receipt_id !== receipt.receipt_id || Number(latest.version) !== Number(receipt.version)) {
      return error(request, `Receipt ${receiptId} is version ${receipt.version}; review the current receipt before changing readiness.`, 409, 'PBC_RECEIPT_STALE');
    }
    const engagement = await readEngagementRow(env, id);
    if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
    const generations = await readAccountingGenerations(env, id);
    const decisionId = crypto.randomUUID();
    const durableNote = note || (decision === 'ACCEPT' ? 'Receipt accepted against the current request version.' : 'Clarification requested for the current receipt.');
    await env.DB.prepare(
      `INSERT INTO auditflow_decisions
        (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
       VALUES (?1, ?2, 'PBC_RECEIPT', ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(decisionId, id, receipt.receipt_id, decision, session.actorId, durableNote, engagement.revision + 1, generations.input).run();
    // Keep the receipt itself inspectable while preserving the original client
    // comment. The decision row remains the append-only review history.
    await env.DB.prepare(
      `UPDATE auditflow_pbc_receipts
       SET state = ?2, comment = CASE WHEN comment = '' THEN ?3 ELSE comment || '\nReviewer: ' || ?3 END
       WHERE receipt_id = ?1`,
    ).bind(receiptId, decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION', durableNote).run();
    await env.DB.prepare(`UPDATE auditflow_pbc_requests SET state = ?2, updated_at = datetime('now') WHERE request_id = ?1`).bind(receipt.request_id, decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION').run();
    await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`pbc-review-${receipt.request_id}`).run();
    await upsertTask(env, { taskId: `pbc-client-${receipt.request_id}`, engagementId: id, assigneeRole: 'client_contributor', title: decision === 'ACCEPT' ? `Receipt accepted: ${receipt.request_id}` : `Clarification required for ${receipt.request_id}`, state: decision === 'ACCEPT' ? 'COMPLETE' : 'OPEN', linkedObjectType: 'pbc_receipt', linkedObjectId: receipt.receipt_id });
    const next = await touchEngagement(env, id, null);
    await appendEvent(env, { engagementId: id, actor: session.actorId, action: decision === 'ACCEPT' ? 'PBC_RECEIPT_ACCEPTED' : 'PBC_CLARIFICATION_REQUESTED', objectType: 'pbc_receipt', objectId: receiptId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
    return json(request, { ok: true, decision, receiptId, version: receipt.version, decisionId, note: durableNote, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(`UPDATE auditflow_pbc_receipts SET state = ?2 WHERE receipt_id = ?1`).bind(receiptId, decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION').run();
  await env.DB.prepare(`UPDATE auditflow_pbc_requests SET state = ?2, updated_at = datetime('now') WHERE request_id = ?1`).bind(receipt.request_id, decision === 'ACCEPT' ? 'ACCEPTED' : 'CLARIFICATION').run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`pbc-review-${receipt.request_id}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: decision === 'ACCEPT' ? 'PBC_RECEIPT_ACCEPTED' : 'PBC_CLARIFICATION_REQUESTED', objectType: 'pbc_receipt', objectId: receiptId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

function cleanCurrency(value) {
  const text = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

const KNOWN_TB_ACCOUNT_CODES = new Set([
  '100101', '110100', '120100', '150100', '159100', '200100', '220100',
  '300100', '310100', '400100', '500100', '510100', '520100', '530100',
]);

function normalizeStrictMoney(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [wholeRaw, fractionRaw = ''] = text.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  try {
    const cents = BigInt(whole) * 100n + BigInt((fractionRaw + '00').slice(0, 2));
    // Keep the bounded synthetic demo within a comfortably serializable
    // range while still accepting equivalent forms such as 00100.0.
    if (cents < 0n || cents > 9_000_000_000_000_00n) return null;
    return `${(cents / 100n).toString()}.${String(cents % 100n).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function sumStrictMoney(values) {
  let total = 0n;
  for (const value of values) {
    const normalized = normalizeStrictMoney(value);
    if (normalized == null) return null;
    const [whole, fraction] = normalized.split('.');
    total += BigInt(whole) * 100n + BigInt(fraction);
  }
  return `${(total / 100n).toString()}.${String(total % 100n).padStart(2, '0')}`;
}

function strictTbRows(payload, engagement) {
  const supplied = Array.isArray(payload.rows) ? payload.rows : null;
  if (!supplied || supplied.length === 0) return { ok: false, code: 'SOURCE_ROWS_REQUIRED', message: 'Send at least one bounded trial-balance row; a zero-row source cannot be validated.' };
  if (supplied.length > 5000) return { ok: false, code: 'ROW_LIMIT_EXCEEDED', message: 'Trial-balance intake is limited to 5,000 rows.' };
  const expectedEntity = String(engagement?.client_id || '').trim();
  const expectedPeriod = String(engagement?.period || '').trim();
  const expectedCurrency = 'QAR';
  const seen = new Set();
  const rows = [];
  for (let index = 0; index < supplied.length; index += 1) {
    const item = supplied[index] || {};
    const accountCode = String(item.accountCode ?? item.account_code ?? item.code ?? '').trim();
    const entityId = String(item.entityId ?? item.entity_id ?? payload.entityId ?? '').trim();
    const period = String(item.period ?? payload.period ?? '').trim();
    const currency = String(item.currency ?? payload.currency ?? '').trim().toUpperCase();
    const account = cleanText(item.account ?? item.accountName ?? item.account_name, 240, '') || '';
    // Area is useful presentation metadata but is not a source identity
    // requirement. Keep a visible fallback so minimal, well-formed fixture
    // rows are not rejected solely because the import omitted a grouping.
    const area = cleanText(item.area, 120, '') || 'Unassigned';
    const debit = normalizeStrictMoney(item.debit);
    const credit = normalizeStrictMoney(item.credit);
    if (!/^\d{1,20}$/.test(accountCode) || !account) return { ok: false, code: 'ROW_INVALID', message: `Row ${index + 1} has an invalid account identity.` };
    if (seen.has(accountCode)) return { ok: false, code: 'DUPLICATE_SOURCE_ROW', message: `Account ${accountCode} appears more than once.` };
    if (!debit || !credit) return { ok: false, code: 'MONEY_INVALID', message: `Row ${index + 1} has an invalid non-negative debit or credit amount.` };
    if (!entityId || entityId !== expectedEntity) return { ok: false, code: 'ENTITY_MISMATCH', message: `Row ${index + 1} belongs to ${entityId || 'no entity'}, not ${expectedEntity}.` };
    if (!period || period !== expectedPeriod) return { ok: false, code: 'PERIOD_MISMATCH', message: `Row ${index + 1} is for ${period || 'no period'}, not ${expectedPeriod}.` };
    if (!currency || currency !== expectedCurrency) return { ok: false, code: 'CURRENCY_MISMATCH', message: `Row ${index + 1} is ${currency || 'uncoded'}, not ${expectedCurrency}.` };
    seen.add(accountCode);
    rows.push({ accountCode, account, area, entityId, period, currency, debit, credit });
  }
  const debitTotal = sumStrictMoney(rows.map((row) => row.debit));
  const creditTotal = sumStrictMoney(rows.map((row) => row.credit));
  if (!debitTotal || !creditTotal || debitTotal !== creditTotal) return { ok: false, code: 'UNBALANCED_SOURCE', message: `Debit ${debitTotal || '—'} does not equal credit ${creditTotal || '—'}.` };
  const mappingComplete = rows.every((row) => KNOWN_TB_ACCOUNT_CODES.has(row.accountCode));
  return { ok: true, rows, debitTotal, creditTotal, mappingComplete, entityId: expectedEntity, period: expectedPeriod, currency: expectedCurrency };
}

async function actionRecordTbSource(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['client_contributor', 'preparer', 'accounting_reviewer', 'system_admin'])) {
    return error(request, 'Only the Client, Accountant or Reviewer demo persona can load the trial balance.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const sourceId = String(payload.sourceId || '').trim();
  const sourceVersion = String(payload.sourceVersion || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(sourceId) || !/^[A-Za-z0-9_.-]{1,20}$/.test(sourceVersion)) {
    return error(request, 'Provide a valid sourceId and sourceVersion (for example TB-BASELINE-001 / v03).');
  }
  const strictCommand = isStrictCommandPayload(payload);
  let currency = cleanCurrency(payload.currency);
  let debitTotal = cleanMoney(payload.debitTotal);
  let creditTotal = cleanMoney(payload.creditTotal);
  let rowCount = Number(payload.rowCount || 0);
  if (!strictCommand && (!currency || !debitTotal || !creditTotal || !Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > 5000)) {
    return error(request, 'Provide currency (3-letter code), debit/credit totals and a row count up to 5,000.');
  }
  if (!strictCommand && debitTotal !== creditTotal) return error(request, `Debit ${debitTotal} does not equal credit ${creditTotal}. The source was not recorded.`, 400, 'UNBALANCED_SOURCE');
  const validationState = String(payload.validationState || 'VALIDATED').trim().toUpperCase();
  if (!['DRAFT', 'VALIDATED', 'REJECTED'].includes(validationState)) return error(request, 'Validation state must be DRAFT, VALIDATED, or REJECTED.');
  const replacesVersion = String(payload.replacesVersion || '').trim().slice(0, 20);
  let normalizedRows = null;
  let parsedSource = null;
  let sourceHash = '';
  let derivedMappingComplete = readBoolean(payload.mappingComplete);
  if (strictCommand) {
    const engagement = await readEngagementRow(env, id);
    if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
    const parsed = strictTbRows(payload, engagement);
    if (!parsed.ok) return error(request, parsed.message, 400, parsed.code);
    parsedSource = parsed;
    normalizedRows = parsed.rows;
    if (payload.rowCount != null && Number(payload.rowCount) !== normalizedRows.length) return error(request, `rowCount ${payload.rowCount} does not match the ${normalizedRows.length} supplied rows.`, 400, 'ROW_COUNT_MISMATCH');
    if (payload.debitTotal != null && normalizeStrictMoney(payload.debitTotal) !== parsed.debitTotal) return error(request, 'The submitted debit total does not match the source rows.', 400, 'TOTAL_MISMATCH');
    if (payload.creditTotal != null && normalizeStrictMoney(payload.creditTotal) !== parsed.creditTotal) return error(request, 'The submitted credit total does not match the source rows.', 400, 'TOTAL_MISMATCH');
    if (readBoolean(payload.mappingComplete) && !parsed.mappingComplete) return error(request, 'Mapping is not verified for every source account; the caller cannot promote this source.', 400, 'MAPPING_UNVERIFIED');
    derivedMappingComplete = parsed.mappingComplete;
    currency = parsed.currency;
    debitTotal = parsed.debitTotal;
    creditTotal = parsed.creditTotal;
    rowCount = normalizedRows.length;
    if (validationState === 'VALIDATED' && !derivedMappingComplete) return error(request, 'A source is VALIDATED only when every bounded row has a known mapping.', 409, 'MAPPING_INCOMPLETE');
    sourceHash = await sha256Hex(JSON.stringify({
      sourceId,
      sourceVersion,
      entityId: parsedSource.entityId,
      period: parsedSource.period,
      currency: parsedSource.currency,
      rows: normalizedRows.map((row) => ({ accountCode: row.accountCode, account: row.account, area: row.area, entityId: row.entityId, period: row.period, currency: row.currency, debit: row.debit, credit: row.credit })).sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
    }));
    let existing = null;
    try {
      existing = await env.DB.prepare('SELECT id, source_id, source_version, period, currency, row_count, debit_total, credit_total, validation_state, mapping_complete, replaces_version, source_hash FROM auditflow_tb_sources WHERE engagement_id = ?1 AND source_version = ?2').bind(id, sourceVersion).first();
    } catch (sourceHashError) {
      if (!/no such column|unknown column|source_hash/i.test(String(sourceHashError?.message || sourceHashError))) throw sourceHashError;
      existing = await env.DB.prepare('SELECT id, source_id, source_version, period, currency, row_count, debit_total, credit_total, validation_state, mapping_complete, replaces_version FROM auditflow_tb_sources WHERE engagement_id = ?1 AND source_version = ?2').bind(id, sourceVersion).first();
    }
    if (existing) {
      const same = existing.source_hash ? existing.source_hash === sourceHash : String(existing.source_id) === sourceId && Number(existing.row_count) === normalizedRows.length && normalizeStrictMoney(existing.debit_total) === parsed.debitTotal && normalizeStrictMoney(existing.credit_total) === parsed.creditTotal && String(existing.period) === parsed.period && String(existing.currency).toUpperCase() === parsed.currency;
      if (same) return json(request, { ok: true, duplicate: true, sourceVersion, sourceHash, evidenceLevel: 'SIMULATION' });
      return error(request, `Source version ${sourceVersion} is immutable; submit a new replacement version.`, 409, 'SOURCE_VERSION_IMMUTABLE');
    }
    const latest = await env.DB.prepare('SELECT source_version FROM auditflow_tb_sources WHERE engagement_id = ?1 ORDER BY created_at DESC, source_version DESC LIMIT 1').bind(id).first();
    if (latest && latest.source_version && !replacesVersion) return error(request, `Link replacement ${sourceVersion} to the current source ${latest.source_version}.`, 409, 'SOURCE_REPLACEMENT_LINK_REQUIRED');
    if (latest && replacesVersion && replacesVersion !== latest.source_version) return error(request, `Source ${sourceVersion} must replace the current source ${latest.source_version}, not ${replacesVersion}.`, 409, 'SOURCE_REPLACEMENT_MISMATCH');
  }
  const effectiveDebit = strictCommand ? normalizeStrictMoney(debitTotal) : debitTotal;
  const effectiveCredit = strictCommand ? normalizeStrictMoney(creditTotal) : creditTotal;
  const effectiveRowCount = strictCommand ? normalizedRows.length : rowCount;
  const effectiveValidation = strictCommand ? validationState : validationState;
  await env.DB.prepare(
    strictCommand
      ? `INSERT INTO auditflow_tb_sources (id, engagement_id, source_id, source_version, period, currency, row_count, debit_total, credit_total, validation_state, mapping_complete, replaces_version, created_by, source_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
      : `INSERT INTO auditflow_tb_sources (id, engagement_id, source_id, source_version, period, currency, row_count, debit_total, credit_total, validation_state, mapping_complete, replaces_version, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT (engagement_id, source_version) DO UPDATE SET source_id = excluded.source_id, period = excluded.period,
           currency = excluded.currency, row_count = excluded.row_count, debit_total = excluded.debit_total, credit_total = excluded.credit_total,
           validation_state = excluded.validation_state, mapping_complete = excluded.mapping_complete, replaces_version = excluded.replaces_version, created_by = excluded.created_by`,
  ).bind(...(strictCommand
    ? [crypto.randomUUID(), id, sourceId, sourceVersion, normalizedRows[0].period, normalizedRows[0].currency, effectiveRowCount, parsedSource?.debitTotal || effectiveDebit, parsedSource?.creditTotal || effectiveCredit, effectiveValidation, derivedMappingComplete ? 1 : 0, replacesVersion, session.actorId, sourceHash]
    : [crypto.randomUUID(), id, sourceId, sourceVersion, cleanText(payload.period, 40, '') ?? '', currency, effectiveRowCount, effectiveDebit, effectiveCredit, effectiveValidation, readBoolean(payload.mappingComplete) ? 1 : 0, replacesVersion, session.actorId])).run();
  const priorStatus = await readAccountingStatus(env, id);
  const nextInputGeneration = priorStatus.inputGeneration + 1;
  await env.DB.prepare(
    'INSERT INTO auditflow_accounting_status (engagement_id, source_version, source_state, mapping_state, input_generation) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (engagement_id) DO UPDATE SET source_version = excluded.source_version, source_state = excluded.source_state, mapping_state = excluded.mapping_state, input_generation = excluded.input_generation, revision = auditflow_accounting_status.revision + 1, updated_at = datetime(\'now\')',
    ).bind(id, sourceVersion, effectiveValidation, derivedMappingComplete ? 'MAPPED' : 'PENDING', nextInputGeneration).run();
  const engagement = await touchEngagement(env, id, 'STAGE-05');
  await upsertTask(env, { taskId: `tb-review-${id}-${sourceVersion}`, engagementId: id, assigneeRole: 'accounting_reviewer', title: `Review TB ${sourceVersion} (${debitTotal})`, state: 'OPEN', linkedObjectType: 'tb_source', linkedObjectId: sourceVersion });
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'TB_SOURCE_RECORDED', objectType: 'tb_source', objectId: sourceVersion, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, sourceVersion, sourceHash: sourceHash || undefined, rowCount: effectiveRowCount, debitTotal: effectiveDebit, creditTotal: effectiveCredit, mappingComplete: derivedMappingComplete, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionSubmitWorkpaper(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['preparer', 'audit_senior'])) {
    return error(request, 'Only the Preparer or Audit Senior demo persona can submit workpapers.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const procedureTitle = cleanText(payload.procedureTitle, 200);
  const evidenceReference = cleanText(payload.evidenceReference, 400, '') ?? '';
  const conclusion = cleanText(payload.conclusion, MAX_CONTEXT_LENGTH);
  if (!procedureTitle || !conclusion) return error(request, 'Provide a procedure title and conclusion (maximum 1,200 characters).');
  let workpaperId = String(payload.workpaperId || '').trim();
  if (workpaperId) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(workpaperId)) return error(request, 'Provide a valid workpaper ID.');
    const existing = await env.DB.prepare('SELECT * FROM auditflow_workpapers WHERE workpaper_id = ?1').bind(workpaperId).first();
    if (!existing || existing.engagement_id !== id) return error(request, 'That workpaper does not belong to this engagement.', 404, 'WORKPAPER_NOT_FOUND');
    await env.DB.prepare(
      `UPDATE auditflow_workpapers SET procedure_title = ?2, evidence_reference = ?3, conclusion = ?4, state = 'SUBMITTED',
         revision = revision + 1, submitted_by = ?5, submitted_at = datetime('now'), updated_at = datetime('now') WHERE workpaper_id = ?1`,
    ).bind(workpaperId, procedureTitle, evidenceReference, conclusion, session.actorId).run();
  } else {
    workpaperId = `WP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await env.DB.prepare(
      `INSERT INTO auditflow_workpapers (workpaper_id, engagement_id, procedure_title, evidence_reference, conclusion, state, revision, submitted_by, submitted_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'SUBMITTED', 1, ?6, datetime('now'))`,
    ).bind(workpaperId, id, procedureTitle, evidenceReference, conclusion, session.actorId).run();
  }
  await upsertTask(env, { taskId: `wp-review-${workpaperId}`, engagementId: id, assigneeRole: 'audit_manager', title: `Review workpaper ${workpaperId}`, state: 'OPEN', linkedObjectType: 'workpaper', linkedObjectId: workpaperId });
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'WORKPAPER_SUBMITTED', objectType: 'workpaper', objectId: workpaperId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, workpaperId, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCreateReviewPoint(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_manager', 'independent_reviewer', 'engagement_partner'])) {
    return error(request, 'Only the Manager, Independent Reviewer or Partner demo persona can raise review points.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const workpaperId = String(payload.workpaperId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(workpaperId)) return error(request, 'Provide the workpaper this review point attaches to.');
  const workpaper = await env.DB.prepare('SELECT * FROM auditflow_workpapers WHERE workpaper_id = ?1').bind(workpaperId).first();
  if (!workpaper || workpaper.engagement_id !== id) return error(request, 'That workpaper does not belong to this engagement.', 404, 'WORKPAPER_NOT_FOUND');
  const severity = String(payload.severity || 'STANDARD').trim().toUpperCase();
  if (!['STANDARD', 'SIGNIFICANT'].includes(severity)) return error(request, 'Severity must be STANDARD or SIGNIFICANT.');
  const owner = cleanText(payload.owner, 80) || workpaper.submitted_by || '';
  const detail = cleanText(payload.detail, MAX_CONTEXT_LENGTH);
  if (!detail) return error(request, 'Describe the review point (maximum 1,200 characters).');
  const reviewId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_review_points (review_id, engagement_id, workpaper_id, severity, owner, author, detail, state)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'OPEN')`,
  ).bind(reviewId, id, workpaperId, severity, owner, session.actorId, detail).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'REVIEW_POINT_RAISED', objectType: 'review_point', objectId: reviewId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, reviewId, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionClearReviewPoint(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_manager', 'independent_reviewer', 'engagement_partner'])) {
    return error(request, 'Only the Manager, Independent Reviewer or Partner demo persona can clear review points.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const reviewId = String(payload.reviewId || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(reviewId)) return error(request, 'Provide the review point ID to clear.');
  const response = cleanText(payload.response, MAX_CONTEXT_LENGTH);
  if (!response) return error(request, 'Record a response before clearing the review point.');
  const review = await env.DB.prepare('SELECT * FROM auditflow_review_points WHERE review_id = ?1').bind(reviewId).first();
  if (!review || review.engagement_id !== id) return error(request, 'That review point does not belong to this engagement.', 404, 'REVIEW_POINT_NOT_FOUND');
  if (review.state === 'CLEARED') return error(request, 'That review point is already cleared.', 409, 'ALREADY_CLEARED');
  if (String(review.severity || '').toUpperCase() === 'SIGNIFICANT') {
    const workpaper = review.workpaper_id
      ? await env.DB.prepare('SELECT * FROM auditflow_workpapers WHERE workpaper_id = ?1').bind(review.workpaper_id).first()
      : null;
    const authorId = review.author || workpaper?.submitted_by || '';
    if (authorId && authorId === session.actorId) {
      return error(request, 'A significant review point cannot be cleared by its own author (separation of duties).', 403, 'SOD_VIOLATION');
    }
  }
  const clearGenerations = await readAccountingGenerations(env, id);
  await env.DB.prepare(`UPDATE auditflow_review_points SET response = ?2, state = 'CLEARED', cleared_at = datetime('now'), cleared_generation = ?3 WHERE review_id = ?1`).bind(reviewId, response, clearGenerations.input).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'REVIEW_POINT_CLEARED', objectType: 'review_point', objectId: reviewId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, reviewId, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

function numericVersion(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function compareVersionDesc(a, b) {
  const byNumber = numericVersion(b?.version ?? b) - numericVersion(a?.version ?? a);
  if (byNumber) return byNumber;
  return String(b?.version ?? b ?? '').localeCompare(String(a?.version ?? a ?? ''));
}

async function latestPublishedDraftFs(env, engagementId) {
  const rows = await env.DB.prepare(
    `SELECT * FROM auditflow_artifacts WHERE engagement_id = ?1 AND document_type = 'DRAFT_FS' AND state = 'PUBLISHED' ORDER BY created_at DESC, document_id DESC LIMIT 200`,
  ).bind(engagementId).all();
  const list = rows.results || [];
  list.sort(compareVersionDesc);
  return list[0] || null;
}

async function actionPublishDraftFs(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can publish the Draft FS.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const summary = cleanText(payload.summary, MAX_CONTEXT_LENGTH, '') ?? '';
  const strictCommand = isStrictCommandPayload(payload);
  if (strictCommand && !summary) return error(request, 'Provide a concise Draft FS conclusion summary.', 400, 'SUMMARY_REQUIRED');
  if (strictCommand) {
    const engagement = await readEngagementRow(env, id);
    if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
    const profile = await env.DB.prepare('SELECT engagement_id FROM auditflow_client_profiles WHERE engagement_id = ?1').bind(id).first();
    if (!profile) return error(request, 'Client details must be submitted before preparing Draft FS.', 409, 'CLIENT_DETAILS_REQUIRED');
    const acceptance = await latestDecision(env, id, 'ACCEPTANCE');
    if (!acceptance || acceptance.decision !== 'ACCEPT') return error(request, 'A current Partner acceptance decision is required before Draft FS publication.', 409, 'ACCEPTANCE_REQUIRED');
    const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
    if (!commercial || commercial.el_state !== 'ACCEPTED') return error(request, 'The current Engagement Letter must be accepted before Draft FS publication.', 409, 'TERMS_REQUIRED');
    const accounting = await readAccountingStatus(env, id);
    if (!accounting.exists || accounting.sourceState !== 'VALIDATED' || !['MAPPED', 'COMPLETE'].includes(String(accounting.mappingState || '').toUpperCase()) || accounting.reconState !== 'COMPLETE' || Number(accounting.openReconCount || 0) !== 0 || accounting.journalState !== 'COMPLETE' || Number(accounting.pendingJournalCount || 0) !== 0 || !accounting.fsVersion || accounting.fsState !== 'FINAL' || accounting.mgmtApprovalState !== 'ACCEPTED') {
      return error(request, 'Accounting source, mapping, reconciliations, journals, FS package and management approval must all be current before Draft FS publication.', 409, 'ACCOUNTING_NOT_READY');
    }
    const pbc = await env.DB.prepare('SELECT request_id, state FROM auditflow_pbc_requests WHERE engagement_id = ?1').bind(id).all();
    if (!pbc.results?.length || pbc.results.some((row) => String(row.state || '').toUpperCase() !== 'ACCEPTED')) return error(request, 'Every information request must be accepted before Draft FS publication.', 409, 'PBC_NOT_EVALUATED');
    const submitted = await env.DB.prepare('SELECT COUNT(*) AS n FROM auditflow_workpapers WHERE engagement_id = ?1 AND state = ?2').bind(id, 'SUBMITTED').first();
    if (!Number(submitted?.n || 0)) return error(request, 'At least one submitted workpaper is required before Draft FS publication.', 409, 'NO_SUBMITTED_WORKPAPERS');
  }
  const prior = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auditflow_artifacts WHERE engagement_id = ?1 AND document_type = 'DRAFT_FS'`,
  ).bind(id).first();
  const version = `v${String(Number(prior?.n || 0) + 1).padStart(2, '0')}`;
  const artifactId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by)
     VALUES (?1, ?2, 'DRAFT_FS', ?3, ?4, 'PUBLISHED', 'CLIENT_VISIBLE', ?5)`,
  ).bind(artifactId, id, `Draft financial statements ${version}`, version, session.actorId).run();
  await upsertTask(env, { taskId: `draftfs-response-${id}-${version}`, engagementId: id, assigneeRole: 'management_approver', title: `Respond to Draft FS ${version}`, state: 'OPEN', linkedObjectType: 'artifact', linkedObjectId: artifactId });
  const engagement = await touchEngagement(env, id, 'STAGE-06');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'DRAFT_FS_PUBLISHED', objectType: 'artifact', objectId: artifactId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, artifactId, version, summary, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRespondDraftFs(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['management_approver'])) {
    return error(request, 'Only the Client Management Approver demo persona can respond to the Draft FS.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!['ACCEPT', 'REJECT', 'REVISION'].includes(decision)) return error(request, 'Decision must be ACCEPT, REJECT, or REVISION.');
  const version = String(payload.version || '').trim();
  const explanation = cleanText(payload.explanation, MAX_CONTEXT_LENGTH) || '';
  if (decision !== 'ACCEPT' && !explanation) return error(request, 'Explain the rejection or revision request.');
  const latest = await latestPublishedDraftFs(env, id);
  if (!latest) return error(request, 'No published Draft FS is awaiting a response yet.', 409, 'PRECONDITION_FAILED');
  if (version !== latest.version) {
    return error(request, `This response names ${version || 'no version'} but the current draft is ${latest.version}. Respond to the exact version.`, 409, 'VERSION_MISMATCH');
  }
  const decisionId = crypto.randomUUID();
  const generations = await readAccountingGenerations(env, id);
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
     VALUES (?1, ?2, 'DRAFT_FS', ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(decisionId, id, version, decision, session.actorId, explanation, 1, generations.input).run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`draftfs-response-${id}-${version}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: `DRAFT_FS_${decision === 'REVISION' ? 'REVISION_REQUESTED' : decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'}`, objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision, version }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCompleteEqr(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['eqr_reviewer'])) {
    return error(request, 'Only the EQR Reviewer demo persona can complete the quality review.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!['APPROVE', 'RETURN', 'HOLD'].includes(decision)) return error(request, 'Decision must be APPROVE, RETURN, or HOLD.');
  const note = cleanText(payload.note, MAX_CONTEXT_LENGTH) || '';
  if (decision !== 'APPROVE' && !note) return error(request, 'Record a note when returning or holding the file.');
  const candidateId = String(payload.candidateId || '').trim();
  const strictCommand = isStrictCommandPayload(payload);
  let currentInputGeneration = 1;
  if (strictCommand) {
    const latest = await latestPublishedDraftFs(env, id);
    if (!latest) return error(request, 'Publish a Draft FS before starting EQR.', 409, 'CANDIDATE_REQUIRED');
    if (!candidateId || candidateId !== latest.version) return error(request, `EQR must name the current Draft FS candidate ${latest.version}.`, 409, 'CANDIDATE_MISMATCH');
    const draftResponse = await latestDecision(env, id, 'DRAFT_FS');
    if (!draftResponse || draftResponse.decision !== 'ACCEPT' || draftResponse.object_version !== latest.version) return error(request, 'EQR is available only after management accepts the current Draft FS.', 409, 'DRAFT_NOT_ACCEPTED');
    const generations = await readAccountingGenerations(env, id);
    currentInputGeneration = generations.input;
    if (generations.input !== generations.evaluated) return error(request, 'Accounting input is stale; audit must evaluate the current generation before EQR.', 409, 'ACCOUNTING_INPUT_STALE');
  }
  const decisionId = crypto.randomUUID();
  const eqrEventAction = `EQR_${decision === 'RETURN' ? 'RETURNED' : decision === 'HOLD' ? 'ON_HOLD' : 'APPROVED'}`;
  if (tx) {
    const engagement = await readEngagementRow(env, id);
    const nextRevision = Number(engagement?.revision || 1) + 1;
    tx.setDecision({
      id: decisionId,
      type: 'EQR',
      objectVersion: candidateId,
      value: decision,
      rationale: note,
      inputGeneration: currentInputGeneration,
      rowRevision: nextRevision,
      eventAction: eqrEventAction,
      eventObjectType: 'decision',
      eventObjectId: decisionId,
      resultExtras: { decision: { decisionId, decision, candidateId, inputGeneration: currentInputGeneration } },
    });
    tx.addEffect({ sql: `UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`, params: [`eqr-${id}`] });
    return json(request, { ok: true, decision: { decisionId, decision, candidateId, inputGeneration: currentInputGeneration }, engagement: serializeEngagementState({ ...(engagement || {}), revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  if (strictCommand) {
    const engagement = await readEngagementRow(env, id);
    await env.DB.prepare(
      `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
       VALUES (?1, ?2, 'EQR', ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(decisionId, id, candidateId, decision, session.actorId, note, Number(engagement?.revision || 1) + 1, currentInputGeneration).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
       VALUES (?1, ?2, 'EQR', ?3, ?4, ?5, ?6, 1)`,
    ).bind(decisionId, id, candidateId, decision, session.actorId, note).run();
  }
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`eqr-${id}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: eqrEventAction, objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision, candidateId, inputGeneration: currentInputGeneration }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRecordAuditOpinion(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can form the audit opinion.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const opinionType = String(payload.opinionType || '').trim().toUpperCase();
  if (!['UNMODIFIED', 'QUALIFIED', 'ADVERSE', 'DISCLAIMER'].includes(opinionType)) {
    return error(request, 'Opinion type must be UNMODIFIED, QUALIFIED, ADVERSE, or DISCLAIMER.');
  }
  const candidateVersion = String(payload.candidateVersion || '').trim();
  const rationale = cleanText(payload.rationale, MAX_CONTEXT_LENGTH);
  if (!rationale) return error(request, 'Record the basis for the opinion (maximum 1,200 characters).');
  const latest = await latestPublishedDraftFs(env, id);
  if (!latest) return error(request, 'Publish the Draft FS before forming the opinion.', 409, 'PRECONDITION_FAILED');
  if (candidateVersion !== latest.version) {
    return error(request, `The opinion names ${candidateVersion || 'no version'} but the current draft is ${latest.version}. Bind the opinion to the exact candidate.`, 409, 'VERSION_MISMATCH');
  }
  const draftResponse = await latestDecision(env, id, 'DRAFT_FS');
  if (!draftResponse || draftResponse.decision !== 'ACCEPT' || draftResponse.object_version !== latest.version) {
    return error(request, 'Record a current management acceptance of the latest Draft FS before forming the opinion.', 409, 'DRAFT_NOT_ACCEPTED');
  }
  const generations = await readAccountingGenerations(env, id);
  if (generations.evaluated !== generations.input) {
    return error(request, 'Accounting input g' + generations.input + ' is not yet evaluated by audit (g' + generations.evaluated + '). Evaluate it before forming the opinion.', 409, 'ACCOUNTING_INPUT_STALE');
  }
  const manager = await latestDecision(env, id, 'MANAGER_COMPLETION');
  if (!manager || manager.decision !== 'RECOMMEND_COMPLETE') {
    return error(request, 'Record a manager completion recommendation before forming the opinion.', 409, 'MANAGER_COMPLETION_REQUIRED');
  }
  if (Number(manager.input_generation || 1) < generations.input) {
    return error(request, 'The manager recommendation evaluated an older accounting input. Ask the manager to re-record it against the current generation.', 409, 'MANAGER_COMPLETION_STALE');
  }
  const partnerReview = await latestDecision(env, id, 'PARTNER_COMPLETION_REVIEW');
  if (!partnerReview || partnerReview.decision !== 'APPROVE_FOR_OPINION') {
    return error(request, 'Record a partner completion review approving the file for opinion before forming the opinion.', 409, 'PARTNER_REVIEW_REQUIRED');
  }
  if (Number(partnerReview.input_generation || 1) < generations.input) {
    return error(request, 'The partner review evaluated an older accounting input. Re-record it against the current generation.', 409, 'PARTNER_REVIEW_STALE');
  }
  const submittedWorkpapers = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM auditflow_workpapers WHERE engagement_id = ?1 AND state = ?2',
  ).bind(id, 'SUBMITTED').first();
  if (!Number(submittedWorkpapers?.n || 0)) return error(request, 'At least one submitted workpaper is required before forming the opinion.', 409, 'NO_SUBMITTED_WORKPAPERS');
  const openSignificant = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM auditflow_review_points WHERE engagement_id = ?1 AND state = ?2 AND severity = ?3',
  ).bind(id, 'OPEN', 'SIGNIFICANT').first();
  if (Number(openSignificant?.n || 0)) return error(request, 'Significant review points must be cleared before forming the opinion.', 409, 'OPEN_SIGNIFICANT_POINTS');
  const pbcRequests = await env.DB.prepare(
    'SELECT request_id, state FROM auditflow_pbc_requests WHERE engagement_id = ?1',
  ).bind(id).all();
  const pbcList = pbcRequests.results || [];
  if (!pbcList.length || pbcList.some((row) => String(row.state || '').toUpperCase() !== 'ACCEPTED')) {
    return error(request, 'Every information request must be evaluated (accepted) before forming the opinion.', 409, 'PBC_NOT_EVALUATED');
  }
  const assessmentGate = await readAssessmentGate(env, id);
  if (assessmentGate.blocking.length) {
    const names = assessmentGate.blocking.slice(0, 5).map((hold) => hold.questionId + ' (' + hold.code + ')').join(', ');
    return error(request, 'Blocking evaluation holds must be resolved before forming the opinion, starting with: ' + names + '.', 409, 'ASSESSMENT_HOLDS_FOR_OPINION');
  }
  const decisionId = crypto.randomUUID();
  if (tx) {
    const engagementRow = await readEngagementRow(env, id);
    tx.setDecision({
      id: decisionId,
      type: 'AUDIT_OPINION',
      objectVersion: candidateVersion,
      value: opinionType,
      rationale,
      inputGeneration: generations.input,
      rowRevision: 1,
      eventAction: 'AUDIT_OPINION_RECORDED',
      eventObjectType: 'decision',
      eventObjectId: decisionId,
      resultExtras: { decision: { decisionId, opinionType, candidateVersion, inputGeneration: generations.input } },
    });
    tx.setStage('STAGE-07');
    return json(request, { ok: true, decision: { decisionId, opinionType, candidateVersion, inputGeneration: generations.input }, engagement: serializeEngagementState({ ...(engagementRow || {}), revision: tx.nextRevision, current_stage: 'STAGE-07' }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
     VALUES (?1, ?2, 'AUDIT_OPINION', ?3, ?4, ?5, ?6, 1, ?7)`,
  ).bind(decisionId, id, candidateVersion, opinionType, session.actorId, rationale, generations.input).run();
  const engagement = await touchEngagement(env, id, 'STAGE-07');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'AUDIT_OPINION_RECORDED', objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, opinionType, candidateVersion, inputGeneration: generations.input }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

function moneyToCents(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function centsToMoney(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Phase C — explicit manager completion and partner review handoffs plus
// the final client discussion. Each record carries the accounting input
// generation it evaluated, so later TB changes visibly stale it.
async function actionRecordManagerCompletion(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['audit_manager'])) {
    return error(request, 'Only the Audit Manager demo persona can record the completion recommendation.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (decision !== 'RECOMMEND_COMPLETE' && decision !== 'RETURN_TO_TEAM' && decision !== 'HOLD') {
    return error(request, 'Decision must be RECOMMEND_COMPLETE, RETURN_TO_TEAM, or HOLD.');
  }
  const rationale = cleanText(payload.rationale, MAX_CONTEXT_LENGTH);
  if (!rationale) return error(request, 'Record the basis for the completion decision (maximum 1,200 characters).');
  const generations = await readAccountingGenerations(env, id);
  if (decision === 'RECOMMEND_COMPLETE') {
    const submitted = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM auditflow_workpapers WHERE engagement_id = ?1 AND state = ?2',
    ).bind(id, 'SUBMITTED').first();
    if (!Number(submitted?.n || 0)) return error(request, 'Recommend completion only after at least one workpaper is submitted.', 409, 'NO_SUBMITTED_WORKPAPERS');
    const openPoints = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM auditflow_review_points WHERE engagement_id = ?1 AND state = ?2',
    ).bind(id, 'OPEN').first();
    if (Number(openPoints?.n || 0)) return error(request, 'Unresolved review points block a completion recommendation. Clear or return each open point first.', 409, 'REVIEW_POINTS_OPEN');
  }
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const decisionId = crypto.randomUUID();
  const partnerTask = { taskId: 'partner-review-' + id, engagementId: id, assigneeRole: 'engagement_partner', title: 'Review manager completion recommendation', state: decision === 'RECOMMEND_COMPLETE' ? 'OPEN' : 'COMPLETE', linkedObjectType: 'decision', linkedObjectId: decisionId };
  // A return is an explicit correction handoff, not just a historical
  // decision. Keep the decision immutable and create a fresh, actionable
  // task for the scoped senior/preparer so the approval center can surface
  // the correction without overwriting prior review history.
  const correctionTaskId = decision === 'RETURN_TO_TEAM' ? `audit-correction-${id}-${decisionId}` : '';
  const correctionTask = correctionTaskId ? {
    taskId: correctionTaskId,
    engagementId: id,
    assigneeRole: 'audit_senior',
    title: 'Correct and resubmit audit file',
    state: 'OPEN',
    priority: 'HIGH',
    blockerCode: 'MANAGER_RETURNED',
    route: 'audit',
    stage: 'STAGE-07',
    linkedObjectType: 'decision',
    linkedObjectId: decisionId,
    creator: session.actorId,
  } : null;
  const nextRevision = engagement.revision + 1;
  if (tx) {
    tx.setDecision({
      id: decisionId,
      type: 'MANAGER_COMPLETION',
      objectVersion: 'rev-' + engagement.revision,
      value: decision,
      rationale,
      inputGeneration: generations.input,
      rowRevision: nextRevision,
      eventAction: 'MANAGER_COMPLETION_RECORDED',
      eventObjectType: 'decision',
      eventObjectId: decisionId,
      resultExtras: { decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input }, correctionTaskId: correctionTaskId || null },
    });
    tx.addEffect(taskUpsertStatement(partnerTask));
    if (correctionTask) tx.addEffect(taskUpsertStatement(correctionTask));
    return json(request, { ok: true, decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input }, correctionTaskId: correctionTaskId || null, engagement: serializeEngagementState({ ...engagement, revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    'INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
  ).bind(decisionId, id, 'MANAGER_COMPLETION', 'rev-' + engagement.revision, decision, session.actorId, rationale, engagement.revision + 1, generations.input).run();
  await upsertTask(env, partnerTask);
  if (correctionTask) await upsertTask(env, correctionTask);
  const next = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'MANAGER_COMPLETION_RECORDED', objectType: 'decision', objectId: decisionId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  return json(request, { ok: true, decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input }, correctionTaskId: correctionTaskId || null, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRecordPartnerReview(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can record the completion review.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (decision !== 'APPROVE_FOR_OPINION' && decision !== 'RETURN_TO_MANAGER' && decision !== 'HOLD') {
    return error(request, 'Decision must be APPROVE_FOR_OPINION, RETURN_TO_MANAGER, or HOLD.');
  }
  const rationale = cleanText(payload.rationale, MAX_CONTEXT_LENGTH);
  if (!rationale) return error(request, 'Record the basis for the completion review (maximum 1,200 characters).');
  const generations = await readAccountingGenerations(env, id);
  const manager = await latestDecision(env, id, 'MANAGER_COMPLETION');
  if (!manager || manager.decision !== 'RECOMMEND_COMPLETE') {
    return error(request, 'Record a manager completion recommendation before the partner review.', 409, 'MANAGER_COMPLETION_REQUIRED');
  }
  if (Number(manager.input_generation || 1) < generations.input) {
    return error(request, 'The manager recommendation evaluated an older accounting input. Ask the manager to re-record it against the current generation.', 409, 'MANAGER_COMPLETION_STALE');
  }
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const decisionId = crypto.randomUUID();
  const nextRevision = engagement.revision + 1;
  if (tx) {
    tx.setDecision({
      id: decisionId,
      type: 'PARTNER_COMPLETION_REVIEW',
      objectVersion: 'rev-' + engagement.revision,
      value: decision,
      rationale,
      inputGeneration: generations.input,
      rowRevision: nextRevision,
      eventAction: 'PARTNER_REVIEW_RECORDED',
      eventObjectType: 'decision',
      eventObjectId: decisionId,
      resultExtras: { decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input } },
    });
    tx.addEffect({ sql: `UPDATE auditflow_tasks SET state = ?1, completed_at = datetime('now') WHERE task_id = ?2`, params: [decision === 'APPROVE_FOR_OPINION' ? 'COMPLETE' : 'OPEN', 'partner-review-' + id] });
    return json(request, { ok: true, decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input }, engagement: serializeEngagementState({ ...engagement, revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    'INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
  ).bind(decisionId, id, 'PARTNER_COMPLETION_REVIEW', 'rev-' + engagement.revision, decision, session.actorId, rationale, engagement.revision + 1, generations.input).run();
  await env.DB.prepare('UPDATE auditflow_tasks SET state = ?1, completed_at = datetime(\'now\') WHERE task_id = ?2').bind(decision === 'APPROVE_FOR_OPINION' ? 'COMPLETE' : 'OPEN', 'partner-review-' + id).run();
  const next = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'PARTNER_REVIEW_RECORDED', objectType: 'decision', objectId: decisionId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  return json(request, { ok: true, decision: { decisionId: decisionId, decision: decision, inputGeneration: generations.input }, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRecordFinalDiscussion(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can record the final client discussion.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const date = String(payload.date || '').trim().slice(0, 40);
  const attendees = cleanText(payload.attendees, 400);
  const topics = cleanText(payload.topics, MAX_CONTEXT_LENGTH);
  const outcome = cleanText(payload.outcome, MAX_CONTEXT_LENGTH);
  if (!date || !attendees || !topics || !outcome) {
    return error(request, 'Record the date, attendees, topics and outcome of the final discussion.');
  }
  const opinion = await latestDecision(env, id, 'AUDIT_OPINION');
  if (!opinion) return error(request, 'Form the audit opinion before recording the final client discussion.', 409, 'OPINION_REQUIRED');
  const generations = await readAccountingGenerations(env, id);
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const decisionId = crypto.randomUUID();
  const rationale = 'Attendees: ' + attendees + ' | Topics: ' + topics + ' | Outcome: ' + outcome;
  const nextRevision = engagement.revision + 1;
  if (tx) {
    tx.setDecision({
      id: decisionId,
      type: 'FINAL_CLIENT_DISCUSSION',
      objectVersion: date,
      value: 'RECORDED',
      rationale,
      inputGeneration: generations.input,
      rowRevision: nextRevision,
      eventAction: 'FINAL_DISCUSSION_RECORDED',
      eventObjectType: 'decision',
      eventObjectId: decisionId,
      resultExtras: { decision: { decisionId: decisionId, date: date, inputGeneration: generations.input } },
    });
    return json(request, { ok: true, decision: { decisionId: decisionId, date: date, inputGeneration: generations.input }, engagement: serializeEngagementState({ ...engagement, revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    'INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
  ).bind(decisionId, id, 'FINAL_CLIENT_DISCUSSION', date, 'RECORDED', session.actorId, rationale, engagement.revision + 1, generations.input).run();
  const next = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'FINAL_DISCUSSION_RECORDED', objectType: 'decision', objectId: decisionId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  return json(request, { ok: true, decision: { decisionId: decisionId, date: date, inputGeneration: generations.input }, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

// M7 APPROVAL-02 — explicit handoff commands. The older portal action names
// remain supported, while these concrete commands make the handoff visible in
// the shared approval center and give each transition its own durable record.
async function actionSubmitAuditFile(request, env, session, id, payload, correlationId) {
  const fileId = String(payload.fileId || payload.auditFileId || '').trim();
  const workpaperPayload = {
    ...payload,
    workpaperId: fileId || payload.workpaperId || '',
    procedureTitle: payload.procedureTitle || payload.title || 'Audit file submission',
    evidenceReference: payload.evidenceReference || payload.manifestId || 'SYNTHETIC-AUDIT-FILE',
    conclusion: payload.conclusion || payload.summary || 'Submitted the current synthetic audit-file manifest for review.',
  };
  return actionSubmitWorkpaper(request, env, session, id, workpaperPayload, correlationId);
}

async function actionRecommendCompletion(request, env, session, id, payload, correlationId) {
  return actionRecordManagerCompletion(request, env, session, id,
    { ...payload, decision: 'RECOMMEND_COMPLETE' }, correlationId);
}

async function actionReturnToTeam(request, env, session, id, payload, correlationId) {
  return actionRecordManagerCompletion(request, env, session, id,
    { ...payload, decision: 'RETURN_TO_TEAM' }, correlationId);
}

async function actionReviewPartnerCompletion(request, env, session, id, payload, correlationId) {
  return actionRecordPartnerReview(request, env, session, id,
    { ...payload, decision: 'APPROVE_FOR_OPINION' }, correlationId);
}

async function actionReturnToManager(request, env, session, id, payload, correlationId) {
  return actionRecordPartnerReview(request, env, session, id,
    { ...payload, decision: 'RETURN_TO_MANAGER' }, correlationId);
}

async function actionVerifyReleaseCheckpoint(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['records_custodian'])) {
    return error(request, 'Only the Records Custodian demo persona can verify a release checkpoint.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  const release = await latestDecision(env, id, 'RELEASE');
  if (!release) return error(request, 'Commit the release event before verifying its checkpoint.', 409, 'RELEASE_EVENT_REQUIRED');
  const requestedReleaseId = String(payload.releaseId || payload.targetId || '').trim();
  if (strictCommand && requestedReleaseId !== release.decision_id) {
    return error(request, `Checkpoint targets ${requestedReleaseId || 'no release'} but the current release is ${release.decision_id}.`, 409, 'RELEASE_ID_MISMATCH');
  }
  const existing = await latestDecision(env, id, 'RELEASE_CHECKPOINT');
  if (existing && existing.decision === 'VERIFIED') {
    if (strictCommand && existing.object_version !== release.object_version) {
      return error(request, 'The stored checkpoint belongs to another release candidate.', 409, 'CHECKPOINT_TARGET_MISMATCH');
    }
    return json(request, { ok: true, duplicate: true, checkpointId: existing.decision_id, targetVersion: existing.object_version, engagement: null, evidenceLevel: 'SIMULATION' });
  }
  const artifacts = await env.DB.prepare(
    `SELECT document_id, document_type, version, state, visibility FROM auditflow_artifacts
     WHERE engagement_id = ?1 AND document_type IN ('FINAL_REPORT', 'FINAL_FS') AND state = 'PUBLISHED' ORDER BY created_at DESC`,
  ).bind(id).all();
  const rows = artifacts.results || [];
  // The checkpoint is an exact pair. A report from a previous candidate must
  // not be paired with the current financial statements just because it is
  // the newest row of that document type.
  const report = rows.find((row) => row.document_type === 'FINAL_REPORT' && row.version === release.object_version);
  const fs = rows.find((row) => row.document_type === 'FINAL_FS' && row.version === release.object_version);
  if (!report || !fs) return error(request, 'The exact final report and financial-statement pair is not available for checkpointing.', 409, 'ARTIFACT_PAIR_REQUIRED');
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const checkpointId = `CHK-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const rationale = cleanText(payload.note || payload.rationale, MAX_CONTEXT_LENGTH, '') || `Verified ${report.document_id} + ${fs.document_id} for release ${release.decision_id}.`;
  const nextRevision = engagement.revision + 1;
  if (tx) {
    tx.setDecision({
      id: checkpointId,
      type: 'RELEASE_CHECKPOINT',
      objectVersion: release.object_version,
      value: 'VERIFIED',
      rationale,
      inputGeneration: Number(release.input_generation || 1),
      rowRevision: nextRevision,
      eventAction: 'RELEASE_CHECKPOINT_VERIFIED',
      eventObjectType: 'checkpoint',
      eventObjectId: checkpointId,
      resultExtras: { checkpointId, targetVersion: release.object_version, reportId: report.document_id, fsId: fs.document_id, duplicate: false },
    });
    return json(request, { ok: true, duplicate: false, checkpointId, targetVersion: release.object_version, reportId: report.document_id, fsId: fs.document_id, engagement: serializeEngagementState({ ...engagement, revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
      VALUES (?1, ?2, 'RELEASE_CHECKPOINT', ?3, 'VERIFIED', ?4, ?5, ?6, ?7)`,
  ).bind(checkpointId, id, release.object_version, session.actorId, rationale, engagement.revision + 1, Number(release.input_generation || 1)).run();
  const next = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'RELEASE_CHECKPOINT_VERIFIED', objectType: 'checkpoint', objectId: checkpointId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, checkpointId, targetVersion: release.object_version, reportId: report.document_id, fsId: fs.document_id, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionAssembleArchive(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['records_custodian'])) {
    return error(request, 'Only the Records Custodian demo persona can assemble the archive.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  const release = await latestDecision(env, id, 'RELEASE');
  if (strictCommand) {
    const requestedReleaseId = String(payload.releaseId || payload.targetId || '').trim();
    if (!release) return error(request, 'Commit the release event before assembling the archive.', 409, 'RELEASE_EVENT_REQUIRED');
    if (requestedReleaseId !== release.decision_id) return error(request, `Archive targets ${requestedReleaseId || 'no release'} but the current release is ${release.decision_id}.`, 409, 'RELEASE_ID_MISMATCH');
  }
  const checkpoint = await latestDecision(env, id, 'RELEASE_CHECKPOINT');
  if (!checkpoint || checkpoint.decision !== 'VERIFIED') return error(request, 'Verify the release checkpoint before assembling the archive.', 409, 'CHECKPOINT_REQUIRED');
  if (strictCommand && payload.checkpointId && String(payload.checkpointId).trim() !== checkpoint.decision_id) {
    return error(request, 'The archive targets a different release checkpoint.', 409, 'CHECKPOINT_TARGET_MISMATCH');
  }
  if (strictCommand) {
    const delivery = await latestDecision(env, id, 'DELIVERY');
    if (!delivery || delivery.decision !== 'DELIVERED' || delivery.object_version !== checkpoint.object_version) {
      return error(request, 'Deliver the checkpointed final report before assembling the archive.', 409, 'DELIVERY_REQUIRED');
    }
  }
  const existing = await latestDecision(env, id, 'ARCHIVE');
  if (existing && existing.decision === 'ASSEMBLED') {
    if (strictCommand && existing.object_version !== checkpoint.object_version) return error(request, 'The stored archive belongs to another checkpoint.', 409, 'ARCHIVE_TARGET_MISMATCH');
    return json(request, { ok: true, duplicate: true, archiveId: existing.decision_id, evidenceLevel: 'SIMULATION' });
  }
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const artifacts = await env.DB.prepare(
    `SELECT document_id, document_type, version FROM auditflow_artifacts WHERE engagement_id = ?1 AND state = 'PUBLISHED' ORDER BY created_at DESC LIMIT 100`,
  ).bind(id).all();
  const archiveId = `ARCH-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const manifest = (artifacts.results || []).map((row) => `${row.document_type}:${row.document_id}:${row.version}`).join('|');
  const nextRevision = engagement.revision + 1;
  if (tx) {
    tx.setDecision({
      id: archiveId,
      type: 'ARCHIVE',
      objectVersion: checkpoint.object_version,
      value: 'ASSEMBLED',
      rationale: cleanText(payload.note || payload.rationale, MAX_CONTEXT_LENGTH, '') || `Archive manifest ${manifest || 'empty'} assembled from checkpoint ${checkpoint.decision_id}.`,
      inputGeneration: Number(checkpoint.input_generation || 1),
      rowRevision: nextRevision,
      eventAction: 'ARCHIVE_ASSEMBLED',
      eventObjectType: 'archive',
      eventObjectId: archiveId,
      resultExtras: { archiveId, targetVersion: checkpoint.object_version, manifest, duplicate: false },
    });
    return json(request, { ok: true, duplicate: false, archiveId, targetVersion: checkpoint.object_version, manifest, engagement: serializeEngagementState({ ...engagement, revision: nextRevision }), evidenceLevel: 'SIMULATION' }, 201);
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
     VALUES (?1, ?2, 'ARCHIVE', ?3, 'ASSEMBLED', ?4, ?5, ?6, ?7)`,
  ).bind(archiveId, id, checkpoint.object_version, session.actorId, cleanText(payload.note || payload.rationale, MAX_CONTEXT_LENGTH, '') || `Archive manifest ${manifest || 'empty'} assembled from checkpoint ${checkpoint.decision_id}.`, engagement.revision + 1, Number(checkpoint.input_generation || 1)).run();
  const next = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ARCHIVE_ASSEMBLED', objectType: 'archive', objectId: archiveId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, archiveId, targetVersion: checkpoint.object_version, manifest, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

// APPROVAL-02 — the delivery boundary is deliberately separate from release
// and records custody. A release creates an internal, version-bound pair; a
// Records Custodian verifies that pair; only then can the Partner make it
// client-visible and emit a portal delivery event. The operation is replay
// safe by release identity and the command receipt/idempotency key.
async function actionDeliverFinalReport(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can deliver the final report.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  const release = await latestDecision(env, id, 'RELEASE');
  if (!release) return error(request, 'Commit the release event before delivering the final report.', 409, 'RELEASE_EVENT_REQUIRED');
  const releaseId = String(payload.releaseId || payload.targetId || '').trim();
  if (strictCommand && releaseId !== release.decision_id) {
    return error(request, `Delivery targets ${releaseId || 'no release'} but the current release is ${release.decision_id}.`, 409, 'RELEASE_ID_MISMATCH');
  }
  const existing = await latestDecision(env, id, 'DELIVERY');
  if (existing && existing.decision === 'DELIVERED') {
    if (strictCommand && existing.object_version !== release.object_version) return error(request, 'The stored delivery belongs to another release candidate.', 409, 'DELIVERY_TARGET_MISMATCH');
    return json(request, { ok: true, duplicate: true, deliveryId: existing.decision_id, releaseId: release.decision_id, targetVersion: release.object_version, evidenceLevel: 'SIMULATION' });
  }
  const checkpoint = await latestDecision(env, id, 'RELEASE_CHECKPOINT');
  if (!checkpoint || checkpoint.decision !== 'VERIFIED' || checkpoint.object_version !== release.object_version) {
    return error(request, 'Verify the exact release checkpoint before delivery.', 409, 'CHECKPOINT_REQUIRED');
  }

  // Re-check the current file at the delivery boundary. A new review point,
  // changed accounting generation or changed opinion after checkpointing
  // must stop outward delivery; the checkpoint remains historical evidence.
  const openPoints = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auditflow_review_points WHERE engagement_id = ?1 AND state = 'OPEN'`,
  ).bind(id).first();
  if (Number(openPoints?.n || 0) > 0) return error(request, 'Unresolved review points were added after checkpointing. Reconcile them before delivery.', 409, 'REVIEW_POINTS_OPEN');
  if (strictCommand) {
    const generations = await readAccountingGenerations(env, id);
    if (Number(release.input_generation || 1) !== Number(generations.input)) return error(request, 'Accounting input changed after release checkpointing. Re-evaluate the file before delivery.', 409, 'ACCOUNTING_INPUT_STALE');
    const opinion = await latestDecision(env, id, 'AUDIT_OPINION');
    if (!opinion || opinion.object_version !== release.object_version) return error(request, 'The audit opinion no longer matches the released candidate.', 409, 'OPINION_VERSION_MISMATCH');
  }
  const artifacts = await env.DB.prepare(
    `SELECT document_id, document_type, version, state, visibility FROM auditflow_artifacts
      WHERE engagement_id = ?1 AND document_type IN ('FINAL_REPORT', 'FINAL_FS') AND state = 'PUBLISHED'
      ORDER BY created_at DESC LIMIT 100`,
  ).bind(id).all();
  const rows = artifacts.results || [];
  const report = rows.find((row) => row.document_type === 'FINAL_REPORT' && row.version === release.object_version);
  const fs = rows.find((row) => row.document_type === 'FINAL_FS' && row.version === release.object_version);
  if (!report || !fs) return error(request, 'The exact checkpointed final report and financial-statement pair is missing.', 409, 'ARTIFACT_PAIR_REQUIRED');
  if (strictCommand && (report.visibility === 'CLIENT_VISIBLE' && fs.visibility === 'CLIENT_VISIBLE')) {
    // A previous delivery may have been committed without its receipt. Return
    // a stable result rather than emitting another notification.
    return json(request, { ok: true, duplicate: true, deliveryId: existing?.decision_id || `delivery-${release.decision_id}`, releaseId: release.decision_id, reportId: report.document_id, fsId: fs.document_id, targetVersion: release.object_version, evidenceLevel: 'SIMULATION' });
  }
  await env.DB.prepare(
    `UPDATE auditflow_artifacts SET visibility = 'CLIENT_VISIBLE' WHERE engagement_id = ?1 AND document_id IN (?2, ?3) AND document_type IN ('FINAL_REPORT', 'FINAL_FS') AND version = ?4`,
  ).bind(id, report.document_id, fs.document_id, release.object_version).run();
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const deliveryId = `DLV-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const note = cleanText(payload.note || payload.rationale, MAX_CONTEXT_LENGTH, '') || `Delivered ${report.document_id} + ${fs.document_id} for release ${release.decision_id}.`;
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
      VALUES (?1, ?2, 'DELIVERY', ?3, 'DELIVERED', ?4, ?5, ?6, ?7)`,
  ).bind(deliveryId, id, release.object_version, session.actorId, note, Number(engagement.revision || 1) + 1, Number(release.input_generation || 1)).run();
  await env.DB.prepare(
    `INSERT INTO auditflow_outbox (message_id, engagement_id, channel, recipient, subject, related_type, related_id, state)
      VALUES (?1, ?2, 'PORTAL_NOTIFICATION', 'client', ?3, 'delivery', ?4, 'SENT_SIMULATION')`,
  ).bind(crypto.randomUUID(), id, `Final report ${release.object_version} is available`, deliveryId).run();
  const next = await touchEngagement(env, id, 'STAGE-08');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'FINAL_REPORT_DELIVERED', objectType: 'delivery', objectId: deliveryId, previousRevision: engagement.revision, newRevision: next?.revision || engagement.revision + 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, deliveryId, releaseId: release.decision_id, reportId: report.document_id, fsId: fs.document_id, targetVersion: release.object_version, engagement: serializeEngagementState(next), evidenceLevel: 'SIMULATION' }, 201);
}

async function latestDecision(env, engagementId, type) {
  return env.DB.prepare(
    `SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 AND decision_type = ?2 ORDER BY revision DESC, decided_at DESC, decision_id DESC LIMIT 1`,
  ).bind(engagementId, type).first();
}

async function actionReleaseFinalReport(request, env, session, id, payload, correlationId, tx) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can release the final report.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  const requestedTargetId = strictCommand ? String(payload.targetId || '').trim() : '';
  const existing = await latestDecision(env, id, 'RELEASE');
  if (existing) {
    // The engagement id remains a compatibility target for older callers,
    // while strict callers may bind directly to the candidate/release record.
    // Never acknowledge a different candidate as an idempotent duplicate.
    if (strictCommand && requestedTargetId
      && ![id, existing.object_version, existing.decision_id].includes(requestedTargetId)) {
      return error(request, `Release target ${requestedTargetId} does not match the current release candidate.`, 409, 'RELEASE_TARGET_MISMATCH');
    }
    return json(request, { ok: true, duplicate: true, releaseId: existing.decision_id, evidenceLevel: 'SIMULATION' });
  }
  const opinion = await latestDecision(env, id, 'AUDIT_OPINION');
  if (!opinion) return error(request, 'Form the audit opinion before releasing the final report.', 409, 'PRECONDITION_FAILED');
  const eqr = await latestDecision(env, id, 'EQR');
  if (!eqr || eqr.decision !== 'APPROVE') {
    return error(request, 'Required EQR is incomplete. Release is blocked until EQR approves.', 409, 'EQR_INCOMPLETE');
  }
  const releaseEngagement = await readEngagementRow(env, id);
  if (!releaseEngagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const openPoints = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auditflow_review_points WHERE engagement_id = ?1 AND state = 'OPEN'`,
  ).bind(id).first();
  if (Number(openPoints?.n || 0) > 0) {
    return error(request, 'Unresolved review points block release. Clear or return each open point first.', 409, 'REVIEW_POINTS_OPEN');
  }
  const candidateVersion = opinion.object_version;
  if (strictCommand && requestedTargetId
    && ![id, candidateVersion, opinion.decision_id].includes(requestedTargetId)) {
    return error(request, `Release target ${requestedTargetId} does not match the current Draft FS candidate ${candidateVersion}.`, 409, 'RELEASE_TARGET_MISMATCH');
  }
  const latestDraft = await latestPublishedDraftFs(env, id);
  const generations = await readAccountingGenerations(env, id);
  const manager = await latestDecision(env, id, 'MANAGER_COMPLETION');
  const partnerReview = await latestDecision(env, id, 'PARTNER_COMPLETION_REVIEW');
  const draftResponse = await latestDecision(env, id, 'DRAFT_FS');
  const discussion = await latestDecision(env, id, 'FINAL_CLIENT_DISCUSSION');
  const managerCurrent = Boolean(manager && manager.decision === 'RECOMMEND_COMPLETE' && Number(manager.input_generation || 1) >= generations.input);
  const partnerCurrent = Boolean(partnerReview && partnerReview.decision === 'APPROVE_FOR_OPINION' && Number(partnerReview.input_generation || 1) >= generations.input);
  const opinionCurrent = Boolean(latestDraft && opinion.object_version === latestDraft.version);
  const draftCurrent = Boolean(latestDraft && draftResponse && draftResponse.decision === 'ACCEPT' && draftResponse.object_version === latestDraft.version);
  const inputCurrent = generations.evaluated === generations.input;
  const releaseChecks = [
    { id: 'input-current', label: 'Accounting input generation current (g' + generations.input + ')', pass: inputCurrent, detail: 'Audit evaluated g' + generations.evaluated, code: 'ACCOUNTING_INPUT_STALE' },
    { id: 'manager-completion', label: 'Manager completion recommendation', pass: managerCurrent, detail: manager ? manager.decision + ' at g' + (manager.input_generation || 1) : 'Not recorded', code: Number(manager?.input_generation || 1) < generations.input ? 'MANAGER_COMPLETION_STALE' : 'MANAGER_COMPLETION_REQUIRED' },
    { id: 'partner-review', label: 'Partner completion review', pass: partnerCurrent, detail: partnerReview ? partnerReview.decision + ' at g' + (partnerReview.input_generation || 1) : 'Not recorded', code: Number(partnerReview?.input_generation || 1) < generations.input ? 'PARTNER_REVIEW_STALE' : 'PARTNER_REVIEW_REQUIRED' },
    { id: 'opinion-final', label: 'Audit opinion bound to final FS ' + (latestDraft ? latestDraft.version : '(none)'), pass: opinionCurrent, detail: 'Opinion binds to ' + (opinion.object_version || 'no version'), code: 'OPINION_VERSION_MISMATCH' },
    { id: 'eqr', label: 'EQR approved', pass: true, detail: 'Approved', code: 'EQR_INCOMPLETE' },
    { id: 'draft-response', label: 'Client response current', pass: draftCurrent, detail: draftResponse ? draftResponse.decision + ' on ' + (draftResponse.object_version || 'no version') : 'No response', code: 'DRAFT_NOT_ACCEPTED' },
    { id: 'review-points', label: 'No open review points', pass: true, detail: 'Clear', code: 'REVIEW_POINTS_OPEN' },
    { id: 'opinion-current', label: 'Opinion evaluated the current input', pass: Boolean(opinion && Number(opinion.input_generation || 1) >= generations.input), detail: 'Opinion evaluated g' + (Number(opinion?.input_generation || 1)), code: 'OPINION_STALE_INPUT' },
    { id: 'final-discussion', label: 'Final client discussion recorded', pass: Boolean(discussion) && Number(discussion?.input_generation || 1) >= generations.input, detail: discussion ? 'Recorded ' + (discussion.object_version || '') + ' at g' + (discussion.input_generation || 1) : 'Not recorded', code: !discussion ? 'FINAL_DISCUSSION_REQUIRED' : 'FINAL_DISCUSSION_STALE' },
  ];
  if (strictCommand) {
    // Strict M7 release is a real handoff, not a shortcut around the ordinary
    // portal records. Bind every prerequisite to the exact current candidate
    // and input generation before creating the release event.
    const pbcRows = (await env.DB.prepare('SELECT state FROM auditflow_pbc_requests WHERE engagement_id = ?1').bind(id).all()).results || [];
    const strictChecks = [
      { code: 'CANDIDATE_REQUIRED', ok: Boolean(latestDraft && candidateVersion === latestDraft.version), message: 'The opinion must name the current Draft FS candidate.' },
      { code: 'EQR_CANDIDATE_MISMATCH', ok: Boolean(eqr.object_version === candidateVersion), message: 'EQR must approve the exact candidate named by the opinion.' },
      { code: 'EQR_STALE_INPUT', ok: Number(eqr.input_generation || 1) === generations.input, message: 'EQR must evaluate the current accounting input generation.' },
      { code: 'OPINION_STALE_INPUT', ok: Number(opinion.input_generation || 1) === generations.input, message: 'The opinion must evaluate the current accounting input generation.' },
      { code: 'DRAFT_NOT_ACCEPTED', ok: draftCurrent, message: 'Management must accept the current Draft FS candidate.' },
      { code: 'MANAGER_COMPLETION_REQUIRED', ok: managerCurrent, message: 'The current manager completion recommendation is required.' },
      { code: 'PARTNER_REVIEW_REQUIRED', ok: partnerCurrent, message: 'The current partner completion review is required.' },
      { code: 'FINAL_DISCUSSION_REQUIRED', ok: Boolean(discussion) && Number(discussion.input_generation || 1) === generations.input, message: 'The final client discussion must be current.' },
      { code: 'ACCOUNTING_INPUT_STALE', ok: inputCurrent, message: 'Audit must evaluate the current accounting input.' },
      { code: 'PBC_NOT_EVALUATED', ok: pbcRows.length > 0 && pbcRows.every((row) => String(row.state || '').toUpperCase() === 'ACCEPTED'), message: 'Every information request must be accepted.' },
    ];
    const failedStrict = strictChecks.find((check) => !check.ok);
    if (failedStrict) return error(request, `Release blocked: ${failedStrict.message}`, 409, failedStrict.code);
    const submitted = await env.DB.prepare('SELECT COUNT(*) AS n FROM auditflow_workpapers WHERE engagement_id = ?1 AND state = ?2').bind(id, 'SUBMITTED').first();
    if (!Number(submitted?.n || 0)) return error(request, 'At least one submitted workpaper is required before release.', 409, 'NO_SUBMITTED_WORKPAPERS');
  }
  const failedCheck = releaseChecks.find((check) => !check.pass);
  if (failedCheck) {
    const checkCorrelationId = requestCorrelationId(request);
    return json(request, { ok: false, checks: releaseChecks, error: { code: failedCheck.code, message: 'Release blocked: ' + failedCheck.label + ' — ' + failedCheck.detail + '.', correlationId: checkCorrelationId }, evidenceLevel: 'SIMULATION' }, 409, checkCorrelationId);
  }
  const releaseId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  const fsId = crypto.randomUUID();
  const releaseRevision = Number(releaseEngagement.revision || 1) + 1;
  const artifactVisibility = strictCommand ? 'INTERNAL' : 'CLIENT_VISIBLE';
  if (tx) {
    const reportContent = JSON.stringify({ schemaVersion: 'M7-FINAL-REPORT-1', documentType: 'FINAL_REPORT', releaseId, engagementId: id, candidateVersion, opinion: opinion.decision, generatedFor: 'synthetic-demo' });
    const fsContent = JSON.stringify({ schemaVersion: 'M7-FINAL-FS-1', documentType: 'FINAL_FS', releaseId, engagementId: id, candidateVersion, reportingPeriod: releaseEngagement.period, currency: 'QAR', generatedFor: 'synthetic-demo' });
    tx.setFallbackEffects([
      { sql: `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
          VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', ?3, 'PUBLISHED', ?4, ?5, datetime('now'))`, params: [reportId, id, candidateVersion, artifactVisibility, session.actorId] },
      { sql: `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
          VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', ?5, ?6, datetime('now'))`, params: [fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, artifactVisibility, session.actorId] },
    ]);
    tx.setDecision({
      id: releaseId,
      type: 'RELEASE',
      objectVersion: candidateVersion,
      value: 'RELEASED',
      rationale: cleanText(payload.rationale, MAX_CONTEXT_LENGTH) || '',
      inputGeneration: generations.input,
      rowRevision: releaseRevision,
      eventAction: 'FINAL_RELEASED',
      eventObjectType: 'decision',
      eventObjectId: releaseId,
      resultExtras: { releaseId, reportId, fsId, candidateVersion, duplicate: false },
    });
    tx.setStage('STAGE-08');
    tx.addEffect({ sql: `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at, content_json, release_id)
        VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', ?3, 'PUBLISHED', ?4, ?5, datetime('now'), ?6, ?7)`, params: [reportId, id, candidateVersion, artifactVisibility, session.actorId, reportContent, releaseId] });
    tx.addEffect({ sql: `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at, content_json, release_id)
        VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', ?5, ?6, datetime('now'), ?7, ?8)`, params: [fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, artifactVisibility, session.actorId, fsContent, releaseId] });
    tx.addEffect({ sql: `INSERT INTO auditflow_decision_targets
        (decision_id, generation_id, engagement_id, target_id, target_revision, content_hash, input_generation, policy_version)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (decision_id) DO NOTHING`, params: [releaseId, releaseEngagement.generation_id, id, fsId, releaseRevision, `${reportId}:${fsId}:${candidateVersion}`, generations.input, 'M7-RELEASE-2026-09'] });
    tx.addEffect(taskUpsertStatement({ taskId: `invoice-${id}`, engagementId: id, assigneeRole: 'finance_team', title: 'Generate final invoice', state: 'OPEN', linkedObjectType: 'decision', linkedObjectId: releaseId }));
    return json(request, { ok: true, duplicate: false, releaseId, reportId, fsId, candidateVersion, checks: releaseChecks, engagement: serializeEngagementState({ ...releaseEngagement, revision: releaseRevision, current_stage: 'STAGE-08' }), evidenceLevel: 'SIMULATION' }, 201);
  }
  if (strictCommand) {
    const reportContent = JSON.stringify({ schemaVersion: 'M7-FINAL-REPORT-1', documentType: 'FINAL_REPORT', releaseId, engagementId: id, candidateVersion, opinion: opinion.decision, generatedFor: 'synthetic-demo' });
    const fsContent = JSON.stringify({ schemaVersion: 'M7-FINAL-FS-1', documentType: 'FINAL_FS', releaseId, engagementId: id, candidateVersion, reportingPeriod: releaseEngagement.period, currency: 'QAR', generatedFor: 'synthetic-demo' });
    try {
      await env.DB.prepare(
        `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at, content_json, release_id)
          VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', ?3, 'PUBLISHED', ?4, ?5, datetime('now'), ?6, ?7)`,
      ).bind(reportId, id, candidateVersion, artifactVisibility, session.actorId, reportContent, releaseId).run();
      await env.DB.prepare(
        `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at, content_json, release_id)
          VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', ?5, ?6, datetime('now'), ?7, ?8)`,
      ).bind(fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, artifactVisibility, session.actorId, fsContent, releaseId).run();
    } catch (artifactError) {
      // Older installations can receive the strict release before migration
      // 0009.  The exact IDs/version/visibility remain enforced; content is
      // simply unavailable until the additive column is applied.
      if (!/no such column|unknown column|content_json|release_id/i.test(String(artifactError?.message || artifactError))) throw artifactError;
      await env.DB.prepare(
        `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
          VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', ?3, 'PUBLISHED', ?4, ?5, datetime('now'))`,
      ).bind(reportId, id, candidateVersion, artifactVisibility, session.actorId).run();
      await env.DB.prepare(
        `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
          VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', ?5, ?6, datetime('now'))`,
      ).bind(fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, artifactVisibility, session.actorId).run();
    }
  } else {
    // Keep the legacy fixture SQL/parameter order stable for existing demo
    // walkthroughs and their compatibility tests.
    await env.DB.prepare(
      `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
       VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', 'v01', 'PUBLISHED', 'CLIENT_VISIBLE', ?3, datetime('now'))`,
    ).bind(reportId, id, session.actorId).run();
    await env.DB.prepare(
      `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
       VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', 'CLIENT_VISIBLE', ?5, datetime('now'))`,
    ).bind(fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, session.actorId).run();
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision, input_generation)
      VALUES (?1, ?2, 'RELEASE', ?3, 'RELEASED', ?4, ?5, ?6, ?7)`,
  ).bind(releaseId, id, candidateVersion, session.actorId, cleanText(payload.rationale, MAX_CONTEXT_LENGTH) || '', strictCommand ? releaseRevision : 1, generations.input).run();
  if (strictCommand) {
    await env.DB.prepare(
      `INSERT INTO auditflow_decision_targets
        (decision_id, generation_id, engagement_id, target_id, target_revision, content_hash, input_generation, policy_version)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (decision_id) DO NOTHING`,
    ).bind(releaseId, releaseEngagement.generation_id, id, fsId, releaseRevision, `${reportId}:${fsId}:${candidateVersion}`, generations.input, 'M7-RELEASE-2026-09').run();
  }
  await upsertTask(env, { taskId: `invoice-${id}`, engagementId: id, assigneeRole: 'finance_team', title: 'Generate final invoice', state: 'OPEN', linkedObjectType: 'decision', linkedObjectId: releaseId });
  const engagement = await touchEngagement(env, id, 'STAGE-08');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'FINAL_RELEASED', objectType: 'decision', objectId: releaseId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, releaseId, reportId, fsId, candidateVersion, checks: releaseChecks, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCreateInvoice(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['finance_team'])) {
    return error(request, 'Only the Finance demo persona can generate the invoice.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const strictCommand = isStrictCommandPayload(payload);
  const release = await latestDecision(env, id, 'RELEASE');
  if (!release) return error(request, 'Release the final report before generating the invoice.', 409, 'PRECONDITION_FAILED');
  const actualHours = cleanHours(payload.actualHours);
  const actualCost = cleanMoney(payload.actualCost);
  if (!actualHours || !actualCost) return error(request, 'Provide actualHours (whole hours) and actualCost as a base-10 money value.');
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  const requestedTargetId = strictCommand ? String(payload.targetId || '').trim() : '';
  if (strictCommand && requestedTargetId
    && ![id, release.decision_id, release.object_version, commercial?.invoice_id || ''].includes(requestedTargetId)) {
    return error(request, `Invoice target ${requestedTargetId} does not match the released candidate.`, 409, 'INVOICE_TARGET_MISMATCH');
  }
  const feeCents = moneyToCents(commercial?.approved_fee || '');
  const advanceCents = moneyToCents(commercial?.advance_required || '0.00');
  if (feeCents == null || advanceCents == null) return error(request, 'The commercial record has no approved fee yet.', 409, 'PRECONDITION_FAILED');

  // A second key must not issue a second invoice or enqueue another set of
  // messages.  The command-receipt path catches normal retries; this durable
  // business-identity guard covers a receipt outage and makes invoice replay
  // safe across tabs and sessions.
  if (strictCommand && commercial?.invoice_state === 'ISSUED' && commercial?.invoice_id) {
    const allocated = ['VERIFIED', 'ALLOCATED'].includes(String(commercial.advance_state || '').toUpperCase()) ? advanceCents : 0;
    // Reconcile a lost response or a partial provider failure without
    // emitting another notification. The commercial identity is durable;
    // each simulated channel is a separate idempotent delivery intent.
    const subject = `Invoice ${commercial.invoice_id}: balance ${centsToMoney(feeCents - allocated)} QAR (simulation)`;
    const channels = ['EMAIL', 'WHATSAPP', 'PORTAL_NOTIFICATION'];
    const existingMessages = await env.DB.prepare(
      `SELECT channel FROM auditflow_outbox
       WHERE engagement_id = ?1 AND related_type = 'invoice' AND related_id = ?2`,
    ).bind(id, commercial.invoice_id).all();
    const present = new Set((existingMessages.results || []).map((row) => String(row.channel || '').toUpperCase()));
    for (const channel of channels) {
      if (present.has(channel)) continue;
      await env.DB.prepare(
        `INSERT INTO auditflow_outbox (message_id, engagement_id, channel, recipient, subject, related_type, related_id, state)
         VALUES (?1, ?2, ?3, 'client', ?4, 'invoice', ?5, 'QUEUED_SIMULATION')`,
      ).bind(crypto.randomUUID(), id, channel, subject, commercial.invoice_id).run();
    }
    return json(request, {
      ok: true,
      duplicate: true,
      invoiceId: commercial.invoice_id,
      balance: centsToMoney(feeCents - allocated),
      advanceApplied: centsToMoney(allocated),
      advanceAllocated: centsToMoney(allocated),
      advanceRequired: centsToMoney(advanceCents),
      actualsBasis: 'ENTERED_SUMMARY',
      commercial,
      evidenceLevel: 'SIMULATION',
    });
  }

  if (strictCommand) {
    // Required advances are deducted only when the persisted commercial
    // record says they were actually verified/allocated.  An unverified
    // requirement remains a payable balance; it is never treated as cash.
    const advanceState = String(commercial?.advance_state || '').toUpperCase();
    const advanceAllocated = ['VERIFIED', 'ALLOCATED'].includes(advanceState) ? advanceCents : 0;
    if (advanceAllocated > feeCents) return error(request, 'The allocated advance cannot exceed the approved fee.', 409, 'ADVANCE_EXCEEDS_FEE');
    const balance = centsToMoney(feeCents - advanceAllocated);
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const engagementSuffix = id.replace(/[^0-9A-Z]/gi, '').slice(-8).toUpperCase() || 'ENG';
    const invoiceId = `INV-2026-${engagementSuffix}-${Date.now().toString(36).toUpperCase()}-${suffix}`;
    let invoiceUpdate;
    try {
      invoiceUpdate = await env.DB.prepare(
        `UPDATE auditflow_commercial SET actual_hours = ?2, actual_cost = ?3, invoice_id = ?4, invoice_state = 'ISSUED',
           advance_allocated = ?5, actuals_basis = 'ENTERED_SUMMARY', release_id = ?6,
           revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1 AND invoice_state <> 'ISSUED'`,
      ).bind(id, actualHours, actualCost, invoiceId, centsToMoney(advanceAllocated), release.decision_id).run();
    } catch (invoiceError) {
      // The finance/content columns are additive.  Keep strict commands
      // compatible during a rolling migration while still applying the
      // non-overwrite invoice guard.
      if (!/no such column|unknown column|advance_allocated|actuals_basis|release_id/i.test(String(invoiceError?.message || invoiceError))) throw invoiceError;
      invoiceUpdate = await env.DB.prepare(
        `UPDATE auditflow_commercial SET actual_hours = ?2, actual_cost = ?3, invoice_id = ?4, invoice_state = 'ISSUED',
           revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1 AND invoice_state <> 'ISSUED'`,
      ).bind(id, actualHours, actualCost, invoiceId).run();
    }
    if (invoiceUpdate?.meta && Number(invoiceUpdate.meta.changes) === 0) {
      const current = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
      if (current?.invoice_state === 'ISSUED' && current.invoice_id) {
        const allocated = ['VERIFIED', 'ALLOCATED'].includes(String(current.advance_state || '').toUpperCase()) ? advanceCents : 0;
        return json(request, { ok: true, duplicate: true, invoiceId: current.invoice_id, balance: centsToMoney(feeCents - allocated), advanceApplied: centsToMoney(allocated), advanceAllocated: centsToMoney(allocated), actualsBasis: 'ENTERED_SUMMARY', commercial: current, evidenceLevel: 'SIMULATION' });
      }
      return error(request, 'The commercial record changed before the invoice could be issued. Reconcile and retry the same command.', 409, 'REVISION_CONFLICT');
    }
    const subject = `Invoice ${invoiceId}: balance ${balance} QAR (simulation)`;
    for (const channel of ['EMAIL', 'WHATSAPP', 'PORTAL_NOTIFICATION']) {
      await env.DB.prepare(
        `INSERT INTO auditflow_outbox (message_id, engagement_id, channel, recipient, subject, related_type, related_id, state)
         VALUES (?1, ?2, ?3, 'client', ?4, 'invoice', ?5, 'QUEUED_SIMULATION')`,
      ).bind(crypto.randomUUID(), id, channel, subject, invoiceId).run();
    }
    await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`invoice-${id}`).run();
    const engagement = await touchEngagement(env, id, null);
    await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'INVOICE_ISSUED', objectType: 'invoice', objectId: invoiceId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
    const updated = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
    return json(request, {
      ok: true,
      duplicate: false,
      invoiceId,
      balance,
      advanceApplied: centsToMoney(advanceAllocated),
      advanceAllocated: centsToMoney(advanceAllocated),
      advanceRequired: centsToMoney(advanceCents),
      actualsBasis: 'ENTERED_SUMMARY',
      commercial: updated || null,
      engagement: serializeEngagementState(engagement),
      evidenceLevel: 'SIMULATION',
    }, 201);
  }

  // Legacy/local compatibility path.  Keep its fixed fixture arithmetic and
  // response shape while migrated clients use the strict branch above.
  const balance = centsToMoney(feeCents - advanceCents);
  const invoiceId = `INV-2026-${id.replace(/[^0-9]/g, '').slice(-4) || '0018'}`;
  await env.DB.prepare(
    `UPDATE auditflow_commercial SET actual_hours = ?2, actual_cost = ?3, invoice_id = ?4, invoice_state = 'ISSUED',
       revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1`,
  ).bind(id, actualHours, actualCost, invoiceId).run();
  const subject = `Invoice ${invoiceId}: balance ${balance} QAR (simulation)`;
  for (const channel of ['EMAIL', 'WHATSAPP', 'PORTAL_NOTIFICATION']) {
    await env.DB.prepare(
      `INSERT INTO auditflow_outbox (message_id, engagement_id, channel, recipient, subject, related_type, related_id, state)
       VALUES (?1, ?2, ?3, 'client', ?4, 'invoice', ?5, 'QUEUED_SIMULATION')`,
    ).bind(crypto.randomUUID(), id, channel, subject, invoiceId).run();
  }
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`invoice-${id}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'INVOICE_ISSUED', objectType: 'invoice', objectId: invoiceId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  const updated = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  return json(request, { ok: true, invoiceId, balance, commercial: updated || null, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCloseEngagement(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['finance_team'])) {
    return error(request, 'Only the Finance demo persona can close the commercial record.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  if (!commercial || commercial.invoice_state !== 'ISSUED') return error(request, 'Generate the final invoice before closing the commercial record.', 409, 'PRECONDITION_FAILED');
  if (commercial.commercial_close === 'CLOSED') return json(request, { ok: true, duplicate: true, commercial: commercial || null, activationState: 'CLOSED', evidenceLevel: 'SIMULATION' });
  await env.DB.prepare(`UPDATE auditflow_commercial SET commercial_close = 'CLOSED', revision = revision + 1, updated_at = datetime('now') WHERE engagement_id = ?1`).bind(id).run();
  await env.DB.prepare(`UPDATE auditflow_engagement_state SET g_status = json_set(COALESCE(g_status, '{}'), '$.commercialClose', 'CLOSED') WHERE engagement_id = ?1`).bind(id).run();
  const engagement = await touchEngagement(env, id, 'STAGE-08');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ENGAGEMENT_CLOSED', objectType: 'commercial', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  const updated = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  return json(request, { ok: true, duplicate: false, commercial: updated || null, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

async function readCommandReceipt(env, { generationId, engagementId, actorId, idempotencyKey } = {}) {
  if (!generationId || !engagementId || !actorId || !idempotencyKey) return null;
  try {
    return await env.DB.prepare(
      `SELECT command_id, request_digest, result_json, claimed_revision
       FROM auditflow_command_receipts
       WHERE generation_id = ?1 AND engagement_id = ?2 AND actor_id = ?3 AND idempotency_key = ?4`,
    ).bind(generationId, engagementId, actorId, idempotencyKey).first();
  } catch { return null; }
}

// Receipts are durable audit metadata, not a secret store.  A strict
// credential command may return a one-time synthetic password to the caller
// that initiated it, but that value must never be persisted for replay,
// inspection, or event projection.  Keep this allow-list style scrub small so
// business results remain inspectable while secret-like fields are removed.
function receiptSafeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const scrub = (value, key = '') => {
    if (value == null || typeof value !== 'object') return value;
    if (/password|token|secret/i.test(key)) return undefined;
    if (Array.isArray(value)) return value.map((item) => scrub(item)).filter((item) => item !== undefined);
    const copy = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const cleaned = scrub(childValue, childKey);
      if (cleaned !== undefined) copy[childKey] = cleaned;
    }
    return copy;
  };
  const safe = scrub(result) || {};
  if (result.temporaryPassword) safe.temporaryPasswordIssued = true;
  return safe;
}

async function persistCommandReceipt(env, command, result) {
  if (!command?.idempotencyKey || !command?.requestDigest || !result) return;
  try {
    await env.DB.prepare(
      `INSERT INTO auditflow_command_receipts
        (command_id, generation_id, engagement_id, actor_id, idempotency_key, request_digest, result_json, claimed_revision, view_id, parent_session_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT (generation_id, engagement_id, actor_id, idempotency_key) DO NOTHING`,
    ).bind(command.commandId, command.generationId, command.engagementId, command.actorId, command.idempotencyKey, command.requestDigest, JSON.stringify(receiptSafeResult(result)), Number(result.revision || command.expectedRevision || 1), command.viewId || '', command.parentSessionId || '').run();
  } catch { /* Legacy action remains usable if migration is not present. */ }
}

async function responseJson(response) {
  try { return await response.clone().json(); } catch { return null; }
}

// M7 PIPE-F11 — guarded completion-chain actions commit atomically through
// worker/repositories/decisionBatch.js when the strict command carries a
// workspace view. Handlers either collect statements into this sink (batch
// mode) or keep the sequential legacy writes (live mode).
const DECISION_BATCH_ACTIONS = new Set([
  'RECORD_MANAGER_COMPLETION',
  'RECORD_PARTNER_REVIEW',
  'RECORD_FINAL_DISCUSSION',
  'RECORD_AUDIT_OPINION',
  'COMPLETE_EQR',
  'RELEASE_FINAL_REPORT',
  'VERIFY_RELEASE_CHECKPOINT',
  'ASSEMBLE_ARCHIVE',
]);

function createDecisionTx(command) {
  return {
    command,
    nextRevision: command.expectedRevision + 1,
    stage: '',
    decision: null,
    effects: [],
    fallbackEffects: null,
    setDecision(decision) { this.decision = decision; },
    addEffect(statement) { this.effects.push(statement); },
    setFallbackEffects(statements) { this.fallbackEffects = statements; },
    setStage(stage) { this.stage = stage; },
  };
}

function unconfirmedOutcome(request, command, engagementId, actorId, correlationId) {
  return json(request, {
    ok: false,
    outcome: 'UNCERTAIN',
    code: 'COMMIT_UNCONFIRMED',
    message: 'The command outcome could not be confirmed. Reconcile or retry the same idempotency key.',
    commandId: command.commandId,
    engagementId,
    generationId: command.generationId,
    actorId,
    revision: command.expectedRevision,
    evidenceLevel: 'SIMULATION',
  }, 503, correlationId);
}

function decisionBatchResponse(request, body, command, result, status, correlationId) {
  if (result.outcome === 'REJECTED') {
    return error(request, result.message || 'The record changed before this command could commit.', 409, result.code || 'REVISION_OR_GENERATION_CONFLICT');
  }
  if (result.replayed) return json(request, { ...body, ...result, replayed: true, evidenceLevel: 'SIMULATION' }, 200, correlationId);
  return json(request, {
    ...body,
    outcome: 'COMMITTED',
    commandId: command.commandId,
    engagementId: command.engagementId,
    generationId: command.generationId,
    actorId: command.actorId,
    revision: command.expectedRevision + 1,
  }, status, correlationId);
}

async function commitDecisionBatch(request, env, command, tx, handlerResponse, correlationId) {
  const body = await responseJson(handlerResponse);
  if (!body?.ok || !tx.decision) return null; // rejections and duplicates keep the generic receipt path
  const run = (effects) => executeDecisionBatch(
    env.DB,
    { ...command, correlationId: correlationId || '' },
    { ...tx.decision, stage: tx.stage || undefined },
    [],
    effects,
  );
  try {
    return decisionBatchResponse(request, body, command, await run(tx.effects), handlerResponse.status, correlationId);
  } catch (batchError) {
    // Migration 0009 columns may be absent on older installations. Retry the
    // same atomic commit once with the legacy artifact shape before failing
    // uncertain; the batch is all-or-nothing so nothing is half-applied.
    if (tx.fallbackEffects && /no such column|unknown column|content_json|release_id/i.test(String(batchError?.message || batchError))) {
      try {
        return decisionBatchResponse(request, body, command, await run(tx.fallbackEffects), handlerResponse.status, correlationId);
      } catch { /* fall through to the uncertain outcome */ }
    }
    throw batchError;
  }
}

async function resolveEffectiveActionSession(request, env, session, engagementId) {
  const viewId = readViewId(request);
  if (!viewId) return { session, view: null };
  const view = await readDemoView(env, session, viewId);
  if (!view) return { response: error(request, 'The workspace view is not active for this session.', 409, 'VIEW_CONTEXT_INVALID') };
  if (view.engagement_id !== engagementId) return { response: error(request, 'The workspace view is scoped to another engagement.', 409, 'VIEW_SCOPE_CONFLICT') };
  const expected = request.headers.get('X-AuditFlow-Context-Version');
  if (expected && Number(expected) !== Number(view.context_version)) return { response: error(request, 'The workspace context changed; reload before acting.', 409, 'CONTEXT_VERSION_CONFLICT') };
  return { session: effectiveSessionForView(view, session), view };
}

async function dispatchEngagementAction(request, env, engagementId) {
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED');
  const parentSession = await resolveDemoSession(request, env);
  if (!parentSession) return error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED');
  const resolved = await resolveEffectiveActionSession(request, env, parentSession, id);
  if (resolved.response) return resolved.response;
  const session = resolved.session;
  if (!canWriteClientSession(session)) return error(request, 'Open an invitation link before submitting client actions.', 403, 'INVITATION_REQUIRED');
  if (!(await isAssignedToEngagement(env, session, id))) {
    return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  }
  // The migrated client sends the strict envelope. Keep the legacy shape
  // temporarily for older prototype pages and direct compatibility tests,
  // but never treat an envelope as a business payload.
  let envelope;
  const commandHeader = String(request.headers.get('X-AuditFlow-Command') || '').trim().toLowerCase();
  if (commandHeader === 'v1') {
    try { envelope = await readCommandEnvelope(request, SHARED_ACTION_SET); }
    catch (inputError) { return error(request, inputError.message, inputError.status || 400, inputError.code || 'COMMAND_INVALID'); }
  } else {
    envelope = await readJson(request);
  }
  if (!envelope) return error(request, 'Send a JSON object in the request body.');
  const strictEnvelope = commandHeader === 'v1' || Object.hasOwn(envelope, 'payload');
  if (strictEnvelope && commandHeader !== 'v1') {
    const checkedEnvelope = validateCommandEnvelope(envelope, SHARED_ACTION_SET);
    if (!checkedEnvelope.ok) return error(request, checkedEnvelope.message, 400, checkedEnvelope.code);
    envelope = checkedEnvelope.value;
  }
  const payload = strictEnvelope
    ? { ...(envelope.payload || {}), action: envelope.action, idempotencyKey: envelope.idempotencyKey,
      expectedRevision: envelope.expectedRevision, expectedGenerationId: envelope.expectedGenerationId,
      expectedContextVersion: envelope.expectedContextVersion, targetId: envelope.targetId, __strictCommand: true }
    : envelope;
  const action = String(envelope.action || '').trim();
  if (!/^[A-Z][A-Z0-9_]{2,59}$/.test(action)) return error(request, 'Provide a valid workflow action name.');
  // Strict commands use the same positive role registry that shapes the
  // workspace action list.  Individual handlers still repeat their checks as
  // a defence-in-depth boundary, while legacy prototype payloads retain their
  // compatibility path until callers migrate to the v1 envelope.
  if (strictEnvelope && !actionAllowed(action, session.roles || [])) {
    return error(request, `The ${session.personaId || 'current'} demo persona is not allowed to perform ${action}.`, 403, 'ROLE_NOT_AUTHORIZED');
  }
  if (strictEnvelope) {
    const payloadValidation = validateActionPayload(action, payload);
    if (!payloadValidation.ok) return error(request, payloadValidation.message, 400, payloadValidation.code);
  }
  const correlationId = requestCorrelationId(request);
  let command = null;
  if (strictEnvelope || payload.targetId || payload.expectedGenerationId || payload.expectedContextVersion) {
    const current = await readEngagementRow(env, id);
    const valid = validateCommandEnvelope({
      action,
      targetId: String(envelope.targetId || payload.linkedObjectId || id),
      payload: strictEnvelope ? envelope.payload : payload,
      idempotencyKey: String(envelope.idempotencyKey || ''),
      expectedGenerationId: String(envelope.expectedGenerationId || current?.generation_id || ''),
      expectedRevision: Number(envelope.expectedRevision),
      expectedContextVersion: Number(envelope.expectedContextVersion || resolved.view?.context_version || 1),
    }, SHARED_ACTION_SET);
    if (!valid.ok) return error(request, valid.message, 400, valid.code);
    const requestDigest = await sha256Hex(JSON.stringify(envelope));
    // Keep the command's expected revision immutable.  A replay is a valid
    // operation even after a later command has advanced the aggregate; the
    // receipt lookup therefore happens before the optimistic revision guard.
    // Reset/generation changes still fail closed before this lookup.
    if (!current || current.generation_id !== valid.value.expectedGenerationId) return error(request, 'The command targets an older demo generation.', 409, 'GENERATION_CONFLICT');
    if (resolved.view && resolved.view.generation_id !== current.generation_id) return error(request, 'The workspace view targets an older demo generation.', 409, 'RESET_REQUIRED');
    command = { commandId: `cmd-${crypto.randomUUID().replaceAll('-', '')}`, generationId: valid.value.expectedGenerationId, engagementId: id, actorId: session.actorId, idempotencyKey: valid.value.idempotencyKey, requestDigest, expectedRevision: valid.value.expectedRevision, expectedContextVersion: valid.value.expectedContextVersion, contextVersion: valid.value.expectedContextVersion, viewId: resolved.view?.view_id || '', parentSessionId: parentSession.sessionId };
    const prior = await readCommandReceipt(env, command);
    if (prior) {
      if (prior.request_digest !== requestDigest) return error(request, 'The idempotency key is already bound to a different command.', 409, 'IDEMPOTENCY_CONFLICT');
      try { return json(request, { ...JSON.parse(prior.result_json), replayed: true, evidenceLevel: 'SIMULATION' }); } catch { /* execute and reconcile */ }
    }
    // If the receipt was lost after the handler committed, an event with the
    // same scoped key is enough to reconcile the intent without running the
    // mutation a second time.  This result is deliberately marked as a
    // replay; the next workspace refresh supplies the complete projection.
    const priorEvent = await findScopedEventByIdempotency(env, id, valid.value.idempotencyKey, session.actorId);
    if (priorEvent) {
      const reconciled = {
        ok: true,
        outcome: 'COMMITTED',
        duplicate: true,
        replayed: true,
        commandId: priorEvent.event_id || command.commandId,
        engagementId: id,
        generationId: current.generation_id,
        actorId: session.actorId,
        revision: Number(priorEvent.new_revision || current.revision),
        eventId: priorEvent.event_id || null,
        evidenceLevel: 'SIMULATION',
      };
      await persistCommandReceipt(env, command, reconciled);
      return json(request, reconciled, 200, correlationId);
    }
    // Only a fresh intent is subject to the current optimistic revision guard.
    if (Number(current.revision) !== valid.value.expectedRevision) return error(request, 'The engagement changed since this command was loaded.', 409, 'REVISION_CONFLICT');
  }
  const decisionTx = strictEnvelope && command && command.viewId && DECISION_BATCH_ACTIONS.has(action) ? createDecisionTx(command) : null;
  let response;
  try {
  if (action === 'SUBMIT_AUDIT_FILE') response = await actionSubmitAuditFile(request, env, session, id, payload, correlationId);
  else if (action === 'RECOMMEND_COMPLETION') response = await actionRecommendCompletion(request, env, session, id, payload, correlationId);
  else if (action === 'RETURN_TO_TEAM') response = await actionReturnToTeam(request, env, session, id, payload, correlationId);
  else if (action === 'REVIEW_PARTNER_COMPLETION') response = await actionReviewPartnerCompletion(request, env, session, id, payload, correlationId);
  else if (action === 'RETURN_TO_MANAGER') response = await actionReturnToManager(request, env, session, id, payload, correlationId);
  else if (action === 'VERIFY_RELEASE_CHECKPOINT') response = await actionVerifyReleaseCheckpoint(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'ASSEMBLE_ARCHIVE') response = await actionAssembleArchive(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'APPLY_SCENARIO_PRESET') response = await actionApplyScenarioPreset(request, env, session, id, payload, correlationId);
  else if (action === 'SUBMIT_CLIENT_DETAILS') response = await actionSubmitClientDetails(request, env, session, id, payload, correlationId);
  else if (action === 'ACCEPT_CLIENT') response = await actionAcceptClient(request, env, session, id, payload, correlationId);
  else if (action === 'VERIFY_ADVANCE') response = await actionVerifyAdvance(request, env, session, id, payload, correlationId);
  else if (action === 'ISSUE_TEMP_CREDENTIAL') response = await actionIssueTempCredential(request, env, session, id, payload, correlationId);
  else if (action === 'ACTIVATE_PORTAL') response = await actionActivatePortal(request, env, session, id, payload, correlationId);
  else if (action === 'ISSUE_ANNOUNCEMENT') response = await actionIssueAnnouncement(request, env, session, id, payload, correlationId);
  else if (action === 'RECORD_ESTIMATE') response = await actionRecordEstimate(request, env, session, id, payload, correlationId);
  else if (action === 'APPROVE_FEE') response = await actionApproveFee(request, env, session, id, payload, correlationId);
  else if (action === 'RESPOND_EL') response = await actionRespondEl(request, env, session, id, payload, correlationId);
  else if (action === 'CREATE_PBC_REQUEST') response = await actionCreatePbcRequest(request, env, session, id, payload, correlationId);
  else if (action === 'SUBMIT_PBC_RECEIPT') response = await actionSubmitPbcReceipt(request, env, session, id, payload, correlationId);
  else if (action === 'RESPOND_PBC_RECEIPT') response = await actionRespondPbcReceipt(request, env, session, id, payload, correlationId);
  else if (action === 'RECORD_TB_SOURCE') response = await actionRecordTbSource(request, env, session, id, payload, correlationId);
  else if (action === 'SUBMIT_WORKPAPER') response = await actionSubmitWorkpaper(request, env, session, id, payload, correlationId);
  else if (action === 'CREATE_REVIEW_POINT') response = await actionCreateReviewPoint(request, env, session, id, payload, correlationId);
  else if (action === 'CLEAR_REVIEW_POINT') response = await actionClearReviewPoint(request, env, session, id, payload, correlationId);
  else if (action === 'PUBLISH_DRAFT_FS') response = await actionPublishDraftFs(request, env, session, id, payload, correlationId);
  else if (action === 'RESPOND_DRAFT_FS') response = await actionRespondDraftFs(request, env, session, id, payload, correlationId);
  else if (action === 'COMPLETE_EQR') response = await actionCompleteEqr(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'RECORD_ASSESSMENT_RESPONSE') response = await recordAssessmentResponse(request, env, session, id, payload, correlationId);
  else if (action === 'UPDATE_ACCOUNTING_STATUS') response = await updateAccountingStatus(request, env, session, id, payload, correlationId);
  else if (action === 'APPROVE_ACCOUNTING_FS') response = await approveAccountingFs(request, env, session, id, payload, correlationId);
  else if (action === 'EVALUATE_ACCOUNTING_INPUT') response = await evaluateAccountingInput(request, env, session, id, payload, correlationId);
  else if (action === 'RECORD_MANAGER_COMPLETION') response = await actionRecordManagerCompletion(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'RECORD_PARTNER_REVIEW') response = await actionRecordPartnerReview(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'RECORD_FINAL_DISCUSSION') response = await actionRecordFinalDiscussion(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'RECORD_AUDIT_OPINION') response = await actionRecordAuditOpinion(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'RELEASE_FINAL_REPORT') response = await actionReleaseFinalReport(request, env, session, id, payload, correlationId, decisionTx);
  else if (action === 'DELIVER_FINAL_REPORT') response = await actionDeliverFinalReport(request, env, session, id, payload, correlationId);
  else if (action === 'CREATE_INVOICE') response = await actionCreateInvoice(request, env, session, id, payload, correlationId);
  else if (action === 'CLOSE_ENGAGEMENT') response = await actionCloseEngagement(request, env, session, id, payload, correlationId);
  else return error(request, `Shared action ${action} is not enabled yet in this demo phase. The decision was not committed.`, 501, 'ACTION_NOT_ENABLED');
  } catch (caught) {
    // A strict command that reaches an unexpected D1/provider failure has an
    // unconfirmed outcome. Do not turn an unknown commit state into a
    // rejection; the caller must reconcile or retry the same intent key.
    if (command) return unconfirmedOutcome(request, command, id, session.actorId, correlationId);
    throw caught;
  }
  if (decisionTx) {
    // The handler recorded its statements instead of writing directly; commit
    // receipt claim, guarded revision bump, decision, effects and event as one
    // all-or-nothing batch. The receipt is claimed inside the batch, so the
    // post-hoc receipt persist below is skipped for these commands.
    try {
      const committed = await commitDecisionBatch(request, env, command, decisionTx, response, correlationId);
      if (committed) return committed;
    } catch {
      return unconfirmedOutcome(request, command, id, session.actorId, correlationId);
    }
  }
  if (command) {
    const body = await responseJson(response);
    const outcomeBody = body?.ok
      ? { ...body, outcome: body.outcome || 'COMMITTED', commandId: body.commandId || command.commandId,
        engagementId: body.engagementId || id, generationId: body.generationId || command.generationId,
        actorId: body.actorId || session.actorId, revision: body.revision || body.engagement?.revision || command.expectedRevision + 1 }
      : { ...(body || {}), ok: false, outcome: 'REJECTED', commandId: command.commandId,
        engagementId: id, generationId: command.generationId, actorId: session.actorId, revision: command.expectedRevision };
    if (outcomeBody.ok) await persistCommandReceipt(env, command, outcomeBody);
    // Strict callers consume the command outcome contract. Legacy callers keep
    // the historical response shape for backward compatibility.
    return json(request, outcomeBody, response.status, correlationId);
  }
  return response;
}

async function resetSharedDemo(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED');
  const session = await resolveDemoSession(request, env);
  if (!session) return error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED');
  const allowed = session.roles.includes('system_admin') || session.roles.includes('engagement_partner');
  if (!allowed) return error(request, 'Only the Admin or Partner demo persona can reset the shared demo.', 403, 'RESET_NOT_AUTHORIZED');
  const generationId = `gen-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
  for (const table of ['auditflow_tasks', 'auditflow_pbc_requests', 'auditflow_pbc_receipts', 'auditflow_workpapers', 'auditflow_review_points', 'auditflow_decisions', 'auditflow_artifacts', 'auditflow_outbox', 'auditflow_events', 'auditflow_credentials', 'auditflow_tb_sources']) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE engagement_id IN ('ENG-0018-AUD-2026','ENG-0018-ACC-2026','ENG-0009-ACC-2026')`).run();
  }
  await env.DB.prepare(`DELETE FROM auditflow_commercial WHERE engagement_id IN ('ENG-0018-AUD-2026','ENG-0018-ACC-2026','ENG-0009-ACC-2026')`).run();
  for (const table of ['auditflow_client_profiles', 'auditflow_comments', 'auditflow_step_preferences']) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE engagement_id IN ('ENG-0018-AUD-2026','ENG-0018-ACC-2026','ENG-0009-ACC-2026')`).run();
  }
  const seeds = [
    ['ENG-0018-AUD-2026', 'CLI-0018', 'AUDIT'],
    ['ENG-0018-ACC-2026', 'CLI-0018', 'ACCOUNTING'],
    ['ENG-0009-ACC-2026', 'CLI-0009', 'ACCOUNTING'],
  ];
  for (const [engagementId, clientId, service] of seeds) {
    await env.DB.prepare(
      `INSERT INTO auditflow_engagement_state (engagement_id, client_id, service, period, revision, current_stage, g_status, generation_id)
       VALUES (?1, ?2, ?3, 'FY2026', 1, 'STAGE-01', '{}', ?4)
       ON CONFLICT (engagement_id) DO UPDATE SET revision = 1, current_stage = 'STAGE-01', g_status = '{}', generation_id = excluded.generation_id, updated_at = datetime('now')`,
    ).bind(engagementId, clientId, service, generationId).run();
  }
  await env.DB.prepare(
    `INSERT INTO auditflow_events (event_id, engagement_id, actor, action, object_type, object_id, previous_revision, new_revision, idempotency_key, correlation_id)
     VALUES (?1, 'ENG-0018-AUD-2026', ?2, 'DEMO_RESET', 'engagement', 'ENG-0018-AUD-2026', 0, 1, ?3, ?4)`,
  ).bind(crypto.randomUUID(), session.actorId, `reset-${generationId}`, requestCorrelationId(request)).run();
  return json(request, { ok: true, generationId, evidenceLevel: 'SIMULATION' });
}

const STAFF_ROLES = ['system_admin', 'engagement_partner', 'signatory', 'audit_senior', 'audit_manager', 'preparer', 'independent_reviewer', 'accounting_reviewer', 'finance_team', 'eqr_reviewer', 'compliance_reviewer', 'records_custodian'];

// Phase C — shared client evaluation on the canonical question bank.
// D1 stores question IDs + responses only; holds, hard stops, categories and
// the system recommendation are always derived from the versioned bank, so
// the bank stays the single source of question wording and rules.
const CE032_ANSWERS = ['NO_MATCH', 'POSSIBLE_MATCH', 'MATCH_CONFIRMED', 'CONFIRMED_PROHIBITION', 'UNKNOWN'];
const CE_STANDARD_ANSWERS = ['YES', 'NO', 'UNKNOWN'];

function assessmentQuestionById(questionId) {
  return clientEvaluationQuestions.find((question) => question.id === questionId) || null;
}

function assessmentActorCanRespond(session, question) {
  if (question.professionalOnly) {
    return hasAnyRole(session, ['engagement_partner', 'compliance_reviewer', 'system_admin']);
  }
  return hasAnyRole(session, ['client_contributor', 'client_finance', 'management_approver', 'preparer', 'compliance_reviewer', 'engagement_partner', 'system_admin']);
}

async function readAssessmentRows(env, engagementId) {
  const assessment = await env.DB.prepare(
    'SELECT * FROM auditflow_assessments WHERE engagement_id = ?1 AND type = ?2',
  ).bind(engagementId, 'acceptance').first();
  if (!assessment) return { assessment: null, responses: [] };
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_assessment_responses WHERE assessment_id = ?1',
  ).bind(assessment.assessment_id).all();
  return { assessment: assessment, responses: result.results || [] };
}

function summarizeAssessment(assessment, responses) {
  const responseMap = {};
  for (const row of responses) {
    responseMap[row.question_id] = {
      questionId: row.question_id,
      templateVersion: QUESTION_BANK_VERSION,
      applicability: row.applicability,
      answer: row.answer,
      explanation: row.explanation || '',
      evidenceSnapshotId: row.evidence_ref || null,
      respondentActorId: row.responder || null,
      respondedAt: row.updated_at || null,
      verification: row.verification,
      disposition: row.disposition || '',
    };
  }
  const evaluation = evaluateAssessment({ type: 'acceptance', responses: responseMap });
  // The historical domain evaluator remains useful for the catalogue's
  // directional rules.  M7 also applies the typed policy keyed by question
  // identity so evidence, applicability and specialist dispositions cannot
  // be inferred from human-readable prose.  Merge both sets without
  // duplicating the same question/code hold.
  const typedHolds = [];
  for (const response of Object.values(responseMap)) {
    const policy = questionPolicyFor(response.questionId);
    if (!policy) {
      typedHolds.push({ questionId: response.questionId, code: 'POLICY_NOT_CONFIGURED', message: 'No typed policy is configured for this question.' });
      continue;
    }
    const typed = validateQuestionResponse(response);
    for (const hold of typed.blockers || []) {
      if (!evaluation.holds.some((existing) => existing.questionId === hold.targetId && existing.code === hold.code)) {
        typedHolds.push({ questionId: hold.targetId || response.questionId, code: hold.code, message: hold.message });
      }
    }
  }
  const mergedHolds = [...evaluation.holds, ...typedHolds];
  const holdsByQuestion = {};
  for (const hold of mergedHolds) {
    if (!holdsByQuestion[hold.questionId]) holdsByQuestion[hold.questionId] = [];
    holdsByQuestion[hold.questionId].push(hold);
  }
  const categories = [];
  const seen = {};
  for (const question of clientEvaluationQuestions) {
    if (!seen[question.category]) {
      seen[question.category] = { name: question.category, total: 0, answered: 0, verified: 0, holds: 0, clear: true };
      categories.push(seen[question.category]);
    }
    const entry = seen[question.category];
    const response = responseMap[question.id];
    entry.total += 1;
    const questionHolds = holdsByQuestion[question.id] || [];
    if (questionHolds.length) {
      entry.holds += questionHolds.length;
      entry.clear = false;
    }
    if (response && response.applicability !== 'NOT_APPLICABLE') {
      const blocking = questionHolds.some((hold) => hold.code === 'RESPONSE_REQUIRED' || hold.code === 'ANSWER_INVALID');
      if (!blocking) {
        entry.answered += 1;
        if (response.verification === 'VERIFIED') entry.verified += 1;
      }
    }
  }
  const hardStops = mergedHolds.filter((hold) => hold.code === 'HARD_STOP_RESPONSE');
  const blocking = [...evaluation.prohibitions, ...mergedHolds.filter((hold) => hold.code !== 'FOLLOW_UP_RECORDED')];
  const recommendation = evaluation.prohibitions.length ? 'DECLINE'
    : hardStops.length ? 'HOLD'
    : mergedHolds.length ? 'REVIEW' : 'ACCEPT';
  return {
    assessmentId: assessment ? assessment.assessment_id : null,
    type: 'acceptance',
    templateVersion: QUESTION_BANK_VERSION,
    state: assessment ? 'IN_PROGRESS' : 'NOT_STARTED',
    revision: assessment ? assessment.revision : 0,
    updatedAt: assessment ? assessment.updated_at : null,
    totalQuestions: clientEvaluationQuestions.length,
    required: evaluation.applicable,
    answered: evaluation.answered,
    verified: evaluation.verified,
    holds: mergedHolds,
    hardStops: hardStops,
    prohibitions: evaluation.prohibitions,
    blocking: blocking,
    recommendation: recommendation,
    categories: categories,
  };
}

// A client-facing assessment projection must not reveal professional-only
// question IDs, reviewer rationale, or internal hold details merely because
// the client shares the engagement scope. Keep the same canonical response
// data for staff while reducing the summary to the questions visible to the
// current effective actor.
function assessmentSummaryForSession(summary, responses, session) {
  if (!summary || !isClientOnlySession(session)) return summary;
  const visibleQuestions = clientEvaluationQuestions.filter((question) => !question.professionalOnly);
  const visibleIds = new Set(visibleQuestions.map((question) => question.id));
  const visibleRows = (Array.isArray(responses) ? responses : []).filter((row) => visibleIds.has(row.question_id));
  const holds = (summary.holds || []).filter((hold) => visibleIds.has(hold.questionId));
  const hardStops = (summary.hardStops || []).filter((hold) => visibleIds.has(hold.questionId));
  const prohibitions = (summary.prohibitions || []).filter((hold) => visibleIds.has(hold.questionId));
  const blocking = (summary.blocking || []).filter((hold) => visibleIds.has(hold.questionId));
  const categories = [];
  const categoryMap = new Map();
  for (const question of visibleQuestions) {
    let category = categoryMap.get(question.category);
    if (!category) {
      category = { name: question.category, total: 0, answered: 0, verified: 0, holds: 0, clear: true };
      categoryMap.set(question.category, category);
      categories.push(category);
    }
    category.total += 1;
    const response = visibleRows.find((row) => row.question_id === question.id);
    const questionHolds = holds.filter((hold) => hold.questionId === question.id);
    category.holds += questionHolds.length;
    category.clear = category.clear && questionHolds.length === 0;
    if (response && String(response.applicability || 'APPLICABLE').toUpperCase() !== 'NOT_APPLICABLE') {
      const answer = String(response.answer || 'UNKNOWN').toUpperCase();
      if (!['UNKNOWN', 'MISSING'].includes(answer)) category.answered += 1;
      if (String(response.verification || '').toUpperCase() === 'VERIFIED') category.verified += 1;
    }
  }
  const applicable = visibleRows.filter((row) => String(row.applicability || 'APPLICABLE').toUpperCase() !== 'NOT_APPLICABLE').length;
  const answered = visibleRows.filter((row) => !['UNKNOWN', 'MISSING'].includes(String(row.answer || 'UNKNOWN').toUpperCase())).length;
  const verified = visibleRows.filter((row) => String(row.applicability || 'APPLICABLE').toUpperCase() !== 'NOT_APPLICABLE' && String(row.verification || '').toUpperCase() === 'VERIFIED').length;
  return {
    ...summary,
    totalQuestions: visibleQuestions.length,
    required: applicable,
    answered,
    verified,
    holds,
    hardStops,
    prohibitions,
    blocking,
    categories,
    recommendation: prohibitions.length ? 'DECLINE' : hardStops.length ? 'HOLD' : holds.length ? 'REVIEW' : 'ACCEPT',
  };
}

async function readAssessmentGate(env, engagementId) {
  const found = await readAssessmentRows(env, engagementId);
  if (!found.assessment || !found.responses.length) {
    return { started: false, holds: [], hardStops: [], prohibitions: [], blocking: [], summary: null };
  }
  const summary = summarizeAssessment(found.assessment, found.responses);
  return { started: true, holds: summary.holds, hardStops: summary.hardStops, prohibitions: summary.prohibitions, blocking: summary.blocking, summary: summary };
}

async function getAssessmentSummary(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const found = await readAssessmentRows(env, engagementId);
  if (!found.assessment) {
    return json(request, {
      ok: true,
      assessment: null,
      summary: summarizeAssessment(null, []),
      responses: [],
      evidenceLevel: 'SIMULATION',
    });
  }
  let responses = found.responses;
  if (isClientOnlySession(checked.session)) {
    const internal = new Set(clientEvaluationQuestions.filter((question) => question.professionalOnly).map((question) => question.id));
    responses = responses.filter((row) => !internal.has(row.question_id));
  }
  return json(request, {
    ok: true,
    assessment: { assessmentId: found.assessment.assessment_id, type: found.assessment.type, templateVersion: QUESTION_BANK_VERSION, revision: found.assessment.revision, updatedAt: found.assessment.updated_at },
    summary: assessmentSummaryForSession(summarizeAssessment(found.assessment, found.responses), responses, checked.session),
    responses: responses,
    evidenceLevel: 'SIMULATION',
  });
}

async function recordAssessmentResponse(request, env, session, id, payload, correlationId) {
  const strictCommand = isStrictCommandPayload(payload);
  const items = Array.isArray(payload.responses) && payload.responses.length
    ? payload.responses
    : [{ questionId: payload.questionId, answer: payload.answer, applicability: payload.applicability, explanation: payload.explanation, evidenceRef: payload.evidenceRef }];
  if (!items.length || items.length > 70) return error(request, 'Send 1 to 70 assessment responses.');
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const questionId = String(item.questionId || '').trim();
    const question = assessmentQuestionById(questionId);
    if (!question) return error(request, 'Row ' + (index + 1) + ': ' + (questionId || 'missing question') + ' is not in question bank ' + QUESTION_BANK_VERSION + '.', 400, 'QUESTION_NOT_FOUND');
    if (!assessmentActorCanRespond(session, question)) return error(request, 'Row ' + (index + 1) + ' (' + questionId + ') needs a professional role this demo persona does not hold.', 403, 'ROLE_NOT_AUTHORIZED');
    const allowed = questionId === 'CE-032' ? CE032_ANSWERS : CE_STANDARD_ANSWERS;
    const answer = String(item.answer || 'UNKNOWN').trim().toUpperCase();
    if (!allowed.includes(answer)) return error(request, 'Row ' + (index + 1) + ' (' + questionId + '): answer must be ' + allowed.join(' / ') + '.', 400, 'ANSWER_INVALID');
    const applicability = String(item.applicability || 'APPLICABLE').trim().toUpperCase();
    if (applicability !== 'APPLICABLE' && applicability !== 'NOT_APPLICABLE') return error(request, 'Row ' + (index + 1) + ' (' + questionId + '): applicability must be APPLICABLE or NOT_APPLICABLE.', 400, 'APPLICABILITY_INVALID');
    const explanation = cleanText(item.explanation, MAX_CONTEXT_LENGTH, '') ?? '';
    if (applicability === 'NOT_APPLICABLE' && !explanation) return error(request, 'Row ' + (index + 1) + ' (' + questionId + '): a not-applicable response needs a rationale.', 400, 'NA_RATIONALE_REQUIRED');
    const evidenceRef = cleanText(item.evidenceRef, 200, '') ?? '';
    const disposition = cleanText(item.disposition, MAX_CONTEXT_LENGTH, '') ?? '';
    const policy = questionPolicyFor(questionId);
    if (strictCommand) {
      if (!policy) return error(request, 'Row ' + (index + 1) + ' (' + questionId + ') has no configured typed policy.', 409, 'POLICY_NOT_CONFIGURED');
      const requestedVerification = String(item.verification || 'UNVERIFIED').trim().toUpperCase();
      if (!['UNVERIFIED', 'SUBMITTED', 'VERIFIED'].includes(requestedVerification)) return error(request, 'Row ' + (index + 1) + ' (' + questionId + '): verification must be UNVERIFIED, SUBMITTED or VERIFIED.', 400, 'VERIFICATION_INVALID');
      const canVerify = hasAnyRole(session, ['compliance_reviewer', 'audit_manager', 'engagement_partner']);
      if (requestedVerification === 'VERIFIED' && !canVerify) return error(request, 'Only an authorized compliance or professional reviewer can mark evidence VERIFIED.', 403, 'VERIFIER_NOT_AUTHORIZED');
      if (requestedVerification === 'VERIFIED' && policy.verificationRequired && applicability !== 'NOT_APPLICABLE' && !evidenceRef) return error(request, 'A verified response must name its evidence reference.', 400, 'EVIDENCE_REFERENCE_REQUIRED');
      if (applicability === 'NOT_APPLICABLE' && !disposition) return error(request, 'A typed applicability disposition is required; a rationale alone cannot waive the control.', 400, 'NA_APPROVAL_REQUIRED');
      const typed = validateQuestionResponse({ questionId, answer, applicability, verification: requestedVerification, evidenceRef, disposition });
      const malformed = (typed.blockers || []).find((hold) => ['QUESTION_NOT_REGISTERED', 'ANSWER_NOT_ALLOWED', 'APPLICABILITY_NOT_ALLOWED', 'NA_APPROVAL_REQUIRED'].includes(hold.code));
      if (malformed) return error(request, malformed.message, 400, malformed.code);
      normalized.push({ questionId, answer, applicability, explanation, evidenceRef, disposition, verification: requestedVerification === 'VERIFIED' ? 'VERIFIED' : 'SUBMITTED', verified: requestedVerification === 'VERIFIED' });
    } else {
      // Compatibility mode preserves the original fixture shortcut where a
      // Partner/Compliance response is marked verified.  New strict commands
      // above must carry an explicit verifier decision and evidence reference.
      const verified = hasAnyRole(session, ['engagement_partner', 'compliance_reviewer']);
      normalized.push({ questionId, answer, applicability, explanation, evidenceRef, disposition, verified, verification: verified ? 'VERIFIED' : 'SUBMITTED' });
    }
  }
  let assessment = await env.DB.prepare(
    'SELECT * FROM auditflow_assessments WHERE engagement_id = ?1 AND type = ?2',
  ).bind(id, 'acceptance').first();
  let assessmentId;
  if (!assessment) {
    assessmentId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO auditflow_assessments (assessment_id, engagement_id, type, template_version, revision) VALUES (?1, ?2, ?3, ?4, 1)',
    ).bind(assessmentId, id, 'acceptance', QUESTION_BANK_VERSION).run();
  } else {
    assessmentId = assessment.assessment_id;
  }
  for (const entry of normalized) {
    if (strictCommand) {
      try {
        await env.DB.prepare(
          `INSERT INTO auditflow_assessment_responses (assessment_id, question_id, answer, applicability, verification, explanation, evidence_ref, disposition, responder, verifier) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT (assessment_id, question_id) DO UPDATE SET answer = excluded.answer, applicability = excluded.applicability, verification = excluded.verification, explanation = excluded.explanation, evidence_ref = excluded.evidence_ref, disposition = excluded.disposition, responder = excluded.responder, verifier = excluded.verifier, updated_at = datetime('now')`,
        ).bind(assessmentId, entry.questionId, entry.answer, entry.applicability, entry.verification, entry.explanation, entry.evidenceRef, entry.disposition, session.actorId, entry.verified ? session.actorId : '').run();
      } catch (assessmentError) {
        // M7's disposition column is additive.  Keep a useful strict write on
        // an older Worker while the migration is being rolled out; the typed
        // validation above still prevents policy bypasses.
        if (!/no such column|unknown column|disposition/i.test(String(assessmentError?.message || assessmentError))) throw assessmentError;
        await env.DB.prepare(
          'INSERT INTO auditflow_assessment_responses (assessment_id, question_id, answer, applicability, verification, explanation, evidence_ref, responder, verifier) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (assessment_id, question_id) DO UPDATE SET answer = excluded.answer, applicability = excluded.applicability, verification = excluded.verification, explanation = excluded.explanation, evidence_ref = excluded.evidence_ref, responder = excluded.responder, verifier = excluded.verifier, updated_at = datetime(\'now\')',
        ).bind(assessmentId, entry.questionId, entry.answer, entry.applicability, entry.verification, entry.explanation, entry.evidenceRef, session.actorId, entry.verified ? session.actorId : '').run();
      }
    } else {
      await env.DB.prepare(
        'INSERT INTO auditflow_assessment_responses (assessment_id, question_id, answer, applicability, verification, explanation, evidence_ref, responder, verifier) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (assessment_id, question_id) DO UPDATE SET answer = excluded.answer, applicability = excluded.applicability, verification = excluded.verification, explanation = excluded.explanation, evidence_ref = excluded.evidence_ref, responder = excluded.responder, verifier = excluded.verifier, updated_at = datetime(\'now\')',
      ).bind(assessmentId, entry.questionId, entry.answer, entry.applicability, entry.verification, entry.explanation, entry.evidenceRef, session.actorId, entry.verified ? session.actorId : '').run();
    }
  }
  await env.DB.prepare(
    'UPDATE auditflow_assessments SET revision = revision + 1, updated_at = datetime(\'now\') WHERE assessment_id = ?1',
  ).bind(assessmentId).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ASSESSMENT_RESPONSE_RECORDED', objectType: 'assessment', objectId: assessmentId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  const found = await readAssessmentRows(env, id);
  return json(request, { ok: true, assessmentId: assessmentId, recorded: normalized.length, summary: summarizeAssessment(found.assessment, found.responses), engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

// Phase C — compact D1-backed accounting status tracker with input
// generations. Every trial-balance source advances input_generation; the
// audit side evaluates it back via EVALUATE_ACCOUNTING_INPUT. Release (and a
// sound opinion) requires the evaluated generation to be current.
const ACCOUNTING_STEP_STATES = ['PENDING', 'IN_PROGRESS', 'COMPLETE'];
const ACCOUNTING_FS_STATES = ['DRAFT', 'IN_REVIEW', 'FINAL'];

async function readAccountingStatus(env, engagementId) {
  const row = await env.DB.prepare(
    'SELECT * FROM auditflow_accounting_status WHERE engagement_id = ?1',
  ).bind(engagementId).first();
  if (!row) {
    return {
      engagementId: engagementId, sourceVersion: '', sourceState: 'PENDING',
      mappingState: 'PENDING', mappingCoverage: '', reconState: 'PENDING', openReconCount: 0,
      journalState: 'PENDING', pendingJournalCount: 0, fsVersion: '', fsState: 'DRAFT',
      mgmtApprovalState: 'PENDING', inputGeneration: 1, auditEvaluatedGeneration: 1,
      revision: 0, updatedAt: null, exists: false,
    };
  }
  return {
    engagementId: row.engagement_id, sourceVersion: row.source_version, sourceState: row.source_state,
    mappingState: row.mapping_state, mappingCoverage: row.mapping_coverage,
    reconState: row.recon_state, openReconCount: row.open_recon_count,
    journalState: row.journal_state, pendingJournalCount: row.pending_journal_count,
    fsVersion: row.fs_version, fsState: row.fs_state, mgmtApprovalState: row.mgmt_approval_state,
    inputGeneration: row.input_generation, auditEvaluatedGeneration: row.audit_evaluated_generation,
    revision: row.revision, updatedAt: row.updated_at, exists: true,
  };
}

function accountingTrackerSteps(status) {
  const step = (id, label, detail, state) => ({ id: id, label: label, detail: detail, state: state });
  const handoffReady = status.mgmtApprovalState === 'ACCEPTED' && status.fsState === 'FINAL';
  return [
    step('source', 'Source received', status.sourceVersion ? 'TB ' + status.sourceVersion : 'No TB source recorded', status.sourceVersion ? 'COMPLETE' : 'PENDING'),
    step('validation', 'Validation', status.sourceState === 'PENDING' && !status.sourceVersion ? 'Awaiting source' : status.sourceState, status.sourceVersion ? (status.sourceState === 'VALIDATED' ? 'COMPLETE' : 'IN_PROGRESS') : 'PENDING'),
    step('mapping', 'Mapping', status.mappingCoverage || status.mappingState, status.mappingState === 'MAPPED' || status.mappingState === 'COMPLETE' ? 'COMPLETE' : (status.sourceVersion ? 'IN_PROGRESS' : 'PENDING')),
    step('reconciliations', 'Reconciliations', status.openReconCount + ' open', status.reconState === 'COMPLETE' && !status.openReconCount ? 'COMPLETE' : (status.sourceVersion ? 'IN_PROGRESS' : 'PENDING')),
    step('journals', 'Journal decisions', status.pendingJournalCount + ' pending', status.journalState === 'COMPLETE' && !status.pendingJournalCount ? 'COMPLETE' : (status.sourceVersion ? 'IN_PROGRESS' : 'PENDING')),
    step('fs-package', 'FS package', status.fsVersion ? status.fsVersion + ' · ' + status.fsState : 'No package yet', status.fsState === 'FINAL' ? 'COMPLETE' : (status.fsVersion ? 'IN_PROGRESS' : 'PENDING')),
    step('mgmt-approval', 'Management approval', status.mgmtApprovalState, status.mgmtApprovalState === 'ACCEPTED' ? 'COMPLETE' : (status.fsVersion ? 'IN_PROGRESS' : 'PENDING')),
    step('audit-handoff', 'Audit handoff', handoffReady ? 'Ready for audit evaluation at g' + status.inputGeneration : 'Blocked until package approval', handoffReady ? 'READY' : 'PENDING'),
  ];
}

async function getAccountingStatus(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const status = await readAccountingStatus(env, engagementId);
  return json(request, {
    ok: true,
    status: status,
    steps: accountingTrackerSteps(status),
    generations: { input: status.inputGeneration, evaluated: status.auditEvaluatedGeneration, current: status.inputGeneration === status.auditEvaluatedGeneration },
    evidenceLevel: 'SIMULATION',
  });
}

async function updateAccountingStatus(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['preparer', 'accounting_reviewer', 'system_admin'])) {
    return error(request, 'Only the Accountant, Accounting Reviewer or System Administrator demo persona can update the accounting tracker.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const patch = {};
  const field = (snake, camel) => (payload[snake] !== undefined ? payload[snake] : payload[camel]);
  const putState = (key, value, allowed) => {
    if (value === undefined) return true;
    const text = String(value).trim().toUpperCase();
    if (!allowed.includes(text)) return false;
    patch[key] = text;
    return true;
  };
  if (!putState('mapping_state', field('mapping_state', 'mappingState'), ACCOUNTING_STEP_STATES)) return error(request, 'mappingState must be PENDING, IN_PROGRESS or COMPLETE.');
  if (field('mapping_coverage', 'mappingCoverage') !== undefined) {
    const coverage = cleanText(field('mapping_coverage', 'mappingCoverage'), 40, '') ?? '';
    patch.mapping_coverage = coverage;
  }
  if (!putState('recon_state', field('recon_state', 'reconState'), ACCOUNTING_STEP_STATES)) return error(request, 'reconState must be PENDING, IN_PROGRESS or COMPLETE.');
  if (field('open_recon_count', 'openReconCount') !== undefined) {
    const n = Number(field('open_recon_count', 'openReconCount'));
    if (!Number.isSafeInteger(n) || n < 0 || n > 500) return error(request, 'openReconCount must be 0 to 500.');
    patch.open_recon_count = n;
  }
  if (!putState('journal_state', field('journal_state', 'journalState'), ACCOUNTING_STEP_STATES)) return error(request, 'journalState must be PENDING, IN_PROGRESS or COMPLETE.');
  if (field('pending_journal_count', 'pendingJournalCount') !== undefined) {
    const n = Number(field('pending_journal_count', 'pendingJournalCount'));
    if (!Number.isSafeInteger(n) || n < 0 || n > 500) return error(request, 'pendingJournalCount must be 0 to 500.');
    patch.pending_journal_count = n;
  }
  if (field('fs_version', 'fsVersion') !== undefined) {
    const version = String(field('fs_version', 'fsVersion') || '').trim().slice(0, 20);
    if (!version) return error(request, 'fsVersion must not be empty.');
    patch.fs_version = version;
  }
  if (!putState('fs_state', field('fs_state', 'fsState'), ACCOUNTING_FS_STATES)) return error(request, 'fsState must be DRAFT, IN_REVIEW or FINAL.');
  if (!Object.keys(patch).length) return error(request, 'Send at least one tracker field to update.');
  const columns = Object.keys(patch);
  const sets = columns.map((column) => column + ' = excluded.' + column).join(', ');
  const values = columns.map((_, index) => '?' + (index + 2)).join(', ');
  await env.DB.prepare(
    'INSERT INTO auditflow_accounting_status (engagement_id, ' + columns.join(', ') + ') VALUES (?1, ' + values + ') ON CONFLICT (engagement_id) DO UPDATE SET ' + sets + ', revision = auditflow_accounting_status.revision + 1, updated_at = datetime(\'now\')',
  ).bind(id, ...columns.map((column) => patch[column])).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'ACCOUNTING_STATUS_UPDATED', objectType: 'accounting_status', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  const status = await readAccountingStatus(env, id);
  return json(request, { ok: true, status: status, steps: accountingTrackerSteps(status), engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

async function approveAccountingFs(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['management_approver'])) {
    return error(request, 'Only the Client Management Approver demo persona can approve the accounting package.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (decision !== 'ACCEPT' && decision !== 'REJECT') return error(request, 'Decision must be ACCEPT or REJECT.');
  const explanation = cleanText(payload.explanation, MAX_CONTEXT_LENGTH) || '';
  if (decision === 'REJECT' && !explanation) return error(request, 'Explain the rejection so Accounting can revise the package.');
  const status = await readAccountingStatus(env, id);
  if (!status.exists || !status.fsVersion) return error(request, 'No accounting FS package is awaiting management approval yet.', 409, 'PRECONDITION_FAILED');
  await env.DB.prepare(
    'INSERT INTO auditflow_accounting_status (engagement_id, mgmt_approval_state) VALUES (?1, ?2) ON CONFLICT (engagement_id) DO UPDATE SET mgmt_approval_state = excluded.mgmt_approval_state, revision = auditflow_accounting_status.revision + 1, updated_at = datetime(\'now\')',
  ).bind(id, decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED').run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: decision === 'ACCEPT' ? 'ACCOUNTING_FS_ACCEPTED' : 'ACCOUNTING_FS_REJECTED', objectType: 'accounting_status', objectId: id, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  const updated = await readAccountingStatus(env, id);
  return json(request, { ok: true, decision: decision, status: updated, steps: accountingTrackerSteps(updated), engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function evaluateAccountingInput(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can evaluate the accounting input.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const status = await readAccountingStatus(env, id);
  if (status.inputGeneration === status.auditEvaluatedGeneration) {
    return json(request, { ok: true, duplicate: true, inputGeneration: status.inputGeneration, evaluatedGeneration: status.auditEvaluatedGeneration, evidenceLevel: 'SIMULATION' });
  }
  await env.DB.prepare(
    'UPDATE auditflow_accounting_status SET audit_evaluated_generation = ?2, revision = revision + 1, updated_at = datetime(\'now\') WHERE engagement_id = ?1',
  ).bind(id, status.inputGeneration).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'AUDIT_INPUT_EVALUATED', objectType: 'accounting_status', objectId: 'g' + status.inputGeneration, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId: correlationId });
  return json(request, { ok: true, duplicate: false, inputGeneration: status.inputGeneration, evaluatedGeneration: status.inputGeneration, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

async function readAccountingGenerations(env, engagementId) {
  const status = await readAccountingStatus(env, engagementId);
  return { input: status.inputGeneration, evaluated: status.auditEvaluatedGeneration };
}

// Read the related D1 projections as one bounded snapshot. D1 queries can be
// issued concurrently for latency, but a command may advance the aggregate
// while those reads are in flight. The revision/generation guard below makes
// that race visible instead of serving a mixed authoritative-looking view.
async function readProgressSnapshotOnce(env, engagementId) {
  const id = engagementId;
  const rows = await Promise.all([
    readEngagementRow(env, id),
    env.DB.prepare('SELECT engagement_id FROM auditflow_client_profiles WHERE engagement_id = ?1').bind(id).first(),
    env.DB.prepare('SELECT decision_id, decision_type, object_version, decision, decided_by, decided_at, revision, input_generation FROM auditflow_decisions WHERE engagement_id = ?1 ORDER BY revision DESC, decided_at DESC, decision_id DESC').bind(id).all(),
    env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first(),
    env.DB.prepare('SELECT state FROM auditflow_credentials WHERE engagement_id = ?1 ORDER BY created_at DESC').bind(id).all(),
    env.DB.prepare('SELECT request_id, state, due_date FROM auditflow_pbc_requests WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 200').bind(id).all(),
    env.DB.prepare('SELECT receipt_id, request_id, state FROM auditflow_pbc_receipts WHERE engagement_id = ?1 ORDER BY uploaded_at DESC LIMIT 200').bind(id).all(),
    env.DB.prepare('SELECT source_version, validation_state, mapping_complete FROM auditflow_tb_sources WHERE engagement_id = ?1').bind(id).all(),
    env.DB.prepare('SELECT workpaper_id, state FROM auditflow_workpapers WHERE engagement_id = ?1').bind(id).all(),
    env.DB.prepare('SELECT review_id, state, severity, cleared_generation FROM auditflow_review_points WHERE engagement_id = ?1').bind(id).all(),
    env.DB.prepare('SELECT * FROM auditflow_accounting_status WHERE engagement_id = ?1').bind(id).first(),
    env.DB.prepare('SELECT document_id, document_type, version, state, created_at FROM auditflow_artifacts WHERE engagement_id = ?1').bind(id).all(),
    env.DB.prepare('SELECT task_id, state, due_date, assignee_role FROM auditflow_tasks WHERE engagement_id = ?1').bind(id).all(),
  ]);
  const engagement = rows[0];
  if (!engagement) return null;
  const decisions = {};
  for (const row of (rows[2].results || [])) {
    if (row && row.decision_type && !decisions[row.decision_type]) {
      decisions[row.decision_type] = { id: row.decision_id, decision: row.decision, version: row.object_version, by: row.decided_by, at: row.decided_at, revision: Number(row.revision || 1), generation: Number(row.input_generation || 1) };
    }
  }
  const statusRow = rows[10] || null;
  const assessmentFound = await readAssessmentRows(env, id);
  const assessmentSummary = assessmentFound.assessment ? summarizeAssessment(assessmentFound.assessment, assessmentFound.responses) : null;
  const finalDiscussion = decisions.FINAL_CLIENT_DISCUSSION || null;
  const commercialRow = rows[3] || null;
  const credentialRows = (rows[4].results || []);
  const artifactRows = (rows[11].results || []);
  const draftVersions = artifactRows
    .filter((row) => row.document_type === 'DRAFT_FS' && row.state === 'PUBLISHED')
    .map((row) => row.version)
    .sort((a, b) => numericVersion(a) - numericVersion(b) || String(a).localeCompare(String(b)));
  const announcementRow = artifactRows.find((row) => row.document_type === 'ANNOUNCEMENT' && row.state === 'PUBLISHED') || null;
  return {
    engagementId: engagement.engagement_id,
    clientId: engagement.client_id,
    service: engagement.service,
    period: engagement.period,
    cachedStage: engagement.current_stage,
    revision: engagement.revision,
    generationId: engagement.generation_id,
    hasClientProfile: Boolean(rows[1]),
    decisions: decisions,
    commercial: commercialRow ? {
      estimateHours: commercialRow.estimate_hours,
      estimateCost: commercialRow.estimate_cost,
      advanceRequired: commercialRow.advance_required,
      feeState: commercialRow.fee_state,
      approvedFee: commercialRow.approved_fee,
      elVersion: commercialRow.el_version,
      elState: commercialRow.el_state,
      advanceState: commercialRow.advance_state,
      advanceReference: commercialRow.advance_reference,
      invoiceState: commercialRow.invoice_state,
      invoiceId: commercialRow.invoice_id,
      commercialClose: commercialRow.commercial_close,
    } : null,
    credentialState: credentialRows.length ? credentialRows[0].state : null,
    portalActivated: credentialRows.some((row) => row.state === 'ACTIVATED'),
    announcement: announcementRow ? { id: announcementRow.document_id, at: announcementRow.created_at } : null,
    pbcRequests: (rows[5].results || []).map((row) => ({ id: row.request_id, state: row.state, dueDate: row.due_date })),
    pbcReceipts: (rows[6].results || []).map((row) => ({ id: row.receipt_id, requestId: row.request_id, state: row.state })),
    tbSources: (rows[7].results || []).map((row) => ({ version: row.source_version, validationState: row.validation_state, mappingComplete: row.mapping_complete })),
    workpapers: (rows[8].results || []).map((row) => ({ id: row.workpaper_id, state: row.state })),
    reviewPoints: (rows[9].results || []).map((row) => ({ id: row.review_id, state: row.state, severity: row.severity, clearedGeneration: Number(row.cleared_generation || 1) })),
    draftVersions: draftVersions,
    tasks: (rows[12].results || []).map((row) => ({ id: row.task_id, state: row.state, dueDate: row.due_date, role: row.assignee_role })),
    artifactCount: artifactRows.length,
    publishedArtifactCount: artifactRows.filter((row) => row.state === 'PUBLISHED').length,
    assessment: assessmentSummary ? {
      answered: assessmentSummary.answered, required: assessmentSummary.required, verified: assessmentSummary.verified,
      holds: assessmentSummary.holds.map((hold) => ({ questionId: hold.questionId, code: hold.code })),
      hardStops: assessmentSummary.hardStops.length, prohibitions: assessmentSummary.prohibitions.length,
    } : null,
    inputGeneration: statusRow ? Number(statusRow.input_generation) || 1 : 1,
    evaluatedGeneration: statusRow ? Number(statusRow.audit_evaluated_generation) || 1 : 1,
    accounting: statusRow ? {
      sourceVersion: statusRow.source_version,
      sourceState: statusRow.source_state,
      mappingState: statusRow.mapping_state,
      mappingCoverage: statusRow.mapping_coverage,
      reconState: statusRow.recon_state, openRecons: statusRow.open_recon_count,
      journalState: statusRow.journal_state, pendingJournals: statusRow.pending_journal_count,
      fsVersion: statusRow.fs_version, fsState: statusRow.fs_state, mgmtApproval: statusRow.mgmt_approval_state,
      mgmtApprovalState: statusRow.mgmt_approval_state,
      inputGeneration: Number(statusRow.input_generation) || 1,
      auditEvaluatedGeneration: Number(statusRow.audit_evaluated_generation) || 1,
      revision: Number(statusRow.revision) || 0,
      updatedAt: statusRow.updated_at || null,
    } : null,
    finalDiscussion: finalDiscussion ? { at: finalDiscussion.version, generation: Number(finalDiscussion.generation || 1) } : null,
  };
}

async function readProgressSnapshot(env, engagementId) {
  let lastSnapshot = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await readEngagementRow(env, engagementId);
    if (!before) return null;
    const snapshot = await readProgressSnapshotOnce(env, engagementId);
    if (!snapshot) return null;
    const after = await readEngagementRow(env, engagementId);
    const coherent = Boolean(after
      && Number(after.revision) === Number(snapshot.revision)
      && String(after.generation_id || '') === String(snapshot.generationId || ''));
    if (coherent) return { ...snapshot, coherent: true, consistency: 'COHERENT' };
    lastSnapshot = {
      ...snapshot,
      coherent: false,
      consistency: 'STALE',
      consistencyReason: 'The engagement changed while its related records were being read.',
    };
  }
  // Preserve the last-good data for inspection, but mark it explicitly stale
  // so version-sensitive controls remain disabled by the frontend/store.
  return lastSnapshot;
}

async function getEngagementProgress(request, env, engagementId) {
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  const snapshot = await readProgressSnapshot(env, id);
  if (!snapshot) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const progress = progressForSession(deriveProgressFromSnapshot(snapshot), checked.session);
  const directory = DEMO_CLIENT_DIRECTORY[snapshot.clientId] || { name: snapshot.clientId, shortName: snapshot.clientId };
  progress.engagementId = id;
  progress.client = directory.name;
  progress.service = snapshot.service;
  progress.period = snapshot.period;
  progress.revision = snapshot.revision;
  progress.generationId = snapshot.generationId;
  progress.cachedStage = snapshot.cachedStage;
  progress.derivedFrom = 'd1';
  return json(request, { ok: true, progress: progress, evidenceLevel: 'SIMULATION' });
}

function effectiveSessionForView(view, parentSession) {
  const persona = DEMO_PERSONAS[view?.persona_id || parentSession?.personaId];
  return {
    ...parentSession,
    personaId: view?.persona_id || parentSession?.personaId,
    actorId: view?.actor_id || parentSession?.actorId,
    roles: persona?.roles || parentSession?.roles || [],
  };
}

async function resolveWorkspaceContext(request, env, engagementId) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked;
  const id = readEngagementId(engagementId);
  if (!id) return { response: error(request, 'A valid engagement id is required.') };
  const viewId = readViewId(request);
  let view = null;
  if (viewId) {
    view = await readDemoView(env, checked.session, viewId);
    if (!view) return { response: error(request, 'The workspace view is not active for this session.', 409, 'VIEW_CONTEXT_INVALID') };
    if (view.engagement_id !== id) return { response: error(request, 'The view is scoped to another engagement.', 409, 'VIEW_SCOPE_CONFLICT') };
    const expectedVersion = request.headers.get('X-AuditFlow-Context-Version');
    if (expectedVersion && Number(expectedVersion) !== Number(view.context_version)) return { response: error(request, 'The workspace context changed; reload before acting.', 409, 'CONTEXT_VERSION_CONFLICT') };
  }
  const effectiveSession = view ? effectiveSessionForView(view, checked.session) : checked.session;
  if (!(await isAssignedToEngagement(env, effectiveSession, id))) return { response: error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED') };
  return { session: checked.session, effectiveSession, view, engagementId: id };
}

function decisionStaleness(row, snapshot) {
  if (!snapshot || !row) return { stale: false, staleReason: '' };
  const latest = snapshot.decisions?.[row.decision_type];
  if (latest?.id && row.decision_id && latest.id !== row.decision_id) {
    return { stale: true, staleReason: `Superseded by ${latest.id} for the current ${row.decision_type.replaceAll('_', ' ').toLowerCase()} target.` };
  }
  if (latest?.version && row.object_version && String(latest.version) !== String(row.object_version)) {
    return { stale: true, staleReason: `Targets ${row.object_version}; the current target is ${latest.version}.` };
  }
  const generationBound = new Set(['MANAGER_COMPLETION', 'PARTNER_COMPLETION_REVIEW', 'EQR', 'AUDIT_OPINION', 'FINAL_CLIENT_DISCUSSION', 'RELEASE', 'DELIVERY']);
  const currentGeneration = Number(snapshot.inputGeneration || 0);
  const rowGeneration = Number(row.input_generation || 0);
  if (generationBound.has(String(row.decision_type || '').toUpperCase()) && currentGeneration > 0 && rowGeneration > 0 && rowGeneration < currentGeneration) {
    return { stale: true, staleReason: `Evaluated accounting generation g${rowGeneration}; current input is g${currentGeneration}.` };
  }
  return { stale: false, staleReason: '' };
}

function serializeApprovalQueue(decisions = [], tasks = [], session = {}, snapshot = null) {
  const items = [];
  for (const task of rankTasks(tasks.map(serializeTask))) {
    const owner = task.assigneeRole || task.assigneePersona || '';
    if (session.roles?.some((role) => ['system_admin', 'engagement_partner', 'audit_manager'].includes(role)) || owner === session.actorId || session.roles?.includes(owner)) {
      items.push({
        id: task.taskId,
        kind: 'TASK',
        targetId: task.target || task.linkedObjectId,
        decisionType: task.linkedObjectType,
        title: task.title,
        owner,
        state: task.state,
        priority: task.priority,
        route: task.route || 'role-workspace',
        dueDate: task.dueDate,
        stale: task.state === 'BLOCKED' || task.escalationState !== 'NONE',
        staleReason: task.state === 'BLOCKED' ? (task.blockerCode || 'Task is blocked.') : task.escalationState !== 'NONE' ? `Task is ${task.escalationState.toLowerCase()}.` : '',
        rationale: '',
      });
    }
  }
  for (const row of decisions) {
    if (isClientOnlySession(session) && !['ENGAGEMENT_LETTER', 'DRAFT_FS'].includes(row.decision_type)) continue;
    const stale = decisionStaleness(row, snapshot);
    items.push({
      id: row.decision_id,
      kind: 'DECISION',
      targetId: row.object_version,
      decisionType: row.decision_type,
      title: `${String(row.decision_type || 'Decision').replaceAll('_', ' ')} · ${row.object_version || 'current'}`,
      owner: row.decided_by,
      state: row.decision,
      priority: 'NORMAL',
      route: ['DRAFT_FS', 'ENGAGEMENT_LETTER'].includes(row.decision_type) ? 'clients' : 'reviews',
      dueDate: '',
      stale: stale.stale,
      staleReason: stale.staleReason,
      rationale: row.rationale || '',
      revision: Number(row.revision || 1),
      generationId: row.generation_id || '',
    });
  }
  return items;
}

function progressForSession(progress, session) {
  if (!progress || !isClientOnlySession(session)) return progress;
  return {
    ...progress,
    // High-level gate state is useful to a client, but internal question,
    // review-point and candidate identifiers are not. Keep those details in
    // staff projections only; the client still receives the next owner/action
    // and the permitted portal outputs.
    gateDetails: (progress.gateDetails || []).map((gate) => ({ ...gate, sourceIds: [] })),
    blockers: (progress.blockers || []).map((blocker) => ({ ...blocker, sourceIds: [] })),
    contradictions: [],
  };
}

async function getWorkspace(request, env, engagementId) {
  const resolved = await resolveWorkspaceContext(request, env, engagementId);
  if (resolved.response) return resolved.response;
  const snapshot = await readProgressSnapshot(env, resolved.engagementId);
  if (!snapshot) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  if (resolved.view && resolved.view.generation_id !== snapshot.generationId) return error(request, 'The demo generation changed. Reopen the workspace before acting.', 409, 'RESET_REQUIRED');
  const progress = progressForSession(deriveProgressFromSnapshot(snapshot), resolved.effectiveSession);
  const context = serializeDemoContext({
    engagement_id: snapshot.engagementId,
    client_id: snapshot.clientId,
    service: snapshot.service,
    period: snapshot.period,
    revision: snapshot.revision,
    current_stage: snapshot.cachedStage,
    generation_id: snapshot.generationId,
    updated_at: new Date().toISOString(),
  });
  const taskRows = await env.DB.prepare('SELECT * FROM auditflow_tasks WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 200').bind(resolved.engagementId).all();
  const eventRows = await env.DB.prepare('SELECT * FROM auditflow_events WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(resolved.engagementId).all();
  const decisionRows = await env.DB.prepare('SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 ORDER BY revision DESC, decided_at DESC, decision_id DESC LIMIT 200').bind(resolved.engagementId).all();
  const outboxRows = await env.DB.prepare('SELECT * FROM auditflow_outbox WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(resolved.engagementId).all();
  // M7 §5 — published artifacts feed the projection so every screen (including
  // the EQR candidate picker) works from the same server truth.
  const artifactRows = await env.DB.prepare(`SELECT document_id, document_type, title, version, state, visibility, created_at FROM auditflow_artifacts WHERE engagement_id = ?1 AND state = 'PUBLISHED' ORDER BY created_at DESC LIMIT 100`).bind(resolved.engagementId).all();
  const effective = resolved.effectiveSession;
  const view = resolved.view || {
    view_id: `legacy-${effective.sessionId || 'session'}`,
    persona_id: effective.personaId,
    actor_id: effective.actorId,
    engagement_id: resolved.engagementId,
    generation_id: snapshot.generationId,
    context_version: 1,
  };
  const viewContexts = await listAuthorizedContexts(env, effective);
  const descriptor = serializeView(view, effective, viewContexts);
  descriptor.contexts = viewContexts;
  const approvals = serializeApprovalQueue(decisionRows.results || [], taskRows.results || [], effective, snapshot);
  const notifications = approvals.filter((item) => item.kind === 'TASK' && ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'WAITING'].includes(item.state));
  const accounting = snapshot.accounting;
  const accountingSteps = accounting
    ? accountingTrackerSteps({
      ...accounting,
      openReconCount: Number(accounting.openRecons || 0),
      pendingJournalCount: Number(accounting.pendingJournals || 0),
    })
    : [];
  const projection = buildWorkspaceProjection({
    view: { ...view, roles: effective.roles },
    context,
    progress,
    tasks: (taskRows.results || []).map(serializeTask),
    approvals,
    notifications,
    recentEvents: (eventRows.results || []).map(serializeEvent),
    outbox: outboxRows.results || [],
    artifacts: artifactRows.results || [],
    accounting,
    accountingSteps,
    blockers: progress.blockers || [],
    counts: { decisions: (decisionRows.results || []).length, artifacts: snapshot.artifactCount, applicableRequirements: progress.applicableRequirements || null },
  });
  return json(request, {
    ok: true,
    workspace: {
      ...projection,
      view: descriptor,
      contextVersion: Number(view.context_version || 1),
      generationId: snapshot.generationId,
      revision: snapshot.revision,
      consistency: snapshot.consistency || 'COHERENT',
      consistencyReason: snapshot.consistencyReason || '',
    },
    evidenceLevel: 'SIMULATION',
  });
}

async function getApprovalCenter(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const resolved = await resolveWorkspaceContext(request, env, engagementId);
  if (resolved.response) return resolved.response;
  const tasks = await env.DB.prepare('SELECT * FROM auditflow_tasks WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 200').bind(engagementId).all();
  const decisions = await env.DB.prepare('SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 ORDER BY revision DESC, decided_at DESC, decision_id DESC LIMIT 200').bind(engagementId).all();
  const snapshot = await readProgressSnapshot(env, engagementId);
  const items = serializeApprovalQueue(decisions.results || [], tasks.results || [], resolved.effectiveSession, snapshot);
  const tab = String(url.searchParams.get('tab') || 'my-decisions').toLowerCase();
  const filtered = tab === 'returned-work' ? items.filter((item) => ['RETURNED', 'REJECTED', 'CLARIFICATION', 'REVISION'].includes(String(item.state).toUpperCase()))
    : tab === 'stale-approvals' ? items.filter((item) => item.stale)
      : tab === 'all-stages' ? items
        : items.filter((item) => item.owner === resolved.effectiveSession.actorId || resolved.effectiveSession.roles?.includes(item.owner) || item.kind === 'TASK');
  return json(request, { ok: true, items: filtered, counts: { all: items.length, mine: items.filter((item) => item.owner === resolved.effectiveSession.actorId || resolved.effectiveSession.roles?.includes(item.owner)).length, returned: items.filter((item) => ['RETURNED', 'REJECTED', 'CLARIFICATION', 'REVISION'].includes(String(item.state).toUpperCase())).length, stale: items.filter((item) => item.stale).length }, scope: { engagementId, actorId: resolved.effectiveSession.actorId }, evidenceLevel: 'SIMULATION' });
}

// Portfolio views are deliberately limited to the people who coordinate the
// engagement. A client or preparer may see their assigned task list but never
// a practice-wide health queue or another engagement's blockers.
function hasPortfolioAccess(session) {
  return hasAnyRole(session, ['system_admin', 'engagement_partner', 'audit_manager']);
}

async function requirePortfolioAccess(request, env) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked;
  if (!hasPortfolioAccess(checked.session)) {
    return { response: error(request, 'Only the Admin, Audit Manager, or Partner demo persona can use the operational portfolio.', 403, 'PORTFOLIO_NOT_AUTHORIZED') };
  }
  return checked;
}

async function getProcessHealth(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requirePortfolioAccess(request, env);
  if (checked.response) return checked.response;
  if (!(await isAssignedToEngagement(env, checked.session, engagementId))) {
    return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  }
  const snapshot = await readProgressSnapshot(env, engagementId);
  if (!snapshot) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  const progress = deriveProgressFromSnapshot(snapshot);
  const health = deriveProcessHealth(snapshot, progress);
  return json(request, {
    ok: true,
    engagementId,
    health,
    nextBestAction: health.nextBestAction,
    evidenceLevel: 'SIMULATION',
  });
}

async function getOperationalPortfolio(request, env) {
  const checked = await requirePortfolioAccess(request, env);
  if (checked.response) return checked.response;
  const allowed = ACTOR_ASSIGNMENTS[checked.session.actorId] || [];
  if (!allowed.length) return json(request, { ok: true, portfolio: [], evidenceLevel: 'SIMULATION' });
  const placeholders = allowed.map((_, index) => `?${index + 1}`).join(', ');
  const result = await env.DB.prepare(
    `SELECT engagement_id, client_id, service, period, revision, current_stage, generation_id, updated_at
     FROM auditflow_engagement_state WHERE engagement_id IN (${placeholders}) ORDER BY engagement_id`,
  ).bind(...allowed).all();
  const contexts = (result.results || [])
    .filter((row) => row && allowed.includes(row.engagement_id))
    .map(serializeDemoContext);
  const progressById = {};
  const healthById = {};
  for (const context of contexts) {
    const snapshot = await readProgressSnapshot(env, context.engagementId);
    if (!snapshot) continue;
    const progress = deriveProgressFromSnapshot(snapshot);
    progressById[context.engagementId] = progress;
    healthById[context.engagementId] = deriveProcessHealth(snapshot, progress);
  }
  return json(request, {
    ok: true,
    portfolio: buildPortfolioRows(contexts, progressById, healthById),
    evidenceLevel: 'SIMULATION',
  });
}

async function getScenarioPreset(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  if (!hasPortfolioAccess(checked.session)) return error(request, 'Only the Admin, Audit Manager, or Partner demo persona can inspect controlled scenarios.', 403, 'SCENARIO_NOT_AUTHORIZED');
  const row = await env.DB.prepare(
    'SELECT engagement_id, preset_key, revision, applied_by, applied_at FROM auditflow_demo_scenario_presets WHERE engagement_id = ?1',
  ).bind(engagementId).first();
  const preset = resolveScenarioPreset(row?.preset_key);
  return json(request, {
    ok: true,
    scenario: row && preset ? {
      engagementId: row.engagement_id,
      ...preset,
      revision: Number(row.revision || 1),
      appliedBy: row.applied_by,
      appliedAt: row.applied_at,
    } : null,
    presets: SCENARIO_PRESETS,
    evidenceLevel: 'SIMULATION',
  });
}

async function actionApplyScenarioPreset(request, env, session, id, payload, correlationId) {
  if (!hasPortfolioAccess(session)) {
    return error(request, 'Only the Admin, Audit Manager, or Partner demo persona can apply a controlled scenario preset.', 403, 'SCENARIO_NOT_AUTHORIZED');
  }
  const preset = resolveScenarioPreset(payload.presetKey);
  if (!preset) {
    return error(request, 'Choose one of the controlled scenario presets: NEW_CLIENT, FIELDWORK, MANAGER_REVIEW_BLOCKED, READY_FOR_PARTNER, or READY_FOR_RELEASE.', 400, 'SCENARIO_PRESET_INVALID');
  }
  const engagement = await readEngagementRow(env, id);
  if (!engagement) return error(request, 'Engagement not found in the shared demo.', 404, 'ENGAGEMENT_NOT_FOUND');
  if (payload.expectedRevision != null && Number(payload.expectedRevision) !== Number(engagement.revision)) {
    return error(request, 'The engagement changed since you loaded it. Reload and retry.', 409, 'REVISION_CONFLICT');
  }
  let existingStatus = {};
  try { existingStatus = JSON.parse(engagement.g_status || '{}') || {}; } catch { existingStatus = {}; }
  const scenarioStatus = {
    ...existingStatus,
    demoScenario: { key: preset.key, label: preset.label, stage: preset.stage, appliedAt: new Date().toISOString() },
  };
  await env.DB.prepare(
    `INSERT INTO auditflow_demo_scenario_presets (engagement_id, preset_key, revision, applied_by, applied_at)
     VALUES (?1, ?2, 1, ?3, datetime('now'))
     ON CONFLICT (engagement_id) DO UPDATE SET
       preset_key = excluded.preset_key,
       revision = auditflow_demo_scenario_presets.revision + 1,
       applied_by = excluded.applied_by,
       applied_at = datetime('now')`,
  ).bind(id, preset.key, session.actorId).run();
  await env.DB.prepare(
    `UPDATE auditflow_engagement_state
     SET revision = revision + 1, g_status = ?2, updated_at = datetime('now')
     WHERE engagement_id = ?1`,
  ).bind(id, JSON.stringify(scenarioStatus)).run();
  const updated = await readEngagementRow(env, id);
  await appendEvent(env, {
    engagementId: id,
    actor: session.actorId,
    action: 'SCENARIO_PRESET_APPLIED',
    objectType: 'demo_scenario_preset',
    objectId: preset.key,
    previousRevision: Number(engagement.revision || 1),
    newRevision: Number(updated?.revision || Number(engagement.revision || 1) + 1),
    idempotencyKey: String(payload.idempotencyKey || ''),
    correlationId,
  });
  return json(request, {
    ok: true,
    scenario: { engagementId: id, ...preset, appliedBy: session.actorId, revision: Number(updated?.revision || 1) },
    engagement: serializeEngagementState(updated),
    // A preset is a bounded presenter marker. It never writes decisions,
    // approvals, evidence, or an opinion; health remains D1-derived.
    note: 'The controlled preset updates only this isolated demo engagement marker. Gates, health, and next actions remain derived from canonical D1 records.',
    evidenceLevel: 'SIMULATION',
  }, 201);
}

function isClientOnlySession(session) {
  return !session.roles.some((role) => STAFF_ROLES.includes(role));
}

async function requireDemoSession(request, env) {
  const session = await resolveDemoSession(request, env);
  if (!session) return { response: error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED') };
  return { session };
}

async function requireEngagementScope(request, env, engagementId) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked;
  const id = readEngagementId(engagementId);
  if (!id) return { response: error(request, 'A valid engagement id is required.') };
  let effective = checked.session;
  const viewId = readViewId(request);
  if (viewId) {
    const view = await readDemoView(env, checked.session, viewId);
    if (!view) return { response: error(request, 'The workspace view is not active for this session.', 409, 'VIEW_CONTEXT_INVALID') };
    if (view.engagement_id !== id) return { response: error(request, 'The workspace view is scoped to another engagement.', 409, 'VIEW_SCOPE_CONFLICT') };
    const expectedVersion = request.headers.get('X-AuditFlow-Context-Version');
    if (expectedVersion && Number(expectedVersion) !== Number(view.context_version)) return { response: error(request, 'The workspace context changed; reload before acting.', 409, 'CONTEXT_VERSION_CONFLICT') };
    effective = effectiveSessionForView(view, checked.session);
  }
  if (!(await isAssignedToEngagement(env, effective, id))) {
    return { response: error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED') };
  }
  return { ...checked, session: effective };
}

// A presenter/staff session normally addresses the legacy synthetic records.
// When the Admin console opens a client invitation run, it may supply that
// run id explicitly; the Worker still resolves the run context and the
// actor's logical assignment before allowing any portal read or write. A
// client session can never override its invitation run.
async function requirePortalEngagementScope(request, env, engagementId, requestedRunId = '') {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked;
  const id = readEngagementId(engagementId);
  if (!id) return { response: error(request, 'A valid engagement id is required.') };
  const runId = String(requestedRunId || '').trim();
  if (runId && !SAFE_RUN_ID.test(runId)) return { response: error(request, 'A valid invitation run id is required.', 400, 'RUN_ID_INVALID') };
  let effective = checked.session;
  if (scopedRunContexts(effective)) {
    if (runId && runId !== effective.runId) {
      return { response: error(request, 'This client session is fixed to its invitation run.', 403, 'INVITATION_SCOPE_CONFLICT') };
    }
  } else if (runId) {
    if (isClientOnlySession(effective)) return { response: error(request, 'Client sessions cannot select another invitation run.', 403, 'INVITATION_SCOPE_CONFLICT') };
    const context = await env.DB.prepare(
      `SELECT run_id, logical_engagement_id, engagement_id
       FROM auditflow_demo_run_contexts WHERE run_id = ?1 AND engagement_id = ?2`,
    ).bind(runId, id).first();
    const assigned = context && (ACTOR_ASSIGNMENTS[effective.actorId] || []).includes(context.logical_engagement_id);
    if (!assigned) return { response: error(request, 'This staff persona is not assigned to the invitation run.', 403, 'SCOPE_DENIED') };
    effective = { ...effective, runId, invitationId: '', clientMode: 0 };
  }
  if (!(await isAssignedToEngagement(env, effective, id))) {
    return { response: error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED') };
  }
  return { ...checked, session: effective };
}

async function listPbc(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const requests = await env.DB.prepare(
    'SELECT * FROM auditflow_pbc_requests WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 100',
  ).bind(engagementId).all();
  const receipts = await env.DB.prepare(
    'SELECT * FROM auditflow_pbc_receipts WHERE engagement_id = ?1 ORDER BY uploaded_at DESC LIMIT 200',
  ).bind(engagementId).all();
  return json(request, { ok: true, requests: requests.results || [], receipts: receipts.results || [], evidenceLevel: 'SIMULATION' });
}

function serializePortalMessage(row) {
  return {
    messageId: row.message_id,
    runId: row.run_id,
    engagementId: row.engagement_id,
    requestId: row.request_id || '',
    threadId: row.thread_id || row.message_id,
    replyTo: row.reply_to || '',
    senderPersonaId: row.sender_persona_id,
    senderActorId: row.sender_actor_id,
    senderRole: row.sender_role,
    body: row.body,
    clientVisible: Boolean(row.client_visible),
    state: row.state,
    createdAt: row.created_at,
    readAt: row.read_at || '',
  }
}

function portalMessageScope(row, session) {
  if (!row || !session || !scopedRunContexts(session)) return false
  return row.run_id === session.runId && isAssignedToEngagementForContext(session, row.engagement_id)
}

function isAssignedToEngagementForContext(session, engagementId) {
  // This synchronous helper is only used after the async scope check has
  // already validated the run/engagement pair. It prevents accidental use of
  // a legacy static id when serializing a portal thread.
  return Boolean(session?.runId && SAFE_RUN_ID.test(session.runId) && readEngagementId(engagementId))
}

async function listPortalMessages(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'))
  if (!engagementId) return error(request, 'A valid engagementId is required.')
  const checked = await requirePortalEngagementScope(request, env, engagementId, url.searchParams.get('runId') || '')
  if (checked.response) return checked.response
  const session = checked.session
  if (!scopedRunContexts(session)) return json(request, { ok: true, messages: [], counts: { total: 0, unread: 0 }, latestPreview: null, lastTeamReply: null, evidenceLevel: 'SIMULATION' })
  const result = await env.DB.prepare(
    `SELECT * FROM auditflow_portal_messages
     WHERE run_id = ?1 AND engagement_id = ?2
     ORDER BY created_at ASC LIMIT 200`,
  ).bind(session.runId, engagementId).all()
  const rows = (result.results || []).filter((row) => !isClientOnlySession(session) || Number(row.client_visible) === 1)
  const messages = rows.map(serializePortalMessage)
  const latest = messages[messages.length - 1] || null
  const latestTeam = [...messages].reverse().find((message) => !['client_contributor', 'client_finance', 'management_approver'].includes(message.senderRole)) || null
  return json(request, {
    ok: true,
    messages,
    counts: { total: messages.length, unread: messages.filter((message) => message.state === 'UNREAD' && message.senderActorId !== session.actorId).length },
    latestPreview: latest ? { body: latest.body, createdAt: latest.createdAt, senderRole: latest.senderRole } : null,
    lastTeamReply: latestTeam ? { body: latestTeam.body, createdAt: latestTeam.createdAt, senderRole: latestTeam.senderRole } : null,
    evidenceLevel: 'SIMULATION',
  })
}

async function createPortalMessage(request, env, { engagementId = '', replyTo = '', runId = '' } = {}) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const id = readEngagementId(engagementId || payload.engagementId)
  if (!id) return error(request, 'A valid engagementId is required.')
  const checked = await requirePortalEngagementScope(request, env, id, runId || payload.runId || '')
  if (checked.response) return checked.response
  const session = checked.session
  if (!scopedRunContexts(session)) return error(request, 'Open an invitation link before sending portal messages.', 403, 'INVITATION_REQUIRED')
  if (!canWriteClientSession(session)) return error(request, 'Open an invitation link before sending portal messages.', 403, 'INVITATION_REQUIRED')
  const body = cleanText(payload.body, MAX_MESSAGE_LENGTH)
  if (!body) return error(request, 'Write a message before sending it (maximum 2,000 characters).')
  const requestId = String(payload.requestId || '').trim()
  if (requestId && !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) return error(request, 'Provide a valid request id or leave it blank.')
  if (requestId) {
    const parentRequest = await env.DB.prepare('SELECT request_id FROM auditflow_pbc_requests WHERE request_id = ?1 AND engagement_id = ?2').bind(requestId, id).first()
    if (!parentRequest) return error(request, 'That message request is not part of this engagement.', 404, 'PBC_REQUEST_NOT_FOUND')
  }
  const replyId = String(replyTo || payload.replyTo || '').trim()
  let parent = null
  if (replyId) {
    if (!SAFE_MESSAGE_ID.test(replyId)) return error(request, 'Provide a valid message to reply to.')
    parent = await env.DB.prepare('SELECT message_id, run_id, engagement_id, request_id, thread_id FROM auditflow_portal_messages WHERE message_id = ?1').bind(replyId).first()
    if (!parent || parent.run_id !== session.runId || parent.engagement_id !== id) return error(request, 'That message is outside the current invitation run.', 404, 'MESSAGE_NOT_FOUND')
  }
  const messageId = `msg-${crypto.randomUUID().replaceAll('-', '')}`
  const threadId = parent?.thread_id || parent?.message_id || requestId || `thread-${id}`
  const senderRole = session.roles?.[0] || 'demo-user'
  const isClient = isClientOnlySession(session)
  const clientVisible = isClient ? 1 : (payload.clientVisible === false || payload.internal === true ? 0 : 1)
  await env.DB.prepare(
    `INSERT INTO auditflow_portal_messages
      (message_id, run_id, engagement_id, request_id, thread_id, reply_to, sender_persona_id, sender_actor_id, sender_role, body, client_visible, state)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'UNREAD')`,
  ).bind(messageId, session.runId, id, requestId || parent?.request_id || '', threadId, replyId, session.personaId, session.actorId, senderRole, body, clientVisible).run()
  const created = await env.DB.prepare('SELECT * FROM auditflow_portal_messages WHERE message_id = ?1').bind(messageId).first()
  return json(request, {
    ok: true,
    message: serializePortalMessage(created || {
      message_id: messageId,
      run_id: session.runId,
      engagement_id: id,
      request_id: requestId,
      thread_id: threadId,
      reply_to: replyId,
      sender_persona_id: session.personaId,
      sender_actor_id: session.actorId,
      sender_role: senderRole,
      body,
      client_visible: clientVisible,
      state: 'UNREAD',
      created_at: new Date().toISOString(),
      read_at: '',
    }),
    evidenceLevel: 'SIMULATION',
  }, 201)
}

async function markPortalMessageRead(request, env, messageId) {
  const checked = await requireDemoSession(request, env)
  if (checked.response) return checked.response
  if (!SAFE_MESSAGE_ID.test(messageId)) return error(request, 'A valid message id is required.')
  const row = await env.DB.prepare('SELECT * FROM auditflow_portal_messages WHERE message_id = ?1').bind(messageId).first()
  if (!row) return error(request, 'Message not found.', 404, 'MESSAGE_NOT_FOUND')
  const scoped = await requirePortalEngagementScope(request, env, row.engagement_id, row.run_id)
  if (scoped.response) return scoped.response
  if (row.run_id !== scoped.session.runId) return error(request, 'Message not found in this invitation run.', 404, 'MESSAGE_NOT_FOUND')
  if (isClientOnlySession(scoped.session) && Number(row.client_visible) !== 1) return error(request, 'That message is internal-only.', 404, 'MESSAGE_NOT_FOUND')
  await env.DB.prepare("UPDATE auditflow_portal_messages SET state = 'READ', read_at = datetime('now') WHERE message_id = ?1 AND run_id = ?2").bind(messageId, scoped.session.runId).run()
  return json(request, { ok: true, messageId, state: 'READ', evidenceLevel: 'SIMULATION' })
}

function safeUploadName(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('..') || /[\\/]/.test(raw)) return null
  const cleaned = raw.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 240).trim()
  return cleaned || null
}

function serializeUpload(row) {
  return {
    receiptId: row.receipt_id,
    runId: row.run_id,
    requestId: row.request_id,
    engagementId: row.engagement_id,
    objectKey: row.object_key,
    fileName: row.file_name,
    fileSize: Number(row.file_size || 0),
    mimeType: row.mime_type,
    contentSha256: row.content_sha256 || '',
    expiresAt: row.expires_at,
    storageState: row.storage_state,
    storageError: row.storage_error || '',
    uploadedBy: row.uploaded_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function insertDemoPbcReceipt(env, { receiptId, requestId, engagementId, fileName, fileSize, mimeType, contentSha256, version, actorId, runId, expiresAt, objectKey }) {
  const common = [receiptId, requestId, engagementId, fileName, fileSize, mimeType, contentSha256, version, actorId]
  try {
    await env.DB.prepare(
      `INSERT INTO auditflow_pbc_receipts
        (receipt_id, request_id, engagement_id, file_name, file_size, mime_type, synthetic_hash, version, hard_copy, comment, state, uploaded_by, run_id, object_key, content_sha256, expires_at, storage_state, storage_error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, '', 'RECEIVED', ?9, ?10, ?11, ?12, ?13, 'RECEIVED', '')`,
    ).bind(...common, runId, objectKey, contentSha256, sqlDateTime(expiresAt)).run()
  } catch (caught) {
    if (!/no such column|unknown column/i.test(String(caught?.message || caught))) throw caught
    await env.DB.prepare(
      `INSERT INTO auditflow_pbc_receipts
        (receipt_id, request_id, engagement_id, file_name, file_size, mime_type, synthetic_hash, version, hard_copy, comment, state, uploaded_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, '', 'RECEIVED', ?9)`,
    ).bind(...common).run()
  }
}

async function uploadDemoEvidence(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  if (!env.DEMO_UPLOADS || typeof env.DEMO_UPLOADS.put !== 'function') return error(request, 'Temporary evidence storage is not configured for this demo.', 503, 'STORAGE_NOT_CONFIGURED')
  const declaredLength = Number(request.headers.get('Content-Length') || 0)
  // Multipart overhead is small but variable; reject clearly oversized
  // bodies before formData() buffers them while the exact file-size check
  // below remains authoritative for the 10 MB evidence limit.
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 128_000) return error(request, 'The upload body is too large. Files must be 10 MB or smaller.', 413, 'UPLOAD_TOO_LARGE')
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const engagementId = readEngagementId(form?.get('engagementId') || request.headers.get('X-AuditFlow-Engagement-Id'))
  const requestId = String(form?.get('requestId') || request.headers.get('X-AuditFlow-Pbc-Request-Id') || '').trim()
  if (!file || typeof file.arrayBuffer !== 'function') return error(request, 'Choose a PDF, CSV, XLS or XLSX file to upload.')
  if (!engagementId || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) return error(request, 'A valid engagement and PBC request are required.')
  const checked = await requireEngagementScope(request, env, engagementId)
  if (checked.response) return checked.response
  const session = checked.session
  if (!scopedRunContexts(session) || !session.invitationId || !canWriteClientSession(session)) return error(request, 'Open an invitation link before uploading evidence.', 403, 'INVITATION_REQUIRED')
  const parent = await env.DB.prepare('SELECT request_id FROM auditflow_pbc_requests WHERE request_id = ?1 AND engagement_id = ?2').bind(requestId, engagementId).first()
  if (!parent) return error(request, 'That PBC request does not belong to this engagement.', 404, 'PBC_REQUEST_NOT_FOUND')
  const idempotencyKey = String(request.headers.get('Idempotency-Key') || form.get('idempotencyKey') || '').trim()
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) return error(request, 'The upload idempotency key is invalid.')
  if (idempotencyKey) {
    const prior = await env.DB.prepare('SELECT * FROM auditflow_demo_uploads WHERE run_id = ?1 AND request_id = ?2 AND idempotency_key = ?3').bind(session.runId, requestId, idempotencyKey).first()
    if (prior?.storage_state === 'RECEIVED') return json(request, { ok: true, receipt: serializeUpload(prior), replayed: true, evidenceLevel: 'SIMULATION' })
    if (prior?.storage_state === 'STAGING') return error(request, 'An upload with this idempotency key is still being stored. Retry shortly.', 409, 'UPLOAD_IN_PROGRESS')
  }
  const fileName = safeUploadName(file.name || form.get('fileName'))
  if (!fileName) return error(request, 'Use a simple file name without paths or parent-directory segments.')
  const mimeType = String(file.type || '').toLowerCase()
  if (!ALLOWED_UPLOAD_TYPES.has(mimeType)) return error(request, 'Only PDF, CSV, XLS and XLSX files are accepted.')
  const fileSize = Number(file.size || 0)
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) return error(request, 'Files must be between 1 byte and 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength !== fileSize || bytes.byteLength > MAX_UPLOAD_BYTES) return error(request, 'The uploaded file size could not be verified safely.')
  const contentSha256 = await sha256Hex(bytes)
  const receiptId = `rec-${crypto.randomUUID().replaceAll('-', '')}`
  const objectKey = `demo/${session.runId}/${engagementId}/${requestId}/${receiptId}-${fileName}`
  const expiresAt = uploadExpiresAt()
  let version = 1
  const priorVersion = await env.DB.prepare('SELECT MAX(version) AS version FROM auditflow_pbc_receipts WHERE request_id = ?1').bind(requestId).first()
  version = Number(priorVersion?.version || 0) + 1
  try {
    await env.DB.prepare(
      `INSERT INTO auditflow_demo_uploads
        (receipt_id, run_id, request_id, engagement_id, object_key, idempotency_key, file_name, file_size, mime_type, content_sha256, expires_at, storage_state, uploaded_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'STAGING', ?12)`,
    ).bind(receiptId, session.runId, requestId, engagementId, objectKey, idempotencyKey, fileName, fileSize, mimeType, contentSha256, sqlDateTime(expiresAt), session.actorId).run()
  } catch (caught) {
    if (idempotencyKey && /unique|constraint/i.test(String(caught?.message || caught))) {
      const replay = await env.DB.prepare('SELECT * FROM auditflow_demo_uploads WHERE run_id = ?1 AND request_id = ?2 AND idempotency_key = ?3').bind(session.runId, requestId, idempotencyKey).first()
      if (replay?.storage_state === 'RECEIVED') return json(request, { ok: true, receipt: serializeUpload(replay), replayed: true, evidenceLevel: 'SIMULATION' })
      if (replay?.storage_state === 'STAGING') return error(request, 'An upload with this idempotency key is still being stored. Retry shortly.', 409, 'UPLOAD_IN_PROGRESS')
    }
    return error(request, 'The upload could not be staged. Retry the same file.', 503, 'UPLOAD_STAGING_FAILED')
  }
  try {
    await insertDemoPbcReceipt(env, { receiptId, requestId, engagementId, fileName, fileSize, mimeType, contentSha256, version, actorId: session.actorId, runId: session.runId, expiresAt, objectKey })
    await env.DEMO_UPLOADS.put(objectKey, bytes, {
      httpMetadata: { contentType: mimeType, contentLength: fileSize },
      customMetadata: { runId: session.runId, engagementId, requestId, receiptId, expiresAt },
    })
    await env.DB.prepare("UPDATE auditflow_demo_uploads SET storage_state = 'RECEIVED', updated_at = datetime('now'), storage_error = '' WHERE receipt_id = ?1 AND run_id = ?2").bind(receiptId, session.runId).run()
    await env.DB.prepare("UPDATE auditflow_pbc_requests SET state = 'RECEIVED', updated_at = datetime('now') WHERE request_id = ?1 AND engagement_id = ?2").bind(requestId, engagementId).run()
    try {
      await upsertTask(env, { taskId: `pbc-review-${requestId}`, engagementId, assigneeRole: 'audit_senior', title: `Review ${requestId} receipt v${version}`, state: 'OPEN', linkedObjectType: 'pbc_receipt', linkedObjectId: receiptId })
      const engagement = await touchEngagement(env, engagementId, null)
      await appendEvent(env, { engagementId, actor: session.actorId, action: 'PBC_RECEIPT_SUBMITTED', objectType: 'pbc_receipt', objectId: receiptId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey, correlationId: requestCorrelationId(request) })
    } catch { /* receipt/object durability is primary; workflow side effects retry on review */ }
    const saved = await env.DB.prepare('SELECT * FROM auditflow_demo_uploads WHERE receipt_id = ?1').bind(receiptId).first()
    return json(request, { ok: true, receipt: serializeUpload(saved || { receipt_id: receiptId, run_id: session.runId, request_id: requestId, engagement_id: engagementId, object_key: objectKey, file_name: fileName, file_size: fileSize, mime_type: mimeType, content_sha256: contentSha256, expires_at: sqlDateTime(expiresAt), storage_state: 'RECEIVED', uploaded_by: session.actorId }), evidenceLevel: 'SIMULATION' }, 201)
  } catch (caught) {
    await env.DB.prepare("UPDATE auditflow_demo_uploads SET storage_state = 'FAILED', storage_error = ?2, updated_at = datetime('now') WHERE receipt_id = ?1").bind(receiptId, cleanText(caught?.message || caught, 240, 'Storage operation failed') || 'Storage operation failed').run().catch(() => {})
    await env.DB.prepare("UPDATE auditflow_pbc_receipts SET state = 'FAILED', storage_state = 'FAILED', storage_error = ?2 WHERE receipt_id = ?1").bind(receiptId, cleanText(caught?.message || caught, 240, 'Storage operation failed') || 'Storage operation failed').run().catch(() => {})
    await env.DEMO_UPLOADS.delete(objectKey).catch(() => {})
    return error(request, 'The evidence file could not be stored. Retry the upload.', 503, 'UPLOAD_STORAGE_FAILED')
  }
}

async function downloadDemoEvidence(request, env, receiptId) {
  if (!SAFE_RECEIPT_ID.test(receiptId)) return error(request, 'A valid receipt id is required.')
  const checked = await requireDemoSession(request, env)
  if (checked.response) return checked.response
  const row = await env.DB.prepare('SELECT * FROM auditflow_demo_uploads WHERE receipt_id = ?1 AND run_id = ?2').bind(receiptId, checked.session.runId).first()
  if (!row) return error(request, 'Evidence receipt not found in this invitation run.', 404, 'UPLOAD_NOT_FOUND')
  if (!(await isAssignedToEngagement(env, checked.session, row.engagement_id))) return error(request, 'This evidence is outside the current engagement scope.', 403, 'SCOPE_DENIED')
  const expiry = new Date(`${row.expires_at}Z`.replace(/ZZ$/, 'Z')).getTime()
  if (row.storage_state === 'EXPIRED' || (Number.isFinite(expiry) && expiry <= Date.now())) {
    await env.DB.prepare("UPDATE auditflow_demo_uploads SET storage_state = 'EXPIRED', updated_at = datetime('now') WHERE receipt_id = ?1").bind(receiptId).run().catch(() => {})
    return error(request, 'This temporary evidence file expired after 24 hours.', 410, 'FILE_EXPIRED')
  }
  if (row.storage_state !== 'RECEIVED') return error(request, 'This evidence file is not available for download.', 409, 'UPLOAD_NOT_READY')
  if (!env.DEMO_UPLOADS || typeof env.DEMO_UPLOADS.get !== 'function') return error(request, 'Temporary evidence storage is not configured for this demo.', 503, 'STORAGE_NOT_CONFIGURED')
  const object = await env.DEMO_UPLOADS.get(row.object_key)
  if (!object) return error(request, 'The temporary evidence object is no longer available.', 404, 'UPLOAD_NOT_FOUND')
  const headers = baseHeaders(request)
  headers['Content-Type'] = row.mime_type || object.httpMetadata?.contentType || 'application/octet-stream'
  headers['Content-Length'] = String(row.file_size || object.size || 0)
  headers['Content-Disposition'] = `attachment; filename="${row.file_name.replace(/"/g, '')}"`
  return new Response(object.body, { status: 200, headers })
}

async function withdrawDemoEvidence(request, env, receiptId) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  if (!SAFE_RECEIPT_ID.test(receiptId)) return error(request, 'A valid receipt id is required.')
  const checked = await requireDemoSession(request, env)
  if (checked.response) return checked.response
  const row = await env.DB.prepare('SELECT * FROM auditflow_demo_uploads WHERE receipt_id = ?1 AND run_id = ?2').bind(receiptId, checked.session.runId).first()
  if (!row) return error(request, 'Evidence receipt not found in this invitation run.', 404, 'UPLOAD_NOT_FOUND')
  if (!(await isAssignedToEngagement(env, checked.session, row.engagement_id))) return error(request, 'This evidence is outside the current engagement scope.', 403, 'SCOPE_DENIED')
  if (row.uploaded_by !== checked.session.actorId) return error(request, 'Only the uploader can withdraw this temporary file.', 403, 'UPLOAD_DELETE_NOT_AUTHORIZED')
  const expiry = new Date(`${row.expires_at}Z`.replace(/ZZ$/, 'Z')).getTime()
  if (Number.isFinite(expiry) && expiry <= Date.now()) return error(request, 'Expired evidence can no longer be withdrawn.', 410, 'FILE_EXPIRED')
  if (env.DEMO_UPLOADS?.delete) await env.DEMO_UPLOADS.delete(row.object_key)
  await env.DB.prepare("UPDATE auditflow_demo_uploads SET storage_state = 'WITHDRAWN', updated_at = datetime('now') WHERE receipt_id = ?1 AND run_id = ?2").bind(receiptId, checked.session.runId).run()
  await env.DB.prepare("UPDATE auditflow_pbc_receipts SET state = 'WITHDRAWN' WHERE receipt_id = ?1").bind(receiptId).run().catch(() => {})
  return json(request, { ok: true, receiptId, storageState: 'WITHDRAWN', evidenceLevel: 'SIMULATION' })
}

async function cleanupDemoUploads(env) {
  if (!env.DB) return { deleted: 0, expired: 0, failed: 0 }
  let result
  try {
    result = await env.DB.prepare(
      `SELECT receipt_id, object_key, storage_state FROM auditflow_demo_uploads
       WHERE (storage_state = 'RECEIVED' AND expires_at <= datetime('now'))
          OR (storage_state = 'STAGING' AND created_at <= datetime('now', '-30 minutes'))
       ORDER BY created_at ASC LIMIT 200`,
    ).all()
  } catch { return { deleted: 0, expired: 0, failed: 0 } }
  let deleted = 0; let expired = 0; let failed = 0
  for (const row of result.results || []) {
    try { if (env.DEMO_UPLOADS?.delete) await env.DEMO_UPLOADS.delete(row.object_key); deleted += 1 } catch { failed += 1 }
    const nextState = row.storage_state === 'STAGING' ? 'FAILED' : 'EXPIRED'
    const note = row.storage_state === 'STAGING' ? 'Abandoned staging upload cleaned up.' : (failed ? 'Expiry cleanup recorded; object deletion will retry.' : '')
    await env.DB.prepare('UPDATE auditflow_demo_uploads SET storage_state = ?2, storage_error = ?3, updated_at = datetime(\'now\') WHERE receipt_id = ?1').bind(row.receipt_id, nextState, note).run().catch(() => { failed += 1 })
    if (nextState === 'EXPIRED') { expired += 1; await env.DB.prepare("UPDATE auditflow_pbc_receipts SET state = 'EXPIRED', storage_state = 'EXPIRED' WHERE receipt_id = ?1").bind(row.receipt_id).run().catch(() => {}) }
  }
  return { deleted, expired, failed }
}

async function listWorkpapers(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  if (isClientOnlySession(checked.session)) return error(request, 'Workpapers are staff-only in the shared demo.', 403, 'ROLE_NOT_AUTHORIZED');
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_workpapers WHERE engagement_id = ?1 ORDER BY updated_at DESC LIMIT 100',
  ).bind(engagementId).all();
  return json(request, { ok: true, workpapers: result.results || [], evidenceLevel: 'SIMULATION' });
}

async function listReviews(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  if (isClientOnlySession(checked.session)) return error(request, 'Review points are staff-only in the shared demo.', 403, 'ROLE_NOT_AUTHORIZED');
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_review_points WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 100',
  ).bind(engagementId).all();
  return json(request, { ok: true, reviewPoints: result.results || [], evidenceLevel: 'SIMULATION' });
}

async function listDecisions(request, env, url) {
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  const checked = await requireEngagementScope(request, env, engagementId);
  if (checked.response) return checked.response;
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 ORDER BY revision DESC, decided_at DESC, decision_id DESC LIMIT 100',
  ).bind(engagementId).all();
  const rows = result.results || [];
  const visible = isClientOnlySession(checked.session)
    ? rows.filter((row) => ['ENGAGEMENT_LETTER', 'DRAFT_FS'].includes(row.decision_type))
    : rows;
  return json(request, { ok: true, decisions: visible, evidenceLevel: 'SIMULATION' });
}

async function handle(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders(request) })
  }
  if (path === '/api/health' && request.method === 'GET') {
    return json(request, {
      ok: true,
      service: 'steaudit-api',
      databaseConfigured: Boolean(env.DB),
      mode: trustedSharedDemoRequest(request, env) ? 'shared-demo-opt-in' : 'local-only',
      sharedDemoEnabled: trustedSharedDemoRequest(request, env),
      deploymentVersion: env.DEPLOYMENT_SHA || 'local',
      evidenceLevel: 'SIMULATION',
    })
  }
  if (!trustedSharedDemoRequest(request, env)) return error(request, 'Shared demo data routes are disabled until a verified Cloudflare Access identity and isolated non-production binding are configured.', 403, 'SHARED_DEMO_DISABLED')
  if (!env.DB) return error(request, 'D1 is not configured for this Worker.', 503, 'DATABASE_UNAVAILABLE')
  if (path === '/api/demo/invitations' && request.method === 'POST') return createDemoInvitation(request, env)
  if (path === '/api/demo/session' && request.method === 'POST') return createDemoSession(request, env)
  if (path === '/api/demo/me' && request.method === 'GET') return getDemoMe(request, env)
  if (path === '/api/demo/contexts' && request.method === 'GET') return getDemoContexts(request, env)
  if (path === '/api/demo/views' && request.method === 'GET') return listDemoViews(request, env)
  if (path === '/api/demo/views' && request.method === 'POST') return createDemoView(request, env)
  const viewMatch = path.match(/^\/api\/demo\/views\/([A-Za-z0-9_-]{8,120})$/)
  if (viewMatch && request.method === 'GET') return getDemoView(request, env, viewMatch[1])
  if (viewMatch && request.method === 'PUT') return updateDemoView(request, env, viewMatch[1])
  if (viewMatch && request.method === 'DELETE') return closeDemoView(request, env, viewMatch[1])
  if (path === '/api/demo/reset' && request.method === 'POST') return resetSharedDemo(request, env)
  if (path === '/api/portfolio' && request.method === 'GET') return getOperationalPortfolio(request, env)
  if (path === '/api/process-health' && request.method === 'GET') return getProcessHealth(request, env, url)
  if (path === '/api/scenario-presets' && request.method === 'GET') return getScenarioPreset(request, env, url)
  if (path === '/api/approval-center' && request.method === 'GET') return getApprovalCenter(request, env, url)
  if (path === '/api/artifacts' && request.method === 'GET') return listArtifacts(request, env, url)
  if (path === '/api/pbc' && request.method === 'GET') return listPbc(request, env, url)
  if (path === '/api/workpapers' && request.method === 'GET') return listWorkpapers(request, env, url)
  if (path === '/api/reviews' && request.method === 'GET') return listReviews(request, env, url)
  if (path === '/api/decisions' && request.method === 'GET') return listDecisions(request, env, url)
  if (path === '/api/outbox' && request.method === 'GET') return listOutbox(request, env, url)
  if (path === '/api/portal/messages' && request.method === 'GET') return listPortalMessages(request, env, url)
  if (path === '/api/portal/messages' && request.method === 'POST') return createPortalMessage(request, env, { engagementId: url.searchParams.get('engagementId') || '' })
  const portalReadMatch = path.match(/^\/api\/portal\/messages\/(msg-[A-Za-z0-9_-]{8,120})\/read$/)
  if (portalReadMatch && request.method === 'POST') return markPortalMessageRead(request, env, portalReadMatch[1])
  const portalReplyMatch = path.match(/^\/api\/portal\/messages\/(msg-[A-Za-z0-9_-]{8,120})\/reply$/)
  if (portalReplyMatch && request.method === 'POST') {
    const parent = await env.DB.prepare('SELECT engagement_id, run_id FROM auditflow_portal_messages WHERE message_id = ?1').bind(portalReplyMatch[1]).first()
    if (!parent) return error(request, 'Message not found.', 404, 'MESSAGE_NOT_FOUND')
    return createPortalMessage(request, env, { engagementId: parent.engagement_id, replyTo: portalReplyMatch[1], runId: parent.run_id })
  }
  if (path === '/api/demo/uploads' && request.method === 'POST') return uploadDemoEvidence(request, env)
  const uploadMatch = path.match(/^\/api\/demo\/uploads\/(rec-[A-Za-z0-9_-]{8,120})$/)
  if (uploadMatch && request.method === 'GET') return downloadDemoEvidence(request, env, uploadMatch[1])
  if (uploadMatch && request.method === 'DELETE') return withdrawDemoEvidence(request, env, uploadMatch[1])
  if (path === '/api/assessments' && request.method === 'GET') return getAssessmentSummary(request, env, url)
  if (path === '/api/accounting-status' && request.method === 'GET') return getAccountingStatus(request, env, url)
  {
    const engagementMatch = path.match(/^\/api\/engagements\/([A-Za-z0-9_-]{1,40})(\/.*)?$/)
    if (engagementMatch) {
      const engagementId = engagementMatch[1]
      const suffix = engagementMatch[2] || ''
      if (suffix === '' && request.method === 'GET') return getEngagement(request, env, engagementId)
      if (suffix === '/workspace' && request.method === 'GET') return getWorkspace(request, env, engagementId)
      if (suffix === '/progress' && request.method === 'GET') return getEngagementProgress(request, env, engagementId)
      if (suffix === '/tasks' && request.method === 'GET') return getEngagementTasks(request, env, engagementId, url)
      if (suffix === '/timeline' && request.method === 'GET') return getEngagementTimeline(request, env, engagementId, url)
      if (suffix === '/actions' && request.method === 'POST') return dispatchEngagementAction(request, env, engagementId)
    }
  }
  if (path === '/api/comments' && request.method === 'GET') return listComments(request, env, url)
  if (path === '/api/comments' && request.method === 'POST') return createComment(request, env)
  if (path === '/api/step-preferences' && request.method === 'GET') return listStepPreferences(request, env, url)
  if (path === '/api/step-preferences' && request.method === 'PUT') return saveStepPreference(request, env)
  if (path === '/api/client-profile' && request.method === 'GET') return getClientProfile(request, env, url)
  if (path === '/api/client-profile' && request.method === 'PUT') return saveClientProfile(request, env)
  return error(request, 'That AuditFlow API endpoint does not exist.', 404, 'NOT_FOUND')
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env)
    } catch (caught) {
      console.error('AuditFlow API request failed', caught)
      return error(request, 'The AuditFlow API could not complete that request.', 500, 'INTERNAL_ERROR')
    }
  },
  async scheduled(controller, env) {
    try {
      await cleanupDemoUploads(env)
    } catch (caught) {
      console.error('AuditFlow demo upload cleanup failed', caught)
    }
  },
}
