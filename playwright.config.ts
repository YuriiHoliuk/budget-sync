import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * This configuration is designed for testing the Budget Sync web app
 * against the E2E test environment (docker-compose.e2e.yml).
 *
 * The test environment runs on:
 * - Frontend: http://localhost:3001
 * - API: http://localhost:4002
 * - Database: localhost:5434
 *
 * Usage:
 *   just test-e2e              # Run all E2E tests
 *   just test-e2e-ui           # Run with Playwright UI
 *   bunx playwright test       # Run directly
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'e2e/playwright-report' }],
    ['list'],
  ],
  outputDir: 'e2e/test-results',

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start E2E Docker Compose stack. The command must stay alive (no -d flag)
  // so Playwright can manage the process lifecycle. In CI, services are
  // started separately by the workflow, so webServer is disabled.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'docker compose -f docker-compose.e2e.yml up',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 120 * 1000,
        stdout: 'ignore',
      },
});
