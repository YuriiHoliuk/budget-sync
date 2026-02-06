import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { Dialog, InlineEditor, MonthSelector } from '../components';

/**
 * Budget Page Object
 * Main page showing monthly budget overview and allocation management
 */
export class BudgetPage extends BasePage {
  readonly inlineEditor: InlineEditor;
  readonly monthNav: MonthSelector;

  constructor(page: Page) {
    super(page);
    this.inlineEditor = new InlineEditor(page);
    this.monthNav = new MonthSelector(page);
  }

  protected get url(): string {
    return '/';
  }

  // ========== METRICS ==========

  get readyToAssign(): Locator {
    return this.byQa('metric-ready-to-assign');
  }

  get availableFunds(): Locator {
    return this.byQa('metric-available-funds');
  }

  get capitalBalance(): Locator {
    return this.byQa('metric-capital-balance');
  }

  get totalAllocated(): Locator {
    return this.byQa('metric-total-allocated');
  }

  get totalSpent(): Locator {
    return this.byQa('metric-total-spent');
  }

  get savingsRate(): Locator {
    return this.byQa('metric-savings-rate');
  }

  /**
   * Get Ready to Assign value
   */
  async getReadyToAssign(): Promise<string> {
    return (await this.readyToAssign.textContent()) ?? '';
  }

  /**
   * Get Available Funds value
   */
  async getAvailableFunds(): Promise<string> {
    return (await this.availableFunds.textContent()) ?? '';
  }

  /**
   * Get Capital Balance value
   */
  async getCapitalBalance(): Promise<string> {
    return (await this.capitalBalance.textContent()) ?? '';
  }

  // ========== BUDGET TABLE ==========

  get budgetTable(): Locator {
    return this.byQa('budget-table');
  }

  get moveFundsButton(): Locator {
    return this.byQa('btn-move-funds');
  }

  get newBudgetButton(): Locator {
    return this.byQa('btn-new-budget');
  }

  /**
   * Get a budget row by budget name
   */
  getBudgetRow(budgetName: string): Locator {
    return this.budgetTable.locator('tr', { hasText: budgetName });
  }

  /**
   * Get a budget row by ID
   */
  getBudgetRowById(budgetId: number): Locator {
    return this.byQa(`budget-row-${budgetId}`);
  }

  /**
   * Get allocated amount for a budget
   */
  async getAllocatedAmount(budgetId: number): Promise<string> {
    return (await this.byQa(`budget-allocated-${budgetId}`).textContent()) ?? '';
  }

  /**
   * Get spent amount for a budget
   */
  async getSpentAmount(budgetId: number): Promise<string> {
    return (await this.byQa(`budget-spent-${budgetId}`).textContent()) ?? '';
  }

  /**
   * Get available amount for a budget
   */
  async getAvailableAmount(budgetId: number): Promise<string> {
    return (await this.byQa(`budget-available-${budgetId}`).textContent()) ?? '';
  }

  /**
   * Edit allocation for a budget inline
   */
  async editAllocation(budgetId: number, newAmount: string): Promise<void> {
    // Click on the allocated cell to enter edit mode
    await this.byQa(`budget-allocated-${budgetId}`).click();

    // Wait for input and fill
    const input = this.byQa('allocation-input');
    await input.waitFor({ state: 'visible' });
    await input.fill(newAmount);

    // Save
    await this.byQa('btn-allocation-save').click();
  }

  /**
   * Open budget menu (three dots) for a specific budget
   */
  async openBudgetMenu(budgetId: number): Promise<void> {
    await this.byQa(`budget-menu-${budgetId}`).click();
  }

  /**
   * Edit a budget via menu
   */
  async clickEditBudget(budgetId: number): Promise<void> {
    await this.openBudgetMenu(budgetId);
    await this.byQa(`budget-edit-${budgetId}`).click();
  }

  /**
   * Archive a budget via menu
   */
  async clickArchiveBudget(budgetId: number): Promise<void> {
    await this.openBudgetMenu(budgetId);
    await this.byQa(`budget-archive-${budgetId}`).click();
  }

  // ========== MOVE FUNDS DIALOG ==========

  /**
   * Open move funds dialog
   */
  async openMoveFundsDialog(): Promise<MoveFundsDialog> {
    await this.moveFundsButton.click();
    const dialog = new MoveFundsDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Open move funds dialog from a specific budget's available cell
   */
  async openMoveFundsFromBudget(budgetId: number): Promise<MoveFundsDialog> {
    // Hover over the row to show the move funds icon
    await this.getBudgetRowById(budgetId).hover();
    await this.byQa(`btn-move-funds-from-${budgetId}`).click();
    const dialog = new MoveFundsDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Move funds between budgets (convenience method)
   */
  async moveFunds(sourceBudgetName: string, destBudgetName: string, amount: string): Promise<void> {
    const dialog = await this.openMoveFundsDialog();
    await dialog.selectSourceBudget(sourceBudgetName);
    await dialog.selectDestinationBudget(destBudgetName);
    await dialog.fillAmount(amount);
    await dialog.submit();
    await dialog.waitForClose();
  }

  // ========== CREATE BUDGET DIALOG ==========

  /**
   * Open create budget dialog
   */
  async openCreateBudgetDialog(): Promise<CreateBudgetDialog> {
    await this.newBudgetButton.click();
    const dialog = new CreateBudgetDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Create a new budget (convenience method)
   */
  async createBudget(name: string, type: string, targetAmount?: string): Promise<void> {
    const dialog = await this.openCreateBudgetDialog();
    await dialog.fillName(name);
    await dialog.selectType(type);
    if (targetAmount) {
      await dialog.fillTargetAmount(targetAmount);
    }
    await dialog.submit();
    await dialog.waitForClose();
  }

  // ========== ASSERTIONS ==========

  /**
   * Assert Ready to Assign shows specific value
   */
  async assertReadyToAssign(expectedValue: string): Promise<void> {
    await expect(this.readyToAssign).toContainText(expectedValue);
  }

  /**
   * Assert budget exists in table
   */
  async assertBudgetExists(budgetName: string): Promise<void> {
    await expect(this.getBudgetRow(budgetName)).toBeVisible();
  }

  /**
   * Assert budget does not exist in table
   */
  async assertBudgetNotExists(budgetName: string): Promise<void> {
    await expect(this.getBudgetRow(budgetName)).not.toBeVisible();
  }
}

/**
 * Move Funds Dialog
 */
class MoveFundsDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'dialog-move-funds');
  }

  async selectSourceBudget(budgetName: string): Promise<void> {
    await this.selectOption('select-source-budget', budgetName);
  }

  async selectDestinationBudget(budgetName: string): Promise<void> {
    await this.selectOption('select-dest-budget', budgetName);
  }

  async fillAmount(amount: string): Promise<void> {
    await this.fillInput('input-transfer-amount', amount);
  }

  async getAvailableBalance(): Promise<string> {
    const element = this.locator.locator('[data-qa="text-available-balance"]');
    return (await element.textContent()) ?? '';
  }

  async hasBalanceWarning(): Promise<boolean> {
    return this.locator.locator('[data-qa="text-warning-exceeds-balance"]').isVisible();
  }
}

/**
 * Create Budget Dialog
 */
class CreateBudgetDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'dialog-create-budget');
  }

  async fillName(name: string): Promise<void> {
    await this.fillInput('input-budget-name', name);
  }

  async selectType(type: string): Promise<void> {
    await this.selectOption('select-budget-type', type);
  }

  async fillTargetAmount(amount: string): Promise<void> {
    await this.fillInput('input-target-amount', amount);
  }

  async selectCadence(cadence: string): Promise<void> {
    await this.selectOption('select-target-cadence', cadence);
  }

  async fillTargetDate(date: string): Promise<void> {
    await this.fillInput('input-target-date', date);
  }
}
