import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the real app against the local room server.
 * `npm run dev` must be running (or set PW_BASE_URL). Install browsers once with
 * `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'reduced-motion', use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } } },
  ],
});
