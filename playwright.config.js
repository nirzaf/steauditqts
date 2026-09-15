// P1.4 — tiny browser-level demo suite (dev-only, not a runtime dependency).
// Run: npm run build && npm run preview -- --port 4173 & npm run test:e2e
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: undefined,
})
