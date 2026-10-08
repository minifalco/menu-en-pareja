import base from './playwright.auth.config';
import { defineConfig } from '@playwright/test';
export default defineConfig(base, { testMatch: '**/shopping-interaction.spec.ts' });
