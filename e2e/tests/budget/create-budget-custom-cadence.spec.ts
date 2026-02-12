import {
  test,
  expect,
  BudgetPage,
  createBudget,
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
 * Verify budget creation with bi-weekly cadence via dialog.
 */
test('should create budget with bi-weekly cadence and show correct suggestion', async ({
  authenticatedPage,
}) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const budgetName = `Bi-Weekly ${Date.now()}`;
  const targetAmount = 500;

  const dialog = await budgetPage.openCreateBudgetDialog();
  await dialog.fillName(budgetName);
  await dialog.fillTargetAmount(targetAmount.toString());
  await dialog.fillCadence('2', 'Week');
  await dialog.submit();
  await dialog.waitForClose();

  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.assertBudgetExists(budgetName);

  // Verify via API: monthly = ceil(50000 * 52 / (2 * 12)) = 108334 kopecks = 1083.34 UAH
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.name === budgetName,
  );

  expect(summary).toBeTruthy();
  expect(summary?.suggestedAllocation).toBe(1083.34);
});

/**
 * Verify budget creation with quarterly cadence via API.
 */
test('should create budget with quarterly cadence and show correct suggestion', async ({
  authenticatedPage,
}) => {
  const budgetName = `Quarterly ${Date.now()}`;
  const targetAmount = 900;

  const budget = await createBudget({
    name: budgetName,
    targetAmount,
    cadenceUnit: 'MONTH',
    cadenceCount: 3,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  await budgetPage.assertBudgetExists(budgetName);

  // Expected monthly = ceil(900 / 3) = 300
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.suggestedAllocation).toBe(300);
});

/**
 * Verify budget creation with yearly cadence via API.
 */
test('should create budget with yearly cadence and show correct suggestion', async ({
  authenticatedPage,
}) => {
  const budgetName = `Yearly ${Date.now()}`;
  const targetAmount = 12000;

  const budget = await createBudget({
    name: budgetName,
    targetAmount,
    cadenceUnit: 'YEAR',
    cadenceCount: 1,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  await budgetPage.assertBudgetExists(budgetName);

  // Expected monthly = ceil(12000 / (1 * 12)) = 1000
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.suggestedAllocation).toBe(1000);
});

/**
 * Verify budget creation with daily cadence via API.
 */
test('should create budget with daily cadence and show correct suggestion', async ({
  authenticatedPage,
}) => {
  const budgetName = `Daily ${Date.now()}`;
  const targetAmount = 200;

  const budget = await createBudget({
    name: budgetName,
    targetAmount,
    cadenceUnit: 'DAY',
    cadenceCount: 14,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  await budgetPage.assertBudgetExists(budgetName);

  // Expected monthly = ceil(20000 * 365 / (14 * 12)) = 43453 kopecks = 434.53 UAH
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.suggestedAllocation).toBe(434.53);
});
