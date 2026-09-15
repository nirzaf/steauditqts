// M7 APPROVAL-03 — one immutable operation per user intent.
// A timeout is UNCERTAIN, not a rejection. Callers can reconcile/retry the
// same operation and idempotency key without creating a duplicate decision.

import { normalizeOutcome } from '../../shared/actionContracts.js'

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through */ }
  return `af-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createOperation(context, action, targetId, payload = {}) {
  if (!context?.engagementId || !context?.generationId || !context?.viewId) throw new TypeError('A confirmed workspace context is required.')
  if (!Number.isSafeInteger(context.revision) || context.revision < 1) throw new TypeError('A confirmed workspace revision is required.')
  if (!Number.isSafeInteger(context.contextVersion) || context.contextVersion < 1) throw new TypeError('A confirmed context version is required.')
  const body = clone({
    action,
    targetId,
    payload,
    idempotencyKey: randomId(),
    expectedGenerationId: context.generationId,
    expectedRevision: context.revision,
    expectedContextVersion: context.contextVersion,
  })
  return { context: { ...context }, body: JSON.stringify(body), status: 'READY', result: null, createdAt: new Date().toISOString() }
}

export function operationPayload(operation) {
  if (!operation?.body) throw new TypeError('Operation body is missing.')
  return JSON.parse(operation.body)
}

export async function attemptOperation(operation, fetchImpl = fetch) {
  if (!operation || typeof operation !== 'object') throw new TypeError('Operation is required.')
  if (['COMMITTED', 'REJECTED', 'SENDING'].includes(operation.status)) return operation
  operation.status = 'SENDING'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetchImpl(`/api/engagements/${encodeURIComponent(operation.context.engagementId)}/actions`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-AuditFlow-View': operation.context.viewId,
        'X-AuditFlow-Context-Version': String(operation.context.contextVersion),
      },
      body: operation.body,
    })
    const contentType = String(response.headers?.get?.('Content-Type') || '').toLowerCase()
    if (!contentType.includes('application/json')) throw new Error('The server did not return a command result.')
    const result = normalizeOutcome(await response.json())
    if (response.ok && result.outcome === 'COMMITTED') {
      const context = operation.context
      if (result.engagementId !== context.engagementId || result.generationId !== context.generationId || result.actorId !== context.actorId) {
        throw new Error('Command response scope did not match.')
      }
      operation.status = 'COMMITTED'
      operation.result = result
    } else if (response.status >= 400 && response.status < 500 && result.outcome === 'REJECTED') {
      operation.status = 'REJECTED'
      operation.result = result
    } else {
      throw new Error('The commit outcome has not been confirmed.')
    }
  } catch (error) {
    operation.status = 'UNCERTAIN'
    operation.result = {
      outcome: 'UNCERTAIN',
      code: 'COMMIT_UNCONFIRMED',
      message: error?.message || 'The commit outcome is unconfirmed.',
      guidance: 'Check the command receipt or retry this same operation. Do not create a new key.',
    }
  } finally {
    clearTimeout(timer)
  }
  return operation
}

export function canRetryOperation(operation) {
  return Boolean(operation && ['READY', 'UNCERTAIN'].includes(operation.status))
}

