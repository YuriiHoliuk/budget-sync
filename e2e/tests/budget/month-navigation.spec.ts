import { test, expect, BudgetPage } from '../../fixtures/index.ts';

/**
 * Verify that month navigation works and updates data.
 */
test('should navigate between months and update metrics', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Get the current month text
  const initialMonth = await budgetPage.getCurrentMonth();
  expect(initialMonth).toBeTruthy();

  // Navigate to previous month
  await budgetPage.goToPreviousMonth();
  await expect(budgetPage.monthSelector.currentMonth).not.toHaveText(initialMonth);

  // Verify month changed
  const previousMonth = await budgetPage.getCurrentMonth();
  expect(previousMonth).not.toBe(initialMonth);

  // Navigate forward (back to current)
  await budgetPage.goToNextMonth();
  await expect(budgetPage.monthSelector.currentMonth).toHaveText(initialMonth);

  // Verify we're back to the original month
  const restoredMonth = await budgetPage.getCurrentMonth();
  expect(restoredMonth).toBe(initialMonth);
});
