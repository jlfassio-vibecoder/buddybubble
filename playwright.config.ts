import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for agent routing (see `e2e/agent-routing.spec.ts`).
 *
 * Prereqs: app running (`pnpm dev`), Supabase env wired in `.env.local`, and the
 * `E2E_*` variables documented at the top of the spec file.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
