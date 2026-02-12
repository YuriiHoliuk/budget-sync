import {
  test,
  expect,
  BudgetPage,
  createBudget,
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
 * Get the last day of the current month as YYYY-MM-DD.
 */
function getLastDayOfCurrentMonth(): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.toISOString().slice(0, 10);
}

/**
 * Get a future date as YYYY-MM-DD.
 */
function getFutureDate(monthsAhead: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead);
  return date.toISOString().slice(0, 10);
}

/**
 * Verify that end date input has a min attribute set to first day of current month.
 */
test('should set end date min attribute to first day of current month', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `EndDate Min ${Date.now()}`,
    targetAmount: 3000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  const minValue = await dialog.getEndDateMin();
  const expectedMin = `${getCurrentMonth()}-01`;
  expect(minValue).toBe(expectedMin);

  await dialog.close();
});

/**
 * Verify that end date can be set to a date in the current month.
 */
test('should allow setting end date to current month', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `EndDate Current ${Date.now()}`,
    targetAmount: 3000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);
  await dialog.fillEndDate(getLastDayOfCurrentMonth());
  await dialog.submit();
  await dialog.waitForClose();

  await authenticatedPage.waitForLoadState('networkidle');

  // Verify budget still exists (mutation succeeded)
  await budgetPage.assertBudgetExists(budget.name);
});

/**
 * Verify that end date can be set to a future date.
 */
test('should allow setting end date to future month', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `EndDate Future ${Date.now()}`,
    targetAmount: 3000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);
  await dialog.fillEndDate(getFutureDate(6));
  await dialog.submit();
  await dialog.waitForClose();

  await authenticatedPage.waitForLoadState('networkidle');
  await budgetPage.assertBudgetExists(budget.name);
});

/**
 * Verify that end date can be cleared.
 */
test('should allow clearing end date', async ({
  authenticatedPage,
}) => {
  const endDate = getFutureDate(3);
  const budget = await createBudget({
    name: `EndDate Clear ${Date.now()}`,
    targetAmount: 3000,
    endDate,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);
  await dialog.clearEndDate();
  await dialog.submit();
  await dialog.waitForClose();

  await authenticatedPage.waitForLoadState('networkidle');

  // Verify budget is not expired after clearing end date
  await budgetPage.assertBudgetNotExpired(budget.name);
});
