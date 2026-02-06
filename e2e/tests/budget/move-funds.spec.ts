import { test, expect, BudgetPage, getBudgets } from '../../fixtures/index.ts';

/**
 * Verify move funds dialog works correctly.
 */
test('should move funds between budgets via dialog', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Get seeded budgets
  const budgets = await getBudgets();
  expect(budgets.length).toBeGreaterThan(1);

  // Find source and destination budgets
  const sourceBudget = budgets.find(b => b.name === 'Продукти');
  const destBudget = budgets.find(b => b.name === 'Транспорт');

  if (!sourceBudget || !destBudget) {
    throw new Error('Test budgets not found in seeded data');
  }

  // Get initial available amounts
  const initialSourceAvailable = await budgetPage.getAvailableAmount(sourceBudget.id);
  const initialDestAvailable = await budgetPage.getAvailableAmount(destBudget.id);

  // Open move funds dialog
  const dialog = await budgetPage.openMoveFundsDialog();

  // Fill in the form - use partial text match since options include balance amount
  await authenticatedPage.locator('[data-qa="select-source-budget"]').click();
  await authenticatedPage.getByRole('option').filter({ hasText: 'Продукти' }).click();

  await authenticatedPage.locator('[data-qa="select-dest-budget"]').click();
  await authenticatedPage.getByRole('option').filter({ hasText: 'Транспорт' }).click();

  await dialog.fillAmount('100');

  // Verify available balance is shown
  const availableText = await dialog.getAvailableBalance();
  expect(availableText).toBeTruthy();

  // Submit the form
  await dialog.submit();
  await dialog.waitForClose();

  // Wait for UI to update
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the available amounts changed
  // Source should decrease, destination should increase
  const updatedSourceAvailable = await budgetPage.getAvailableAmount(sourceBudget.id);
  const updatedDestAvailable = await budgetPage.getAvailableAmount(destBudget.id);

  // The amounts should have changed (we moved 100 UAH)
  expect(updatedSourceAvailable).not.toBe(initialSourceAvailable);
  expect(updatedDestAvailable).not.toBe(initialDestAvailable);
});
