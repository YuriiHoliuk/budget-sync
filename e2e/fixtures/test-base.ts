import { test as base, type Page } from '@playwright/test';

/**
 * Test credentials for E2E tests
 * Must match NEXT_PUBLIC_ALLOWED_EMAIL and NEXT_PUBLIC_ALLOWED_PASSWORD
 * in docker-compose.e2e.yml
 */
const TEST_USER = {
  email: 'test@example.com',
  password: 'testpassword123',
};

/**
 * E2E Test API endpoints
 */
const API_BASE_URL = 'http://localhost:4002';
const GRAPHQL_ENDPOINT = `${API_BASE_URL}/graphql`;

/**
 * Authenticated page fixture
 * Handles login before each test
 */
async function authenticatePage(page: Page): Promise<void> {
  // Navigate to the app
  await page.goto('/');

  // Check if we're on the login page (auth gate)
  const emailInput = page.locator('input[type="email"]');
  const isLoginPage = await emailInput.isVisible().catch(() => false);

  if (isLoginPage) {
    // Fill in login credentials
    await emailInput.fill(TEST_USER.email);
    await page.locator('input[type="password"]').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to complete
    await page.waitForURL(/^(?!.*login).*$/);
  }
}

/**
 * GraphQL helper to execute queries directly against the API
 * Useful for seeding data or verifying state
 */
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function executeGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<GraphQLResponse<T>>;
}

/**
 * Extended test fixtures for E2E testing
 */
export interface TestFixtures {
  authenticatedPage: Page;
  graphql: <T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ) => Promise<GraphQLResponse<T>>;
}

/**
 * Base test with authentication and API helpers
 */
export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await authenticatePage(page);
    await use(page);
  },

  graphql: async ({}, use) => {
    await use(executeGraphQL);
  },
});

export { expect } from '@playwright/test';
