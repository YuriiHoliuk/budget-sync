import { test, expect } from '../../fixtures/index.ts';

/**
 * Verify that sidebar navigation works correctly.
 * Tests navigation between all main pages: Budget, Transactions, Accounts, Categories.
 */
test('should have working navigation', async ({ authenticatedPage }) => {
  // Navigate to transactions page
  await authenticatedPage.getByRole('link', { name: /transactions/i }).click();
  await expect(authenticatedPage).toHaveURL('/transactions');

  // Navigate to accounts page
  await authenticatedPage.getByRole('link', { name: /accounts/i }).click();
  await expect(authenticatedPage).toHaveURL('/accounts');

  // Navigate to categories page
  await authenticatedPage.getByRole('link', { name: /categories/i }).click();
  await expect(authenticatedPage).toHaveURL('/categories');

  // Navigate back to budget page (use exact match)
  await authenticatedPage.getByRole('link', { name: 'Budget', exact: true }).click();
  await expect(authenticatedPage).toHaveURL('/');
});
