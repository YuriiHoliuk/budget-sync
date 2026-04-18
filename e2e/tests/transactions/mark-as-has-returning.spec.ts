import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Reverse entry: start from a debit (expense) and pick a compensating credit.
 * When the credit is larger than the debit, the debit disappears and the
 * credit amount is reduced by the debit amount (credit_reduced outcome).
 */
test.describe('Mark as Has Returning — from debit', () => {
  let accountName: string;
  let debitTxId: number;
  let creditTxId: number;

  test.beforeAll(async () => {
    accountName = `E2E HasReturning ${Date.now()}`;
    const account = await createAccount({
      name: accountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });

    const debitTx = await createTransaction({
      accountId: account.id,
      amount: 30,
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E work lunch',
    });
    debitTxId = debitTx.id;

    const creditTx = await createTransaction({
      accountId: account.id,
      amount: 100,
      type: 'CREDIT',
      date: '2026-02-25',
      description: 'E2E salary with compensation',
    });
    creditTxId = creditTx.id;
  });

  test('debit removed and credit reduced when credit > debit', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    await transactionsPage.selectTransaction(debitTxId);
    await transactionsPage.waitForDetailPanel();
    await transactionsPage.clickMarkAsHasReturning();

    await expect(transactionsPage.returningSelectionBanner).toBeVisible();

    await transactionsPage.getRowById(creditTxId).click();
    await transactionsPage.clickReturningDone();
    await expect(transactionsPage.returningConfirmationDialog).toBeVisible();
    await transactionsPage.confirmReturning();

    await expect(transactionsPage.returningSelectionBanner).not.toBeVisible({
      timeout: 10000,
    });

    // Debit is gone
    await expect(transactionsPage.getRowById(debitTxId)).not.toBeVisible({
      timeout: 10000,
    });

    // Credit reduced to 70 (100 - 30)
    await expect(
      authenticatedPage.locator(`[data-qa="transaction-amount-${creditTxId}"]`),
    ).toContainText('70', { timeout: 10000 });
  });
});
