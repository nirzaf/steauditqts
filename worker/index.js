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

// The browser demo is deliberately local-only. Shared routes can be enabled
// only by an operator who has separately protected the Worker with Cloudflare
// Access, provisioned an isolated non-production binding, and set all three
// explicit deployment values. A caller-supplied role, Origin, password or
// obscured URL is never treated as identity.
function trustedSharedDemoRequest(request, env) {
  if (env.SHARED_DEMO_ENABLED !== 'true') return false
  if (env.SHARED_DEMO_IDENTITY_MODE !== 'cloudflare-access-verified') return false
  if (env.SHARED_DEMO_BINDING !== 'isolated-non-production') return false
  return Boolean(request.headers.get('Cf-Access-Jwt-Assertion') && request.headers.get('Cf-Access-Authenticated-User-Email'))
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
