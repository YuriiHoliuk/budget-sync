import { test, expect, TransactionsPage } from '../../fixtures/index.ts';

/**
 * Verify that verifying a transaction updates its status.
 */
test('should verify an unverified transaction', async ({ authenticatedPage }) => {
  const transactionsPage = new TransactionsPage(authenticatedPage);
  await transactionsPage.goto();
  await transactionsPage.waitForLoad();

  // Filter by pending status to find an unverified transaction
  await transactionsPage.filterByStatus('Pending');
  await authenticatedPage.waitForLoadState('networkidle');

  // Check if there are any pending transactions
  const isEmpty = await transactionsPage.isEmpty();
  if (isEmpty) {
    // Skip this test if no pending transactions
    test.skip();
    return;
  }

  // Get the first transaction row
  const firstRow = transactionsPage.rows.first();
  await expect(firstRow).toBeVisible();

  // Get transaction ID from data-qa attribute
  const dataQa = await firstRow.getAttribute('data-qa');
  const idMatch = dataQa?.match(/transaction-row-(\d+)/);
  if (!idMatch) throw new Error('Could not extract transaction ID from data-qa');

  const transactionId = parseInt(idMatch[1], 10);

  // Verify the transaction
  await transactionsPage.verifyTransaction(transactionId);
  await authenticatedPage.waitForLoadState('networkidle');

  // The status should change (transaction will be refetched)
  // Either the transaction will have 'Verified' status or will disappear from the filtered list
  const statusBadge = transactionsPage.byQa(`transaction-status-${transactionId}`);
  const isStillVisible = await statusBadge.isVisible().catch(() => false);

  // If still visible in the list, it's because we're filtering by pending
  // so it should have disappeared. If API updated but UI didn't filter yet,
  // the status should show Verified
  if (isStillVisible) {
    await expect(statusBadge).toContainText('Verified');
  }
});
