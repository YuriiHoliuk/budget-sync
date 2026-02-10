import {
  test,
  expect,
  BudgetPage,
  createBudget,
  createAllocation,
  getMonthlyOverviewWithBudgets,
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
 * Helper: get a past month date string (YYYY-MM-DD, last day of 2 months ago).
 */
function getPastEndDate(): string {
  const now = new Date();
  // Go back 2 months to ensure it's firmly in the past
  const pastDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
  return pastDate.toISOString().slice(0, 10);
}

/**
 * Helper: get a past start date (1st of 4 months ago).
 */
function getPastStartDate(): string {
  const now = new Date();
  const pastDate = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  return pastDate.toISOString().slice(0, 10);
}

/**
 * Helper: get a future start date (1st of 3 months from now).
 */
function getFutureStartDate(): string {
  const now = new Date();
  const futureDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  return futureDate.toISOString().slice(0, 10);
}

/**
 * Budget with past endDate and zero balance is hidden from the current month.
 */
test('should hide budget with past endDate and zero balance', async ({
  authenticatedPage,
}) => {
  const budgetName = `Past Hidden ${Date.now()}`;

  // Create budget with endDate in the past and no funds
  await createBudget({
    name: budgetName,
    type: 'SPENDING',
    targetAmount: 5000,
    startDate: getPastStartDate(),
    endDate: getPastEndDate(),
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Budget should NOT be visible in current month since it ended in the past
  // and has no remaining funds
  await budgetPage.assertBudgetNotExists(budgetName);
});

/**
 * Budget with past endDate but remaining funds shows as expired.
 */
test('should show expired badge for past budget with remaining funds', async ({
  authenticatedPage,
}) => {
  const budgetName = `Past Expired ${Date.now()}`;
  const month = getCurrentMonth();

  // Create budget with endDate in the past
  const budget = await createBudget({
    name: budgetName,
    type: 'SPENDING',
    targetAmount: 5000,
    startDate: getPastStartDate(),
    endDate: getPastEndDate(),
  });

  // Allocate funds to give it a remaining balance
  await createAllocation({
    budgetId: budget.id,
    amount: 3000,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Budget should be visible because it has remaining funds
  await budgetPage.assertBudgetExists(budgetName);

  // Budget should show the "Expired" badge
  await budgetPage.assertBudgetExpired(budgetName);

  // Verify isExpired flag via API
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );
  expect(summary?.isExpired).toBe(true);
});

/**
 * Recurring budget (no endDate) is always visible across months.
 */
test('should always show recurring budget without endDate', async ({
  authenticatedPage,
}) => {
  const budgetName = `Recurring ${Date.now()}`;

  await createBudget({
    name: budgetName,
    type: 'SPENDING',
    targetAmount: 5000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Budget should be visible in the current month
  await budgetPage.assertBudgetExists(budgetName);
  await budgetPage.assertBudgetNotExpired(budgetName);

  // Navigate to previous month — budget should still be visible
  await budgetPage.goToPreviousMonth();
  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.assertBudgetExists(budgetName);

  // Navigate forward twice (to next month) — budget should still be visible
  await budgetPage.goToNextMonth();
  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.goToNextMonth();
  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.assertBudgetExists(budgetName);
});

/**
 * Budget with startDate in the future is not visible in the current month.
 */
test('should hide budget with future startDate', async ({
  authenticatedPage,
}) => {
  const budgetName = `Future Budget ${Date.now()}`;

  await createBudget({
    name: budgetName,
    type: 'SPENDING',
    targetAmount: 5000,
    startDate: getFutureStartDate(),
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Budget should NOT be visible in current month since it hasn't started yet
  await budgetPage.assertBudgetNotExists(budgetName);
});
