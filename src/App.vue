<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LoginPage from './pages/LoginPage.vue'
import Icon from './components/Icon.vue'
import AsyncPageError from './components/AsyncPageError.vue'
import AsyncPageLoading from './components/AsyncPageLoading.vue'
import { clearDemoSession, loadDemoSession, saveDemoSession } from './auth'
import { client, navItems } from './data'
import { roleRouteSets } from './roleWorkspaces.js'
import { setActivePersona } from './domain/scenario.js'

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
  'admin-console': { label: 'Admin console', title: 'Admin console', roles: ['admin'], component: asyncPage(() => import('./pages/AdminConsolePage.vue'), 'Admin console') },
}

const currentUser = ref(loadDemoSession())
if (currentUser.value) setActivePersona(currentUser.value.id)
const currentRoute = ref(getRouteFromHash())
const mobileNavOpen = ref(false)
const search = ref('')
const helpOpen = ref(false)
const accountMenuOpen = ref(false)
const permissionNotice = ref('')
const helpButton = ref(null)
const helpCloseButton = ref(null)

const current = computed(() => routes[currentRoute.value] || routes.dashboard)
const activeNav = computed(() => visibleNavItems.value.find((item) => item.key === currentRoute.value) || visibleNavItems.value[0] || { label: 'Sign in' })
const isClient = computed(() => currentUser.value?.role === 'client')
const isClientManagement = computed(() => currentUser.value?.role === 'client-management')
const isAccountant = computed(() => ['accountant', 'accounting-reviewer', 'preparer'].includes(currentUser.value?.role))
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
      { key: 'client-communications', label: 'Communications', icon: 'message', section: 'Client portal', badge: '2' },
      { key: 'artifacts', label: 'Published outputs', icon: 'file', section: 'Client portal' },
      { key: 'pipeline', label: 'Pipeline visualizer', icon: 'workflow', section: 'Client portal' },
      { key: 'client-architecture', label: 'How the platform works', icon: 'workflow', section: 'Client portal' },
    ]
  }
  if (currentUser.value.role === 'admin') return [
    ...navItems,
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
  const icons = { 'role-workspace': 'grid', clients: 'users', engagements: 'briefcase', pbc: 'inbox', accounting: 'calculator', audit: 'clipboard', reviews: 'check-circle', release: 'lock', integration: 'pulse', architecture: 'workflow', blueprint: 'layers', cycle: 'workflow', pipeline: 'workflow', 'client-home': 'grid', 'client-details': 'users', 'client-communications': 'message', 'accountant-home': 'grid', 'accountant-client': 'users', 'client-architecture': 'workflow', 'accountant-architecture': 'workflow' }
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

function getRouteFromHash() {
  if (typeof window === 'undefined') return 'dashboard'
  const key = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  if (!currentUser.value) return ''
  return routes[key] && routes[key].roles.includes(currentUser.value.role) ? key : currentUser.value.landing
}

function setDocumentTitle() {
  if (typeof document !== 'undefined') document.title = currentUser.value ? `${current.value.title} · AuditFlow` : 'AuditFlow · Demo access'
}

function navigate(key) {
  if (!currentUser.value) return
  if (!routes[key] || !routes[key].roles.includes(currentUser.value.role)) {
    permissionNotice.value = `${routes[key]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
    return
  }
  const next = key
  currentRoute.value = next
  mobileNavOpen.value = false
  accountMenuOpen.value = false
  permissionNotice.value = ''
  if (typeof window !== 'undefined' && window.location.hash !== `#/${next}`) window.location.hash = `/${next}`
  setDocumentTitle()
  if (typeof document !== 'undefined') window.requestAnimationFrame(() => document.querySelector('#main-content')?.focus())
}

function syncRoute() {
  if (!currentUser.value) {
    currentRoute.value = ''
    mobileNavOpen.value = false
    accountMenuOpen.value = false
    setDocumentTitle()
    return
  }
  const requested = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '').split('/')[0] : ''
  const allowed = routes[requested] && routes[requested].roles.includes(currentUser.value.role)
  currentRoute.value = allowed ? requested : currentUser.value.landing
  if (!allowed && requested && requested !== currentUser.value.landing) {
    permissionNotice.value = `${routes[requested]?.label || 'That page'} is not available for the ${currentUser.value.roleLabel.toLowerCase()} account.`
    if (typeof window !== 'undefined') window.location.hash = `/${currentUser.value.landing}`
  }
  mobileNavOpen.value = false
  accountMenuOpen.value = false
  setDocumentTitle()
}

function submitSearch() {
  if (!search.value.trim()) return
  navigate(isClient.value ? 'client-details' : isAccountant.value ? 'accountant-client' : 'clients')
}

function handleLogin(user) {
  currentUser.value = user
  setActivePersona(user.id)
  saveDemoSession(user)
  currentRoute.value = user.landing
  permissionNotice.value = ''
  if (typeof window !== 'undefined') window.location.hash = `/${user.landing}`
  setDocumentTitle()
}

function showLogin() {
  clearDemoSession()
  setActivePersona(null)
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
  syncRoute()
  setDocumentTitle()
})

onBeforeUnmount(() => window.removeEventListener('hashchange', syncRoute))
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
      <header class="topbar"><div class="topbar-left"><button type="button" class="mobile-menu" aria-label="Open navigation" title="Open navigation" aria-controls="primary-navigation" :aria-expanded="mobileNavOpen" @click="mobileNavOpen = true"><Icon name="menu" :size="19" /></button><div class="breadcrumbs"><span>{{ currentUser.roleLabel }}</span><Icon name="chevron-right" :size="16" /><strong>{{ activeNav.label }}</strong></div></div><div class="topbar-actions"><form class="top-search" role="search" @submit.prevent="submitSearch"><Icon name="search" :size="17" /><input v-model="search" type="search" aria-label="Search clients, engagements and IDs" placeholder="Search anything" /></form><button type="button" class="top-icon-button" :aria-label="isClient ? 'Portal messages, 2 items' : 'Notifications, 3 items'" :title="isClient ? 'Portal messages, 2 items' : 'Notifications, 3 items'"><Icon name="bell" :size="18" /><span aria-hidden="true">{{ isClient ? '2' : '3' }}</span></button><div class="account-control"><button type="button" class="top-user top-user-button" aria-label="Open account menu" title="Open account menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen"><span class="avatar" :class="`avatar-${currentUser.tone}`">{{ currentUser.initials }}</span><span><strong>{{ currentUser.name }}</strong><small>{{ currentUser.roleLabel }}</small></span><Icon name="chevron-down" :size="15" /></button><div v-if="accountMenuOpen" class="account-menu" role="menu"><div class="account-menu-heading"><strong>{{ currentUser.name }}</strong><span>{{ currentUser.email }}</span></div><button type="button" role="menuitem" @click="showLogin">Switch demo account</button><button type="button" role="menuitem" @click="showLogin">Sign out</button></div></div></div></header>
      <div class="system-strip"><span><i></i> {{ systemLabel }}</span><span>{{ isClient ? currentUser.organization : `${client.name} · ${client.period}` }}</span></div>
      <div v-if="permissionNotice" class="permission-notice" role="status" aria-live="polite"><Icon name="warning" :size="17" />{{ permissionNotice }}</div>
      <main id="main-content" class="main-content" tabindex="-1"><component :is="current.component" @navigate="navigate" /></main>
    </div>

    <div v-if="helpOpen" class="help-backdrop" role="presentation" @click.self="closeHelp">
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-dialog-header"><div><span class="eyebrow">Prototype orientation</span><h2 id="help-title">How to read AuditFlow</h2></div><button ref="helpCloseButton" type="button" class="icon-button" aria-label="Close help" title="Close help" @click="closeHelp"><Icon name="x" :size="17" /></button></div>
        <p>{{ helpCopy }}</p>
        <ol class="help-list"><li><strong>Orient</strong><span>Overview shows the queue, owners, and current gate pressure.</span></li><li><strong>Decide</strong><span>Clients and engagement pages separate acceptance from delivery work.</span></li><li><strong>Evidence</strong><span>PBC, Accounting, and Audit pages show the source-to-conclusion chain.</span></li><li><strong>Control</strong><span>Reviews, Release, and Integration show approvals, versions, retries, and archive evidence.</span></li></ol>
        <div class="help-dialog-note"><Icon name="info" :size="17" /><span><strong>Demo boundary</strong> Values are illustrative. Qualified people own professional decisions, approvals, conclusions, and records actions.</span></div>
      </section>
    </div>
  </div>
</template>
