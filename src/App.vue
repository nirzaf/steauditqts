<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LoginPage from './pages/LoginPage.vue'
import Icon from './components/Icon.vue'
import AsyncPageError from './components/AsyncPageError.vue'
import AsyncPageLoading from './components/AsyncPageLoading.vue'
import { clearDemoSession, demoUsers, getDemoUser, loadDemoSession, saveDemoSession } from './auth'
import { resetDemoData } from './demoReset.js'
import { activeDemoSession, applyScenarioPreset, clearActiveDemoSession, createDemoSession, getActiveDemoView, getDemoContexts, getScenarioPresets, isSharedDemoEnabled, resetSharedDemo, setActiveDemoView, switchDemoView } from './sharedDemo.js'
import { client } from './data'
import { roleRouteSets } from './roleWorkspaces.js'
import { setActivePersona } from './domain/scenario.js'
import DemoNavigator from './components/DemoNavigator.vue'
import NotificationDrawer from './components/NotificationDrawer.vue'
import CommandPalette from './components/CommandPalette.vue'
import { buildBreadcrumbs, buildNotifications, localContextsForPersona, resolvePersonaSwitch, useDemoContext } from './demoContext.js'
import { decodeLocation, encodeLocation } from './navigation/location.js'
import { ROUTE_REGISTRY, routeIsAllowed } from './navigation/registry.js'
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

// ROUTE_REGISTRY owns route labels, titles, sections and access policy.
// App intentionally keeps only the lazy component loader map so a future
// menu, palette, deep-link, or role check cannot quietly drift from policy.
const routeComponents = {
  dashboard: asyncPage(() => import('./pages/DashboardPage.vue'), 'Overview'),
  portfolio: asyncPage(() => import('./pages/PortfolioPage.vue'), 'Operational portfolio'),
  clients: asyncPage(() => import('./pages/ClientsPage.vue'), 'Clients & acceptance'),
  engagements: asyncPage(() => import('./pages/EngagementsPage.vue'), 'Engagement workspace'),
  pbc: asyncPage(() => import('./pages/PbcPage.vue'), 'PBC portal'),
  accounting: asyncPage(() => import('./pages/AccountingPage.vue'), 'Accounting & TB'),
  audit: asyncPage(() => import('./pages/AuditPage.vue'), 'Audit & fieldwork'),
  reviews: asyncPage(() => import('./pages/ReviewsPage.vue'), 'Reviews & approvals'),
  release: asyncPage(() => import('./pages/ReleasePage.vue'), 'Release & archive'),
  integration: asyncPage(() => import('./pages/IntegrationPage.vue'), 'Integration health'),
  architecture: asyncPage(() => import('./pages/ArchitecturePage.vue'), 'Architecture map'),
  blueprint: asyncPage(() => import('./pages/V5BlueprintPage.vue'), 'V5 operating model'),
  cycle: asyncPage(() => import('./pages/CyclePage.vue'), 'Complete cycle'),
  pipeline: asyncPage(() => import('./pages/PipelinePage.vue'), 'Audit portal pipeline'),
  'shared-demo': asyncPage(() => import('./pages/SharedDemoPage.vue'), 'Workflow control room'),
  'accountant-architecture': asyncPage(() => import('./pages/AccountantArchitecturePage.vue'), 'Accountant architecture'),
  'client-architecture': asyncPage(() => import('./pages/ClientArchitecturePage.vue'), 'Client architecture'),
  readiness: asyncPage(() => import('./pages/ReadinessPage.vue'), 'Phase 0 readiness'),
  'client-home': asyncPage(() => import('./pages/ClientPortalPage.vue'), 'Client portal'),
  'client-details': asyncPage(() => import('./pages/ClientDetailsPage.vue'), 'Client details'),
  'client-communications': asyncPage(() => import('./pages/ClientCommunicationsPage.vue'), 'Portal communications'),
  'accountant-home': asyncPage(() => import('./pages/AccountantHomePage.vue'), 'Accountant portal'),
  'accountant-client': asyncPage(() => import('./pages/AccountantClientPage.vue'), 'View client details'),
  'role-workspace': asyncPage(() => import('./pages/RoleWorkspacePage.vue'), 'Role workspace'),
  artifacts: asyncPage(() => import('./pages/ArtifactsPage.vue'), 'Document center'),
  'admin-console': asyncPage(() => import('./pages/AdminConsolePage.vue'), 'Admin console'),
}

// Navigation order and icons are presentation details. ROUTE_REGISTRY remains
// the only owner of labels, titles, sections, and role policy.
const NAVIGATION_ICONS = Object.freeze({
  dashboard: 'grid', portfolio: 'briefcase', clients: 'users', engagements: 'briefcase',
  pbc: 'inbox', accounting: 'calculator', audit: 'clipboard', reviews: 'check-circle',
  release: 'lock', integration: 'pulse', architecture: 'workflow', blueprint: 'layers',
  cycle: 'workflow', pipeline: 'workflow', 'shared-demo': 'workflow', artifacts: 'file',
  readiness: 'list-check', 'admin-console': 'shield', 'role-workspace': 'grid',
  'client-home': 'grid', 'client-details': 'users', 'client-communications': 'message',
  'client-architecture': 'workflow', 'accountant-home': 'grid', 'accountant-client': 'users',
  'accountant-architecture': 'workflow',
})

const ADMIN_NAVIGATION_KEYS = Object.freeze([
  'dashboard', 'portfolio', 'clients', 'engagements', 'pbc', 'accounting', 'audit', 'reviews',
  'release', 'integration', 'architecture', 'blueprint', 'cycle', 'pipeline', 'shared-demo',
  'artifacts', 'readiness', 'client-home', 'client-details', 'client-communications',
  'accountant-home', 'accountant-client', 'client-architecture', 'accountant-architecture',
  'admin-console',
])

const CLIENT_NAVIGATION_KEYS = Object.freeze([
  'role-workspace', 'client-home', 'client-details', 'client-communications', 'artifacts',
  'pipeline', 'client-architecture',
])

// An invitation is an explicit client entry point. Do not let a stale
// presenter persona from localStorage silently win when the same browser
// opens a client link; the LoginPage must be shown so the Worker can bind the
// session to the invitation's fixed client persona.
const invitationEntry = typeof window !== 'undefined' && Boolean(new URL(window.location.href).searchParams.get('invite'))
const currentUser = ref(invitationEntry ? null : loadDemoSession())
if (invitationEntry) clearDemoSession()
if (currentUser.value) setActivePersona(currentUser.value.id)
// Only an invitation-bound client session is fixed to the client portal.
// Browser-local client previews remain useful for presenter walkthroughs,
// and a stale session response must never hide presenter controls after
// switching personas.
const isClientInvitation = computed(() => Boolean(activeDemoSession.value?.clientMode && activeDemoSession.value?.invitationId))
const currentRoute = ref(getRouteFromHash())
const mobileNavOpen = ref(false)
const search = ref('')
const helpOpen = ref(false)
const accountMenuOpen = ref(false)
const permissionNotice = ref('')
const pendingDeepLink = ref('')
const helpButton = ref(null)
const helpCloseButton = ref(null)
const restartCancelButton = ref(null)
let restartRestoreFocus = null

// Phase A — unified demo navigation and context (M7 navigation slice).
// One shared 5s polling loop lives in useDemoContext; the navigator,
// breadcrumbs, drawer and palette below are presentational views over it.
// Normal login (LoginPage + handleLogin) is unchanged; the persona switcher
// is a presenter shortcut that reuses the same Worker demo session call.
const demoNotificationsOpen = ref(false)
const commandPaletteOpen = ref(false)
const personaBusy = ref(false)
const scenarioBusy = ref(false)
const scenarioPresets = ref([])
const activeScenario = ref(null)
const restartConfirmOpen = ref(false)
const restartBusy = ref(false)
const restartError = ref('')
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
const routeRolesMap = computed(() => Object.fromEntries(Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.roles])))

function canAccessRoute(key, role) {
  if (key === 'shared-demo' && isClientInvitation.value) return false
  return Boolean(routeComponents[key] && routeIsAllowed(key, role))
}

const current = computed(() => {
  const key = routeComponents[currentRoute.value] ? currentRoute.value : 'dashboard'
  return { ...(ROUTE_REGISTRY[key] || ROUTE_REGISTRY.dashboard), component: routeComponents[key] || routeComponents.dashboard }
})
const activeNav = computed(() => visibleNavItems.value.find((item) => item.key === currentRoute.value) || visibleNavItems.value[0] || { label: 'Sign in' })
const isClient = computed(() => currentUser.value?.role === 'client')
const isClientManagement = computed(() => currentUser.value?.role === 'client-management')
const isAccountant = computed(() => ['accountant', 'accounting-reviewer', 'preparer'].includes(currentUser.value?.role))
const buildCommit = computed(() => String(import.meta.env.VITE_BUILD_COMMIT || 'local').slice(0, 12))
const workspaceName = computed(() => isClient.value || isClientManagement.value ? currentUser.value.organization : currentUser.value?.role === 'accountant' || currentUser.value?.role === 'accounting-reviewer' ? 'Quadrate Accounting' : 'Quadrate Audit')
const workspaceSubtitle = computed(() => isClient.value ? 'Client portal' : currentUser.value?.roleLabel || 'Workspace')
const workspaceInitials = computed(() => currentUser.value?.initials || 'Q')
const systemLabel = computed(() => isClient.value ? 'Client portal · engagement workspace' : isClientManagement.value ? 'Client management · approval access' : currentUser.value?.role === 'accountant' || currentUser.value?.role === 'accounting-reviewer' || currentUser.value?.role === 'preparer' ? 'Accounting workspace · scoped preparation access' : currentUser.value?.role === 'admin' ? 'Practice overview · full workspace access' : `${currentUser.value?.roleLabel || 'Staff'} · scoped role access`)
const healthLabel = computed(() => 'Guided workspace')
const healthDetail = computed(() => 'Follow each step to see the handoff and owner.')
const canSwitchPersona = computed(() => !isClientInvitation.value && ['admin', 'partner'].includes(currentUser.value?.role))
const canManageScenario = computed(() => !isClientInvitation.value && isSharedDemoEnabled && ['admin', 'audit-manager', 'partner'].includes(currentUser.value?.role))
const canRestartWalkthrough = computed(() => !isClientInvitation.value && ['admin', 'partner'].includes(currentUser.value?.role))
const helpCopy = computed(() => isClient.value
  ? 'Use Client details to submit facts, Requests to see what is due, Communications for every question, and Pipeline visualizer to understand the end-to-end handoff.'
  : isClientManagement.value
    ? 'Review the exact Engagement Letter and Draft FS versions, then use the portal surface to confirm what is published. Professional opinion and release controls remain separate.'
    : isAccountant.value
      ? 'Start with your role workspace, then follow the scoped PBC, Accounting, and Audit pages. The package is handed to an independent reviewer; acceptance and release remain separate authorities.'
      : currentUser.value?.role === 'admin'
        ? 'Use the full navigation to trace the animated pipeline, acceptance, evidence, accounting, audit, approvals, release, architecture, and Phase 0 proof.'
        : 'Start with My role workspace to see your owner queue and blockers. Each link opens the exact record surface while the authority boundary remains visible.')
function navigationItemsFor(keys) {
  return keys
    .filter((key) => canAccessRoute(key, currentUser.value?.role))
    .map((key) => {
      const route = ROUTE_REGISTRY[key]
      return {
        key,
        label: route.label,
        icon: NAVIGATION_ICONS[key] || 'workflow',
        section: route.section,
      }
    })
}
const visibleNavItems = computed(() => {
  if (!currentUser.value) return []
  if (currentUser.value.role === 'client') return navigationItemsFor(CLIENT_NAVIGATION_KEYS)
  if (currentUser.value.role === 'admin') return navigationItemsFor(ADMIN_NAVIGATION_KEYS)
  const keys = roleRouteSets[currentUser.value.role] || ['role-workspace', 'pipeline']
  return navigationItemsFor(keys)
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
  if (typeof document !== 'undefined') document.title = currentUser.value ? `${current.value.title} · AuditFlow` : 'AuditFlow · Sign in'
}

function navigate(key, locationOptions = {}) {
  if (!currentUser.value) return
  if (key && typeof key === 'object') {
    locationOptions = key
    key = locationOptions.routeKey
  }
  if (!canAccessRoute(key, currentUser.value.role)) {
    permissionNotice.value = `${ROUTE_REGISTRY[key]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
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
    if (requested && routeComponents[requested]) pendingDeepLink.value = requested
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
    permissionNotice.value = `${ROUTE_REGISTRY[requested]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
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

async function refreshWalkthroughPresets() {
  if (!canManageScenario.value || !activeEngagementId.value) {
    scenarioPresets.value = []
    activeScenario.value = null
    return
  }
  const result = await getScenarioPresets(activeEngagementId.value)
  if (result.ok) {
    scenarioPresets.value = result.presets || []
    activeScenario.value = result.scenario || null
  } else {
    scenarioPresets.value = []
    activeScenario.value = null
  }
}

async function handleScenarioSelect(presetKey) {
  if (!canManageScenario.value || scenarioBusy.value || !presetKey || !activeEngagementId.value) return
  const preset = scenarioPresets.value.find((item) => item.key === presetKey)
  if (!preset || activeScenario.value?.key === preset.key) return
  scenarioBusy.value = true
  const result = await applyScenarioPreset(activeEngagementId.value, preset.key, {
    expectedRevision: demoActiveContext.value?.revision,
    idempotencyKey: `scenario-${activeEngagementId.value}-${preset.key}-${Date.now()}`,
  })
  scenarioBusy.value = false
  if (!result.ok) {
    permissionNotice.value = `Walkthrough focus was not changed (${result.error?.code || 'NOT_COMMITTED'}). ${result.error?.message || 'Please try again.'}`
    return
  }
  activeScenario.value = result.scenario || null
  permissionNotice.value = `${preset.label} is selected as the walkthrough focus. Workflow progress and permissions remain based on the engagement record.`
  await refreshDemoContext()
  await refreshWalkthroughPresets()
}

function requestRestart() {
  if (!canRestartWalkthrough.value) return
  restartRestoreFocus = typeof document !== 'undefined' ? document.activeElement : null
  helpOpen.value = false
  restartError.value = ''
  restartConfirmOpen.value = true
  nextTick(() => restartCancelButton.value?.focus())
}

function closeRestartConfirm() {
  if (restartBusy.value) return
  restartConfirmOpen.value = false
  restartError.value = ''
  const target = restartRestoreFocus
  restartRestoreFocus = null
  nextTick(() => target?.focus?.())
}

async function confirmRestart() {
  if (!canRestartWalkthrough.value || restartBusy.value) return
  restartBusy.value = true
  restartError.value = ''
  if (isSharedDemoEnabled) {
    const result = await resetSharedDemo()
    if (!result.ok) {
      restartError.value = `${result.error?.code || 'RESET_NOT_COMMITTED'}: ${result.error?.message || 'The walkthrough could not be restarted.'}`
      restartBusy.value = false
      return
    }
  } else {
    resetDemoData()
  }
  await refreshDemoContext()
  const restoredEngagement = demoContexts.value[0]?.engagementId || activeEngagementId.value
  if (restoredEngagement) switchDemoEngagement(restoredEngagement)
  restartBusy.value = false
  closeRestartConfirm()
  permissionNotice.value = 'Walkthrough restarted. The starting engagement, queue, and next action have been restored.'
  navigate(currentUser.value?.landing || 'dashboard', { engagementId: restoredEngagement })
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
    if (target && target !== user.landing) permissionNotice.value = `${ROUTE_REGISTRY[target]?.label || 'That page'} is not available for the ${user.roleLabel.toLowerCase()} account.`
    else permissionNotice.value = ''
    currentRoute.value = user.landing
    if (typeof window !== 'undefined') window.location.hash = encodeLocation({ routeKey: user.landing, engagementId: activeEngagementId.value })
  }
  if (isSharedDemoEnabled) {
    createDemoSession(user.id).then((res) => {
      if (!res.ok) permissionNotice.value = `Workspace connection is unavailable (${res.error.code}). You can continue exploring while it reconnects.`;
      else if (res.view?.engagementId) {
        switchDemoEngagement(res.view.engagementId)
        void refreshWalkthroughPresets()
      } else {
        void refreshDemoContext().then(refreshWalkthroughPresets)
      }
    });
  } else void refreshDemoContext()
  setDocumentTitle()
}

// Presenter quick persona switch (Phase A §3.1). Normal login above stays
// intact: this shortcut creates the Worker demo session, switches the local
// persona, retains the engagement when the new persona may view it,
// otherwise falls back to the first allowed context, and stays on the
// current route when authorized (else opens the role workspace).
async function handlePersonaSwitch(personaId) {
  if (!canSwitchPersona.value) {
    permissionNotice.value = isClientInvitation.value
      ? 'This client invitation is fixed to the client portal. Sign out to return to presenter access.'
      : 'Persona switching is available from an authorized presenter workspace.'
    return
  }
  const user = getDemoUser(personaId)
  if (!user || personaBusy.value) return
  if (user.id === currentUser.value?.id) return
  personaBusy.value = true
  accountMenuOpen.value = false
  try {
  let allowedIds = isSharedDemoEnabled
    ? demoContexts.value.map((context) => context.engagementId)
    : localContextsForPersona(user.id).map((context) => context.engagementId)
    if (isSharedDemoEnabled) {
      const activeView = getActiveDemoView()
      const session = activeView?.viewId
        ? await switchDemoView(activeView.viewId, { personaId, engagementId: activeEngagementId.value, expectedContextVersion: activeView.contextVersion })
        : await createDemoSession(user.id)
      if (!session.ok) {
        permissionNotice.value = `Workspace connection is unavailable (${session.error.code}). You remain in the ${currentUser.value.roleLabel} workspace.`
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
    else await refreshDemoContext()
    if (decision.targetRouteKey !== currentRoute.value) {
      currentRoute.value = decision.targetRouteKey
      if (typeof window !== 'undefined') window.location.hash = `/${decision.targetRouteKey}`
      if (!decision.stayed) permissionNotice.value = `${current.value?.title || 'That page'} is not available for the ${user.roleLabel.toLowerCase()} account. Opened the role workspace instead.`
    }
    setDocumentTitle()
    await refreshWalkthroughPresets()
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
        await refreshDemoContext()
        await refreshWalkthroughPresets()
      } else {
        permissionNotice.value = `Context switch rejected (${result.error?.code || 'CONTEXT_ERROR'}). The confirmed context was retained.`
      }
    } finally {
      personaBusy.value = false
    }
  } else {
    switchDemoEngagement(engagementId)
    await refreshDemoContext()
  }
}

function onGlobalKeydown(event) {
  const isPaletteShortcut = (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'k'
  if (isPaletteShortcut && currentUser.value) {
    event.preventDefault()
    commandPaletteOpen.value = !commandPaletteOpen.value
  }
}

function handleDemoReset() { requestRestart() }

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

function onShellEscape() {
  if (restartConfirmOpen.value) closeRestartConfirm()
  else if (helpOpen.value) closeHelp()
}

onMounted(() => {
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('keydown', onGlobalKeydown)
  syncRoute()
  setDocumentTitle()
  if (currentUser.value && isSharedDemoEnabled) {
    createDemoSession(currentUser.value.id).then((res) => {
      if (!res.ok) permissionNotice.value = `Workspace connection is unavailable (${res.error.code}). Please try again once it reconnects.`
      else if (res.view?.engagementId) {
        switchDemoEngagement(res.view.engagementId)
        void refreshWalkthroughPresets()
      } else {
        void refreshDemoContext().then(refreshWalkthroughPresets)
      }
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

  <div v-else class="app-shell" @keydown.esc.window="onShellEscape">
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
      <header class="topbar">
        <div class="topbar-left"><button type="button" class="mobile-menu" aria-label="Open navigation" title="Open navigation" aria-controls="primary-navigation" :aria-expanded="mobileNavOpen" @click="mobileNavOpen = true"><Icon name="menu" :size="19" /></button><nav class="breadcrumbs" aria-label="Context breadcrumb"><template v-for="(crumb, index) in demoCrumbs" :key="`${crumb.label}-${index}`"><button v-if="crumb.route" type="button" class="text-button breadcrumb-link" @click="navigate(crumb.route)">{{ crumb.label }}</button><strong v-else aria-current="page">{{ crumb.label }}</strong><Icon v-if="index < demoCrumbs.length - 1" name="chevron-right" :size="16" /></template></nav></div>
        <div class="topbar-actions">
          <form class="top-search" role="search" @submit.prevent="submitSearch"><Icon name="search" :size="17" /><input v-model="search" type="search" aria-label="Search clients, engagements and IDs (opens command palette)" placeholder="Search anything (Ctrl/Cmd+K)" @focus="commandPaletteOpen = true" /></form>
          <button type="button" class="top-icon-button" :aria-label="`Notifications, ${demoNotificationCount} items`" :title="`Notifications, ${demoNotificationCount} items`" @click="demoNotificationsOpen = true"><Icon name="bell" :size="18" /><span aria-hidden="true">{{ demoNotificationCount }}</span></button>
          <div class="account-control">
            <button type="button" class="top-user top-user-button" aria-label="Open account menu" title="Open account menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen"><span class="avatar" :class="`avatar-${currentUser.tone}`">{{ currentUser.initials }}</span><span><strong>{{ currentUser.name }}</strong><small>{{ currentUser.roleLabel }}</small></span><Icon name="chevron-down" :size="15" /></button>
            <div v-if="accountMenuOpen" class="account-menu" role="menu">
              <div class="account-menu-heading"><strong>{{ currentUser.name }}</strong><span>{{ currentUser.email }}</span></div>
              <template v-if="canSwitchPersona"><span class="account-menu-label">Switch role view</span><button v-for="persona in demoUsers.filter((candidate) => candidate.id !== currentUser.id)" :key="persona.id" type="button" role="menuitem" :disabled="personaBusy" @click="accountMenuOpen = false; handlePersonaSwitch(persona.id)">{{ persona.roleLabel }}</button></template>
              <p v-else-if="isClientInvitation" class="account-menu-note">This invitation opens the client portal only.</p>
              <button type="button" role="menuitem" @click="showLogin">Sign out</button>
            </div>
          </div>
        </div>
      </header>
      <DemoNavigator
        :current-user="currentUser"
        :personas="canSwitchPersona ? demoUsers : []"
        :contexts="demoContexts"
        :active-engagement-id="activeEngagementId"
        :active-context="demoActiveContext"
        :stage-summary="demoStageSummary"
        :loading="demoLoading"
        :persona-busy="personaBusy"
        :scenario-options="canManageScenario ? scenarioPresets : []"
        :active-scenario="activeScenario"
        :scenario-busy="scenarioBusy"
        :can-restart="canRestartWalkthrough"
        :restart-busy="restartBusy"
        @switch-persona="handlePersonaSwitch"
        @switch-context="handleContextSwitch"
        @select-scenario="handleScenarioSelect"
        @request-restart="requestRestart"
        @navigate="navigate"
        @open-palette="commandPaletteOpen = true"
        @open-notifications="demoNotificationsOpen = true"
      />
      <div class="system-strip"><span><i></i> {{ systemLabel }}</span><span>{{ demoActiveContext ? `${demoActiveContext.clientName} · ${demoActiveContext.serviceLabel} ${demoActiveContext.period}` : (isClient ? currentUser.organization : `${client.name} · ${client.period}`) }}</span><span class="build-version">Build {{ buildCommit }}</span></div>
      <div v-if="permissionNotice" class="permission-notice" role="status" aria-live="polite"><Icon name="warning" :size="17" />{{ permissionNotice }}</div>
      <main id="main-content" class="main-content" tabindex="-1"><component :is="current.component" @navigate="navigate" @request-restart="requestRestart" /></main>
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
      :personas="canSwitchPersona ? demoUsers : []"
      :routes="paletteRoutes"
      :tasks="demoTasks"
      :initial-query="search"
      @close="commandPaletteOpen = false"
      @navigate="(route) => navigate(route)"
      @switch-persona="handlePersonaSwitch"
      @switch-context="handleContextSwitch"
    />
    <div v-if="helpOpen" class="help-backdrop" role="presentation" @click.self="closeHelp">
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-dialog-header"><div><span class="eyebrow">Getting started</span><h2 id="help-title">How to read AuditFlow</h2></div><button ref="helpCloseButton" type="button" class="icon-button" aria-label="Close help" title="Close help" @click="closeHelp"><Icon name="x" :size="17" /></button></div>
        <p>{{ helpCopy }}</p>
        <ol class="help-list"><li><strong>Orient</strong><span>Overview shows the queue, owners, and current gate pressure.</span></li><li><strong>Decide</strong><span>Clients and engagement pages separate acceptance from delivery work.</span></li><li><strong>Evidence</strong><span>PBC, Accounting, and Audit pages show the source-to-conclusion chain.</span></li><li><strong>Control</strong><span>Reviews, Release, and Integration show approvals, versions, retries, and archive evidence.</span></li></ol>
        <div v-if="canRestartWalkthrough" class="help-dialog-reset"><button type="button" class="button secondary" @click="handleDemoReset">Restart walkthrough</button><span>Return this walkthrough to its starting point while keeping your sign-in open.</span></div>
      </section>
    </div>
    <div v-if="restartConfirmOpen" class="help-backdrop" role="presentation" @click.self="closeRestartConfirm">
      <section class="help-dialog restart-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title" aria-describedby="restart-description">
        <div class="help-dialog-header"><div><span class="eyebrow">Restart walkthrough</span><h2 id="restart-title">Restore the starting workflow?</h2></div><button type="button" class="icon-button" aria-label="Close restart confirmation" title="Close restart confirmation" :disabled="restartBusy" @click="closeRestartConfirm"><Icon name="x" :size="17" /></button></div>
        <p id="restart-description">This restores the starting engagement, queue, progress, and next action for this walkthrough. Changes made during the current walkthrough will be discarded.</p>
        <p v-if="restartError" class="guide-status-message" role="status"><Icon name="warning" :size="16" />{{ restartError }}</p>
        <div class="help-dialog-reset"><button ref="restartCancelButton" type="button" class="button secondary" :disabled="restartBusy" @click="closeRestartConfirm">Cancel</button><button type="button" class="button danger" :disabled="restartBusy" @click="confirmRestart">{{ restartBusy ? 'Restarting…' : 'Restart walkthrough' }}<Icon name="refresh" :size="16" /></button></div>
      </section>
    </div>
  </div>
</template>
