import { test, AccountsPage } from '../../fixtures/index.ts';

/**
 * Verify creating a manual account via dialog.
 */
test('should create a new manual account', async ({ authenticatedPage }) => {
  const accountsPage = new AccountsPage(authenticatedPage);
  await accountsPage.goto();
  await accountsPage.waitForLoad();

  // Create a unique account name
  const uniqueAccountName = `Test Account ${Date.now()}`;

  // Create the account (without optional bank name - not supported by dialog)
  await accountsPage.createAccount(uniqueAccountName, 'Debit', 'Operational');

  // Wait for the mutation and refetch
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the new account appears in the table
  await accountsPage.assertAccountExists(uniqueAccountName);
});
