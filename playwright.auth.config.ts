import base from './playwright.config';
import { defineConfig } from '@playwright/test';

// Isolated UI fixtures only: never contacts the configured household backend.
export default defineConfig(base, {
  testMatch: '**/auth-keyboard.spec.ts',
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:8922' },
  webServer: {
    command: 'EXPO_PUBLIC_SUPABASE_URL=https://ihambre-ui.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=ui-test-fixture npm run web -- --port 8922',
    url: 'http://127.0.0.1:8922',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
