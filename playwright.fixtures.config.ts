import base from './playwright.config';
import { defineConfig } from '@playwright/test';

// Supabase simulado con page.route: nunca contacta con un backend real.
export default defineConfig(base, {
  testMatch: ['**/auth-keyboard.spec.ts', '**/account.spec.ts', '**/account-management.spec.ts', '**/shopping-interaction.spec.ts'],
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:8922' },
  webServer: {
    command: 'EXPO_PUBLIC_SUPABASE_URL=https://ihambre-ui.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=ui-test-fixture npm run web -- --port 8922',
    url: 'http://127.0.0.1:8922',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
