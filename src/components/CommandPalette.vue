<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { filterPalette, isEscapeEvent } from '../demoContext.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  contexts: { type: Array, default: () => [] },
  personas: { type: Array, default: () => [] },
  routes: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  initialQuery: { type: String, default: '' },
})

const emit = defineEmits(['close', 'navigate', 'switch-persona', 'switch-context'])
const query = ref(props.initialQuery || '')
const activeIndex = ref(0)
const inputRef = ref(null)

const results = computed(() => filterPalette(query.value, {
  contexts: props.contexts,
  personas: props.personas,
  routes: props.routes,
  tasks: props.tasks,
}))

let restoreFocusTo = null
watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    restoreFocusTo = typeof document !== 'undefined' ? document.activeElement : null
    query.value = props.initialQuery || ''
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  } else if (restoreFocusTo && typeof document !== 'undefined') {
    const target = restoreFocusTo
    restoreFocusTo = null
    target.focus?.()
  }
})
watch(query, () => { activeIndex.value = 0 })

function choose(result) {
  if (!result) return
  if (result.action?.type === 'navigate') emit('navigate', {
    routeKey: result.action.route,
    engagementId: result.action.engagementId || undefined,
    recordId: result.action.recordId || undefined,
  })
  else if (result.action?.type === 'switch-persona') emit('switch-persona', result.action.personaId)
  else if (result.action?.type === 'switch-context') emit('switch-context', result.action.engagementId)
  emit('close')
}
function onKeydown(event) {
  if (isEscapeEvent(event)) { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex.value = Math.max(activeIndex.value - 1, 0) }
  else if (event.key === 'Enter') { event.preventDefault(); choose(results.value[activeIndex.value]) }
}
</script>

<template>
  <div v-if="open" class="palette-backdrop" role="presentation" @click.self="emit('close')" @keydown="onKeydown">
    <section class="palette" role="dialog" aria-modal="true" aria-labelledby="palette-title">
      <div class="palette-search-row">
        <Icon name="search" :size="17" />
        <input
          ref="inputRef"
          v-model="query"
          name="command-search"
          type="search"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search clients, engagements, IDs, stages, personas and routes"
          placeholder="Search clients, ENG-IDs, stages, personas, routes… (Esc closes)"
          @keydown="onKeydown"
        />
        <button type="button" class="icon-button" aria-label="Close command palette" @click="emit('close')"><Icon name="x" :size="16" /></button>
      </div>
      <h2 id="palette-title" class="sr-only">Global search and commands</h2>
      <p v-if="!results.length" class="guide-empty-state">No matches. Try a client, ENG-ID, stage, persona, or route.</p>
      <ul v-else class="palette-list" role="listbox" aria-label="Search results">
        <li v-for="(result, index) in results" :key="`${result.kind}-${result.label}-${index}`">
          <button
            type="button"
            role="option"
            :aria-selected="index === activeIndex"
            class="palette-row"
            :class="{ active: index === activeIndex }"
            @click="choose(result)"
            @mouseenter="activeIndex = index"
          >
            <span class="palette-kind">{{ result.kind }}</span>
            <span class="palette-main"><strong>{{ result.label }}</strong><small>{{ result.detail }}</small></span>
            <Icon name="arrow-right" :size="14" />
          </button>
        </li>
      </ul>
      <p class="panel-footnote"><Icon name="info" :size="14" /><span>Lightweight local filter over server-authorized contexts · ↑↓ + Enter · Ctrl/Cmd+K toggles.</span></p>
    </section>
  </div>
</template>

<style scoped>
.palette-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.38); z-index: 70; display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; }
.palette { width: min(620px, 94vw); max-height: 72vh; overflow: auto; background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 14px; padding: 12px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25); }
.palette-search-row { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #e5e7eb); padding-bottom: 8px; margin-bottom: 8px; }
.palette-search-row input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; }
.palette-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.palette-row { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; padding: 8px; border-radius: 10px; border: 1px solid transparent; background: transparent; cursor: pointer; }
.palette-row.active { border-color: var(--border, #d1d5db); background: var(--background, #f3f4f6); }
.palette-kind { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; min-width: 62px; opacity: 0.65; }
.palette-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.palette-main strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-main small { font-size: 11px; opacity: 0.7; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
</style>
