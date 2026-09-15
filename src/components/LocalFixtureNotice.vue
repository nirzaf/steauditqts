<script setup>
import Icon from './Icon.vue'

defineProps({
  title: { type: String, default: 'Local fixture reference' },
  description: { type: String, default: 'This reference view is browser-local and does not change the shared workflow record.' },
})
</script>

<template>
  <aside class="local-fixture-notice" role="note">
    <span class="local-fixture-icon" aria-hidden="true"><Icon name="lock" :size="15" /></span>
    <span class="local-fixture-copy"><strong>{{ title }}</strong><small>{{ description }}</small></span>
    <span class="local-fixture-label">LOCAL · READ ONLY</span>
  </aside>
</template>

<style scoped>
.local-fixture-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid #dbe5f0;
  border-radius: 10px;
  color: #526274;
  background: #f8fafc;
  font-size: .76rem;
}
.local-fixture-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  color: #64748b;
  border-radius: 7px;
  background: #eaf0f6;
}
.local-fixture-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.local-fixture-copy strong { color: #26384d; font-size: .77rem; }
.local-fixture-copy small { color: #68798b; line-height: 1.35; }
.local-fixture-label {
  flex: 0 0 auto;
  color: #66788b;
  font-size: .64rem;
  font-weight: 800;
  letter-spacing: .08em;
  white-space: nowrap;
}
@media (max-width: 680px) {
  .local-fixture-notice { align-items: flex-start; flex-wrap: wrap; }
  .local-fixture-label { margin-left: 36px; }
}
</style>
