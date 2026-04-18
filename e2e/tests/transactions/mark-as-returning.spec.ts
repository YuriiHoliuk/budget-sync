import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Mark-as-returning flow: a credit (income) transaction is linked to a debit
 * (expense) transaction as a partial return. The credit transaction disappears
 * and the debit amount is reduced by the return amount.
 */
test.describe('Mark as Returning', () => {
  let accountName: string;
  let debitTxId: number;
  let creditTxId: number;

  test.beforeAll(async () => {
    // Create an isolated manual account for this test suite
    accountName = `E2E Returning ${Date.now()}`;
    const account = await createAccount({
      name: accountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });

    // Create a debit (expense) transaction of 100.00 UAH
    const debitTx = await createTransaction({
      accountId: account.id,
      amount: 100, // 100.00 UAH in major units (GraphQL API)
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E original expense',
    });
    debitTxId = debitTx.id;

    // Create a credit (income) transaction of 30.00 UAH on the same account
    const creditTx = await createTransaction({
      accountId: account.id,
      amount: 30, // 30.00 UAH in major units (GraphQL API)
      type: 'CREDIT',
      date: '2026-02-21',
      description: 'E2E partial return',
    });
    creditTxId = creditTx.id;
  });

  test('should mark a credit transaction as returning for a debit transaction', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account to see only our test transactions
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // Both transactions should be visible
    await expect(transactionsPage.getRowById(creditTxId)).toBeVisible();
    await expect(transactionsPage.getRowById(debitTxId)).toBeVisible();

    // Step 1: Click the credit transaction row to open the detail panel
    await transactionsPage.selectTransaction(creditTxId);
    await transactionsPage.waitForDetailPanel();

    // Step 2: Click "Mark as Returning" in the detail panel
    await transactionsPage.clickMarkAsReturning();

    // The detail panel should close and the returning selection banner should appear
    await expect(transactionsPage.returningSelectionBanner).toBeVisible();

    // Step 3: Click the debit transaction row (toggles selection)
    await transactionsPage.getRowById(debitTxId).click();

    // Step 4: Click Done in the banner to open the confirmation dialog
    await transactionsPage.clickReturningDone();
    await expect(transactionsPage.returningConfirmationDialog).toBeVisible();

    // Step 5: Confirm the returning
    await transactionsPage.confirmReturning();

    // Step 6: Verify the banner is gone (wait for mutation to complete)
    await expect(transactionsPage.returningSelectionBanner).not.toBeVisible({ timeout: 10000 });

    // Step 7: Verify the credit transaction is gone from the table
    await expect(transactionsPage.getRowById(creditTxId)).not.toBeVisible({ timeout: 10000 });

    // Step 8: Verify the debit transaction amount is now 70.00 (100.00 - 30.00)
    await expect(authenticatedPage.locator(`[data-qa="transaction-amount-${debitTxId}"]`)).toContainText('70', { timeout: 10000 });
  });
});
