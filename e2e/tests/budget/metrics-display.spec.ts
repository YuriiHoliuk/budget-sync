import { test, expect, BudgetPage } from '../../fixtures/index.ts';

/**
 * Verify that monthly overview metrics display correctly.
 * Uses seeded data from db-seed-e2e service.
 */
test('should display monthly overview metrics', async ({ authenticatedPage }) => {
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.waitForLoad();

  // Verify all metrics are visible
  await expect(budgetPage.readyToAssign).toBeVisible();
  await expect(budgetPage.availableFunds).toBeVisible();
  await expect(budgetPage.capitalBalance).toBeVisible();
  await expect(budgetPage.totalAllocated).toBeVisible();
  await expect(budgetPage.totalSpent).toBeVisible();
  await expect(budgetPage.savingsRate).toBeVisible();

  // Verify metrics contain currency values (UAH format)
  const readyToAssignText = await budgetPage.getReadyToAssign();
  expect(readyToAssignText).toMatch(/[\d\s,]+/); // Contains numbers

  const availableFundsText = await budgetPage.getAvailableFunds();
  expect(availableFundsText).toMatch(/[\d\s,]+/);

  const capitalBalanceText = await budgetPage.getCapitalBalance();
  expect(capitalBalanceText).toMatch(/[\d\s,]+/);
});
