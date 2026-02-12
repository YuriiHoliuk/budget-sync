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

  // Fill target amount
  await dialog.fillTargetAmount('1200');

  // Set cadence: every 1 year
  await dialog.fillCadence('1', 'Year');

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
    targetAmount,
    cadenceUnit: 'MONTH',
    cadenceCount: 1,
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
 * Periodic formula: max(0, monthlyAmount - available)
 * Cap post-processing: min(suggestion, max(0, cap - available))
 *
 * With monthlyAmount=500, available=100, cap=300:
 * Periodic: max(0, 500 - 100) = 400
 * Cap: min(400, max(0, 300 - 100)) = min(400, 200) = 200
 */
test('should show capped suggested allocation for partially funded periodic budget', async ({
  authenticatedPage,
}) => {
  // Monthly target of 500 → monthly amount = 500
  const targetAmount = 500;
  const capAmount = 300;
  const partialAlloc = 100;
  const month = getCurrentMonth();

  const budget = await createBudget({
    name: `Periodic Partial ${Date.now()}`,
    targetAmount,
    cadenceUnit: 'MONTH',
    cadenceCount: 1,
    cap: capAmount,
  });

  // Allocate partially (100 of 300 cap)
  await createAllocation({
    budgetId: budget.id,
    amount: partialAlloc,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify API: monthly = 500, available = 100, cap = 300
  // Periodic: max(0, 500 - 100) = 400
  // Cap: min(400, max(0, 300 - 100)) = min(400, 200) = 200
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary?.suggestedAllocation).toBe(200);
});
