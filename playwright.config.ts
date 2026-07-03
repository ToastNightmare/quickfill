import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseURL);

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Only manage a local server when testing localhost.
  // Production/preview runs (PLAYWRIGHT_BASE_URL set to a remote URL) never boot a server.
  webServer: isLocal
    ? {
        command: 'pnpm start',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
});
