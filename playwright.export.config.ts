import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig(base, {
  use: { ...base.use, baseURL: 'http://127.0.0.1:8913' },
  webServer: {
    command: 'python -m http.server 8913 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:8913',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
