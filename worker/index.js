const DEFAULT_ENGAGEMENT_ID = 'ENG-2026-0018'
const MAX_REQUEST_BYTES = 16_000
const MAX_COMMENT_LENGTH = 1_200
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

function baseHeaders(request) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
  const origin = originFor(request)
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers.Vary = 'Origin'
  }
  return headers
}

function json(request, payload, status = 200) {
  return Response.json(payload, { status, headers: baseHeaders(request) })
}

function error(request, message, status = 400, code = 'BAD_REQUEST') {
  return json(request, { ok: false, error: { code, message } }, status)
}

function readEngagementId(value) {
  const engagementId = String(value || DEFAULT_ENGAGEMENT_ID).trim()
  return SAFE_ENGAGEMENT_ID.test(engagementId) ? engagementId : null
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
    return json(request, { ok: true, service: 'steaudit-api', database: Boolean(env.DB), mode: 'demo' })
  }
  if (!env.DB) return error(request, 'D1 is not configured for this Worker.', 503, 'DATABASE_UNAVAILABLE')
  if (path === '/api/comments' && request.method === 'GET') return listComments(request, env, url)
  if (path === '/api/comments' && request.method === 'POST') return createComment(request, env)
  if (path === '/api/step-preferences' && request.method === 'GET') return listStepPreferences(request, env, url)
  if (path === '/api/step-preferences' && request.method === 'PUT') return saveStepPreference(request, env)
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

