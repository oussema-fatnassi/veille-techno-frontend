import { defineConfig, devices } from '@playwright/test'

const realApi = process.env.API_SMOKE_REAL === '1'
const isolatedApi = process.env.API_TEST_BACKEND_URL
if (realApi && !isolatedApi) {
  throw new Error('Use npm run test:api:real to provision an isolated API and database.')
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/api',
  testMatch: 'api.spec.ts',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    // Login bodies and Authorization headers must not be saved in reports.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: realApi ? isolatedApi! : 'http://127.0.0.1:43123/api' },
  },
})
