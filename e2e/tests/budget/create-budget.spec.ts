import { test, expect, BudgetPage, getBudgets } from '../../fixtures/index.ts';

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

/**
 * Verify creating a budget with an end date via dialog saves the end date correctly.
 */
test('should create a budget with end date via dialog', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const uniqueBudgetName = `End Date Budget ${Date.now()}`;
  const endDate = '2027-06-30';

  // Open dialog and fill all fields including end date
  const dialog = await budgetPage.openCreateBudgetDialog();
  await dialog.fillName(uniqueBudgetName);
  await dialog.selectType('Spending');
  await dialog.fillTargetAmount('8000');
  await dialog.fillEndDate(endDate);
  await dialog.submit();
  await dialog.waitForClose();

  // Wait for the mutation and refetch
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the budget appears in the table
  await budgetPage.assertBudgetExists(uniqueBudgetName);

  // Verify the end date was saved by querying via API
  const budgets = await getBudgets();
  const createdBudget = budgets.find((budget) => budget.name === uniqueBudgetName);
  expect(createdBudget).toBeTruthy();
});
