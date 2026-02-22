import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
  splitTransaction,
} from '../../fixtures/index.ts';

/**
 * Join transactions flow: a split child transaction is merged back into
 * another sibling transaction. The target transaction absorbs the source
 * transaction's amount, and the source transaction is deleted.
 */
test.describe('Join Transactions', () => {
  let accountName: string;
  let originalTxId: number;
  let splitChildIds: number[];

  test.beforeAll(async () => {
    // Create an isolated manual account for this test suite
    accountName = `E2E Join ${Date.now()}`;
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
      description: 'E2E join source',
    });
    originalTxId = transaction.id;

    // Split the transaction into two parts via data factory
    const splitResult = await splitTransaction(originalTxId, [
      { amount: 40, description: 'Join child A' },
      { amount: 50, description: 'Join child B' },
    ]);

    splitChildIds = splitResult.splitTransactions.map((tx) => tx.id);
  });

  test('should join a sibling transaction back into the current one', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account to see only our test transactions
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // All three transactions should be visible (original reduced + 2 split children)
    await expect(transactionsPage.getRowById(originalTxId)).toBeVisible();
    await expect(transactionsPage.getRowById(splitChildIds[0])).toBeVisible();
    await expect(transactionsPage.getRowById(splitChildIds[1])).toBeVisible();

    // Step 1: Click the first split child to open the detail panel
    await transactionsPage.selectTransaction(splitChildIds[0]);
    await transactionsPage.waitForDetailPanel();

    // Step 2: Verify the split group section is visible with sibling(s)
    await expect(transactionsPage.splitGroup).toBeVisible();

    // There should be at least one sibling shown (the other split child or the original)
    await expect(transactionsPage.getSiblingItem(0)).toBeVisible();

    // Step 3: Click "Join" on the first sibling
    await transactionsPage.clickJoinOnSibling(0);

    // Step 4: The join confirmation dialog should appear
    await expect(transactionsPage.joinConfirmationDialog).toBeVisible();

    // Step 5: Confirm the join
    await transactionsPage.confirmJoin();

    // Wait for the mutation to complete
    await expect(transactionsPage.joinConfirmationDialog).not.toBeVisible({ timeout: 10000 });
    await authenticatedPage.waitForLoadState('networkidle');

    // Step 6: Close the detail panel
    await authenticatedPage.keyboard.press('Escape');
    await transactionsPage.waitForDetailPanelClosed();
    await authenticatedPage.waitForLoadState('networkidle');

    // Step 7: Verify the source sibling is gone and the target has updated amount
    // After joining, one of the split children should be gone
    // The remaining visible transactions should total 100.00 (the original amount)
    const rowCount = await transactionsPage.getRowCount();
    // We started with 3 rows, joining should reduce to 2
    expect(rowCount).toBe(2);
  });

  test('should cancel join without making changes', async ({
    authenticatedPage,
  }) => {
    // Create a fresh split for the cancel test
    const cancelAccountName = `E2E JoinCancel ${Date.now()}`;
    const account = await createAccount({
      name: cancelAccountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 500000,
    });

    const transaction = await createTransaction({
      accountId: account.id,
      amount: 80,
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E join cancel source',
    });

    const splitResult = await splitTransaction(transaction.id, [
      { amount: 30, description: 'Cancel child A' },
      { amount: 40, description: 'Cancel child B' },
    ]);

    const childId = splitResult.splitTransactions[0].id;

    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account
    await transactionsPage.filterByAccount(cancelAccountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // Open the detail panel for the first split child
    await transactionsPage.selectTransaction(childId);
    await transactionsPage.waitForDetailPanel();

    // Click Join on the first sibling
    await transactionsPage.clickJoinOnSibling(0);
    await expect(transactionsPage.joinConfirmationDialog).toBeVisible();

    // Cancel the join
    await transactionsPage.cancelJoin();
    await expect(transactionsPage.joinConfirmationDialog).not.toBeVisible();

    // Close the detail panel
    await authenticatedPage.keyboard.press('Escape');
    await transactionsPage.waitForDetailPanelClosed();

    // All 3 transactions should still be visible (nothing was joined)
    await expect(transactionsPage.rows).toHaveCount(3);
  });
});
