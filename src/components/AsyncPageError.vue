<script setup>
import Icon from './Icon.vue'

defineProps({
  error: { type: Error, default: null },
})

function reload() {
  if (typeof window !== 'undefined') window.location.reload()
}
</script>

<template>
  <section class="page-state page-state-error panel" role="alert">
    <span class="page-state-error-icon"><Icon name="refresh" :size="22" /></span>
    <div><span class="eyebrow">This page needs a refresh</span><h1>The current page version could not be loaded.</h1><p>A newer version may have replaced this page while the tab was open. Refresh to continue from the current workspace.</p><code v-if="error?.message">{{ error.message }}</code><button type="button" class="button primary" @click="reload">Reload current version <Icon name="refresh" :size="16" /></button></div>
  </section>
</template>
