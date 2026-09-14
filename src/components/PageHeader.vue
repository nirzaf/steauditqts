<script setup>
import Icon from './Icon.vue'

defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="page-header">
    <div>
      <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <button v-if="actionLabel" type="button" class="button primary" @click="emit('action')">
      <span>{{ actionLabel }}</span>
      <Icon name="plus" :size="16" />
    </button>
  </div>
</template>
