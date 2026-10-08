import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/auth-keyboard.spec.ts', '**/account.spec.ts', '**/shopping-interaction.spec.ts'],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8911',
    browserName: 'chromium',
    launchOptions: { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] },
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run web -- --port 8911',
    url: 'http://127.0.0.1:8911',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
