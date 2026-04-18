import {
  test,
  expect,
  TransactionsPage,
  createAccount,
  createBudget,
  createCategory,
  createTransaction,
} from '../../fixtures/index.ts';

/**
 * Batch transaction editing: select multiple rows via checkbox / shift-click
 * and apply a category, budget, or verify in one shot.
 *
 * Covers:
 *  a. Batch change category
 *  b. Batch change budget
 *  c. Batch verify
 *  d. Cross-page selection
 *  e. Shift-click toggles selection without opening detail
 *  f. Clear button dismisses the bar
 */
test.describe('Batch transaction editing', () => {
  // Suite-wide seed: each test operates on its own set of ids so suites don't
  // interfere with each other. We create one account with enough expenses to
  // span two pages (PAGE_SIZE = 50 → we need > 50 rows to test cross-page).

  const CATEGORY_NAME_BASE = 'E2E Batch Groceries';
  const BUDGET_NAME_BASE = 'E2E Batch Monthly';

  let accountName: string;
  let categoryName: string;
  let budgetName: string;

  // Five txs per test scenario — isolate each scenario's tx ids.
  let categoryTestIds: number[];
  let budgetTestIds: number[];
  let verifyTestIds: number[];
  let clearTestIds: number[];
  let shiftClickTestIds: number[];

  // Cross-page test needs its own account so filtering yields a predictable
  // set with more than 50 rows.
  let crossPageAccountName: string;
  let crossPageIds: number[];

  test.beforeAll(async () => {
    const suffix = Date.now();
    accountName = `E2E Batch ${suffix}`;
    categoryName = `${CATEGORY_NAME_BASE} ${suffix}`;
    budgetName = `${BUDGET_NAME_BASE} ${suffix}`;
    crossPageAccountName = `E2E Batch Cross ${suffix}`;

    const account = await createAccount({
      name: accountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });
    const crossPageAccount = await createAccount({
      name: crossPageAccountName,
      role: 'OPERATIONAL',
      type: 'DEBIT',
      currency: 'UAH',
      balance: 0,
    });

    await createCategory({ name: categoryName });
    await createBudget({
      name: budgetName,
      currency: 'UAH',
      // A wide active window that covers all dates used below.
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      targetAmount: 10_000,
      cadenceUnit: 'MONTH',
      cadenceCount: 1,
    });

    // Helper: seed a batch of debit transactions on the given account.
    async function seed(
      options: {
        count: number;
        descriptionPrefix: string;
        account: number;
        startDay?: number;
      },
    ): Promise<number[]> {
      const ids: number[] = [];
      for (let index = 0; index < options.count; index++) {
        const day = (options.startDay ?? 1) + index;
        // Dates stay within 2026-03 / 2026-04 to stay inside the budget range.
        const month = day > 28 ? 4 : 3;
        const dayOfMonth = day > 28 ? day - 28 : day;
        const dateString = `2026-${String(month).padStart(2, '0')}-${String(
          dayOfMonth,
        ).padStart(2, '0')}`;
        const tx = await createTransaction({
          accountId: options.account,
          amount: 10 + index,
          type: 'DEBIT',
          date: dateString,
          description: `${options.descriptionPrefix} ${index + 1}`,
        });
        ids.push(tx.id);
      }
      return ids;
    }

    categoryTestIds = await seed({
      count: 3,
      descriptionPrefix: `E2E batch-cat ${suffix}`,
      account: account.id,
      startDay: 1,
    });
    budgetTestIds = await seed({
      count: 3,
      descriptionPrefix: `E2E batch-bud ${suffix}`,
      account: account.id,
      startDay: 4,
    });
    verifyTestIds = await seed({
      count: 3,
      descriptionPrefix: `E2E batch-ver ${suffix}`,
      account: account.id,
      startDay: 7,
    });
    clearTestIds = await seed({
      count: 2,
      descriptionPrefix: `E2E batch-clear ${suffix}`,
      account: account.id,
      startDay: 10,
    });
    shiftClickTestIds = await seed({
      count: 2,
      descriptionPrefix: `E2E batch-shift ${suffix}`,
      account: account.id,
      startDay: 12,
    });

    // Cross-page needs > PAGE_SIZE=50 rows. Seed 55.
    crossPageIds = await seed({
      count: 55,
      descriptionPrefix: `E2E batch-cross ${suffix}`,
      account: crossPageAccount.id,
      startDay: 1,
    });
  });

  test('select multiple rows and change category via batch bar', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // Wait until the rows we care about are in the DOM.
    for (const txId of categoryTestIds) {
      await expect(transactionsPage.getRowById(txId)).toBeVisible();
    }

    // Select the three category-test rows via their checkboxes.
    for (const txId of categoryTestIds) {
      await transactionsPage.toggleRowCheckbox(txId);
    }

    await expect(transactionsPage.batchEditBar).toBeVisible();
    expect(await transactionsPage.readBatchSelectedCount()).toBe(
      categoryTestIds.length,
    );

    // Apply the category.
    await transactionsPage.batchApplyCategory(categoryName);

    // Bar clears on success.
    await expect(transactionsPage.batchEditBar).not.toBeVisible({
      timeout: 10_000,
    });

    // Each row now displays the chosen category.
    for (const txId of categoryTestIds) {
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-category-${txId}"]`),
      ).toContainText(categoryName, { timeout: 10_000 });
    }
  });

  test('select multiple rows and change budget via batch bar', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    for (const txId of budgetTestIds) {
      await expect(transactionsPage.getRowById(txId)).toBeVisible();
    }

    for (const txId of budgetTestIds) {
      await transactionsPage.toggleRowCheckbox(txId);
    }

    await expect(transactionsPage.batchEditBar).toBeVisible();
    expect(await transactionsPage.readBatchSelectedCount()).toBe(
      budgetTestIds.length,
    );

    await transactionsPage.batchApplyBudget(budgetName);

    await expect(transactionsPage.batchEditBar).not.toBeVisible({
      timeout: 10_000,
    });

    for (const txId of budgetTestIds) {
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-budget-${txId}"]`),
      ).toContainText(budgetName, { timeout: 10_000 });
    }
  });

  test('select multiple rows and verify via batch bar', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    for (const txId of verifyTestIds) {
      await expect(transactionsPage.getRowById(txId)).toBeVisible();
      // Sanity check: they start as Pending (no category yet).
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-status-${txId}"]`),
      ).toContainText('Pending');
    }

    for (const txId of verifyTestIds) {
      await transactionsPage.toggleRowCheckbox(txId);
    }

    await expect(transactionsPage.batchEditBar).toBeVisible();
    await transactionsPage.batchVerify();

    await expect(transactionsPage.batchEditBar).not.toBeVisible({
      timeout: 10_000,
    });

    for (const txId of verifyTestIds) {
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-status-${txId}"]`),
      ).toContainText('Verified', { timeout: 10_000 });
    }
  });

  test('selection persists across pagination and applies to rows on both pages', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(crossPageAccountName);
    await authenticatedPage.waitForLoadState('networkidle');

    // Newest rows (page 1) and oldest rows (page 2) — we don't know the order
    // without querying, but we'll pick two ids from each page after landing on
    // them.
    // We expect 55 rows, so there should be a next page.
    await expect(await transactionsPage.hasNextPage()).toBe(true);

    // Pick two rows from page 1.
    const page1Rows = transactionsPage.rows;
    const firstPageFirstRowQa = await page1Rows
      .first()
      .getAttribute('data-qa');
    const firstPageSecondRowQa = await page1Rows
      .nth(1)
      .getAttribute('data-qa');
    const extractId = (qa: string | null): number => {
      const match = qa?.match(/transaction-row-(\d+)/);
      if (!match) throw new Error(`Bad row data-qa: ${qa}`);
      return parseInt(match[1], 10);
    };
    const page1Ids = [
      extractId(firstPageFirstRowQa),
      extractId(firstPageSecondRowQa),
    ];

    for (const txId of page1Ids) {
      await transactionsPage.toggleRowCheckbox(txId);
    }

    expect(await transactionsPage.readBatchSelectedCount()).toBe(2);

    // Go to page 2.
    await transactionsPage.nextPage();
    await authenticatedPage.waitForLoadState('networkidle');

    // Bar still shows two selected (persists across page change).
    await expect(transactionsPage.batchEditBar).toBeVisible();
    expect(await transactionsPage.readBatchSelectedCount()).toBe(2);

    // Select two more rows on page 2.
    const page2Rows = transactionsPage.rows;
    const page2FirstRowQa = await page2Rows.first().getAttribute('data-qa');
    const page2SecondRowQa = await page2Rows.nth(1).getAttribute('data-qa');
    const page2Ids = [
      extractId(page2FirstRowQa),
      extractId(page2SecondRowQa),
    ];

    for (const txId of page2Ids) {
      await transactionsPage.toggleRowCheckbox(txId);
    }

    expect(await transactionsPage.readBatchSelectedCount()).toBe(4);

    // Apply the category.
    await transactionsPage.batchApplyCategory(categoryName);

    await expect(transactionsPage.batchEditBar).not.toBeVisible({
      timeout: 10_000,
    });

    // Rows on page 2 (current view) now display the chosen category.
    for (const txId of page2Ids) {
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-category-${txId}"]`),
      ).toContainText(categoryName, { timeout: 10_000 });
    }

    // Go back to page 1 and assert those rows were updated too.
    await transactionsPage.prevPage();
    await authenticatedPage.waitForLoadState('networkidle');

    for (const txId of page1Ids) {
      await expect(
        authenticatedPage.locator(`[data-qa="transaction-category-${txId}"]`),
      ).toContainText(categoryName, { timeout: 10_000 });
    }
  });

  test('shift-click toggles selection without opening the detail panel', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    const targetId = shiftClickTestIds[0];
    await expect(transactionsPage.getRowById(targetId)).toBeVisible();

    // Shift-click should NOT open the detail panel.
    await transactionsPage.shiftClickRow(targetId);

    // Detail panel (role=dialog) should not become visible.
    const dialog = authenticatedPage.locator('[role="dialog"]').first();
    await expect(dialog).not.toBeVisible();

    // Batch bar appears with count = 1.
    await expect(transactionsPage.batchEditBar).toBeVisible();
    expect(await transactionsPage.readBatchSelectedCount()).toBe(1);

    // The row carries the batch-selected data attribute.
    await expect(transactionsPage.getRowById(targetId)).toHaveAttribute(
      'data-qa-batch-selected',
      'true',
    );

    // The row's checkbox is checked as a result.
    await expect(transactionsPage.batchRowCheckbox(targetId)).toBeChecked();
  });

  test('clear button dismisses the batch bar and clears selection', async ({
    authenticatedPage,
  }) => {
    const transactionsPage = new TransactionsPage(authenticatedPage);
    await transactionsPage.goto();
    await transactionsPage.waitForLoad();
    await transactionsPage.filterByAccount(accountName);
    await authenticatedPage.waitForLoadState('networkidle');

    for (const txId of clearTestIds) {
      await expect(transactionsPage.getRowById(txId)).toBeVisible();
      await transactionsPage.toggleRowCheckbox(txId);
    }

    await expect(transactionsPage.batchEditBar).toBeVisible();
    expect(await transactionsPage.readBatchSelectedCount()).toBe(
      clearTestIds.length,
    );

    await transactionsPage.batchClear();

    await expect(transactionsPage.batchEditBar).not.toBeVisible();

    for (const txId of clearTestIds) {
      await expect(transactionsPage.batchRowCheckbox(txId)).not.toBeChecked();
    }
  });
});
