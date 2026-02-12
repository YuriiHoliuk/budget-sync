import {
  test,
  expect,
  BudgetPage,
  createBudget,
} from '../../fixtures/index.ts';

/**
 * Verify that the edit form shows structural fields as read-only.
 */
test('should display read-only fields for budget with cadence', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `ReadOnly Cadence ${Date.now()}`,
    targetAmount: 1000,
    cadenceUnit: 'WEEK',
    cadenceCount: 2,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  // Verify read-only section is visible
  await expect(dialog.readOnlySection).toBeVisible();

  // Verify structural fields are displayed as text
  const currency = await dialog.getCurrencyDisplay();
  expect(currency).toBe('UAH');

  const cadence = await dialog.getCadenceDisplay();
  expect(cadence).toBe('Every 2 weeks');

  const startDate = await dialog.getStartDateDisplay();
  expect(startDate).not.toBe('');

  // Verify cadence is NOT an editable input
  const noCadenceInputs = await dialog.hasNoCadenceInputs();
  expect(noCadenceInputs).toBe(true);

  // Verify structural fields are read-only
  const structuralReadOnly = await dialog.assertStructuralFieldsReadOnly();
  expect(structuralReadOnly).toBe(true);

  await dialog.close();
});

/**
 * Verify that editable fields (name, target, cap, endDate) are present and editable.
 */
test('should allow editing name, target amount, cap, and end date', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `Editable Fields ${Date.now()}`,
    targetAmount: 5000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  // Verify name input is present and editable
  const nameInput = dialog.getInput('input-name');
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toBeEditable();

  // Verify target amount input is present and editable
  const targetInput = dialog.getInput('input-target-amount');
  await expect(targetInput).toBeVisible();
  await expect(targetInput).toBeEditable();

  // Verify cap input is present and editable
  const capInput = dialog.getInput('input-cap');
  await expect(capInput).toBeVisible();
  await expect(capInput).toBeEditable();

  // Verify end date input is present and editable
  await expect(dialog.endDateInput).toBeVisible();
  await expect(dialog.endDateInput).toBeEditable();

  await dialog.close();
});

/**
 * Verify budget with target date shows target date in read-only section.
 */
test('should display target date in read-only section when set', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `Goal Budget ${Date.now()}`,
    targetAmount: 50000,
    targetDate: '2027-12-31',
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  // Target date should be displayed as read-only text
  const targetDate = await dialog.getTargetDateDisplay();
  expect(targetDate).toContain('2027');

  await dialog.close();
});

/**
 * Verify budget without cadence shows "None (simple target)" as cadence.
 */
test('should show "None (simple target)" for budget without cadence', async ({
  authenticatedPage,
}) => {
  const budget = await createBudget({
    name: `Simple Budget ${Date.now()}`,
    targetAmount: 3000,
  });

  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  const dialog = await budgetPage.openEditBudgetDialog(budget.id);

  const cadence = await dialog.getCadenceDisplay();
  expect(cadence).toBe('None (simple target)');

  await dialog.close();
});
