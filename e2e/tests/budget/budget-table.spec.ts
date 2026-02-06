import { test, expect, BudgetPage, getBudgets } from '../../fixtures/index.ts';

/**
 * Verify that the budget table displays correctly.
 */
test('should display budget table with seeded budgets', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // The budget table should be visible
  await expect(budgetPage.budgetTable).toBeVisible();

  // Get seeded budgets from API to verify they're displayed
  const budgets = await getBudgets();
  expect(budgets.length).toBeGreaterThan(0);

  // Verify at least one budget row is visible
  // Using a known seeded budget name
  await budgetPage.assertBudgetExists('Продукти');
});
