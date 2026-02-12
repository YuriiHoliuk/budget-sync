import {
  test,
  expect,
  BudgetPage,
  createBudget,
  getBudgetsWithOrder,
  reorderBudget,
} from '../../fixtures/index.ts';

/**
 * Tests for budget reordering functionality.
 * Verifies drag-and-drop reordering and persistence.
 */

test.describe('Budget Reordering', () => {
  test('should reorder budget via API and verify new order', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create 3 budgets with unique names for this test
    const timestamp = Date.now();
    const budget1 = await createBudget({
      name: `Reorder Test 1 - ${timestamp}`,
      targetAmount: 1000,
    });
    const budget2 = await createBudget({
      name: `Reorder Test 2 - ${timestamp}`,
      targetAmount: 2000,
    });
    const budget3 = await createBudget({
      name: `Reorder Test 3 - ${timestamp}`,
      targetAmount: 3000,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify initial order (budgets are ordered by sortOrder which is assigned on creation)
    const initialBudgets = await getBudgetsWithOrder();
    const testBudgets = initialBudgets.filter(
      (budget) =>
        budget.id === budget1.id ||
        budget.id === budget2.id ||
        budget.id === budget3.id,
    );

    // Sort by sortOrder to verify creation order
    testBudgets.sort((budgetA, budgetB) =>
      (budgetA.sortOrder ?? '').localeCompare(budgetB.sortOrder ?? ''),
    );

    expect(testBudgets[0].id).toBe(budget1.id);
    expect(testBudgets[1].id).toBe(budget2.id);
    expect(testBudgets[2].id).toBe(budget3.id);

    // Reorder budget3 to be first (before budget1)
    await reorderBudget({
      budgetId: budget3.id,
      afterBudgetId: null,
      beforeBudgetId: budget1.id,
    });

    // Reload page and verify new order
    await budgetPage.goto();
    await budgetPage.waitForLoad();

    const updatedBudgets = await getBudgetsWithOrder();
    const updatedTestBudgets = updatedBudgets.filter(
      (budget) =>
        budget.id === budget1.id ||
        budget.id === budget2.id ||
        budget.id === budget3.id,
    );

    updatedTestBudgets.sort((budgetA, budgetB) =>
      (budgetA.sortOrder ?? '').localeCompare(budgetB.sortOrder ?? ''),
    );

    // Budget3 should now be first
    expect(updatedTestBudgets[0].id).toBe(budget3.id);
    expect(updatedTestBudgets[1].id).toBe(budget1.id);
    expect(updatedTestBudgets[2].id).toBe(budget2.id);
  });

  test('should persist order after page reload', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create 2 budgets
    const timestamp = Date.now();
    const budget1 = await createBudget({
      name: `Persist Test A - ${timestamp}`,
      targetAmount: 1000,
    });
    const budget2 = await createBudget({
      name: `Persist Test B - ${timestamp}`,
      targetAmount: 2000,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Reorder budget2 to be before budget1
    await reorderBudget({
      budgetId: budget2.id,
      afterBudgetId: null,
      beforeBudgetId: budget1.id,
    });

    // Reload page
    await authenticatedPage.reload();
    await budgetPage.waitForLoad();

    // Verify order persisted
    const budgets = await getBudgetsWithOrder();
    const testBudgets = budgets.filter(
      (budget) => budget.id === budget1.id || budget.id === budget2.id,
    );

    testBudgets.sort((budgetA, budgetB) =>
      (budgetA.sortOrder ?? '').localeCompare(budgetB.sortOrder ?? ''),
    );

    expect(testBudgets[0].id).toBe(budget2.id);
    expect(testBudgets[1].id).toBe(budget1.id);
  });

  test('should reorder budget to the end of list', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    const timestamp = Date.now();
    const budget1 = await createBudget({
      name: `End Test 1 - ${timestamp}`,
      targetAmount: 1000,
    });
    const budget2 = await createBudget({
      name: `End Test 2 - ${timestamp}`,
      targetAmount: 2000,
    });
    const budget3 = await createBudget({
      name: `End Test 3 - ${timestamp}`,
      targetAmount: 3000,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Move budget1 to the end (after budget3)
    await reorderBudget({
      budgetId: budget1.id,
      afterBudgetId: budget3.id,
      beforeBudgetId: null,
    });

    // Verify new order
    const budgets = await getBudgetsWithOrder();
    const testBudgets = budgets.filter(
      (budget) =>
        budget.id === budget1.id ||
        budget.id === budget2.id ||
        budget.id === budget3.id,
    );

    testBudgets.sort((budgetA, budgetB) =>
      (budgetA.sortOrder ?? '').localeCompare(budgetB.sortOrder ?? ''),
    );

    // Budget1 should now be last
    expect(testBudgets[0].id).toBe(budget2.id);
    expect(testBudgets[1].id).toBe(budget3.id);
    expect(testBudgets[2].id).toBe(budget1.id);
  });

  test('should display drag handle on budget rows', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    const budget = await createBudget({
      name: `Drag Handle Test - ${Date.now()}`,
      targetAmount: 1000,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify drag handle is visible
    const dragHandle = budgetPage.getBudgetDragHandle(budget.id);
    await expect(dragHandle).toBeVisible();
  });
});
