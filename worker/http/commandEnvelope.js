// M7 APPROVAL-03 — bounded UTF-8 command envelope parser.
// This is transport validation only. The Worker still resolves viewer/view,
// assignment, receipt, business rules and atomic D1 effects afterwards.

import { COMMAND_FIELDS, SHARED_ACTION_SET, validateCommandEnvelope } from '../../shared/actionContracts.js'

export class CommandInputError extends Error {
  constructor(message, status = 400, code = 'COMMAND_INVALID') {
    super(message)
    this.name = 'CommandInputError'
    this.status = status
    this.code = code
  }
}

export async function readCommandEnvelope(request, registeredActions = SHARED_ACTION_SET, maxBytes = 16_000) {
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase()
  if (!contentType.startsWith('application/json')) throw new CommandInputError('Send JSON.', 415, 'CONTENT_TYPE_INVALID')
  if (!request.body) throw new CommandInputError('A command body is required.')

  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new CommandInputError('Request too large.', 413, 'BODY_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let body
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new CommandInputError('Malformed JSON.')
  }
  const validation = validateCommandEnvelope(body, registeredActions)
  if (!validation.ok) {
    const status = validation.code === 'ACTION_NOT_ENABLED' ? 422 : 400
    throw new CommandInputError(validation.message, status, validation.code)
  }
  return validation.value
}

export function commandFields() {
  return [...COMMAND_FIELDS]
}

