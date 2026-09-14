const DEFAULT_ENGAGEMENT_ID = 'ENG-0018-AUD-2026'
const MAX_REQUEST_BYTES = 16_000
const MAX_COMMENT_LENGTH = 1_200
const MAX_CONTEXT_LENGTH = 1_200
const MAX_PAGE_SIZE = 50
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const SAFE_ENGAGEMENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
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
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-AuditFlow-Request-Id, X-Correlation-Id'
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
  if (text.length > MAX_REQUEST_BYTES) throw new Error('Request body is too large.')
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
  const profile = await env.DB.prepare(`SELECT ${profileColumns} FROM auditflow_client_profiles WHERE engagement_id = ?1`).bind(engagementId).first()
  return json(request, { ok: true, profile: profile ? serializeProfile(profile) : null })
}

async function saveClientProfile(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED')
  const payload = await readJson(request)
  if (!payload) return error(request, 'Send a JSON object in the request body.')
  const engagementId = readEngagementId(payload.engagementId)
  const legalName = cleanText(payload.legalName, 160)
  const registration = cleanText(payload.registration, 80)
  const contactName = cleanText(payload.contactName, 80)
  const contactEmail = cleanText(payload.contactEmail, 160)
  const phone = cleanText(payload.phone, 40)
  const servicePeriod = cleanText(payload.servicePeriod, 120)
  const serviceRequested = cleanText(payload.serviceRequested, 160)
  const context = cleanText(payload.context, MAX_CONTEXT_LENGTH, '') ?? ''
  const submittedBy = cleanText(payload.submittedBy, 80, 'Client contact')
  if (!engagementId || !legalName || !registration || !contactName || !contactEmail || !phone || !servicePeriod || !serviceRequested || !submittedBy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
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
  const pageKey = readKey(payload.pageKey)
  const stepKey = readKey(payload.stepKey, pageKey || '')
  const authorName = cleanText(payload.authorName, 80)
  const authorRole = cleanText(payload.authorRole, 80, 'Client contact')
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
  // Keep the session useful for the demo's bounded activity window. This is
  // deliberately best-effort; a read must not fail only because an activity
  // timestamp update was unavailable.
  void env.DB.prepare("UPDATE auditflow_demo_sessions SET last_activity = datetime('now') WHERE session_id = ?1").bind(sessionId).run().catch(() => {});
  return { sessionId: row.session_id, personaId: row.persona_id, actorId: row.actor_id, roles: persona.roles };
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

async function createDemoSession(request, env) {
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED');
  const payload = await readJson(request);
  if (!payload) return error(request, 'Send a JSON object in the request body.');
  const personaId = String(payload.personaId || '').trim();
  const persona = DEMO_PERSONAS[personaId];
  if (!persona) return error(request, 'Choose one of the demo personas.', 400, 'UNKNOWN_PERSONA');
  const sessionId = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  await env.DB.prepare(
    `INSERT INTO auditflow_demo_sessions (session_id, persona_id, actor_id, expires_at)
     VALUES (?1, ?2, ?3, datetime('now', '+1 day'))`,
  ).bind(sessionId, personaId, persona.actorId).run();
  const correlationId = requestCorrelationId(request);
  const headers = baseHeaders(request, correlationId);
  headers['Set-Cookie'] = sessionCookie(sessionId);
  return Response.json({ ok: true, session: { personaId, actorId: persona.actorId, roles: persona.roles }, evidenceLevel: 'SIMULATION' }, { status: 201, headers });
}

async function getDemoMe(request, env) {
  const session = await resolveDemoSession(request, env);
  if (!session) return error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED');
  return json(request, { ok: true, session, evidenceLevel: 'SIMULATION' });
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
  return json(request, { ok: true, tasks: (result.results || []).map(serializeTask), evidenceLevel: 'SIMULATION' });
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
  return json(request, { ok: true, events: (result.results || []).map(serializeEvent), evidenceLevel: 'SIMULATION' });
}

async function listArtifacts(request, env, url) {
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  if (!(ACTOR_ASSIGNMENTS[checked.session.actorId] || []).includes(engagementId)) return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
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
  const checked = await requireDemoSession(request, env);
  if (checked.response) return checked.response;
  const engagementId = readEngagementId(url.searchParams.get('engagementId'));
  if (!engagementId) return error(request, 'A valid engagementId is required.');
  if (!(ACTOR_ASSIGNMENTS[checked.session.actorId] || []).includes(engagementId)) return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  const result = await env.DB.prepare(
    'SELECT * FROM auditflow_outbox WHERE engagement_id = ?1 ORDER BY created_at DESC LIMIT 100',
  ).bind(engagementId).all();
  return json(request, { ok: true, messages: result.results || [], evidenceLevel: 'SIMULATION' });
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

function hasAnyRole(session, roles) {
  return roles.some((role) => session.roles.includes(role));
}

async function findEventByIdempotency(env, engagementId, key) {
  if (!key) return null;
  return env.DB.prepare(
    'SELECT * FROM auditflow_events WHERE engagement_id = ?1 AND idempotency_key = ?2',
  ).bind(engagementId, key).first();
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

async function upsertTask(env, task) {
  await env.DB.prepare(
    `INSERT INTO auditflow_tasks (task_id, engagement_id, assignee_persona, assignee_role, title, state, due_date, linked_object_type, linked_object_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT (task_id) DO UPDATE SET state = excluded.state, title = excluded.title`,
  ).bind(task.taskId, task.engagementId, task.assigneePersona || '', task.assigneeRole || '', task.title, task.state || 'OPEN', task.dueDate || '', task.linkedObjectType || '', task.linkedObjectId || '').run();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  if (!commercial || commercial.advance_state !== 'VERIFIED') {
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
  await upsertTask(env, { taskId: `pbc-client-${requestId}`, engagementId: id, assigneeRole: 'client_contributor', title: `Respond to ${requestId}: ${title}`, state: 'OPEN', linkedObjectType: 'pbc_request', linkedObjectId: requestId });
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
  const hardCopy = Boolean(payload.hardCopy);
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

async function actionRecordTbSource(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['client_contributor', 'preparer', 'accounting_reviewer', 'system_admin'])) {
    return error(request, 'Only the Client, Accountant or Reviewer demo persona can load the trial balance.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const sourceId = String(payload.sourceId || '').trim();
  const sourceVersion = String(payload.sourceVersion || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(sourceId) || !/^[A-Za-z0-9_.-]{1,20}$/.test(sourceVersion)) {
    return error(request, 'Provide a valid sourceId and sourceVersion (for example TB-BASELINE-001 / v03).');
  }
  const currency = cleanCurrency(payload.currency);
  const debitTotal = cleanMoney(payload.debitTotal);
  const creditTotal = cleanMoney(payload.creditTotal);
  const rowCount = Number(payload.rowCount || 0);
  if (!currency || !debitTotal || !creditTotal || !Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > 5000) {
    return error(request, 'Provide currency (3-letter code), debit/credit totals and a row count up to 5,000.');
  }
  if (debitTotal !== creditTotal) return error(request, `Debit ${debitTotal} does not equal credit ${creditTotal}. The source was not recorded.`, 400, 'UNBALANCED_SOURCE');
  const validationState = String(payload.validationState || 'VALIDATED').trim().toUpperCase();
  if (!['DRAFT', 'VALIDATED', 'REJECTED'].includes(validationState)) return error(request, 'Validation state must be DRAFT, VALIDATED, or REJECTED.');
  const replacesVersion = String(payload.replacesVersion || '').trim().slice(0, 20);
  await env.DB.prepare(
    `INSERT INTO auditflow_tb_sources (id, engagement_id, source_id, source_version, period, currency, row_count, debit_total, credit_total, validation_state, mapping_complete, replaces_version, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
     ON CONFLICT (engagement_id, source_version) DO UPDATE SET source_id = excluded.source_id, period = excluded.period,
       currency = excluded.currency, row_count = excluded.row_count, debit_total = excluded.debit_total, credit_total = excluded.credit_total,
       validation_state = excluded.validation_state, mapping_complete = excluded.mapping_complete, replaces_version = excluded.replaces_version, created_by = excluded.created_by`,
  ).bind(crypto.randomUUID(), id, sourceId, sourceVersion, cleanText(payload.period, 40, '') ?? '', currency, rowCount, debitTotal, creditTotal, validationState, payload.mappingComplete ? 1 : 0, replacesVersion, session.actorId).run();
  const engagement = await touchEngagement(env, id, 'STAGE-05');
  await upsertTask(env, { taskId: `tb-review-${id}-${sourceVersion}`, engagementId: id, assigneeRole: 'accounting_reviewer', title: `Review TB ${sourceVersion} (${debitTotal})`, state: 'OPEN', linkedObjectType: 'tb_source', linkedObjectId: sourceVersion });
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'TB_SOURCE_RECORDED', objectType: 'tb_source', objectId: sourceVersion, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, sourceVersion, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
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
  await env.DB.prepare(`UPDATE auditflow_review_points SET response = ?2, state = 'CLEARED', cleared_at = datetime('now') WHERE review_id = ?1`).bind(reviewId, response).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'REVIEW_POINT_CLEARED', objectType: 'review_point', objectId: reviewId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, reviewId, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' });
}

async function latestPublishedDraftFs(env, engagementId) {
  const rows = await env.DB.prepare(
    `SELECT * FROM auditflow_artifacts WHERE engagement_id = ?1 AND document_type = 'DRAFT_FS' AND state = 'PUBLISHED' ORDER BY created_at DESC LIMIT 10`,
  ).bind(engagementId).all();
  const list = rows.results || [];
  list.sort((a, b) => String(b.version || '').localeCompare(String(a.version || '')));
  return list[0] || null;
}

async function actionPublishDraftFs(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['audit_senior', 'audit_manager'])) {
    return error(request, 'Only the Audit Senior or Manager demo persona can publish the Draft FS.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const summary = cleanText(payload.summary, MAX_CONTEXT_LENGTH, '') ?? '';
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
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'DRAFT_FS', ?3, ?4, ?5, ?6, ?7)`,
  ).bind(decisionId, id, version, decision, session.actorId, explanation, 1).run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`draftfs-response-${id}-${version}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: `DRAFT_FS_${decision === 'REVISION' ? 'REVISION_REQUESTED' : decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'}`, objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision, version }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCompleteEqr(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['eqr_reviewer'])) {
    return error(request, 'Only the EQR Reviewer demo persona can complete the quality review.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const decision = String(payload.decision || '').trim().toUpperCase();
  if (!['APPROVE', 'RETURN', 'HOLD'].includes(decision)) return error(request, 'Decision must be APPROVE, RETURN, or HOLD.');
  const note = cleanText(payload.note, MAX_CONTEXT_LENGTH) || '';
  if (decision !== 'APPROVE' && !note) return error(request, 'Record a note when returning or holding the file.');
  const candidateId = String(payload.candidateId || '').trim();
  const decisionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'EQR', ?3, ?4, ?5, ?6, 1)`,
  ).bind(decisionId, id, candidateId, decision, session.actorId, note).run();
  await env.DB.prepare(`UPDATE auditflow_tasks SET state = 'COMPLETE', completed_at = datetime('now') WHERE task_id = ?1`).bind(`eqr-${id}`).run();
  const engagement = await touchEngagement(env, id, null);
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: `EQR_${decision === 'RETURN' ? 'RETURNED' : decision === 'HOLD' ? 'ON_HOLD' : 'APPROVED'}`, objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, decision }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionRecordAuditOpinion(request, env, session, id, payload, correlationId) {
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
  const decisionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'AUDIT_OPINION', ?3, ?4, ?5, ?6, 1)`,
  ).bind(decisionId, id, candidateVersion, opinionType, session.actorId, rationale).run();
  const engagement = await touchEngagement(env, id, 'STAGE-07');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'AUDIT_OPINION_RECORDED', objectType: 'decision', objectId: decisionId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, decision: { decisionId, opinionType, candidateVersion }, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
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

async function latestDecision(env, engagementId, type) {
  return env.DB.prepare(
    `SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 AND decision_type = ?2 ORDER BY decided_at DESC LIMIT 1`,
  ).bind(engagementId, type).first();
}

async function actionReleaseFinalReport(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['engagement_partner'])) {
    return error(request, 'Only the Partner demo persona can release the final report.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const existing = await latestDecision(env, id, 'RELEASE');
  if (existing) {
    return json(request, { ok: true, duplicate: true, releaseId: existing.decision_id, evidenceLevel: 'SIMULATION' });
  }
  const opinion = await latestDecision(env, id, 'AUDIT_OPINION');
  if (!opinion) return error(request, 'Form the audit opinion before releasing the final report.', 409, 'PRECONDITION_FAILED');
  const eqr = await latestDecision(env, id, 'EQR');
  if (!eqr || eqr.decision !== 'APPROVE') {
    return error(request, 'Required EQR is incomplete. Release is blocked until EQR approves.', 409, 'EQR_INCOMPLETE');
  }
  const openPoints = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auditflow_review_points WHERE engagement_id = ?1 AND state = 'OPEN'`,
  ).bind(id).first();
  if (Number(openPoints?.n || 0) > 0) {
    return error(request, 'Unresolved review points block release. Clear or return each open point first.', 409, 'REVIEW_POINTS_OPEN');
  }
  const candidateVersion = opinion.object_version;
  const releaseId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  const fsId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
     VALUES (?1, ?2, 'FINAL_REPORT', 'Final audit report', 'v01', 'PUBLISHED', 'CLIENT_VISIBLE', ?3, datetime('now'))`,
  ).bind(reportId, id, session.actorId).run();
  await env.DB.prepare(
    `INSERT INTO auditflow_artifacts (document_id, engagement_id, document_type, title, version, state, visibility, created_by, published_at)
     VALUES (?1, ?2, 'FINAL_FS', ?3, ?4, 'PUBLISHED', 'CLIENT_VISIBLE', ?5, datetime('now'))`,
  ).bind(fsId, id, `Final financial statements ${candidateVersion}`, candidateVersion, session.actorId).run();
  await env.DB.prepare(
    `INSERT INTO auditflow_decisions (decision_id, engagement_id, decision_type, object_version, decision, decided_by, rationale, revision)
     VALUES (?1, ?2, 'RELEASE', ?3, 'RELEASED', ?4, ?5, 1)`,
  ).bind(releaseId, id, candidateVersion, session.actorId, cleanText(payload.rationale, MAX_CONTEXT_LENGTH) || '').run();
  await upsertTask(env, { taskId: `invoice-${id}`, engagementId: id, assigneeRole: 'finance_team', title: 'Generate final invoice', state: 'OPEN', linkedObjectType: 'decision', linkedObjectId: releaseId });
  const engagement = await touchEngagement(env, id, 'STAGE-08');
  await appendEvent(env, { engagementId: id, actor: session.actorId, action: 'FINAL_RELEASED', objectType: 'decision', objectId: releaseId, previousRevision: (engagement?.revision || 1) - 1, newRevision: engagement?.revision || 1, idempotencyKey: String(payload.idempotencyKey || ''), correlationId });
  return json(request, { ok: true, duplicate: false, releaseId, reportId, fsId, candidateVersion, engagement: serializeEngagementState(engagement), evidenceLevel: 'SIMULATION' }, 201);
}

async function actionCreateInvoice(request, env, session, id, payload, correlationId) {
  if (!hasAnyRole(session, ['finance_team'])) {
    return error(request, 'Only the Finance demo persona can generate the invoice.', 403, 'ROLE_NOT_AUTHORIZED');
  }
  const release = await latestDecision(env, id, 'RELEASE');
  if (!release) return error(request, 'Release the final report before generating the invoice.', 409, 'PRECONDITION_FAILED');
  const actualHours = cleanHours(payload.actualHours);
  const actualCost = cleanMoney(payload.actualCost);
  if (!actualHours || !actualCost) return error(request, 'Provide actualHours (whole hours) and actualCost as a base-10 money value.');
  const commercial = await env.DB.prepare('SELECT * FROM auditflow_commercial WHERE engagement_id = ?1').bind(id).first();
  const feeCents = moneyToCents(commercial?.approved_fee || '');
  const advanceCents = moneyToCents(commercial?.advance_required || '0.00');
  if (feeCents == null || advanceCents == null) return error(request, 'The commercial record has no approved fee yet.', 409, 'PRECONDITION_FAILED');
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

async function dispatchEngagementAction(request, env, engagementId) {
  const id = readEngagementId(engagementId);
  if (!id) return error(request, 'A valid engagement id is required.');
  if (env.ALLOW_DEMO_WRITES === 'false') return error(request, 'Demo writes are currently disabled.', 403, 'WRITES_DISABLED');
  const session = await resolveDemoSession(request, env);
  if (!session) return error(request, 'No active shared demo session. Choose a persona first.', 401, 'SESSION_REQUIRED');
  if (!(ACTOR_ASSIGNMENTS[session.actorId] || []).includes(id)) {
    return error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED');
  }
  const payload = await readJson(request);
  if (!payload) return error(request, 'Send a JSON object in the request body.');
  const action = String(payload.action || '').trim();
  if (!/^[A-Z][A-Z0-9_]{2,59}$/.test(action)) return error(request, 'Provide a valid workflow action name.');
  const correlationId = requestCorrelationId(request);
  if (action === 'SUBMIT_CLIENT_DETAILS') return actionSubmitClientDetails(request, env, session, id, payload, correlationId);
  if (action === 'ACCEPT_CLIENT') return actionAcceptClient(request, env, session, id, payload, correlationId);
  if (action === 'VERIFY_ADVANCE') return actionVerifyAdvance(request, env, session, id, payload, correlationId);
  if (action === 'ISSUE_TEMP_CREDENTIAL') return actionIssueTempCredential(request, env, session, id, payload, correlationId);
  if (action === 'ACTIVATE_PORTAL') return actionActivatePortal(request, env, session, id, payload, correlationId);
  if (action === 'ISSUE_ANNOUNCEMENT') return actionIssueAnnouncement(request, env, session, id, payload, correlationId);
  if (action === 'RECORD_ESTIMATE') return actionRecordEstimate(request, env, session, id, payload, correlationId);
  if (action === 'APPROVE_FEE') return actionApproveFee(request, env, session, id, payload, correlationId);
  if (action === 'RESPOND_EL') return actionRespondEl(request, env, session, id, payload, correlationId);
  if (action === 'CREATE_PBC_REQUEST') return actionCreatePbcRequest(request, env, session, id, payload, correlationId);
  if (action === 'SUBMIT_PBC_RECEIPT') return actionSubmitPbcReceipt(request, env, session, id, payload, correlationId);
  if (action === 'RESPOND_PBC_RECEIPT') return actionRespondPbcReceipt(request, env, session, id, payload, correlationId);
  if (action === 'RECORD_TB_SOURCE') return actionRecordTbSource(request, env, session, id, payload, correlationId);
  if (action === 'SUBMIT_WORKPAPER') return actionSubmitWorkpaper(request, env, session, id, payload, correlationId);
  if (action === 'CREATE_REVIEW_POINT') return actionCreateReviewPoint(request, env, session, id, payload, correlationId);
  if (action === 'CLEAR_REVIEW_POINT') return actionClearReviewPoint(request, env, session, id, payload, correlationId);
  if (action === 'PUBLISH_DRAFT_FS') return actionPublishDraftFs(request, env, session, id, payload, correlationId);
  if (action === 'RESPOND_DRAFT_FS') return actionRespondDraftFs(request, env, session, id, payload, correlationId);
  if (action === 'COMPLETE_EQR') return actionCompleteEqr(request, env, session, id, payload, correlationId);
  if (action === 'RECORD_AUDIT_OPINION') return actionRecordAuditOpinion(request, env, session, id, payload, correlationId);
  if (action === 'RELEASE_FINAL_REPORT') return actionReleaseFinalReport(request, env, session, id, payload, correlationId);
  if (action === 'CREATE_INVOICE') return actionCreateInvoice(request, env, session, id, payload, correlationId);
  if (action === 'CLOSE_ENGAGEMENT') return actionCloseEngagement(request, env, session, id, payload, correlationId);
  return error(request, `Shared action ${action} is not enabled yet in this demo phase. The decision was not committed.`, 501, 'ACTION_NOT_ENABLED');
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
  if (!(ACTOR_ASSIGNMENTS[checked.session.actorId] || []).includes(id)) {
    return { response: error(request, 'This demo persona is not assigned to the requested engagement.', 403, 'SCOPE_DENIED') };
  }
  return checked;
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
    'SELECT * FROM auditflow_decisions WHERE engagement_id = ?1 ORDER BY decided_at DESC LIMIT 100',
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
      evidenceLevel: 'SIMULATION',
    })
  }
  if (!trustedSharedDemoRequest(request, env)) return error(request, 'Shared demo data routes are disabled until a verified Cloudflare Access identity and isolated non-production binding are configured.', 403, 'SHARED_DEMO_DISABLED')
  if (!env.DB) return error(request, 'D1 is not configured for this Worker.', 503, 'DATABASE_UNAVAILABLE')
  if (path === '/api/demo/session' && request.method === 'POST') return createDemoSession(request, env)
  if (path === '/api/demo/me' && request.method === 'GET') return getDemoMe(request, env)
  if (path === '/api/demo/reset' && request.method === 'POST') return resetSharedDemo(request, env)
  if (path === '/api/artifacts' && request.method === 'GET') return listArtifacts(request, env, url)
  if (path === '/api/pbc' && request.method === 'GET') return listPbc(request, env, url)
  if (path === '/api/workpapers' && request.method === 'GET') return listWorkpapers(request, env, url)
  if (path === '/api/reviews' && request.method === 'GET') return listReviews(request, env, url)
  if (path === '/api/decisions' && request.method === 'GET') return listDecisions(request, env, url)
  if (path === '/api/outbox' && request.method === 'GET') return listOutbox(request, env, url)
  {
    const engagementMatch = path.match(/^\/api\/engagements\/([A-Za-z0-9_-]{1,40})(\/.*)?$/)
    if (engagementMatch) {
      const engagementId = engagementMatch[1]
      const suffix = engagementMatch[2] || ''
      if (suffix === '' && request.method === 'GET') return getEngagement(request, env, engagementId)
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
}
