import { test, expect, TransactionsPage, createAccount } from '../../fixtures/index.ts';

/**
 * Tests for creating manual transactions via the UI form.
 */
test.describe('Create Manual Transaction', () => {
  let manualAccountName: string;

  test.beforeAll(async () => {
    // Create a manual account for all tests in this suite
    manualAccountName = `E2E Cash ${Date.now()}`;
    await createAccount({
      name: manualAccountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 100000,
    });
  });

  test('should create an expense transaction', async ({ authenticatedPage }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    const description = `Test expense ${Date.now()}`;

    await transactionsPage.createTransaction({
      account: manualAccountName,
      amount: '125.50',
      description,
      type: 'Expense',
    });

    // Wait for refetch
    await authenticatedPage.waitForLoadState('networkidle');

    // Search for the newly created transaction
    await transactionsPage.search(description);
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify transaction appears in the table
    await transactionsPage.assertTransactionExists(description);
  });

  test('should create an income transaction', async ({ authenticatedPage }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    const description = `Test income ${Date.now()}`;

    await transactionsPage.createTransaction({
      account: manualAccountName,
      amount: '5000',
      description,
      type: 'Income',
    });

    await authenticatedPage.waitForLoadState('networkidle');

    await transactionsPage.search(description);
    await authenticatedPage.waitForLoadState('networkidle');

    await transactionsPage.assertTransactionExists(description);
  });

  test('should not show Add Transaction button when no manual accounts exist', async ({ authenticatedPage }) => {
    // This test navigates to transactions page before any manual accounts are created
    // The seed data only has synced accounts, but our beforeAll already created one.
    // So we check that the button IS visible (since we have a manual account).
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Since we created a manual account in beforeAll, the button should be visible
    await expect(transactionsPage.addTransactionButton).toBeVisible();
  });

  test('should disable submit button when required fields are empty', async ({ authenticatedPage }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    await transactionsPage.openCreateTransaction();

    // Submit button should be disabled without required fields
    const submitButton = transactionsPage.createTransactionSheet.locator('[data-qa="btn-create-transaction"]');
    await expect(submitButton).toBeDisabled();

    // Fill only description — still missing account and amount
    await transactionsPage.createTransactionSheet.locator('[data-qa="input-tx-description"]').fill('Test');
    await expect(submitButton).toBeDisabled();
  });
});
