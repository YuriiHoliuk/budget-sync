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
 * Verify that the create form has no type selector.
 */
test('should have no type selector in create budget form', async ({
  authenticatedPage,
}) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openCreateBudgetDialog();

  // Verify there is no type selector
  const hasNoTypeSelector = await dialog.hasNoTypeSelector();
  expect(hasNoTypeSelector).toBe(true);

  // Verify the form fields present: name, target, cadence, target date, cap, start date, end date
  const nameInput = dialog.getInput('input-budget-name');
  await expect(nameInput).toBeVisible();

  const targetInput = dialog.getInput('input-target-amount');
  await expect(targetInput).toBeVisible();

  const cadenceCountInput = dialog.getInput('input-cadence-count');
  await expect(cadenceCountInput).toBeVisible();

  const targetDateInput = dialog.getInput('input-target-date');
  await expect(targetDateInput).toBeVisible();

  const capInput = dialog.getInput('input-cap');
  await expect(capInput).toBeVisible();

  const startDateInput = dialog.getInput('input-start-date');
  await expect(startDateInput).toBeVisible();

  const endDateInput = dialog.getInput('input-end-date');
  await expect(endDateInput).toBeVisible();

  await dialog.close();
});

/**
 * Verify simplest budget creation: just name + target (no type needed).
 */
test('should create budget with just name and target', async ({
  authenticatedPage,
}) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const budgetName = `Simple Budget ${Date.now()}`;
  await budgetPage.createBudget(budgetName, '3000');

  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.assertBudgetExists(budgetName);

  // Verify via API — simple budget with no cadence/targetDate uses simple formula
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.name === budgetName,
  );

  expect(summary).toBeTruthy();
  // Simple formula: max(0, target - available) = 3000 (no allocations)
  expect(summary?.suggestedAllocation).toBe(3000);
});

/**
 * Verify creating a periodic-like budget with cadence + cap (no type needed).
 */
test('should create periodic-like budget with cadence and cap', async ({
  authenticatedPage,
}) => {
  const budgetName = `Periodic-Like ${Date.now()}`;
  const targetAmount = 600;

  const budget = await createBudget({
    name: budgetName,
    targetAmount,
    cadenceUnit: 'MONTH',
    cadenceCount: 1,
    cap: 1200,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  await budgetPage.assertBudgetExists(budgetName);

  // periodic formula: max(0, monthlyAmount - available)
  // monthlyAmount = ceil(600 / 1) = 600
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.suggestedAllocation).toBe(600);
});

/**
 * Verify creating a goal-like budget with target date (no type needed).
 */
test('should create goal-like budget with target date', async ({
  authenticatedPage,
}) => {
  // Set target date 12 months from now
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + 12);
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  const budgetName = `Goal-Like ${Date.now()}`;
  const targetAmount = 24000;

  const budget = await createBudget({
    name: budgetName,
    targetAmount,
    targetDate: targetDateStr,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  await budgetPage.assertBudgetExists(budgetName);

  // goal formula: ceil((target - available) / monthsRemaining)
  // With 12 months remaining and 0 available: ceil(24000 / 12) = 2000
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  // The exact value depends on how many months remain from current date to target
  // At minimum it should be positive and reasonable
  expect(summary?.suggestedAllocation).toBeGreaterThan(0);
  expect(summary?.suggestedAllocation).toBeLessThanOrEqual(targetAmount);
});
