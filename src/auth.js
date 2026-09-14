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

