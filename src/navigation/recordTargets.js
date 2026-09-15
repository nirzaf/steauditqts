// Canonical record-target metadata shared by queue producers and destination
// pages. Hash locations are intentionally lightweight; this helper keeps the
// prefix/route rules in one place so a task can never open the wrong surface.

const TARGETS = Object.freeze([
  { pattern: /^(?:PBC-|REC-)/i, route: 'pbc', key: 'pbc' },
  { pattern: /^MIR-/i, route: 'client-communications', key: 'client-communications' },
  { pattern: /^(?:WP-|RISK-|FND-|SMP-|POP-)/i, route: 'audit', key: 'audit' },
  { pattern: /^(?:RP-|APP-|EQR-|REV-)/i, route: 'reviews', key: 'reviews' },
  { pattern: /^(?:DOC-|REPORT-|FS-FINAL-)/i, route: 'artifacts', key: 'artifacts' },
  { pattern: /^(?:RC-|REL-|CHK-|ARCH-|LH-)/i, route: 'release', key: 'release' },
  { pattern: /^(?:TB-|PKG-|FS-|AJ-)/i, route: 'accounting', key: 'accounting' },
  { pattern: /^(?:COMM-|TERMS-|COST-|FEE-|QTN-|ACT-)/i, route: 'engagements', key: 'engagements' },
  { pattern: /^ENG-/i, route: 'engagements', key: 'engagements' },
  { pattern: /^G(?:10?|[0-9])$/i, route: 'pipeline', key: 'pipeline' },
  { pattern: /^(?:CE-|CLI-|CLIENT-|LEAD-|QUESTION-|Q-)/i, route: 'clients', key: 'clients' },
  { pattern: /^(?:TASK-|ROLE-)/i, route: 'role-workspace', key: 'role-workspace' },
  { pattern: /^(?:MSG-|OUT-)/i, route: 'client-communications', key: 'client-communications' },
])

export function recordTargetFor(routeKey = '', recordId = '') {
  const route = String(routeKey || '').trim()
  const id = String(recordId || '').trim()
  if (!id) return { routeKey: route || 'role-workspace', recordId: '', matched: false }
  const match = TARGETS.find((entry) => entry.pattern.test(id))
  return {
    routeKey: route || match?.route || 'role-workspace',
    recordId: id,
    matched: Boolean(match),
    targetType: match?.key || 'unknown',
  }
}

export function targetIsInScope(recordId, collection = []) {
  const id = String(recordId || '').trim()
  return Boolean(id && Array.isArray(collection) && collection.some((item) => {
    const candidate = item?.id || item?.taskId || item?.recordId || item?.receiptId
    return String(candidate || '') === id
  }))
}

export const RECORD_TARGET_RULES = TARGETS
