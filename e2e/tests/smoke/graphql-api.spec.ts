import { test, expect } from '../../fixtures/index.ts';

/**
 * Verify that the GraphQL API is accessible from E2E tests.
 * Tests the graphql fixture for direct API queries.
 */
test('should be able to query API via GraphQL fixture', async ({ graphql }) => {
  interface AccountsResponse {
    accounts: Array<{ id: number; name: string }>;
  }

  const result = await graphql<AccountsResponse>(`
    query {
      accounts {
        id
        name
      }
    }
  `);

  // Should have data (seeded from db-seed-e2e service)
  expect(result.errors).toBeUndefined();
  expect(result.data?.accounts).toBeDefined();
  expect(Array.isArray(result.data?.accounts)).toBe(true);
});
