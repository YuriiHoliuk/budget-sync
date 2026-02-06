import { test, expect, TransactionsPage } from '../../fixtures/index.ts';

/**
 * Verify pagination works correctly.
 */
test('should paginate through transactions', async ({ authenticatedPage }) => {
  const transactionsPage = new TransactionsPage(authenticatedPage);
  await transactionsPage.goto();
  await transactionsPage.waitForLoad();

  // Check if we have enough transactions for pagination
  const hasNextPage = await transactionsPage.hasNextPage();

  if (hasNextPage) {
    // Get current page info
    const initialPage = await transactionsPage.getCurrentPage();

    // Go to next page
    await transactionsPage.nextPage();
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify page changed
    const nextPage = await transactionsPage.getCurrentPage();
    expect(nextPage).not.toBe(initialPage);

    // Verify we can go back
    const hasPrevPage = await transactionsPage.hasPrevPage();
    expect(hasPrevPage).toBe(true);

    // Go back
    await transactionsPage.prevPage();
    await authenticatedPage.waitForLoadState('networkidle');

    // Should be back to initial page
    const restoredPage = await transactionsPage.getCurrentPage();
    expect(restoredPage).toBe(initialPage);
  } else {
    // If no pagination, just verify the table has data
    const rowCount = await transactionsPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  }
});
