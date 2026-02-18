import {
  test,
  expect,
  BudgetPage,
  createBudget,
  createBudgetGroup,
  getBudgetGroups,
  getBudgetsWithOrder,
  updateBudget,
} from '../../fixtures/index.ts';

/**
 * Tests for budget group functionality.
 * Covers group CRUD, inline rename, and budget assignment.
 */

test.describe('Budget Groups', () => {
  test('should create a new budget group via button', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);
    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Click the "New Group" button
    await budgetPage.clickNewGroup();

    // Wait for the mutation to complete and verify a new group was created
    let newGroup: { id: number; name: string } | undefined;
    await expect(async () => {
      const groups = await getBudgetGroups();
      newGroup = groups.find((group) => group.name === 'New Group');
      expect(newGroup).toBeTruthy();
    }).toPass({ timeout: 5000 });

    // Verify the group header is visible
    if (newGroup) {
      await budgetPage.assertGroupExists(newGroup.id);
    }
  });

  test('should rename a group inline', async ({ authenticatedPage }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group via API
    const group = await createBudgetGroup('Original Group Name');

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify the group exists with the original name
    await budgetPage.assertGroupName(group.id, 'Original Group Name');

    // Rename the group inline
    await budgetPage.renameGroup(group.id, 'Renamed Group');

    // Wait for mutation
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify the name was updated
    await budgetPage.assertGroupName(group.id, 'Renamed Group');

    // Verify in API
    const groups = await getBudgetGroups();
    const renamedGroup = groups.find((grp) => grp.id === group.id);
    expect(renamedGroup?.name).toBe('Renamed Group');
  });

  test('should create a budget within a group via edit form', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group
    const group = await createBudgetGroup(`Test Group - ${Date.now()}`);

    // Create a budget without a group
    const budget = await createBudget({
      name: `Budget for Group - ${Date.now()}`,
      targetAmount: 5000,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify budget is initially in ungrouped section
    let budgets = await getBudgetsWithOrder();
    let testBudget = budgets.find((budg) => budg.id === budget.id);
    expect(testBudget?.budgetGroupId).toBeNull();

    // Assign the budget to the group via API
    await updateBudget({
      id: budget.id,
      month: new Date().toISOString().slice(0, 7),
      budgetGroupId: group.id,
    });

    // Reload and verify
    await budgetPage.goto();
    await budgetPage.waitForLoad();

    budgets = await getBudgetsWithOrder();
    testBudget = budgets.find((budg) => budg.id === budget.id);
    expect(testBudget?.budgetGroupId).toBe(group.id);
  });

  test('should delete a group and move budgets to ungrouped', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group
    const group = await createBudgetGroup(`Group to Delete - ${Date.now()}`);

    // Create a budget in the group
    const budget = await createBudget({
      name: `Budget in Deleted Group - ${Date.now()}`,
      targetAmount: 3000,
      budgetGroupId: group.id,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify budget is in the group
    let budgets = await getBudgetsWithOrder();
    let testBudget = budgets.find((budg) => budg.id === budget.id);
    expect(testBudget?.budgetGroupId).toBe(group.id);

    // Delete the group via menu
    const dialog = await budgetPage.deleteGroupViaMenu(group.id);
    await dialog.confirm();

    // Wait for mutation
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify budget is now ungrouped
    budgets = await getBudgetsWithOrder();
    testBudget = budgets.find((budg) => budg.id === budget.id);
    expect(testBudget?.budgetGroupId).toBeNull();

    // Verify group no longer exists
    const groups = await getBudgetGroups();
    const deletedGroup = groups.find((grp) => grp.id === group.id);
    expect(deletedGroup).toBeUndefined();
  });

  test('should cancel group deletion', async ({ authenticatedPage }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group
    const group = await createBudgetGroup(`Group to Keep - ${Date.now()}`);

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Open delete dialog and cancel
    const dialog = await budgetPage.deleteGroupViaMenu(group.id);
    await dialog.cancel();

    // Verify group still exists
    const groups = await getBudgetGroups();
    const existingGroup = groups.find((grp) => grp.id === group.id);
    expect(existingGroup).toBeTruthy();
  });

  test('should toggle group collapse/expand', async ({ authenticatedPage }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group with a budget
    const group = await createBudgetGroup(`Collapsible Group - ${Date.now()}`);
    const budget = await createBudget({
      name: `Budget in Collapsible - ${Date.now()}`,
      targetAmount: 2000,
      budgetGroupId: group.id,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify budget row is visible
    await expect(budgetPage.getBudgetRowById(budget.id)).toBeVisible();

    // Collapse the group
    await budgetPage.toggleGroup(group.id);
    await authenticatedPage.waitForTimeout(300); // Wait for animation

    // Verify budget row is hidden
    await expect(budgetPage.getBudgetRowById(budget.id)).not.toBeVisible();

    // Expand the group
    await budgetPage.toggleGroup(group.id);
    await authenticatedPage.waitForTimeout(300);

    // Verify budget row is visible again
    await expect(budgetPage.getBudgetRowById(budget.id)).toBeVisible();
  });

  test('should show ungrouped section when budgets have no group', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a budget without a group
    await createBudget({
      name: `Ungrouped Budget - ${Date.now()}`,
      targetAmount: 1500,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify "Ungrouped" section is visible
    await expect(budgetPage.ungroupedHeader).toBeVisible();
  });

  test('should display group totals correctly', async ({
    authenticatedPage,
  }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create a group with multiple budgets
    const group = await createBudgetGroup(`Totals Group - ${Date.now()}`);
    await createBudget({
      name: `Budget A - ${Date.now()}`,
      targetAmount: 1000,
      budgetGroupId: group.id,
    });
    await createBudget({
      name: `Budget B - ${Date.now()}`,
      targetAmount: 2000,
      budgetGroupId: group.id,
    });

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Verify the group header shows correct budget count
    const groupHeader = budgetPage.getGroupHeaderById(group.id);
    await expect(groupHeader).toContainText('(2)');
  });

  test('should delete empty group', async ({ authenticatedPage }) => {
    const budgetPage = new BudgetPage(authenticatedPage);

    // Create an empty group
    const group = await createBudgetGroup(`Empty Group - ${Date.now()}`);

    await budgetPage.goto();
    await budgetPage.waitForLoad();

    // Delete the empty group
    const dialog = await budgetPage.deleteGroupViaMenu(group.id);
    await dialog.confirm();

    // Wait for mutation
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify group was deleted
    const groups = await getBudgetGroups();
    const deletedGroup = groups.find((grp) => grp.id === group.id);
    expect(deletedGroup).toBeUndefined();
  });
});
