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
    <div><span class="eyebrow">This demo page needs a refresh</span><h1>The current page version could not be loaded.</h1><p>A newer deployment may have replaced the page module while this tab was open. Refresh to load the current synthetic build. No workflow decision was changed.</p><code v-if="error?.message">{{ error.message }}</code><button type="button" class="button primary" @click="reload">Reload current deployment <Icon name="refresh" :size="16" /></button></div>
  </section>
</template>
