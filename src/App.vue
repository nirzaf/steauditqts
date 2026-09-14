<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LoginPage from './pages/LoginPage.vue'
import { clearDemoSession, loadDemoSession, saveDemoSession } from './auth'
import { client, navItems } from './data'

const routes = {
  dashboard: { label: 'Overview', title: 'Overview', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/DashboardPage.vue')) },
  clients: { label: 'Clients & acceptance', title: 'Clients & acceptance', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/ClientsPage.vue')) },
  engagements: { label: 'Engagements', title: 'Engagement workspace', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/EngagementsPage.vue')) },
  pbc: { label: 'PBC portal', title: 'PBC portal', roles: ['admin', 'accountant'], component: defineAsyncComponent(() => import('./pages/PbcPage.vue')) },
  accounting: { label: 'Accounting & TB', title: 'Accounting & TB', roles: ['admin', 'accountant'], component: defineAsyncComponent(() => import('./pages/AccountingPage.vue')) },
  audit: { label: 'Audit & fieldwork', title: 'Audit & fieldwork', roles: ['admin', 'accountant'], component: defineAsyncComponent(() => import('./pages/AuditPage.vue')) },
  reviews: { label: 'Reviews & approvals', title: 'Reviews & approvals', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/ReviewsPage.vue')) },
  release: { label: 'Release & archive', title: 'Release & archive', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/ReleasePage.vue')) },
  integration: { label: 'Integration health', title: 'Integration health', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/IntegrationPage.vue')) },
  'client-home': { label: 'Portal overview', title: 'Client portal', roles: ['admin', 'client'], component: defineAsyncComponent(() => import('./pages/ClientPortalPage.vue')) },
  'client-details': { label: 'Client details', title: 'Client details', roles: ['admin', 'client'], component: defineAsyncComponent(() => import('./pages/ClientDetailsPage.vue')) },
  'client-communications': { label: 'Communications', title: 'Portal communications', roles: ['admin', 'client'], component: defineAsyncComponent(() => import('./pages/ClientCommunicationsPage.vue')) },
  'accountant-home': { label: 'Accountant overview', title: 'Accountant portal', roles: ['admin', 'accountant'], component: defineAsyncComponent(() => import('./pages/AccountantHomePage.vue')) },
  'accountant-client': { label: 'View client details', title: 'View client details', roles: ['admin', 'accountant'], component: defineAsyncComponent(() => import('./pages/AccountantClientPage.vue')) },
  'admin-console': { label: 'Admin console', title: 'Admin console', roles: ['admin'], component: defineAsyncComponent(() => import('./pages/AdminConsolePage.vue')) },
}

const iconPaths = {
  grid: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  users: ['M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20', 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 11a2.5 2.5 0 1 0-1.2-4.7', 'M20 20v-1.5a4.5 4.5 0 0 0-3.2-4.3'],
  briefcase: ['M5 7h14v13H5z', 'M9 7V5h6v2', 'M5 12h14M10 12v2h4v-2'],
  inbox: ['M4 5h16v14H4z', 'M4 14h4l1.5 2h5L16 14h4', 'M8 9h8'],
  calculator: ['M6 3h12v18H6z', 'M9 7h6', 'M9 11h1M12 11h1M15 11h1M9 14h1M12 14h1M15 14h1M9 17h1M12 17h1M15 17h1'],
  clipboard: ['M7 4h10v17H7z', 'M9 4V3h6v1', 'M10 9h4M10 13h4M10 17h3'],
  'check-circle': ['M5 12 9 16 19 6', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  lock: ['M6 10h12v11H6z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v3'],
  pulse: ['M3 12h4l2-6 4 12 2-6h6'],
  message: ['M4 5h16v11H8l-4 4z', 'M8 9h8M8 12h5'],
  shield: ['M12 3 20 6v5c0 5-3.5 8.3-8 10-4.5-1.7-8-5-8-10V6z', 'm9 12 2 2 4-4'],
  search: ['m20 20-4.5-4.5', 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  bell: ['M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4'],
}

const currentUser = ref(loadDemoSession())
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
const isAccountant = computed(() => currentUser.value?.role === 'accountant')
const workspaceName = computed(() => isClient.value ? currentUser.value.organization : currentUser.value?.role === 'accountant' ? 'Quadrate Accounting' : 'Quadrate Audit')
const workspaceSubtitle = computed(() => isClient.value ? 'Client portal' : currentUser.value?.roleLabel || 'Demo workspace')
const workspaceInitials = computed(() => currentUser.value?.initials || 'Q')
const systemLabel = computed(() => isClient.value ? 'Client portal · shared communication record' : currentUser.value?.role === 'accountant' ? 'Accountant workspace · preparation access' : 'Admin workspace · all demo privileges')
const helpCopy = computed(() => isClient.value
  ? 'Use Client details to submit facts, Requests to see what is due, and Communications for every question or clarification.'
  : isAccountant.value
    ? 'Start with View client details, then follow PBC, Accounting, and Audit. Acceptance, review, release, and integration controls remain with the admin role.'
    : 'Use the full navigation to trace acceptance, evidence, accounting, audit, approvals, release, and integration controls.')
const visibleNavItems = computed(() => {
  if (!currentUser.value) return []
  if (currentUser.value.role === 'client') {
    return [
      { key: 'client-home', label: 'Portal overview', icon: 'grid', section: 'Client portal' },
      { key: 'client-details', label: 'Client details', icon: 'users', section: 'Client portal' },
      { key: 'client-communications', label: 'Communications', icon: 'message', section: 'Client portal', badge: '2' },
    ]
  }
  if (currentUser.value.role === 'accountant') {
    return [
      { key: 'accountant-home', label: 'Accountant overview', icon: 'grid', section: 'Accountant workspace' },
      { key: 'accountant-client', label: 'View client details', icon: 'users', section: 'Accountant workspace' },
      ...navItems.filter((item) => ['pbc', 'accounting', 'audit'].includes(item.key)),
    ]
  }
  return [
    ...navItems,
    { key: 'client-home', label: 'Client portal preview', icon: 'grid', section: 'Portals' },
    { key: 'client-details', label: 'Client details preview', icon: 'users', section: 'Portals' },
    { key: 'client-communications', label: 'Client communications', icon: 'message', section: 'Portals' },
    { key: 'accountant-home', label: 'Accountant portal preview', icon: 'calculator', section: 'Portals' },
    { key: 'accountant-client', label: 'Accountant client view', icon: 'users', section: 'Portals' },
    { key: 'admin-console', label: 'Admin console', icon: 'shield', section: 'Administration' },
  ]
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
  saveDemoSession(user)
  currentRoute.value = user.landing
  permissionNotice.value = ''
  if (typeof window !== 'undefined') window.location.hash = `/${user.landing}`
  setDocumentTitle()
}

function showLogin() {
  clearDemoSession()
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
      <div class="sidebar-brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zM8 9h8M8 13h5M8 17h8"/></svg></span><span><strong>AuditFlow</strong><small>Practice platform</small></span></div>
      <div class="workspace-switcher"><span class="workspace-avatar">{{ workspaceInitials }}</span><span><strong>{{ workspaceName }}</strong><small>{{ workspaceSubtitle }}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg></div>

      <nav class="sidebar-nav">
        <div v-for="group in navGroups" :key="group.name" class="nav-group"><span class="nav-group-label">{{ group.name }}</span><button v-for="item in group.items" :key="item.key" type="button" class="nav-item" :class="{ active: currentRoute === item.key }" :aria-current="currentRoute === item.key ? 'page' : undefined" @click="navigate(item.key)"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in iconPaths[item.icon]" :key="path" :d="path"/></svg><span>{{ item.label }}</span><em v-if="item.badge">{{ item.badge }}</em></button></div>
      </nav>

      <div class="sidebar-bottom"><div class="sidebar-health"><span class="health-pulse"></span><span><strong>{{ isClient ? 'Portal connected' : 'All systems healthy' }}</strong><small>{{ isClient ? 'Secure demo workspace' : 'Reconciled 09:42' }}</small></span></div><div class="sidebar-foot"><span>{{ currentUser.roleLabel }}</span><button ref="helpButton" type="button" aria-label="Open help" @click="openHelp"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.6c-1 .8-1.7 1.1-1.7 2.4M12 16.5v.5"/></svg></button></div></div>
    </aside>

    <div class="app-main">
      <header class="topbar"><div class="topbar-left"><button type="button" class="mobile-menu" aria-label="Open navigation" aria-controls="primary-navigation" :aria-expanded="mobileNavOpen" @click="mobileNavOpen = true"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in iconPaths.menu" :key="path" :d="path"/></svg></button><div class="breadcrumbs"><span>{{ currentUser.roleLabel }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg><strong>{{ activeNav.label }}</strong></div></div><div class="topbar-actions"><form class="top-search" role="search" @submit.prevent="submitSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in iconPaths.search" :key="path" :d="path"/></svg><input v-model="search" type="search" aria-label="Search clients, engagements and IDs" placeholder="Search anything" /></form><button type="button" class="top-icon-button" :aria-label="isClient ? 'Portal messages, 2 items' : 'Notifications, 3 items'"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in iconPaths.bell" :key="path" :d="path"/></svg><span aria-hidden="true">{{ isClient ? '2' : '3' }}</span></button><div class="account-control"><button type="button" class="top-user top-user-button" aria-label="Open account menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen"><span class="avatar" :class="`avatar-${currentUser.tone}`">{{ currentUser.initials }}</span><span><strong>{{ currentUser.name }}</strong><small>{{ currentUser.roleLabel }}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg></button><div v-if="accountMenuOpen" class="account-menu" role="menu"><div class="account-menu-heading"><strong>{{ currentUser.name }}</strong><span>{{ currentUser.email }}</span></div><button type="button" role="menuitem" @click="showLogin">Switch demo account</button><button type="button" role="menuitem" @click="showLogin">Sign out</button></div></div></div></header>
      <div class="system-strip"><span><i></i> {{ systemLabel }}</span><span>{{ isClient ? currentUser.organization : `${client.name} · ${client.period}` }}</span></div>
      <div v-if="permissionNotice" class="permission-notice" role="status" aria-live="polite"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>{{ permissionNotice }}</div>
      <main id="main-content" class="main-content" tabindex="-1"><component :is="current.component" @navigate="navigate" /></main>
    </div>

    <div v-if="helpOpen" class="help-backdrop" role="presentation" @click.self="closeHelp">
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-dialog-header"><div><span class="eyebrow">Prototype orientation</span><h2 id="help-title">How to read AuditFlow</h2></div><button ref="helpCloseButton" type="button" class="icon-button" aria-label="Close help" @click="closeHelp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <p>{{ helpCopy }}</p>
        <ol class="help-list"><li><strong>Orient</strong><span>Overview shows the queue, owners, and current gate pressure.</span></li><li><strong>Decide</strong><span>Clients and engagement pages separate acceptance from delivery work.</span></li><li><strong>Evidence</strong><span>PBC, Accounting, and Audit pages show the source-to-conclusion chain.</span></li><li><strong>Control</strong><span>Reviews, Release, and Integration show approvals, versions, retries, and archive evidence.</span></li></ol>
        <div class="help-dialog-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5v.5"/></svg><span><strong>Demo boundary</strong> Values are illustrative. Qualified people own professional decisions, approvals, conclusions, and records actions.</span></div>
      </section>
    </div>
  </div>
</template>
