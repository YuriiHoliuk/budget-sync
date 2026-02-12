import {
  test,
  expect,
  BudgetPage,
  createBudget,
  createAllocation,
  updateBudget,
  getMonthlyOverviewWithBudgets,
} from '../../fixtures/index.ts';

/**
 * Get a month string in YYYY-MM format relative to today.
 * offset: 0 = current month, -1 = previous, +1 = next
 */
function getMonthOffset(offset: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Verify that changing target amount shows the inline note.
 */
test('should show target change note when target amount is modified', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `Target Note ${Date.now()}`,
    targetAmount: 5000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  // Verify no note initially
  const initialNote = await dialog.getTargetChangeNoteText();
  expect(initialNote).toBe('');

  // Change target amount
  await dialog.fillTargetAmount('7000');

  // Verify the note appears
  const noteText = await dialog.getTargetChangeNoteText();
  expect(noteText).toContain('New target takes effect from');

  await dialog.close();
});

/**
 * Verify that historical target is preserved after changing target amount.
 * This test:
 * 1. Creates a budget with target 5000
 * 2. Allocates in the current month
 * 3. Changes target to 7000 (effective current month)
 * 4. Verifies current month shows target 7000 via API
 */
test('should preserve correct target amount after update via API', async ({
  authenticatedPage,
}) => {
  const currentMonth = getMonthOffset(0);
  const originalTarget = 5000;
  const newTarget = 7000;

  const budget = await createBudget({
    name: `History API ${Date.now()}`,
    targetAmount: originalTarget,
  });

  // Allocate some funds in the current month
  await createAllocation({
    budgetId: budget.id,
    amount: 2000,
    period: currentMonth,
  });

  // Update target via API
  await updateBudget({
    id: budget.id,
    month: currentMonth,
    targetAmount: newTarget,
  });

  // Verify current month shows the new target
  const overview = await getMonthlyOverviewWithBudgets(currentMonth);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.targetAmount).toBe(newTarget);

  // Verify UI also shows updated target
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();
  await budgetPage.assertBudgetExists(budget.name);
});

/**
 * Verify that updating target via the edit dialog works correctly.
 */
test('should update target amount via edit dialog', async ({
  authenticatedPage,
}) => {
  const currentMonth = getMonthOffset(0);
  const originalTarget = 4000;
  const newTarget = 6000;

  const budget = await createBudget({
    name: `Edit Dialog Target ${Date.now()}`,
    targetAmount: originalTarget,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Open edit dialog and change target
  const dialog = await budgetPage.openEditBudgetDialog(budget.id);
  await dialog.fillTargetAmount(newTarget.toString());

  // Verify the note appears
  const noteText = await dialog.getTargetChangeNoteText();
  expect(noteText).toContain('New target takes effect from');

  await dialog.submit();
  await dialog.waitForClose();
  await authenticatedPage.waitForLoadState('networkidle');

  // Verify via API that the target was updated
  const overview = await getMonthlyOverviewWithBudgets(currentMonth);
  const summary = overview.budgetSummaries.find(
    (budgetSummary) => budgetSummary.budgetId === budget.id,
  );

  expect(summary).toBeTruthy();
  expect(summary?.targetAmount).toBe(newTarget);
});
