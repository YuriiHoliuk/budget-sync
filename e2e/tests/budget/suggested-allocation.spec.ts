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
 * Verify that a spending budget with no allocation shows the target as suggested.
 */
test('should show target amount as suggested for unallocated spending budget', async ({
  authenticatedPage,
}) => {
  const targetAmount = 5000;
  const budget = await createBudget({
    name: `Suggested Test ${Date.now()}`,
    targetAmount,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify the budget row exists
  await budgetPage.assertBudgetExists(budget.name);

  // Get the suggested allocation from the API to know expected value
  const month = getCurrentMonth();
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  // With no allocation and no spending, suggested should equal target
  expect(summary?.suggestedAllocation).toBe(targetAmount);

  // Verify the suggested cell shows a value (not just a dash)
  const suggestedText = await budgetPage.getSuggestedAllocation(budget.id);
  expect(suggestedText).not.toBe('—');
  expect(suggestedText).toMatch(/[\d\s,]+/);
});

/**
 * Verify that suggested allocation decreases after allocating funds.
 */
test('should decrease suggested allocation after partial allocation', async ({
  authenticatedPage,
}) => {
  const targetAmount = 8000;
  const allocationAmount = 3000;
  const month = getCurrentMonth();

  const budget = await createBudget({
    name: `Partial Alloc ${Date.now()}`,
    targetAmount,
  });

  // Allocate partially
  await createAllocation({
    budgetId: budget.id,
    amount: allocationAmount,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify API returns correct suggested allocation
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  // Suggested should be target - allocated = 8000 - 3000 = 5000
  expect(summary?.suggestedAllocation).toBe(targetAmount - allocationAmount);

  // Verify UI shows the suggested value
  const suggestedText = await budgetPage.getSuggestedAllocation(budget.id);
  expect(suggestedText).toMatch(/[\d\s,]+/);
});

/**
 * Verify that suggested allocation becomes zero when fully allocated.
 */
test('should show no suggested allocation when fully allocated', async ({
  authenticatedPage,
}) => {
  const targetAmount = 4000;
  const month = getCurrentMonth();

  const budget = await createBudget({
    name: `Full Alloc ${Date.now()}`,
    targetAmount,
  });

  // Allocate the full target amount
  await createAllocation({
    budgetId: budget.id,
    amount: targetAmount,
    period: month,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify API returns zero suggested allocation
  const overview = await getMonthlyOverviewWithBudgets(month);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary?.suggestedAllocation).toBe(0);

  // Verify UI shows a dash (no suggestion)
  const suggestedText = await budgetPage.getSuggestedAllocation(budget.id);
  expect(suggestedText).toBe('—');
});
