import { test, BudgetPage } from '../../fixtures/index.ts';

/**
 * Verify budget creation dialog works correctly.
 */
test('should create a new budget via dialog', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Create a unique budget name for this test run
  const uniqueBudgetName = `Test Budget ${Date.now()}`;

  // Create the budget using the convenience method
  await budgetPage.createBudget(uniqueBudgetName, 'Spending', '5000');

  // Wait for the mutation and refetch
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the new budget appears in the table
  await budgetPage.assertBudgetExists(uniqueBudgetName);
});
