// P0.1 — exact-record navigation. Destination pages consume ?record= from the
// hash location (written by NextBestActionCard / notifications / palette via
// App.navigate) and select + highlight the exact row.
// Usage:
//   const { selectedId, isTarget, select } = useRecordSelection({
//     getIds: () => requests.value.map(r => r.id),
//     initial: 'PBC-019',
//     onSelect: (id) => { selectedId.value = id },
//   })
import { onMounted, onUnmounted, ref } from 'vue'
import { decodeLocation, encodeLocation } from '../navigation/location.js'

export function getRecordIdFromHash() {
  try {
    if (typeof window === 'undefined') return null
    return decodeLocation(window.location.hash)?.recordId || null
  } catch { return null }
}

export function useRecordSelection({ getIds = () => [], initial = null, scrollSelector = '[data-record-id]' } = {}) {
  const selectedId = ref(initial)
  const targetedId = ref(null)

  function ids() {
    try { return getIds() || [] } catch { return [] }
  }

  function applyFromHash({ scroll = true } = {}) {
    const recordId = getRecordIdFromHash()
    if (!recordId) return false
    if (!ids().includes(recordId)) return false
    selectedId.value = recordId
    targetedId.value = recordId
    if (scroll && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-record-id="${CSS.escape(recordId)}"]`)
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          const focusable = el.matches('button,[href],input,select,textarea,[tabindex]') ? el : el.querySelector('button,[href],[tabindex]')
          // Do not steal focus from the shell search/palette; highlight + scroll is enough.
          el.classList.add('record-target-flash')
          setTimeout(() => el.classList.remove('record-target-flash'), 2400)
        }
      })
    }
    return true
  }

  function isTarget(id) {
    return targetedId.value != null && String(id) === String(targetedId.value)
  }

  function select(id) {
    selectedId.value = id
    targetedId.value = id
    // Keep the hash in sync so reload / copy-link retains the exact record.
    try {
      if (typeof window !== 'undefined') {
        const loc = decodeLocation(window.location.hash)
        const hash = encodeLocation({ routeKey: loc.routeKey || 'role-workspace', engagementId: loc.engagementId || undefined, recordId: String(id), tab: loc.tab || undefined })
        if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
      }
    } catch { /* hash sync is best-effort */ }
  }

  function onHashChange() { applyFromHash({ scroll: true }) }

  onMounted(() => {
    // If no deep link, keep the initial selection but do not mark a target.
    applyFromHash({ scroll: true })
    if (typeof window !== 'undefined') window.addEventListener('hashchange', onHashChange)
  })
  onUnmounted(() => {
    if (typeof window !== 'undefined') window.removeEventListener('hashchange', onHashChange)
  })

  return { selectedId, targetedId, isTarget, select, applyFromHash, getRecordIdFromHash }
}
