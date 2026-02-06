import { test, AccountsPage, createAccount } from '../../fixtures/index.ts';

/**
 * Verify archiving a manual account removes it from list.
 */
test('should archive manual account and remove from list', async ({ authenticatedPage }) => {
  // Create a test account via API
  const testAccount = await createAccount({
    name: `Archive Test ${Date.now()}`,
    role: 'OPERATIONAL',
    type: 'DEBIT',
  });

  const accountsPage = new AccountsPage(authenticatedPage);
  await accountsPage.goto();
  await accountsPage.waitForLoad();

  // Verify the account exists
  await accountsPage.assertAccountExists(testAccount.name);

  // Archive the account
  await accountsPage.clickArchiveAccount(testAccount.id);

  // Confirm the archive dialog
  await accountsPage.confirmArchive();

  // Wait for mutation and UI update
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the account is no longer visible
  await accountsPage.assertAccountNotExists(testAccount.name);
});
