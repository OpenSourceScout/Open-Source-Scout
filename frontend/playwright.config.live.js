import { defineConfig, devices } from '@playwright/test'

/**
 * Live E2E: requires backend on :8001 (GITHUB_TOKEN) and Vite dev on :5173
 * (npm run dev — proxies /api → 8001). Run: E2E_LIVE_BACKEND=1 npm run test:e2e:live
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/editor-github-live.spec.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
})
