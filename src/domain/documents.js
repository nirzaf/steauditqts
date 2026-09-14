import canonicalize from 'canonicalize'

export const MAX_SYNTHETIC_UPLOAD_BYTES = 2_000_000

function cryptoSubtle() {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto.subtle
  throw new Error('Web Crypto is unavailable; the synthetic bytes cannot be hashed.')
}

export async function bytesFrom(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value && typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer())
  throw new TypeError('Synthetic upload content must be text, bytes, or a File-like object.')
}

export async function sha256(value) {
  const bytes = await bytesFrom(value)
  const digest = await cryptoSubtle().digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function canonicalManifestDigest(manifest) {
  const canonical = canonicalize(manifest)
  if (typeof canonical !== 'string') throw new TypeError('Manifest contains a value that cannot be canonicalized.')
  const canonicalBytes = new TextEncoder().encode(canonical)
  return { canonical, canonicalBytesBase64: base64(canonicalBytes), digest: await sha256(canonicalBytes) }
}

export async function createSnapshot({ receiptId, engagementId, entityId, period, classification = 'AUDIT_EVIDENCE', providerVersion, content }) {
  const bytes = await bytesFrom(content)
  if (bytes.byteLength === 0) throw new TypeError('A synthetic upload cannot be empty.')
  if (bytes.byteLength > MAX_SYNTHETIC_UPLOAD_BYTES) throw new RangeError(`Synthetic uploads are limited to ${MAX_SYNTHETIC_UPLOAD_BYTES} bytes.`)
  const originalHash = await sha256(bytes)
  const storedHash = await sha256(bytes)
  const snapshotId = `SNAP-${receiptId}-${providerVersion || 'native'}`
  const manifest = {
    schema: 'auditflow.synthetic.manifest.v1',
    snapshotId,
    receiptId,
    engagementId,
    entityId,
    period,
    classification,
    providerVersion: providerVersion || 'browser-fixture-1',
    dependencies: [],
    artifacts: [{ kind: 'ORIGINAL_RECEIPT', hash: originalHash }, { kind: 'STORED_NATIVE', hash: storedHash }],
  }
  const manifestData = await canonicalManifestDigest(manifest)
  return {
    id: snapshotId,
    receiptId,
    engagementId,
    entityId,
    period,
    classification,
    providerVersion: providerVersion || 'browser-fixture-1',
    byteLength: bytes.byteLength,
    originalHash,
    storedHash,
    snapshotHash: storedHash,
    captureState: 'STABLE',
    canonicalManifest: manifestData.canonicalBytesBase64,
    manifestDigest: manifestData.digest,
    evidenceLevel: 'SIMULATION',
  }
}

