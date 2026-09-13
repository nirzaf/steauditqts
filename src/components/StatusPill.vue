<script setup>
defineProps({
  label: { type: String, required: true },
  tone: { type: String, default: 'neutral' },
})
</script>

<template>
  <span class="status-pill" :class="`tone-${tone}`"><i aria-hidden="true"></i>{{ label }}</span>
</template>
