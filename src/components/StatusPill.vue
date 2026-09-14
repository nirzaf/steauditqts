<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  label: { type: String, required: true },
  tone: { type: String, default: 'neutral' },
})

const iconName = computed(() => ({
  good: 'check-circle',
  warn: 'warning',
  danger: 'lock',
  neutral: 'clock',
}[props.tone] || 'info'))
</script>

<template>
  <span class="status-pill" :class="`tone-${props.tone}`"><Icon :name="iconName" :size="14" />{{ props.label }}</span>
</template>
