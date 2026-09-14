import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    watch: {
      // Windows EBUSY guard: atomic-write temp files under worker/ must not
      // crash the Vite watcher during shared-demo backend edits.
      ignored: ['**/node_modules/**', '**/dist/**', '**/.wrangler/**', '**/*.tmp', '**/*.tmpdir/**', '**/.tmp*/**'],
    },
  },
})
