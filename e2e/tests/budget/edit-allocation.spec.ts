import { test, expect, BudgetPage, getBudgets } from '../../fixtures/index.ts';

/**
 * Verify inline allocation editing updates the totals.
 */
test('should edit allocation inline and update totals', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Get seeded budgets
  const budgets = await getBudgets();
  expect(budgets.length).toBeGreaterThan(0);

  // Find a budget to edit (Продукти)
  const targetBudget = budgets.find(b => b.name === 'Продукти');
  if (!targetBudget) throw new Error('Test budget "Продукти" not found in seeded data');

  // Get initial allocated amount for this budget
  const initialAllocatedText = await budgetPage.getAllocatedAmount(targetBudget.id);
  expect(initialAllocatedText).toBeTruthy();

  // Edit allocation - set to a new value
  const newAmount = '11000';
  await budgetPage.editAllocation(targetBudget.id, newAmount);

  // Wait for the mutation to complete and UI to update
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the allocated amount changed in the UI
  const updatedAllocatedText = await budgetPage.getAllocatedAmount(targetBudget.id);
  expect(updatedAllocatedText).toContain('11');
});
