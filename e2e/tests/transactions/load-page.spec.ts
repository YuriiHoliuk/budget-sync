import { test, expect, TransactionsPage } from '../../fixtures/index.ts';

/**
 * Verify transactions page loads with default filters.
 */
test('should load transactions page with default filters', async ({ authenticatedPage }) => {
  const transactionsPage = new TransactionsPage(authenticatedPage);
  await transactionsPage.goto();
  await transactionsPage.waitForLoad();

  // Table should be visible
  await expect(transactionsPage.table).toBeVisible();

  // Should have seeded transactions
  const rowCount = await transactionsPage.getRowCount();
  expect(rowCount).toBeGreaterThan(0);
});
