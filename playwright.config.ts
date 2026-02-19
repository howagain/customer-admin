import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3002',
    video: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 14 Pro'] },
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command: 'node src/server.mjs',
    port: 3002,
    reuseExistingServer: !process.env.CI,
  },
})
