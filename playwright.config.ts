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
 * - Database: localhost:5433
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
  retries: process.env.CI ? 2 : 0,
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

  // Wait for services to be ready before running tests
  webServer: {
    command: 'docker compose -f docker-compose.e2e.yml up -d',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
