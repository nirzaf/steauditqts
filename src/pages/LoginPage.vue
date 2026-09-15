<script setup>
import { computed, ref } from 'vue'
import { demoUsers, findDemoUser } from '../auth'
import Icon from '../components/Icon.vue'

const emit = defineEmits(['login'])
const invitationMode = computed(() => {
  try { return Boolean(new URL(window.location.href).searchParams.get('invite')) } catch { return false }
})
const availableUsers = computed(() => invitationMode.value ? demoUsers.filter((user) => user.id === 'client-demo') : demoUsers)
const selectedId = ref(invitationMode.value ? 'client-demo' : demoUsers[0].id)
const selectedSeed = computed(() => availableUsers.value.find((user) => user.id === selectedId.value) || availableUsers.value[0] || demoUsers[0])
const email = ref(selectedSeed.value.email)
const password = ref(selectedSeed.value.password)
const errorMessage = ref('')
const activeFilterId = ref('all')
const roleSearch = ref('')
const showManualSignIn = ref(false)

const selectedUser = computed(() => availableUsers.value.find((user) => user.id === selectedId.value) || availableUsers.value[0] || demoUsers[0])

const categoryDefinitions = [
  { id: 'all', label: 'All roles', shortLabel: 'All' },
  { id: 'client', label: 'Client workspace', shortLabel: 'Client' },
  { id: 'audit', label: 'Audit team', shortLabel: 'Audit' },
  { id: 'accounting', label: 'Accounting & finance', shortLabel: 'Accounting' },
  { id: 'quality', label: 'Quality & operations', shortLabel: 'Quality + ops' },
]

const roleCategories = {
  'client-demo': 'client',
  'client-management-demo': 'client',
  'audit-senior-demo': 'audit',
  'preparer-demo': 'audit',
  'audit-manager-demo': 'audit',
  'partner-demo': 'audit',
  'accountant-demo': 'accounting',
  'accounting-reviewer-demo': 'accounting',
  'finance-demo': 'accounting',
  'admin-demo': 'quality',
  'system-admin-only-demo': 'quality',
  'eqr-demo': 'quality',
  'records-demo': 'quality',
  'compliance-demo': 'quality',
}

const recommendedRoleIds = new Set(['client-demo', 'audit-senior-demo', 'partner-demo'])

const categoryFilters = computed(() => categoryDefinitions.map((category) => ({
  ...category,
  count: category.id === 'all'
    ? availableUsers.value.length
    : availableUsers.value.filter((user) => roleCategories[user.id] === category.id).length,
})))

const filteredUsers = computed(() => {
  const needle = roleSearch.value.trim().toLowerCase()
  return availableUsers.value.filter((user) => {
    const inCategory = activeFilterId.value === 'all' || roleCategories[user.id] === activeFilterId.value
    if (!inCategory) return false
    if (!needle) return true
    return [user.roleLabel, user.name, user.organization, user.description]
      .some((value) => value.toLowerCase().includes(needle))
  })
})

const activeFilterLabel = computed(() => categoryFilters.value.find((filter) => filter.id === activeFilterId.value)?.label || 'All roles')

const workflowSteps = [
  { number: '01', label: 'Scope', detail: 'Client + engagement', icon: 'users' },
  { number: '02', label: 'Evidence', detail: 'PBC + accounting', icon: 'inbox' },
  { number: '03', label: 'Review', detail: 'Gates + approvals', icon: 'check-circle' },
  { number: '04', label: 'Release', detail: 'Report + archive', icon: 'archive' },
]

const platformStats = [
  { value: '8', label: 'workflow handoffs' },
  { value: '14', label: 'role workspaces' },
  { value: '1', label: 'control record' },
]

function chooseUser(user) {
  selectedId.value = user.id
  email.value = user.email
  password.value = user.password
  errorMessage.value = ''
}

function signIn() {
  const user = findDemoUser({ email: email.value, password: password.value })
  if (invitationMode.value && user?.id !== 'client-demo') {
    errorMessage.value = 'This invitation opens the Client portal. Please select the Client portal role.'
    return
  }
  if (!user) {
    errorMessage.value = 'Choose a role or enter its matching sign-in details.'
    return
  }
  emit('login', user)
}

function enterDemo(user) {
  chooseUser(user)
  emit('login', user)
}

function openManualSignIn() {
  showManualSignIn.value = !showManualSignIn.value
  if (showManualSignIn.value) requestAnimationFrame(() => document.querySelector('.manual-signin-panel input')?.focus())
}
</script>

<template>
  <main class="login-shell">
    <section class="login-intro">
      <div class="login-intro-top">
        <div class="login-brand"><span class="brand-mark"><Icon name="workflow" :size="22" /></span><span><strong>AuditFlow</strong><small>Practice platform</small></span></div>
        <span class="login-mode"><i aria-hidden="true"></i> Guided walkthrough</span>
      </div>

      <div class="login-copy">
        <span class="eyebrow">STE AuditFlow QTS</span>
        <h1>See the whole audit journey in one place.</h1>
        <p>Choose a role to follow the right handoff: clients submit and approve, teams prepare and review, finance closes the commercial record, and records protects the final archive.</p>

        <div class="login-flow" aria-label="AuditFlow workflow overview">
          <span class="login-flow-line" aria-hidden="true"></span>
          <div v-for="step in workflowSteps" :key="step.number" class="login-flow-step">
            <span class="login-flow-dot"><Icon :name="step.icon" :size="17" /></span>
            <span class="login-flow-step-copy"><strong><span>{{ step.number }}</span>{{ step.label }}</strong><small>{{ step.detail }}</small></span>
          </div>
        </div>

        <div class="login-stats" aria-label="Platform coverage">
          <div v-for="stat in platformStats" :key="stat.label" class="login-stat"><strong>{{ stat.value }}</strong><span>{{ stat.label }}</span></div>
        </div>
      </div>

    </section>

    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-panel-heading"><span class="eyebrow">Workspace access</span><h2 id="login-title">{{ invitationMode ? 'Open your client invitation' : 'Choose your starting point' }}</h2><p>{{ invitationMode ? 'This invitation opens a private client workspace. Your access stays inside the client portal.' : 'Filter by team, select a role, and open the workflow in one click.' }}</p></div>

      <div class="login-access-toolbar">
        <div class="login-access-toolbar-heading"><strong>{{ invitationMode ? 'Invitation access' : 'Role directory' }}</strong><span>{{ invitationMode ? 'Client portal access is fixed for this invitation.' : 'Start with a recommended path or explore every handoff.' }}</span></div>
        <span class="login-access-count">{{ filteredUsers.length }} of {{ availableUsers.length }} visible</span>
      </div>

      <div class="login-filter-tabs" role="tablist" aria-label="Filter roles">
        <button v-for="filter in categoryFilters" :key="filter.id" type="button" class="login-filter-tab" :class="{ active: activeFilterId === filter.id }" role="tab" :aria-selected="activeFilterId === filter.id" @click="activeFilterId = filter.id">
          <span>{{ filter.shortLabel }}</span><strong>{{ filter.count }}</strong>
        </button>
      </div>

      <label class="login-role-search">
        <Icon name="search" :size="17" />
        <span class="sr-only">Search roles</span>
        <input v-model="roleSearch" type="search" placeholder="Search by role, person, or focus" />
      </label>

      <p class="login-result-count" aria-live="polite"><strong>{{ activeFilterLabel }}</strong><span>{{ filteredUsers.length === 1 ? '1 role' : `${filteredUsers.length} roles` }} available</span><small>Open a workspace to continue.</small></p>

      <div class="persona-grid">
        <article v-for="user in filteredUsers" :key="user.id" class="persona-card" :class="[{ selected: selectedId === user.id }, `tone-${user.tone}`]">
          <button type="button" class="persona-card-select" :aria-pressed="selectedId === user.id" :aria-label="`Select ${user.roleLabel}`" @click="chooseUser(user)">
            <span class="persona-avatar avatar" :class="`avatar-${user.tone}`">{{ user.initials }}</span>
            <span class="persona-card-copy"><span class="persona-card-title"><strong>{{ user.roleLabel }}</strong><em v-if="recommendedRoleIds.has(user.id)">Recommended</em></span><span>{{ user.name }} · {{ user.organization }}</span><small>{{ user.description }}</small></span>
            <span class="persona-selected" aria-hidden="true">{{ selectedId === user.id ? 'Selected' : 'Select' }}</span>
          </button>
          <button type="button" class="persona-launch" @click="enterDemo(user)">Open workspace <Icon name="arrow-right" :size="15" /></button>
        </article>
      </div>

      <p v-if="!filteredUsers.length" class="login-empty">No roles match “{{ roleSearch }}”. <button type="button" class="text-button" @click="roleSearch = ''; activeFilterId = 'all'">Clear filters</button></p>

      <button type="button" class="manual-signin-toggle" :aria-expanded="showManualSignIn" @click="openManualSignIn"><span><Icon name="key" :size="15" />Sign in manually</span><small>Use the selected role’s sign-in details</small><Icon name="chevron-down" :size="16" :class="{ rotated: showManualSignIn }" /></button>

      <div v-if="showManualSignIn" class="manual-signin-panel">
        <form class="login-form" @submit.prevent="signIn">
          <div class="login-form-heading"><span>Selected role</span><strong>{{ selectedUser.roleLabel }}</strong></div>
          <label>Email<input v-model="email" type="email" autocomplete="username" /></label>
          <label>Password<input v-model="password" type="text" autocomplete="current-password" /></label>
          <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
          <button type="submit" class="button primary full-width">Sign in as {{ selectedUser.name }}<Icon name="arrow-right" :size="17" /></button>
        </form>
      </div>
    </section>
  </main>
</template>
