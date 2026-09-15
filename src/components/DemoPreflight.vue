<!-- P1.3 — Demo preflight / Ready-to-present check. Read-only checklist over
     the existing demo context; the only action is the existing restart flow. -->
<script setup>
import Icon from './Icon.vue'

const props = defineProps({
  mode: { type: String, default: 'local' },
  build: { type: String, default: 'local' },
  checks: { type: Array, default: () => [] },
  canRestore: { type: Boolean, default: false },
  restoreBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'restore'])
const ready = props.checks.length > 0 && props.checks.every((c) => c.ok)
</script>

<template>
  <section class="preflight" role="dialog" aria-modal="false" aria-labelledby="preflight-title">
    <div class="preflight-header">
      <div><span class="eyebrow">Demo readiness</span><h2 id="preflight-title">{{ ready ? 'Ready to present' : 'Preflight — check before presenting' }}</h2></div>
      <button type="button" class="icon-button" aria-label="Close demo preflight" @click="emit('close')"><Icon name="x" :size="16" /></button>
    </div>
    <ul class="preflight-list">
      <li v-for="check in checks" :key="check.label" :class="{ ok: check.ok, bad: !check.ok }">
        <span aria-hidden="true">{{ check.ok ? '✓' : '!' }}</span>
        <span><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></span>
      </li>
    </ul>
    <p class="panel-footnote"><Icon name="info" :size="14" /><span>Mode {{ mode === 'shared' ? 'SHARED_DEMO' : 'LOCAL_ONLY' }} · Build {{ build }}</span></p>
    <div class="preflight-footer">
      <button v-if="canRestore" type="button" class="button secondary" :disabled="restoreBusy" @click="emit('restore')">{{ restoreBusy ? 'Restoring…' : 'Restore clean demo' }}</button>
      <button type="button" class="text-button" @click="emit('close')">Close</button>
    </div>
  </section>
</template>

<style scoped>
.preflight { position: absolute; right: 16px; top: 100%; z-index: 50; width: min(380px, 92vw); max-height: 70vh; overflow: auto; background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 12px; box-shadow: 0 20px 50px rgba(15,23,42,.18); padding: 14px; }
.preflight-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.preflight-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.preflight-list li { display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; font-size: 12px; }
.preflight-list li.ok { border-color: #bbf7d0; background: #f0fdf4; }
.preflight-list li.bad { border-color: #fecaca; background: #fef2f2; }
.preflight-list strong { display: block; font-size: 12px; }
.preflight-list small { color: var(--muted, #64748b); font-size: 11px; }
.preflight-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
</style>
