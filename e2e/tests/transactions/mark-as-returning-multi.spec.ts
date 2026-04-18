import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Multi-select returning: user marks a salary credit as having covered multiple
 * work expenses, or a single expense as compensated by multiple friend refunds.
 * Here: salary 1000 absorbs three expenses totaling 400 → salary reduced to 600,
 * all three expenses deleted.
 */
test.describe('Mark as Returning — multi-select', () => {
  let accountName: string;
  let salaryTxId: number;
  let expenseTxIds: number[];

  test.beforeAll(async () => {
    accountName = `E2E Multi ${Date.now()}`;
    const account = await createAccount({
      name: accountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });

    const salary = await createTransaction({
      accountId: account.id,
      amount: 1000,
      type: 'CREDIT',
      date: '2026-02-25',
      description: 'E2E salary with compensation',
    });
    salaryTxId = salary.id;

    expenseTxIds = [];
    for (const [i, amount] of [150, 100, 150].entries()) {
      const expense = await createTransaction({
        accountId: account.id,
        amount,
        type: 'DEBIT',
        date: `2026-02-${String(20 + i).padStart(2, '0')}`,
        description: `E2E work expense ${i + 1}`,
      });
      expenseTxIds.push(expense.id);
    }
  });

  test('salary absorbs three expenses', async ({ authenticatedPage }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    await transactionsPage.selectTransaction(salaryTxId);
    await transactionsPage.waitForDetailPanel();
    await transactionsPage.clickMarkAsReturning();

    await expect(transactionsPage.returningSelectionBanner).toBeVisible();

    for (const expenseId of expenseTxIds) {
      await transactionsPage.getRowById(expenseId).click();
    }

    await transactionsPage.clickReturningDone();
    await expect(transactionsPage.returningConfirmationDialog).toBeVisible();
    await transactionsPage.confirmReturning();

    await expect(transactionsPage.returningSelectionBanner).not.toBeVisible({
      timeout: 10000,
    });

    for (const expenseId of expenseTxIds) {
      await expect(transactionsPage.getRowById(expenseId)).not.toBeVisible({
        timeout: 10000,
      });
    }

    // Salary reduced to 600 (1000 - 400)
    await expect(
      authenticatedPage.locator(`[data-qa="transaction-amount-${salaryTxId}"]`),
    ).toContainText('600', { timeout: 10000 });
  });
});
