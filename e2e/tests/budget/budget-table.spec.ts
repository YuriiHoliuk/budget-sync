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

/**
 * Verify table has the Suggested column and no Equalize All button.
 */
test('should display Suggested column header and no Equalize button', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify the Suggested column header exists
  const suggestedHeader = budgetPage.budgetTable.locator('th', { hasText: 'Suggested' });
  await expect(suggestedHeader).toBeVisible();

  // Verify there is no "Equalize All" button
  const equalizeButton = authenticatedPage.locator('[data-qa="btn-equalize-all"]');
  await expect(equalizeButton).not.toBeVisible();
});

/**
 * Verify suggested allocation values are displayed for budgets.
 */
test('should display suggested allocation values for budgets', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const budgets = await getBudgets();
  const targetBudget = budgets.find(budget => budget.name === 'Продукти');
  if (!targetBudget) throw new Error('Test budget "Продукти" not found in seeded data');

  // The suggested allocation cell should exist for this budget
  const suggestedCell = authenticatedPage.locator(`[data-qa="budget-suggested-${targetBudget.id}"]`);
  await expect(suggestedCell).toBeVisible();
});
