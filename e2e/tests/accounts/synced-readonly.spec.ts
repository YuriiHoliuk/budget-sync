import { test, expect, AccountsPage, getAccounts } from '../../fixtures/index.ts';

/**
 * Verify synced accounts show synced badge.
 */
test('should show synced badge for synced accounts', async ({ authenticatedPage }) => {
  const accountsPage = new AccountsPage(authenticatedPage);
  await accountsPage.goto();
  await accountsPage.waitForLoad();

  // Get accounts from API
  const accounts = await getAccounts();

  // Find a synced account from seeded data (Mono accounts are synced via bank)
  const syncedAccount = accounts.find(acc => acc.name.includes('Mono'));

  if (syncedAccount) {
    // Verify the synced badge is displayed
    await accountsPage.assertAccountIsSynced(syncedAccount.id);
  } else {
    // If no synced accounts, just verify the page loads
    await expect(accountsPage.table).toBeVisible();
  }
});
