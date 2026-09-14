<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  title: { type: String, default: '' },
  decorative: { type: Boolean, default: true },
})

// A small, deliberately consistent outline set keeps the prototype legible while
// avoiding a mix of emoji, raster assets, and unrelated icon families.
const paths = {
  grid: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  users: ['M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20', 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 11a2.5 2.5 0 1 0-1.2-4.7', 'M20 20v-1.5a4.5 4.5 0 0 0-3.2-4.3'],
  user: ['M19 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 5 18.5V20', 'M12 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
  briefcase: ['M5 7h14v13H5z', 'M9 7V5h6v2', 'M5 12h14M10 12v2h4v-2'],
  inbox: ['M4 5h16v14H4z', 'M4 14h4l1.5 2h5L16 14h4', 'M8 9h8'],
  calculator: ['M6 3h12v18H6z', 'M9 7h6', 'M9 11h1M12 11h1M15 11h1M9 14h1M12 14h1M15 14h1M9 17h1M12 17h1M15 17h1'],
  clipboard: ['M7 4h10v17H7z', 'M9 4V3h6v1', 'M10 9h4M10 13h4M10 17h3'],
  'list-check': ['M5 5h14M5 12h7M5 19h14', 'm15 11 2 2 3-4'],
  'check-circle': ['M5 12 9 16 19 6', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
  check: ['M5 12 9 16 19 6'],
  warning: ['M12 3 2.8 19h18.4L12 3Z', 'M12 9v4M12 16.5v.5'],
  lock: ['M6 10h12v11H6z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v3'],
  pulse: ['M3 12h4l2-6 4 12 2-6h6'],
  message: ['M4 5h16v11H8l-4 4z', 'M8 9h8M8 12h5'],
  shield: ['M12 3 20 6v5c0 5-3.5 8.3-8 10-4.5-1.7-8-5-8-10V6z', 'm9 12 2 2 4-4'],
  search: ['m20 20-4.5-4.5', 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  bell: ['M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4'],
  'chevron-down': ['m7 9 5 5 5-5'],
  'chevron-right': ['m9 5 7 7-7 7'],
  'arrow-right': ['M5 12h14', 'm13 6 6 6-6 6'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  x: ['m6 6 12 12M18 6 6 18'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 10v6M12 7.5v.5'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  archive: ['M4 6h16v14H4z', 'M8 6V4h8v2', 'M8 11h8M8 15h5'],
  folder: ['M3.5 6.5h6l2 2h9v10h-17z', 'M3.5 8.5h17'],
  link: ['M9.5 14.5 14.5 9.5', 'M7 17a4 4 0 0 1 0-5.7l2.3-2.3a4 4 0 0 1 5.7 0', 'M17 7a4 4 0 0 1 0 5.7l-2.3 2.3a4 4 0 0 1-5.7 0'],
  calendar: ['M5 4h14v16H5z', 'M8 2v4M16 2v4M5 9h14', 'M9 13h2M13 13h2M9 17h2'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  eye: ['M2.8 12s3.3-6 9.2-6 9.2 6 9.2 6-3.3 6-9.2 6-9.2-6-9.2-6Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  send: ['M3 11.5 21 3l-5.5 18-3.5-7-9-2.5Z', 'm12 14 9-11'],
  settings: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.5v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.5v-2.5h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1H15v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  database: ['M4 5c0 1.1 3.6 2 8 2s8-.9 8-2-3.6-2-8-2-8 .9-8 2Z', 'M4 5v7c0 1.1 3.6 2 8 2s8-.9 8-2V5', 'M4 12v7c0 1.1 3.6 2 8 2s8-.9 8-2v-7'],
  spark: ['m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z', 'm19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z'],
  refresh: ['M20 11a8 8 0 0 0-14.6-4L3 10', 'M3 5v5h5', 'M4 13a8 8 0 0 0 14.6 4L21 14', 'M21 19v-5h-5'],
  filter: ['M4 6h16M7 12h10M10 18h4'],
  key: ['m14 7 3-3 3 3-3 3', 'M17 7a5 5 0 1 0 0 10H7'],
  building: ['M4 21V5l8-2 8 2v16', 'M8 9h2M14 9h2M8 13h2M14 13h2M8 17h2M14 17h2'],
  chart: ['M4 19V5M4 19h16', 'm7 15 3-4 3 2 5-6'],
  workflow: ['M5 5h5v5H5zM14 14h5v5h-5z', 'M10 7h4a3 3 0 0 1 3 3v4', 'M14 17h-4a3 3 0 0 1-3-3v-4'],
}

const iconPaths = computed(() => paths[props.name] || paths.workflow)
const accessible = computed(() => Boolean(props.title) || !props.decorative)
const iconStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
}))
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    :style="iconStyle"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
    :role="accessible ? 'img' : undefined"
    :aria-label="title || undefined"
    :aria-hidden="accessible ? undefined : 'true'"
  >
    <title v-if="title">{{ title }}</title>
    <path v-for="path in iconPaths" :key="path" :d="path" />
  </svg>
</template>
