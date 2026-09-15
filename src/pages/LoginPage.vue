<script setup>
import { computed, ref } from 'vue'
import { demoUsers, findDemoUser } from '../auth'
import Icon from '../components/Icon.vue'

const emit = defineEmits(['login'])
const selectedId = ref(demoUsers[0].id)
const email = ref(demoUsers[0].email)
const password = ref(demoUsers[0].password)
const errorMessage = ref('')

const selectedUser = computed(() => demoUsers.find((user) => user.id === selectedId.value) || demoUsers[0])

const workflowSteps = [
  { number: '01', label: 'Scope', detail: 'Client + engagement', icon: 'users' },
  { number: '02', label: 'Evidence', detail: 'PBC + accounting', icon: 'inbox' },
  { number: '03', label: 'Review', detail: 'Gates + approvals', icon: 'check-circle' },
  { number: '04', label: 'Release', detail: 'Report + archive', icon: 'archive' },
]

const platformStats = [
  { value: '8', label: 'workflow handoffs' },
  { value: '14', label: 'demo personas' },
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
  if (!user) {
    errorMessage.value = 'Choose one of the demo personas or enter its exact credentials.'
    return
  }
  emit('login', user)
}

function enterDemo(user) {
  chooseUser(user)
  emit('login', user)
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
        <p>Choose a fictional persona to follow the right handoff: clients submit and approve, teams prepare and review, finance closes the commercial record, and records protects the final archive.</p>

        <div class="login-flow" aria-label="AuditFlow workflow overview">
          <span class="login-flow-line" aria-hidden="true"></span>
          <div v-for="step in workflowSteps" :key="step.number" class="login-flow-step">
            <span class="login-flow-dot"><Icon :name="step.icon" :size="17" /></span>
            <span class="login-flow-step-copy"><strong><span>{{ step.number }}</span>{{ step.label }}</strong><small>{{ step.detail }}</small></span>
          </div>
        </div>

        <div class="login-stats" aria-label="Prototype coverage">
          <div v-for="stat in platformStats" :key="stat.label" class="login-stat"><strong>{{ stat.value }}</strong><span>{{ stat.label }}</span></div>
        </div>
      </div>

    </section>

    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-panel-heading"><span class="eyebrow">Demo access</span><h2 id="login-title">Sign in to AuditFlow</h2><p>Pick a persona to see the pages and actions that role can use.</p></div>
      <div class="persona-grid">
        <button v-for="user in demoUsers" :key="user.id" type="button" class="persona-card" :class="[{ selected: selectedId === user.id }, `tone-${user.tone}`]" @click="chooseUser(user)">
          <span class="persona-avatar avatar" :class="`avatar-${user.tone}`">{{ user.initials }}</span>
          <span class="persona-card-copy"><strong>{{ user.roleLabel }}</strong><span>{{ user.name }} · {{ user.organization }}</span><small>{{ user.description }}</small></span>
          <span class="persona-selected" aria-hidden="true">{{ selectedId === user.id ? 'Selected' : 'Select' }}</span>
        </button>
      </div>

      <form class="login-form" @submit.prevent="signIn">
        <div class="login-form-heading"><span>Selected persona</span><strong>{{ selectedUser.roleLabel }}</strong></div>
        <label>Email<input v-model="email" type="email" autocomplete="username" /></label>
        <label>Password<input v-model="password" type="text" autocomplete="current-password" /></label>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <button type="submit" class="button primary full-width">Sign in as {{ selectedUser.name }}<Icon name="arrow-right" :size="17" /></button>
      </form>

      <div class="login-credentials"><span class="guide-label"><Icon name="key" :size="14" />Quick demo credentials</span><div v-for="user in demoUsers" :key="`${user.id}-credentials`" class="credential-row"><span><strong>{{ user.roleLabel }}</strong><small>{{ user.email }} · {{ user.password }}</small></span><button type="button" class="text-button" @click="enterDemo(user)">Enter demo <Icon name="arrow-right" :size="15" /></button></div></div>
    </section>
  </main>
</template>
