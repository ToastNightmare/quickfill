import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  headless: true,
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
});
