<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LoginPage from './pages/LoginPage.vue'
import Icon from './components/Icon.vue'
import AsyncPageError from './components/AsyncPageError.vue'
import AsyncPageLoading from './components/AsyncPageLoading.vue'
import { clearDemoSession, demoUsers, getDemoUser, loadDemoSession, saveDemoSession } from './auth'
import { resetDemoData } from './demoReset.js'
import { activeDemoSession, clearActiveDemoSession, createDemoSession, getActiveDemoView, getDemoContexts, isSharedDemoEnabled, setActiveDemoView, switchDemoView } from './sharedDemo.js'
import { client, navItems } from './data'
import { roleRouteSets } from './roleWorkspaces.js'
import { setActivePersona } from './domain/scenario.js'
import DemoNavigator from './components/DemoNavigator.vue'
import NotificationDrawer from './components/NotificationDrawer.vue'
import CommandPalette from './components/CommandPalette.vue'
import { buildBreadcrumbs, buildNotifications, resolvePersonaSwitch, useDemoContext } from './demoContext.js'
import { decodeLocation, encodeLocation } from './navigation/location.js'
import { ROUTE_REGISTRY } from './navigation/registry.js'
import { provideDemoWorkspace } from './composables/useDemoWorkspace.js'

function asyncPage(loader, label) {
  return defineAsyncComponent({
    loader,
    loadingComponent: AsyncPageLoading,
    errorComponent: AsyncPageError,
    // Render the loading surface immediately. A short delay leaves an empty
    // main region during route transitions, which users can mistake for a
    // missing page on slower networks or a cold browser cache.
    delay: 0,
    timeout: 15000,
    onError(error, _retry, fail) {
      // A stale tab can request a removed content-hash chunk after a deploy.
      // Fail into an explicit refresh panel instead of leaving an empty main.
      console.warn(`AuditFlow could not load ${label}.`, error)
      fail(error)
    },
  })
}

const routes = {
  dashboard: { label: 'Overview', title: 'Overview', roles: ['admin'], component: asyncPage(() => import('./pages/DashboardPage.vue'), 'Overview') },
  portfolio: { label: 'Operational portfolio', title: 'Operational portfolio', roles: ['admin', 'audit-manager', 'partner'], component: asyncPage(() => import('./pages/PortfolioPage.vue'), 'Operational portfolio') },
  clients: { label: 'Clients & acceptance', title: 'Clients & acceptance', roles: ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'compliance'], component: asyncPage(() => import('./pages/ClientsPage.vue'), 'Clients & acceptance') },
  engagements: { label: 'Engagements', title: 'Engagement workspace', roles: ['admin', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance'], component: asyncPage(() => import('./pages/EngagementsPage.vue'), 'Engagement workspace') },
  pbc: { label: 'PBC portal', title: 'PBC portal', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'audit-senior', 'audit-manager'], component: asyncPage(() => import('./pages/PbcPage.vue'), 'PBC portal') },
  accounting: { label: 'Accounting & TB', title: 'Accounting & TB', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client-management'], component: asyncPage(() => import('./pages/AccountingPage.vue'), 'Accounting & TB') },
  audit: { label: 'Audit & fieldwork', title: 'Audit & fieldwork', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'audit-senior', 'audit-manager', 'partner'], component: asyncPage(() => import('./pages/AuditPage.vue'), 'Audit & fieldwork') },
  reviews: { label: 'Reviews & approvals', title: 'Reviews & approvals', roles: ['admin', 'audit-manager', 'partner', 'accounting-reviewer', 'eqr'], component: asyncPage(() => import('./pages/ReviewsPage.vue'), 'Reviews & approvals') },
  release: { label: 'Release & archive', title: 'Release & archive', roles: ['admin', 'partner', 'eqr', 'records', 'finance', 'compliance'], component: asyncPage(() => import('./pages/ReleasePage.vue'), 'Release & archive') },
  integration: { label: 'Integration health', title: 'Integration health', roles: ['admin', 'system-admin', 'records'], component: asyncPage(() => import('./pages/IntegrationPage.vue'), 'Integration health') },
  architecture: { label: 'Architecture map', title: 'Architecture map', roles: ['admin', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'], component: asyncPage(() => import('./pages/ArchitecturePage.vue'), 'Architecture map') },
  blueprint: { label: 'V5 operating model', title: 'V5 operating model', roles: ['admin', 'finance'], component: asyncPage(() => import('./pages/V5BlueprintPage.vue'), 'V5 operating model') },
  cycle: { label: 'Complete cycle', title: 'Complete synthetic cycle', roles: ['admin'], component: asyncPage(() => import('./pages/CyclePage.vue'), 'Complete synthetic cycle') },
  pipeline: { label: 'Pipeline visualizer', title: 'Audit portal pipeline', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'], component: asyncPage(() => import('./pages/PipelinePage.vue'), 'Audit portal pipeline') },
  'shared-demo': { label: 'Shared demo control room', title: 'Shared demo control room', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer', 'client', 'client-management', 'audit-senior', 'audit-manager', 'partner', 'finance', 'eqr', 'records', 'system-admin', 'compliance'], component: asyncPage(() => import('./pages/SharedDemoPage.vue'), 'Shared demo control room') },
  'accountant-architecture': { label: 'Accountant architecture', title: 'Accountant architecture', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'], component: asyncPage(() => import('./pages/AccountantArchitecturePage.vue'), 'Accountant architecture') },
  'client-architecture': { label: 'Client architecture', title: 'Client architecture', roles: ['admin', 'client', 'client-management'], component: asyncPage(() => import('./pages/ClientArchitecturePage.vue'), 'Client architecture') },
  readiness: { label: 'Phase 0 readiness', title: 'Phase 0 readiness', roles: ['admin'], component: asyncPage(() => import('./pages/ReadinessPage.vue'), 'Phase 0 readiness') },
  'client-home': { label: 'Portal overview', title: 'Client portal', roles: ['admin', 'client', 'client-management'], component: asyncPage(() => import('./pages/ClientPortalPage.vue'), 'Client portal') },
  'client-details': { label: 'Client details', title: 'Client details', roles: ['admin', 'client', 'client-management'], component: asyncPage(() => import('./pages/ClientDetailsPage.vue'), 'Client details') },
  'client-communications': { label: 'Communications', title: 'Portal communications', roles: ['admin', 'client', 'client-management'], component: asyncPage(() => import('./pages/ClientCommunicationsPage.vue'), 'Portal communications') },
  'accountant-home': { label: 'Accountant overview', title: 'Accountant portal', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'], component: asyncPage(() => import('./pages/AccountantHomePage.vue'), 'Accountant portal') },
  'accountant-client': { label: 'View client details', title: 'View client details', roles: ['admin', 'accountant', 'accounting-reviewer', 'preparer'], component: asyncPage(() => import('./pages/AccountantClientPage.vue'), 'View client details') },
  'role-workspace': { label: 'My role workspace', title: 'Role workspace', roles: ['client', 'client-management', 'preparer', 'audit-senior', 'audit-manager', 'partner', 'finance', 'accountant', 'accounting-reviewer', 'eqr', 'records', 'system-admin', 'compliance', 'admin'], component: asyncPage(() => import('./pages/RoleWorkspacePage.vue'), 'Role workspace') },
  artifacts: { label: 'Document center', title: 'Document center', roles: ['admin', 'client', 'client-management', 'preparer', 'audit-senior', 'audit-manager', 'partner', 'finance', 'accountant', 'accounting-reviewer', 'eqr', 'records', 'system-admin', 'compliance'], component: asyncPage(() => import('./pages/ArtifactsPage.vue'), 'Document center') },
  'admin-console': { label: 'Admin console', title: 'Admin console', roles: ['admin', 'system-admin'], component: asyncPage(() => import('./pages/AdminConsolePage.vue'), 'Admin console') },
}

// An invitation is an explicit client entry point. Do not let a stale
// presenter persona from localStorage silently win when the same browser
// opens a client link; the LoginPage must be shown so the Worker can bind the
// session to the invitation's fixed client persona.
const invitationEntry = typeof window !== 'undefined' && Boolean(new URL(window.location.href).searchParams.get('invite'))
const currentUser = ref(invitationEntry ? null : loadDemoSession())
if (invitationEntry) clearDemoSession()
if (currentUser.value) setActivePersona(currentUser.value.id)
const isClientInvitation = computed(() => Boolean(activeDemoSession.value?.clientMode))
const currentRoute = ref(getRouteFromHash())
const mobileNavOpen = ref(false)
const search = ref('')
const helpOpen = ref(false)
const accountMenuOpen = ref(false)
const permissionNotice = ref('')
const pendingDeepLink = ref('')
const helpButton = ref(null)
const helpCloseButton = ref(null)

// Phase A — unified demo navigation and context (M7 navigation slice).
// One shared 5s polling loop lives in useDemoContext; the navigator,
// breadcrumbs, drawer and palette below are presentational views over it.
// Normal login (LoginPage + handleLogin) is unchanged; the persona switcher
// is a presenter shortcut that reuses the same Worker demo session call.
const demoNotificationsOpen = ref(false)
const commandPaletteOpen = ref(false)
const personaBusy = ref(false)
const {
  mode: demoMode,
  activeEngagementId,
  contexts: demoContexts,
  activeContext: demoActiveContext,
  tasks: demoTasks,
  events: demoEvents,
  outbox: demoOutbox,
  loading: demoLoading,
  syncError: demoSyncError,
  lastSync: demoLastSync,
  stageSummary: demoStageSummary,
  refresh: refreshDemoContext,
  switchEngagement: switchDemoEngagement,
} = useDemoContext()
// Expose the same app-scoped shared projection through provide/inject for
// migrated child screens; the provider delegates to the store above and does
// not create another polling loop.
provideDemoWorkspace({ useSharedStore: true, autoStart: false })
const demoAssignee = computed(() => ({
  client: 'client_contributor',
  'client-management': 'management_approver',
  preparer: 'preparer',
  'audit-senior': 'audit_senior',
  'audit-manager': 'audit_manager',
  partner: 'engagement_partner',
  finance: 'finance_team',
  accountant: 'preparer',
  'accounting-reviewer': 'accounting_reviewer',
  eqr: 'eqr_reviewer',
  records: 'records_custodian',
  'system-admin': 'system_admin',
  compliance: 'compliance_reviewer',
  admin: '',
}[currentUser.value?.role] || ''))
const demoNotifications = computed(() => buildNotifications({
  tasks: demoTasks.value,
  events: demoEvents.value,
  outbox: demoOutbox.value,
  assignee: currentUser.value?.role === 'admin' ? '' : demoAssignee.value,
}))
const demoNotificationCount = computed(() => demoNotifications.value.length)
const demoCrumbs = computed(() => buildBreadcrumbs({
  personaLabel: currentUser.value?.roleLabel || '',
  context: demoActiveContext.value,
  pageLabel: activeNav.value?.label || current.value?.title || '',
  clientRoute: isClient.value ? 'client-home' : 'clients',
  engagementRoute: isClient.value ? 'client-home' : 'engagements',
}))
const paletteRoutes = computed(() => visibleNavItems.value.map((item) => ({ key: item.key, label: item.label, title: item.label })))
const routeRolesMap = computed(() => Object.fromEntries(Object.entries(routes).map(([key, entry]) => [key, ROUTE_REGISTRY[key]?.roles || entry.roles])))

function canAccessRoute(key, role) {
  if (key === 'shared-demo' && isClientInvitation.value) return false
  return Boolean(routes[key] && ROUTE_REGISTRY[key]?.roles?.includes(role) && routes[key].roles.includes(role))
}

const current = computed(() => routes[currentRoute.value] || routes.dashboard)
const activeNav = computed(() => visibleNavItems.value.find((item) => item.key === currentRoute.value) || visibleNavItems.value[0] || { label: 'Sign in' })
const isClient = computed(() => currentUser.value?.role === 'client')
const isClientManagement = computed(() => currentUser.value?.role === 'client-management')
const isAccountant = computed(() => ['accountant', 'accounting-reviewer', 'preparer'].includes(currentUser.value?.role))
const buildCommit = computed(() => String(import.meta.env.VITE_BUILD_COMMIT || 'local').slice(0, 12))
const workspaceName = computed(() => isClient.value || isClientManagement.value ? currentUser.value.organization : currentUser.value?.role === 'accountant' || currentUser.value?.role === 'accounting-reviewer' ? 'Quadrate Accounting' : 'Quadrate Audit')
const workspaceSubtitle = computed(() => isClient.value ? 'Client portal' : currentUser.value?.roleLabel || 'Demo workspace')
const workspaceInitials = computed(() => currentUser.value?.initials || 'Q')
const systemLabel = computed(() => isClient.value ? 'Client portal · shared communication record' : isClientManagement.value ? 'Client management · approval access' : currentUser.value?.role === 'accountant' || currentUser.value?.role === 'accounting-reviewer' || currentUser.value?.role === 'preparer' ? 'Accounting workspace · scoped preparation access' : currentUser.value?.role === 'admin' ? 'Presenter admin · synthetic inspection access' : `${currentUser.value?.roleLabel || 'Staff'} · scoped role access`)
const healthLabel = computed(() => isClient.value ? 'Synthetic portal projection' : 'Synthetic controls only')
const healthDetail = computed(() => isClient.value ? 'Browser-local demo · SIMULATION' : 'No live integrations enabled')
const helpCopy = computed(() => isClient.value
  ? 'Use Client details to submit facts, Requests to see what is due, Communications for every question, and Pipeline visualizer to understand the end-to-end handoff.'
  : isClientManagement.value
    ? 'Review the exact Engagement Letter and Draft FS versions, then use the portal surface to confirm what is published. Professional opinion and release controls remain separate.'
    : isAccountant.value
      ? 'Start with your role workspace, then follow the scoped PBC, Accounting, and Audit pages. The package is handed to an independent reviewer; acceptance and release remain separate authorities.'
      : currentUser.value?.role === 'admin'
        ? 'Use the full navigation to trace the animated pipeline, acceptance, evidence, accounting, audit, approvals, release, architecture, and Phase 0 proof.'
        : 'Start with My role workspace to see your owner queue and blockers. Each link opens the exact record surface while the authority boundary remains visible.')
const visibleNavItems = computed(() => {
  if (!currentUser.value) return []
  if (currentUser.value.role === 'client') {
    return [
      { key: 'role-workspace', label: 'My role workspace', icon: 'grid', section: 'Client portal' },
      { key: 'client-home', label: 'Portal overview', icon: 'grid', section: 'Client portal' },
      { key: 'client-details', label: 'Client details', icon: 'users', section: 'Client portal' },
      { key: 'client-communications', label: 'Communications', icon: 'message', section: 'Client portal' },
      { key: 'artifacts', label: 'Published outputs', icon: 'file', section: 'Client portal' },
      { key: 'pipeline', label: 'Pipeline visualizer', icon: 'workflow', section: 'Client portal' },
      { key: 'client-architecture', label: 'How the platform works', icon: 'workflow', section: 'Client portal' },
    ]
  }
  if (currentUser.value.role === 'admin') return [
    ...navItems,
    { key: 'portfolio', label: 'Operational portfolio', icon: 'briefcase', section: 'Workspace' },
    { key: 'client-home', label: 'Client portal preview', icon: 'grid', section: 'Portals' },
    { key: 'client-details', label: 'Client details preview', icon: 'users', section: 'Portals' },
    { key: 'client-communications', label: 'Client communications', icon: 'message', section: 'Portals' },
    { key: 'accountant-home', label: 'Accountant portal preview', icon: 'calculator', section: 'Portals' },
    { key: 'accountant-client', label: 'Accountant client view', icon: 'users', section: 'Portals' },
    { key: 'client-architecture', label: 'Client architecture', icon: 'workflow', section: 'Portals' },
    { key: 'accountant-architecture', label: 'Accountant architecture', icon: 'workflow', section: 'Portals' },
    { key: 'admin-console', label: 'Admin console', icon: 'shield', section: 'Administration' },
  ]
  const keys = roleRouteSets[currentUser.value.role] || ['role-workspace', 'pipeline']
  const icons = { 'role-workspace': 'grid', portfolio: 'briefcase', clients: 'users', engagements: 'briefcase', pbc: 'inbox', accounting: 'calculator', audit: 'clipboard', reviews: 'check-circle', release: 'lock', integration: 'pulse', architecture: 'workflow', blueprint: 'layers', cycle: 'workflow', pipeline: 'workflow', 'shared-demo': 'workflow', 'client-home': 'grid', 'client-details': 'users', 'client-communications': 'message', 'accountant-home': 'grid', 'accountant-client': 'users', 'client-architecture': 'workflow', 'accountant-architecture': 'workflow' }
  return keys.map((key) => {
    const source = navItems.find((item) => item.key === key)
    return { key, label: key === 'role-workspace' ? 'My role workspace' : source?.label || routes[key]?.label || key, icon: source?.icon || icons[key] || 'workflow', section: key === 'role-workspace' ? 'My workspace' : source?.section || 'Workflow' }
  })
})
const navGroups = computed(() => {
  const groups = []
  for (const item of visibleNavItems.value) {
    let group = groups.find((entry) => entry.name === item.section)
    if (!group) {
      group = { name: item.section, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
})

function readHashKey() {
  if (typeof window === 'undefined') return ''
  return decodeLocation(window.location.hash).routeKey
}

function getRouteFromHash() {
  if (typeof window === 'undefined') return 'dashboard'
  const key = readHashKey()
  if (!currentUser.value) return ''
  return canAccessRoute(key, currentUser.value.role) ? key : currentUser.value.landing
}

function setDocumentTitle() {
  if (typeof document !== 'undefined') document.title = currentUser.value ? `${current.value.title} · AuditFlow` : 'AuditFlow · Demo access'
}

function navigate(key, locationOptions = {}) {
  if (!currentUser.value) return
  if (key && typeof key === 'object') {
    locationOptions = key
    key = locationOptions.routeKey
  }
  if (!canAccessRoute(key, currentUser.value.role)) {
    permissionNotice.value = `${routes[key]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
    return
  }
  const next = key
  currentRoute.value = next
  mobileNavOpen.value = false
  accountMenuOpen.value = false
  permissionNotice.value = ''
  if (typeof window !== 'undefined') {
    const requestedEngagement = String(locationOptions.engagementId || activeEngagementId.value || '')
    const requestedRecord = String(locationOptions.recordId || '')
    const safeEngagement = /^[A-Za-z0-9_-]{1,80}$/.test(requestedEngagement) ? requestedEngagement : undefined
    const safeRecord = /^[A-Za-z0-9_-]{1,80}$/.test(requestedRecord) ? requestedRecord : undefined
    const hash = encodeLocation({
      routeKey: next,
      engagementId: safeEngagement,
      recordId: safeRecord,
      tab: locationOptions.tab,
    })
    if (window.location.hash !== hash) window.location.hash = hash
  }
  setDocumentTitle()
  if (typeof document !== 'undefined') window.requestAnimationFrame(() => document.querySelector('#main-content')?.focus())
}

function syncRoute() {
  if (!currentUser.value) {
    const requested = readHashKey()
    if (requested && routes[requested]) pendingDeepLink.value = requested
    currentRoute.value = ''
    mobileNavOpen.value = false
    accountMenuOpen.value = false
    setDocumentTitle()
    return
  }
  const location = typeof window !== 'undefined' ? decodeLocation(window.location.hash) : { routeKey: '' }
  const requested = location.routeKey
  if (location.engagementId && location.engagementId !== activeEngagementId.value) {
    switchDemoEngagement(location.engagementId)
  }
  const allowed = canAccessRoute(requested, currentUser.value.role)
  currentRoute.value = allowed ? requested : currentUser.value.landing
  if (!allowed && requested && requested !== currentUser.value.landing) {
    permissionNotice.value = `${routes[requested]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
    if (typeof window !== 'undefined') window.location.hash = encodeLocation({ routeKey: currentUser.value.landing, engagementId: activeEngagementId.value })
  }
  mobileNavOpen.value = false
  accountMenuOpen.value = false
  setDocumentTitle()
}

function submitSearch() {
  // Phase A: the top search opens the lightweight command palette instead of
  // guessing a role-dependent client page. The query is preserved.
  commandPaletteOpen.value = true
}

function handleLogin(user) {
  currentUser.value = user
  setActivePersona(user.id)
  saveDemoSession(user)
  const target = pendingDeepLink.value || readHashKey()
  pendingDeepLink.value = ''
  if (target && canAccessRoute(target, user.role)) {
    currentRoute.value = target
    permissionNotice.value = ''
      if (typeof window !== 'undefined') window.location.hash = encodeLocation({ routeKey: target, engagementId: activeEngagementId.value })
  } else {
    if (target && target !== user.landing) permissionNotice.value = `${routes[target]?.label || 'That page'} is not available for the ${user.roleLabel.toLowerCase()} account.`
    else permissionNotice.value = ''
    currentRoute.value = user.landing
    if (typeof window !== 'undefined') window.location.hash = encodeLocation({ routeKey: user.landing, engagementId: activeEngagementId.value })
  }
  if (isSharedDemoEnabled) {
    createDemoSession(user.id).then((res) => {
      if (!res.ok) permissionNotice.value = `Shared demo session unavailable (${res.error.code}). Continuing browser-local; shared actions will report not committed.`;
      else refreshDemoContext();
    });
  }
  setDocumentTitle()
}

// Presenter quick persona switch (Phase A §3.1). Normal login above stays
// intact: this shortcut creates the Worker demo session, switches the local
// persona, retains the engagement when the new persona may view it,
// otherwise falls back to the first allowed context, and stays on the
// current route when authorized (else opens the role workspace).
async function handlePersonaSwitch(personaId) {
  if (isClientInvitation.value) {
    permissionNotice.value = 'This client invitation is fixed to the client portal. Sign out to return to presenter access.'
    return
  }
  const user = getDemoUser(personaId)
  if (!user || personaBusy.value) return
  if (user.id === currentUser.value?.id) return
  personaBusy.value = true
  accountMenuOpen.value = false
  try {
    let allowedIds = demoContexts.value.map((context) => context.engagementId)
    if (isSharedDemoEnabled) {
      const activeView = getActiveDemoView()
      const session = activeView?.viewId
        ? await switchDemoView(activeView.viewId, { personaId, engagementId: activeEngagementId.value, expectedContextVersion: activeView.contextVersion })
        : await createDemoSession(user.id)
      if (!session.ok) {
        permissionNotice.value = `Shared demo session unavailable (${session.error.code}). Stayed on ${currentUser.value.roleLabel}; shared actions will report not committed.`
        return
      }
      if (session.view) setActiveDemoView(session.view)
      const refreshed = await getDemoContexts()
      if (refreshed.ok && Array.isArray(refreshed.contexts)) allowedIds = refreshed.contexts.map((context) => context.engagementId)
    }
    const decision = resolvePersonaSwitch({
      currentEngagementId: activeEngagementId.value,
      allowedEngagementIds: allowedIds,
      currentRouteKey: currentRoute.value,
      routeRoles: routeRolesMap.value,
      newRole: user.role,
    })
    currentUser.value = user
    setActivePersona(user.id)
    saveDemoSession(user)
    permissionNotice.value = ''
    if (decision.retainedEngagementId !== activeEngagementId.value) switchDemoEngagement(decision.retainedEngagementId)
    else refreshDemoContext()
    if (decision.targetRouteKey !== currentRoute.value) {
      currentRoute.value = decision.targetRouteKey
      if (typeof window !== 'undefined') window.location.hash = `/${decision.targetRouteKey}`
      if (!decision.stayed) permissionNotice.value = `${current.value?.title || 'That page'} is not available for the ${user.roleLabel.toLowerCase()} account. Opened the role workspace instead.`
    }
    setDocumentTitle()
  } finally {
    personaBusy.value = false
  }
}

async function handleContextSwitch(engagementId) {
  if (!engagementId || engagementId === activeEngagementId.value) return
  permissionNotice.value = ''
  const activeView = getActiveDemoView()
  if (isSharedDemoEnabled && activeView?.viewId) {
    personaBusy.value = true
    try {
      const result = await switchDemoView(activeView.viewId, { engagementId, expectedContextVersion: activeView.contextVersion })
      if (result.ok) {
        setActiveDemoView(result.view)
        switchDemoEngagement(engagementId)
      } else {
        permissionNotice.value = `Context switch rejected (${result.error?.code || 'CONTEXT_ERROR'}). The confirmed context was retained.`
      }
    } finally {
      personaBusy.value = false
    }
  } else switchDemoEngagement(engagementId)
}

function handlePaletteCommand(command) {
  if (command === 'reset-demo') navigate('shared-demo')
}

function onGlobalKeydown(event) {
  const isPaletteShortcut = (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'k'
  if (isPaletteShortcut && currentUser.value) {
    event.preventDefault()
    commandPaletteOpen.value = !commandPaletteOpen.value
  }
}

function handleDemoReset() {
  const message = resetDemoData()
  permissionNotice.value = message
  if (typeof window !== 'undefined') window.location.reload()
}

function showLogin() {
  if (currentRoute.value) pendingDeepLink.value = currentRoute.value
  clearDemoSession()
  setActivePersona(null)
  clearActiveDemoSession()
  setActiveDemoView(null)
  currentUser.value = null
  currentRoute.value = ''
  accountMenuOpen.value = false
  mobileNavOpen.value = false
  if (typeof window !== 'undefined') window.location.hash = ''
  setDocumentTitle()
}

async function openHelp() {
  helpOpen.value = true
  await nextTick()
  helpCloseButton.value?.focus()
}

function closeHelp() {
  helpOpen.value = false
  nextTick(() => helpButton.value?.focus())
}

onMounted(() => {
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('keydown', onGlobalKeydown)
  syncRoute()
  setDocumentTitle()
  if (currentUser.value && isSharedDemoEnabled) {
    createDemoSession(currentUser.value.id).then((res) => {
      if (!res.ok) permissionNotice.value = `Shared demo session unavailable (${res.error.code}). Shared actions will report not committed.`
      else refreshDemoContext()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <LoginPage v-if="!currentUser" @login="handleLogin" />

  <div v-else class="app-shell" @keydown.esc.window="closeHelp">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <button v-if="mobileNavOpen" type="button" class="mobile-scrim" aria-label="Close navigation" @click="mobileNavOpen = false"></button>

    <aside id="primary-navigation" class="sidebar" :class="{ open: mobileNavOpen }" aria-label="Primary navigation">
      <div class="sidebar-brand"><span class="brand-mark" aria-hidden="true"><Icon name="workflow" :size="21" /></span><span><strong>AuditFlow</strong><small>Practice platform</small></span></div>
      <div class="workspace-switcher"><span class="workspace-avatar">{{ workspaceInitials }}</span><span><strong>{{ workspaceName }}</strong><small>{{ workspaceSubtitle }}</small></span><Icon name="chevron-down" :size="16" /></div>

      <nav class="sidebar-nav">
        <div v-for="group in navGroups" :key="group.name" class="nav-group"><span class="nav-group-label">{{ group.name }}</span><button v-for="item in group.items" :key="item.key" type="button" class="nav-item" :class="{ active: currentRoute === item.key }" :aria-current="currentRoute === item.key ? 'page' : undefined" @click="navigate(item.key)"><Icon :name="item.icon" :size="18" /><span>{{ item.label }}</span><em v-if="item.badge">{{ item.badge }}</em></button></div>
      </nav>

      <div class="sidebar-bottom"><div class="sidebar-health"><span class="health-pulse"></span><span><strong>{{ healthLabel }}</strong><small>{{ healthDetail }}</small></span></div><div class="sidebar-foot"><span>{{ currentUser.roleLabel }}</span><button ref="helpButton" type="button" aria-label="Open help" title="Open help and orientation" @click="openHelp"><Icon name="info" :size="18" /></button></div></div>
    </aside>

    <div class="app-main">
      <header class="topbar"><div class="topbar-left"><button type="button" class="mobile-menu" aria-label="Open navigation" title="Open navigation" aria-controls="primary-navigation" :aria-expanded="mobileNavOpen" @click="mobileNavOpen = true"><Icon name="menu" :size="19" /></button><nav class="breadcrumbs" aria-label="Context breadcrumb"><template v-for="(crumb, index) in demoCrumbs" :key="`${crumb.label}-${index}`"><button v-if="crumb.route" type="button" class="text-button breadcrumb-link" @click="navigate(crumb.route)">{{ crumb.label }}</button><strong v-else aria-current="page">{{ crumb.label }}</strong><Icon v-if="index < demoCrumbs.length - 1" name="chevron-right" :size="16" /></template></nav></div><div class="topbar-actions"><form class="top-search" role="search" @submit.prevent="submitSearch"><Icon name="search" :size="17" /><input v-model="search" type="search" aria-label="Search clients, engagements and IDs (opens command palette)" placeholder="Search anything (Ctrl/Cmd+K)" @focus="commandPaletteOpen = true" /></form><button type="button" class="top-icon-button" :aria-label="`Notifications, ${demoNotificationCount} items`" :title="`Notifications, ${demoNotificationCount} items`" @click="demoNotificationsOpen = true"><Icon name="bell" :size="18" /><span aria-hidden="true">{{ demoNotificationCount }}</span></button><div class="account-control"><button type="button" class="top-user top-user-button" aria-label="Open account menu" title="Open account menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen"><span class="avatar" :class="`avatar-${currentUser.tone}`">{{ currentUser.initials }}</span><span><strong>{{ currentUser.name }}</strong><small>{{ currentUser.roleLabel }}</small></span><Icon name="chevron-down" :size="15" /></button><div v-if="accountMenuOpen" class="account-menu" role="menu"><div class="account-menu-heading"><strong>{{ currentUser.name }}</strong><span>{{ currentUser.email }}</span></div><template v-if="!isClientInvitation"><span class="account-menu-label">Switch demo persona</span><button v-for="persona in demoUsers.filter((candidate) => candidate.id !== currentUser.id)" :key="persona.id" type="button" role="menuitem" :disabled="personaBusy" @click="accountMenuOpen = false; handlePersonaSwitch(persona.id)">{{ persona.roleLabel }}</button></template><p v-else class="account-menu-note">Client invitation access is fixed to this portal.</p><button type="button" role="menuitem" @click="showLogin">Sign out</button></div></div></div></header>
      <DemoNavigator
        :current-user="currentUser"
        :personas="isClientInvitation ? [] : demoUsers"
        :contexts="demoContexts"
        :active-engagement-id="activeEngagementId"
        :active-context="demoActiveContext"
        :stage-summary="demoStageSummary"
        :mode="demoMode"
        :loading="demoLoading"
        :last-sync="demoLastSync"
        :persona-busy="personaBusy"
        @switch-persona="handlePersonaSwitch"
        @switch-context="handleContextSwitch"
        @navigate="navigate"
        @open-palette="commandPaletteOpen = true"
        @open-notifications="demoNotificationsOpen = true"
      />
      <div class="system-strip"><span><i></i> {{ systemLabel }}</span><span>{{ demoActiveContext ? `${demoActiveContext.clientName} · ${demoActiveContext.serviceLabel} ${demoActiveContext.period}` : (isClient ? currentUser.organization : `${client.name} · ${client.period}`) }}</span><span class="build-version">Build {{ buildCommit }}</span></div>
      <div v-if="permissionNotice" class="permission-notice" role="status" aria-live="polite"><Icon name="warning" :size="17" />{{ permissionNotice }}</div>
      <main id="main-content" class="main-content" tabindex="-1"><component :is="current.component" @navigate="navigate" /></main>
    </div>

    <NotificationDrawer
      :open="demoNotificationsOpen"
      :notifications="demoNotifications"
      :loading="demoLoading"
      :error="demoSyncError"
      :mode="demoMode"
      :last-sync="demoLastSync"
      @close="demoNotificationsOpen = false"
      @navigate="(route) => { demoNotificationsOpen = false; navigate(route) }"
    />
    <CommandPalette
      :open="commandPaletteOpen"
      :contexts="demoContexts"
      :personas="isClientInvitation ? [] : demoUsers"
      :routes="paletteRoutes"
      :tasks="demoTasks"
      :initial-query="search"
      @close="commandPaletteOpen = false"
      @navigate="(route) => navigate(route)"
      @switch-persona="handlePersonaSwitch"
      @switch-context="handleContextSwitch"
      @command="handlePaletteCommand"
    />
    <div v-if="helpOpen" class="help-backdrop" role="presentation" @click.self="closeHelp">
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-dialog-header"><div><span class="eyebrow">Prototype orientation</span><h2 id="help-title">How to read AuditFlow</h2></div><button ref="helpCloseButton" type="button" class="icon-button" aria-label="Close help" title="Close help" @click="closeHelp"><Icon name="x" :size="17" /></button></div>
        <p>{{ helpCopy }}</p>
        <ol class="help-list"><li><strong>Orient</strong><span>Overview shows the queue, owners, and current gate pressure.</span></li><li><strong>Decide</strong><span>Clients and engagement pages separate acceptance from delivery work.</span></li><li><strong>Evidence</strong><span>PBC, Accounting, and Audit pages show the source-to-conclusion chain.</span></li><li><strong>Control</strong><span>Reviews, Release, and Integration show approvals, versions, retries, and archive evidence.</span></li></ol>
        <div class="help-dialog-reset"><button type="button" class="button secondary" @click="handleDemoReset">Reset demo data</button><span>Clears the synthetic scenario and local drafts, keeps you signed in.</span></div>
        <div class="help-dialog-note"><Icon name="info" :size="17" /><span><strong>Demo boundary</strong> Values are illustrative. Qualified people own professional decisions, approvals, conclusions, and records actions.</span></div>
      </section>
    </div>
  </div>
</template>
