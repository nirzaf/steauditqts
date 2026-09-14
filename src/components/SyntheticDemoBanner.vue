<script setup>
import Icon from './Icon.vue'
import { demoStorageMode, evidenceLevel } from '../api'

const modeLabel = demoStorageMode === 'LOCAL_ONLY' ? 'BROWSER-LOCAL STATE' : 'EXPLICIT SHARED DEMO'
</script>

<template>
  <div class="synthetic-demo-banner" role="status" aria-label="Synthetic demo boundary">
    <span class="synthetic-demo-badge"><Icon name="info" :size="14" />SYNTHETIC DEMO</span>
    <span class="synthetic-demo-copy">Fictional values only. Do not enter real client information, credentials, files, or decisions.</span>
    <span class="synthetic-demo-mode"><strong>{{ modeLabel }}</strong><small>Evidence: {{ evidenceLevel }}</small></span>
  </div>
</template>
