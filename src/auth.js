const sessionStorageKey = 'auditflow-demo-session-v1'

// These accounts are intentionally fictional and only demonstrate role-based
// navigation in the prototype. They are not production credentials.
export const demoUsers = [
  {
    id: 'client-demo',
    role: 'client',
    roleLabel: 'Client portal',
    name: 'Nadia Faris',
    organization: 'Northstar Trading W.L.L.',
    initials: 'NF',
    tone: 'blue',
    email: 'nadia@northstar.demo',
    password: 'client123',
    landing: 'client-home',
    description: 'Submit company details, upload requested evidence, and keep every question with the engagement team in one portal thread.',
  },
  {
    id: 'client-management-demo',
    role: 'client-management',
    roleLabel: 'Client management approver',
    name: 'Nadia Faris',
    organization: 'Northstar Trading W.L.L.',
    initials: 'NF',
    tone: 'blue',
    email: 'management@northstar.demo',
    password: 'management123',
    landing: 'role-workspace',
    description: 'Review the engagement letter, management accounting decisions, Draft FS responses, and published deliverables.',
  },
  {
    id: 'admin-demo',
    role: 'admin',
    roleLabel: 'Admin portal',
    name: 'Maya Rahman',
    organization: 'Quadrate Audit',
    initials: 'MR',
    tone: 'navy',
    email: 'maya@quadrate.demo',
    password: 'admin123',
    landing: 'dashboard',
    description: 'See every workspace, manage demo access, and review the complete acceptance-to-archive control chain.',
  },
  {
    id: 'system-admin-only-demo',
    role: 'system-admin',
    roleLabel: 'System administrator',
    name: 'Samir Khan',
    organization: 'Quadrate Audit',
    initials: 'SK',
    tone: 'navy',
    email: 'samir@quadrate.demo',
    password: 'samir123',
    landing: 'role-workspace',
    description: 'Manage user access, session state, and technical diagnostics without making professional decisions.',
  },
  {
    id: 'audit-senior-demo',
    role: 'audit-senior',
    roleLabel: 'Audit senior',
    name: 'Omar Aziz',
    organization: 'Quadrate Audit',
    initials: 'OA',
    tone: 'blue',
    email: 'omar@quadrate.demo',
    password: 'omar123',
    landing: 'role-workspace',
    description: 'Plan the engagement, issue evidence requests, prepare workpapers, and coordinate the Draft FS handoff.',
  },
  {
    id: 'preparer-demo',
    role: 'preparer',
    roleLabel: 'Junior / preparer',
    name: 'Fatima Saleh',
    organization: 'Quadrate Audit',
    initials: 'FS',
    tone: 'blue',
    email: 'preparer@quadrate.demo',
    password: 'preparer123',
    landing: 'role-workspace',
    description: 'Complete assigned procedures, attach evidence, submit workpapers, and record time without self-clearing review points.',
  },
  {
    id: 'audit-manager-demo',
    role: 'audit-manager',
    roleLabel: 'Audit manager',
    name: 'Omar Aziz',
    organization: 'Quadrate Audit',
    initials: 'OA',
    tone: 'blue',
    email: 'manager@quadrate.demo',
    password: 'manager123',
    landing: 'role-workspace',
    description: 'Review plans, workpapers, client feedback, review points, deadlines, and completion recommendations.',
  },
  {
    id: 'partner-demo',
    role: 'partner',
    roleLabel: 'Audit partner / signatory',
    name: 'Maya Rahman',
    organization: 'Quadrate Audit',
    initials: 'MR',
    tone: 'navy',
    email: 'partner@quadrate.demo',
    password: 'partner123',
    landing: 'role-workspace',
    description: 'Own acceptance, continuance, final professional decisions, opinion, client discussion, and release authorization.',
  },
  {
    id: 'finance-demo',
    role: 'finance',
    roleLabel: 'Finance team',
    name: 'Aisha Rahman',
    organization: 'Quadrate Audit',
    initials: 'AR',
    tone: 'green',
    email: 'finance@quadrate.demo',
    password: 'finance123',
    landing: 'role-workspace',
    description: 'Prepare cost estimates, verify advances, review time and cost, issue invoices, and close the commercial record.',
  },
  {
    id: 'accountant-demo',
    role: 'accountant',
    roleLabel: 'Accountant portal',
    name: 'Leila Noor',
    organization: 'Quadrate Audit',
    initials: 'LN',
    tone: 'green',
    email: 'leila@quadrate.demo',
    password: 'accountant123',
    landing: 'accountant-home',
    description: 'View client details, prepare the accounting package, follow PBC evidence, and continue into audit fieldwork.',
  },
  {
    id: 'accounting-reviewer-demo',
    role: 'accounting-reviewer',
    roleLabel: 'Accounting reviewer',
    name: 'Leila Noor',
    organization: 'Quadrate Audit',
    initials: 'LN',
    tone: 'green',
    email: 'reviewer@quadrate.demo',
    password: 'reviewer123',
    landing: 'role-workspace',
    description: 'Review the prepared TB, mappings, journals, and statement package independently from preparation.',
  },
  {
    id: 'eqr-demo',
    role: 'eqr',
    roleLabel: 'EQR reviewer',
    name: 'Yusuf Ali',
    organization: 'Quadrate Audit',
    initials: 'YA',
    tone: 'purple',
    email: 'eqr@quadrate.demo',
    password: 'eqr123',
    landing: 'role-workspace',
    description: 'Perform the independent engagement quality review against the exact release candidate.',
  },
  {
    id: 'records-demo',
    role: 'records',
    roleLabel: 'Records custodian',
    name: 'Sara Khan',
    organization: 'Quadrate Audit',
    initials: 'SK',
    tone: 'purple',
    email: 'records@quadrate.demo',
    password: 'records123',
    landing: 'role-workspace',
    description: 'Verify checkpoints, assemble the archive, manage legal holds, and preserve amendment links.',
  },
  {
    id: 'compliance-demo',
    role: 'compliance',
    roleLabel: 'Compliance reviewer',
    name: 'Sara Khan',
    organization: 'Quadrate Audit',
    initials: 'SK',
    tone: 'purple',
    email: 'compliance@quadrate.demo',
    password: 'compliance123',
    landing: 'role-workspace',
    description: 'Review acceptance evidence, independence controls, and records-policy observations before handoff.',
  },
]

export function findDemoUser({ email, password } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  return demoUsers.find((user) => user.email === normalizedEmail && user.password === password) || null
}

export function getDemoUser(id) {
  return demoUsers.find((user) => user.id === id) || null
}

export function loadDemoSession() {
  if (typeof window === 'undefined') return null
  try {
    const id = window.localStorage.getItem(sessionStorageKey)
    return getDemoUser(id)
  } catch {
    return null
  }
}

export function saveDemoSession(user) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(sessionStorageKey, user.id) } catch { /* demo session is optional */ }
}

export function clearDemoSession() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(sessionStorageKey) } catch { /* demo session is optional */ }
}
