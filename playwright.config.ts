import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end tests against the static export in `out/` (run `npm run build` first).
 * Demo mode only: every request that does not go to BASE_URL is aborted by the
 * fixture in e2e/fixtures.ts and fails the test.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: process.env.PW_SLOW ? 120_000 : 60_000,
  // Playwright WebKit on Windows is several times slower than Chromium; give it room.
  expect: { timeout: process.env.PW_SLOW ? 25_000 : 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `${BASE_URL}/login/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { PORT: String(PORT) },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
