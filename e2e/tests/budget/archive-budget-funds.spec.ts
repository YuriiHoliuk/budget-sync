import {
  test,
  expect,
  BudgetPage,
  createBudget,
  createAllocation,
  createAccount,
  createTransaction,
  getMonthlyOverview,
} from '../../fixtures/index.ts';

/**
 * Helper: get current month in YYYY-MM format.
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Archive a budget with leftover funds and verify Ready to Assign increases.
 */
test('should release leftover funds to Ready to Assign when archiving', async ({
  authenticatedPage,
}) => {
  const month = getCurrentMonth();
  const allocationAmount = 5000;

  // Create a budget and allocate funds to it
  const budget = await createBudget({
    name: `Archive Leftover ${Date.now()}`,
    type: 'SPENDING',
    targetAmount: 10000,
  });

  await createAllocation({
    budgetId: budget.id,
    amount: allocationAmount,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify budget exists and has allocated funds
  await budgetPage.assertBudgetExists(budget.name);

  // Capture Ready to Assign before archive
  const overviewBefore = await getMonthlyOverview(month);
  const readyToAssignBefore = overviewBefore.readyToAssign;

  // Archive the budget via UI
  await budgetPage.clickArchiveBudget(budget.id);

  // Confirm the archive dialog
  const dialog = authenticatedPage.locator('[data-qa="dialog-archive-budget"]');
  await expect(dialog).toBeVisible();
  await authenticatedPage.locator('[data-qa="btn-archive-confirm"]').click();

  // Wait for mutation and UI update
  await authenticatedPage.waitForLoadState('networkidle');

  // Budget should no longer be visible
  await budgetPage.assertBudgetNotExists(budget.name);

  // Ready to Assign should increase by the leftover amount
  const overviewAfter = await getMonthlyOverview(month);
  const readyToAssignAfter = overviewAfter.readyToAssign;

  // The leftover funds (allocation minus spending = 5000 - 0 = 5000) should be released
  expect(readyToAssignAfter).toBeCloseTo(
    readyToAssignBefore + allocationAmount,
    0,
  );
});

/**
 * Archive a fully-spent budget and verify Ready to Assign stays the same.
 */
test('should not change Ready to Assign when archiving fully-spent budget', async ({
  authenticatedPage,
}) => {
  const month = getCurrentMonth();
  const budgetAmount = 3000;

  // Create a budget
  const budget = await createBudget({
    name: `Archive Spent ${Date.now()}`,
    type: 'SPENDING',
    targetAmount: budgetAmount,
  });

  // Allocate funds
  await createAllocation({
    budgetId: budget.id,
    amount: budgetAmount,
    period: month,
  });

  // Create an account with balance and a spending transaction to use up the budget
  const account = await createAccount({
    name: `Spend Account ${Date.now()}`,
    role: 'OPERATIONAL',
    type: 'DEBIT',
    balance: 100000,
  });

  // Create a transaction that spends the entire budget amount
  await createTransaction({
    accountId: account.id,
    amount: -budgetAmount * 100, // Convert to minor units (kopecks)
    date: new Date().toISOString().slice(0, 10),
    description: 'Test spending for archive',
    budgetId: budget.id,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify budget exists
  await budgetPage.assertBudgetExists(budget.name);

  // Capture Ready to Assign before archive
  const overviewBefore = await getMonthlyOverview(month);
  const readyToAssignBefore = overviewBefore.readyToAssign;

  // Archive the budget via UI
  await budgetPage.clickArchiveBudget(budget.id);

  // Confirm the archive dialog
  const dialog = authenticatedPage.locator('[data-qa="dialog-archive-budget"]');
  await expect(dialog).toBeVisible();
  await authenticatedPage.locator('[data-qa="btn-archive-confirm"]').click();

  // Wait for mutation and UI update
  await authenticatedPage.waitForLoadState('networkidle');

  // Budget should no longer be visible
  await budgetPage.assertBudgetNotExists(budget.name);

  // Ready to Assign should remain approximately the same
  // (fully-spent budget has no leftover to release)
  const overviewAfter = await getMonthlyOverview(month);
  const readyToAssignAfter = overviewAfter.readyToAssign;

  expect(readyToAssignAfter).toBeCloseTo(readyToAssignBefore, 0);
});
