import {
  test,
  expect,
  BudgetPage,
  createBudget,
  createAllocation,
  getMonthlyOverviewWithBudgets,
} from '../../fixtures/index.ts';

/**
 * Get the current month in YYYY-MM format.
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Verify creating a periodic budget with a cap via the dialog.
 */
test('should create a periodic budget with cap via dialog', async ({
  authenticatedPage,
}) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const uniqueName = `Periodic Cap ${Date.now()}`;

  // Open create budget dialog
  const dialog = await budgetPage.openCreateBudgetDialog();

  // Fill name
  await dialog.fillName(uniqueName);

  // Select Periodic type
  await dialog.selectType('Periodic');

  // Fill target amount
  await dialog.fillTargetAmount('1200');

  // Select cadence
  await dialog.selectCadence('Yearly');

  // Fill cap
  await dialog.fillCap('15000');

  // Submit
  await dialog.submit();
  await dialog.waitForClose();

  // Wait for mutation
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the budget appears in the table
  await budgetPage.assertBudgetExists(uniqueName);
});

/**
 * Verify that cap limits the suggested allocation via API.
 * When available balance reaches the cap, suggested should be 0.
 */
test('should stop suggesting when cap is reached', async ({ authenticatedPage }) => {
  const targetAmount = 500;
  const capAmount = 1000;
  const month = getCurrentMonth();

  // Create a periodic budget with monthly cadence and a cap
  const budget = await createBudget({
    name: `Cap Limit ${Date.now()}`,
    type: 'PERIODIC',
    targetAmount,
    targetCadence: 'MONTHLY',
    cap: capAmount,
  });

  // Allocate enough to reach the cap
  await createAllocation({
    budgetId: budget.id,
    amount: capAmount,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify API returns 0 suggested allocation since cap is reached
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary?.suggestedAllocation).toBe(0);

  // Verify UI shows a dash (no suggestion)
  const suggestedText = await budgetPage.getSuggestedAllocation(budget.id);
  expect(suggestedText).toBe('—');
});

/**
 * Verify that periodic budget with cap shows limited suggestion when partially funded.
 * Formula: min(monthlyAmount, max(0, cap - available))
 */
test('should show capped suggested allocation for partially funded periodic budget', async ({
  authenticatedPage,
}) => {
  // Yearly target of 1200 → monthly amount = ceil(1200/12) = 100
  const targetAmount = 1200;
  const capAmount = 300;
  const partialAlloc = 250;
  const month = getCurrentMonth();

  const budget = await createBudget({
    name: `Periodic Partial ${Date.now()}`,
    type: 'PERIODIC',
    targetAmount,
    targetCadence: 'YEARLY',
    cap: capAmount,
  });

  // Allocate partially (250 of 300 cap)
  await createAllocation({
    budgetId: budget.id,
    amount: partialAlloc,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify API: monthly = 100, available = 250, cap = 300
  // Suggested = min(100, max(0, 300 - 250)) = min(100, 50) = 50
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary?.suggestedAllocation).toBe(50);
});
