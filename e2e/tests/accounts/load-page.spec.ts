import { test, expect, AccountsPage, getAccounts } from '../../fixtures/index.ts';

/**
 * Verify accounts page loads with seeded data.
 */
test('should load accounts page grouped by role', async ({ authenticatedPage }) => {
  const accountsPage = new AccountsPage(authenticatedPage);
  await accountsPage.goto();
  await accountsPage.waitForLoad();

  // Table should be visible
  await expect(accountsPage.table).toBeVisible();

  // Verify accounts are loaded from API
  const accounts = await getAccounts();
  expect(accounts.length).toBeGreaterThan(0);

  // Check that both groups exist
  await expect(accountsPage.operationalGroup).toBeVisible();
  await expect(accountsPage.savingsGroup).toBeVisible();
});
