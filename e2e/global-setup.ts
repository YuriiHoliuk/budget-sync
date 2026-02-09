import { execSync } from 'node:child_process';

const E2E_DATABASE_URL =
  'postgresql://budget_sync_test:budget_sync_test@localhost:5434/budget_sync_test';

/**
 * Playwright global setup
 *
 * Clears and re-seeds the E2E database before each test run,
 * so tests always start with a predictable state.
 */
export default function globalSetup() {
  if (process.env.CI) {
    console.log('\nSkipping database reset on CI (handled by docker-compose)');
    return;
  }

  console.log('\nResetting E2E database...');
  execSync('bun scripts/seed-local-db.ts', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}
