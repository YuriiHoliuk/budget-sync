import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Split transaction flow: a single transaction is split into multiple
 * child parts. The original transaction's amount is reduced, and new
 * child transactions are created for each split part.
 */
test.describe('Split Transaction', () => {
  let accountName: string;
  let transactionId: number;

  test.beforeAll(async () => {
    // Create an isolated manual account for this test suite
    accountName = `E2E Split ${Date.now()}`;
    const account = await createAccount({
      name: accountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 500000,
    });

    // Create a debit (expense) transaction of 100.00 UAH
    const transaction = await createTransaction({
      accountId: account.id,
      amount: 100,
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E split source',
    });
    transactionId = transaction.id;
  });

  test('should split a transaction into two parts', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account to see only our test transactions
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // The original transaction should be visible
    await expect(transactionsPage.getRowById(transactionId)).toBeVisible();

    // Step 1: Click the transaction row to open the detail panel
    await transactionsPage.selectTransaction(transactionId);
    await transactionsPage.waitForDetailPanel();

    // Step 2: Click "Split Transaction" button
    await transactionsPage.clickSplitButton();

    // The split form should be visible
    await expect(transactionsPage.splitForm).toBeVisible();

    // Step 3: Fill the first split part (60.00 UAH)
    await transactionsPage.fillSplitPart(0, {
      amount: '60',
      description: 'Split part A',
    });

    // Step 4: Add a second split part
    await transactionsPage.addSplitPart();

    // Step 5: Fill the second split part (30.00 UAH)
    await transactionsPage.fillSplitPart(1, {
      amount: '30',
      description: 'Split part B',
    });

    // Step 6: Submit the split
    await transactionsPage.submitSplit();

    // Wait for the mutation to complete and the form to disappear
    await expect(transactionsPage.splitForm).not.toBeVisible({ timeout: 10000 });
    await authenticatedPage.waitForLoadState('networkidle');

    // Step 7: Close the detail panel and verify the results
    await authenticatedPage.keyboard.press('Escape');
    await transactionsPage.waitForDetailPanelClosed();
    await authenticatedPage.waitForLoadState('networkidle');

    // The original transaction should now show reduced amount (10.00 = 100.00 - 60.00 - 30.00)
    // And the two split children should appear in the table
    await expect(transactionsPage.getRowByDescription('Split part A')).toBeVisible({ timeout: 10000 });
    await expect(transactionsPage.getRowByDescription('Split part B')).toBeVisible({ timeout: 10000 });
    await expect(transactionsPage.getRowById(transactionId)).toBeVisible();
  });

  test('should cancel split without making changes', async ({
    authenticatedPage,
  }) => {
    const cancelAccountName = `E2E SplitCancel ${Date.now()}`;
    const account = await createAccount({
      name: cancelAccountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 500000,
    });

    const transaction = await createTransaction({
      accountId: account.id,
      amount: 50,
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E cancel split source',
    });

    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account
    await transactionsPage.filterByAccount(cancelAccountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // Open the detail panel
    await transactionsPage.selectTransaction(transaction.id);
    await transactionsPage.waitForDetailPanel();

    // Click split, then cancel
    await transactionsPage.clickSplitButton();
    await expect(transactionsPage.splitForm).toBeVisible();

    await transactionsPage.cancelSplit();
    await expect(transactionsPage.splitForm).not.toBeVisible();

    // The split button should be visible again (form was dismissed)
    await expect(transactionsPage.byQa('btn-split-transaction')).toBeVisible();
  });
});
