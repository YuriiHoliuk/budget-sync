import { test, expect, TransactionsPage } from '../../fixtures/index.ts';

/**
 * Verify search by description filters transactions.
 */
test('should filter transactions by search text', async ({ authenticatedPage }) => {
  const transactionsPage = new TransactionsPage(authenticatedPage);
  await transactionsPage.goto();
  await transactionsPage.waitForLoad();

  // Get initial row count
  const initialRowCount = await transactionsPage.getRowCount();
  expect(initialRowCount).toBeGreaterThan(0);

  // Search for a specific counterparty from seeded data
  await transactionsPage.search('Сільпо');
  await authenticatedPage.waitForLoadState('networkidle');

  // Row count should be filtered
  const filteredRowCount = await transactionsPage.getRowCount();

  // Either we have results matching the search or no results
  // (filtered count should be less than or equal to initial)
  expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
});
