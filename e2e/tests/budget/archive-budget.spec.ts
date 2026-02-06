import { test, expect, BudgetPage, createBudget } from '../../fixtures/index.ts';

/**
 * Verify budget archiving removes budget from list.
 */
test('should archive budget and remove from list', async ({ authenticatedPage }) => {
  // First, create a test budget via API that we'll archive
  const testBudget = await createBudget({
    name: `Archive Test ${Date.now()}`,
    type: 'SPENDING',
    targetAmount: 1000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify the budget exists in the table
  await budgetPage.assertBudgetExists(testBudget.name);

  // Click archive from the menu
  await budgetPage.clickArchiveBudget(testBudget.id);

  // Confirm the archive dialog
  const dialog = authenticatedPage.locator('[data-qa="dialog-archive-budget"]');
  await expect(dialog).toBeVisible();

  // Click confirm button
  await authenticatedPage.locator('[data-qa="btn-archive-confirm"]').click();

  // Wait for mutation and UI update
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify the budget is no longer in the table
  await budgetPage.assertBudgetNotExists(testBudget.name);
});
