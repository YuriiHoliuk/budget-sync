import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Cross-account mark-as-returning: a credit on account B is linked to a debit
 * on account A. The credit row disappears (absorbed) and the debit on A is
 * reduced by the credit amount. Account B's transactions view no longer shows
 * the absorbed credit.
 */
test.describe('Mark as Returning — cross-account', () => {
  let accountAName: string;
  let accountBName: string;
  let debitOnA_Id: number;
  let creditOnB_Id: number;

  test.beforeAll(async () => {
    const suffix = Date.now();
    accountAName = `E2E IronBlack ${suffix}`;
    accountBName = `E2E MonoWhite ${suffix}`;

    const accountA = await createAccount({
      name: accountAName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });
    const accountB = await createAccount({
      name: accountBName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });

    const debitTx = await createTransaction({
      accountId: accountA.id,
      amount: 100,
      type: 'DEBIT',
      date: '2026-02-20',
      description: 'E2E pub expense on Iron Black',
    });
    debitOnA_Id = debitTx.id;

    const creditTx = await createTransaction({
      accountId: accountB.id,
      amount: 40,
      type: 'CREDIT',
      date: '2026-02-21',
      description: 'E2E friend refund to Mono White',
    });
    creditOnB_Id = creditTx.id;
  });

  test('credit on account B absorbed into debit on account A', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();

    // Filter by account B so the credit row is on the current page
    await transactionsPage.filterByAccount(accountBName);
    await authenticatedPage.waitForLoadState('networkidle');

    await transactionsPage.selectTransaction(creditOnB_Id);
    await transactionsPage.waitForDetailPanel();
    await transactionsPage.clickMarkAsReturning();

    await expect(transactionsPage.returningSelectionBanner).toBeVisible();

    // Switch filter to account A while staying in selection mode
    await transactionsPage.filterByAccount(accountAName);
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(transactionsPage.returningSelectionBanner).toBeVisible();

    await transactionsPage.getRowById(debitOnA_Id).click();
    await transactionsPage.clickReturningDone();
    await expect(transactionsPage.returningConfirmationDialog).toBeVisible();
    await transactionsPage.confirmReturning();

    await expect(transactionsPage.returningSelectionBanner).not.toBeVisible({
      timeout: 10000,
    });

    // Credit on B is gone (absorbed)
    await expect(transactionsPage.getRowById(creditOnB_Id)).not.toBeVisible({
      timeout: 10000,
    });

    // Debit on A is now 60.00 (100 - 40)
    await expect(
      authenticatedPage.locator(`[data-qa="transaction-amount-${debitOnA_Id}"]`),
    ).toContainText('60', { timeout: 10000 });
  });
});
