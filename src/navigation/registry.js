// M7 NAV-03 — one metadata registry for menus, routes, palette and deep links.
// Components remain lazy-loaded by App.vue; this file owns the policy labels
// and route keys so the shell does not grow another competing access list.

export const ROUTE_REGISTRY = Object.freeze({
  dashboard: { label: 'Overview', title: 'Overview', section: 'Workspace', navTier: 'core', roles: ['admin'], presentation: true },
  portfolio: { label: 'Operational portfolio', title: 'Operational portfolio', section: 'Workspace', navTier: 'core', roles: ['admin', 'audit-manager', 'partner'] },
  clients: { label: 'Clients & acceptance', title: 'Clients & acceptance', section: 'Workflow', navTier: 'core', roles: ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'compliance'], presentation: true },
  engagements: { label: 'Engagements', title: 'Engagement workspace', section: 'Workflow', navTier: 'core', roles: ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance'], presentation: true },
  pbc: { label: 'PBC portal', title: 'PBC portal', section: 'Workflow', navTier: 'core', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'audit-senior', 'audit-manager'], presentation: true },
  accounting: { label: 'Accounting & TB', title: 'Accounting & TB', section: 'Workflow', navTier: 'core', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client-management'], presentation: true },
  audit: { label: 'Audit & fieldwork', title: 'Audit & fieldwork', section: 'Workflow', navTier: 'core', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'audit-senior', 'audit-manager', 'partner'], presentation: true },
  reviews: { label: 'Reviews & approvals', title: 'Reviews & approvals', section: 'Control', navTier: 'core', roles: ['admin', 'audit-manager', 'partner', 'accounting-reviewer', 'eqr'], presentation: true },
  release: { label: 'Release & archive', title: 'Release & archive', section: 'Control', navTier: 'core', roles: ['admin', 'partner', 'eqr', 'records', 'finance', 'compliance'], presentation: true },
  integration: { label: 'Integration health', title: 'Integration health', section: 'Control', navTier: 'advanced', roles: ['admin', 'system-admin', 'records'] },
  architecture: { label: 'Architecture map', title: 'Architecture map', section: 'Reference', navTier: 'advanced', roles: ['admin', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'] },
  blueprint: { label: 'V5 operating model', title: 'V5 operating model', section: 'Reference', navTier: 'advanced', roles: ['admin', 'finance'] },
  cycle: { label: 'Complete cycle', title: 'Complete cycle', section: 'Reference', navTier: 'advanced', roles: ['admin'] },
  readiness: { label: 'Phase 0 readiness', title: 'Phase 0 readiness', section: 'Administration', navTier: 'advanced', roles: ['admin'] },
  pipeline: { label: 'Pipeline visualizer', title: 'Audit portal pipeline', section: 'Reference', navTier: 'advanced', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'], presentation: true },
  'shared-demo': { label: 'Workflow control room', title: 'Workflow control room', section: 'Reference', navTier: 'advanced', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'] },
  artifacts: { label: 'Document center', title: 'Document center', section: 'Workflow', navTier: 'core', roles: ['admin', 'client', 'client-management', 'preparer', 'audit-senior', 'audit-manager', 'partner', 'finance', 'accountant', 'accounting-reviewer', 'eqr', 'records', 'system-admin', 'compliance'], presentation: true },
  'admin-console': { label: 'Admin console', title: 'Admin console', section: 'Administration', navTier: 'core', roles: ['admin', 'system-admin'] },
  'role-workspace': { label: 'My role workspace', title: 'Role workspace', section: 'Workspace', navTier: 'core', roles: ['client', 'client-management', 'preparer', 'audit-senior', 'audit-manager', 'partner', 'finance', 'accountant', 'accounting-reviewer', 'eqr', 'records', 'system-admin', 'compliance', 'admin'], presentation: true },
  'client-home': { label: 'Portal overview', title: 'Client portal', section: 'Client portal', navTier: 'core', roles: ['admin', 'client', 'client-management'], presentation: true },
  'client-details': { label: 'Client details', title: 'Client details', section: 'Client portal', navTier: 'core', roles: ['admin', 'client', 'client-management'], presentation: true },
  'client-communications': { label: 'Communications', title: 'Portal communications', section: 'Client portal', navTier: 'core', roles: ['admin', 'client', 'client-management'], presentation: true },
  'client-architecture': { label: 'How the platform works', title: 'Client architecture', section: 'Client portal', navTier: 'advanced', roles: ['admin', 'client', 'client-management'] },
  'accountant-home': { label: 'Accountant overview', title: 'Accountant portal', section: 'Accounting portal', navTier: 'core', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'], presentation: true },
  'accountant-client': { label: 'View client details', title: 'View client details', section: 'Accounting portal', navTier: 'core', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'], presentation: true },
  'accountant-architecture': { label: 'Accountant architecture', title: 'Accountant architecture', section: 'Accounting portal', navTier: 'advanced', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'] },
})

export function createRouteRegistry(routes = ROUTE_REGISTRY) {
  return Object.freeze({ ...routes })
}

export function routeIsAllowed(routeKey, role, registry = ROUTE_REGISTRY) {
  return Boolean(registry?.[routeKey]?.roles?.includes(role))
}

export function routeKeysForRole(role, registry = ROUTE_REGISTRY) {
  return Object.entries(registry)
    .filter(([, route]) => route.roles?.includes(role))
    .map(([key]) => key)
}

export function routeMenuForRole(role, registry = ROUTE_REGISTRY) {
  return Object.entries(registry)
    .filter(([, route]) => route.roles?.includes(role))
    .map(([key, route]) => ({ key, ...route }))
}
