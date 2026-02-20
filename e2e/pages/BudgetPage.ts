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
   * Get suggested allocation for a budget
   */
  async getSuggestedAllocation(budgetId: number): Promise<string> {
    return (await this.byQa(`budget-suggested-${budgetId}`).textContent()) ?? '';
  }

  /**
   * Edit allocation for a budget inline
   * Note: The inline editor saves on Enter key or blur
   */
  async editAllocation(budgetId: number, newAmount: string): Promise<void> {
    // Click on the allocated cell to enter edit mode
    await this.byQa(`budget-allocated-${budgetId}`).click();

    // Wait for input and fill
    const input = this.byQa('allocation-input');
    await input.waitFor({ state: 'visible' });
    await input.fill(newAmount);

    // Press Enter to save (the component saves on Enter or blur)
    await input.press('Enter');

    // Wait for the input to disappear (edit mode closed)
    await input.waitFor({ state: 'hidden', timeout: 5000 });
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

  // ========== EDIT BUDGET DIALOG ==========

  /**
   * Open edit budget dialog for a specific budget
   */
  async openEditBudgetDialog(budgetId: number): Promise<EditBudgetDialog> {
    await this.clickEditBudget(budgetId);
    const dialog = new EditBudgetDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
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
  async createBudget(
    name: string,
    targetAmount?: string,
    options?: { startDate?: string; endDate?: string },
  ): Promise<void> {
    const dialog = await this.openCreateBudgetDialog();
    await dialog.fillName(name);
    if (targetAmount) {
      await dialog.fillTargetAmount(targetAmount);
    }
    if (options?.startDate) {
      await dialog.fillStartDate(options.startDate);
    }
    if (options?.endDate) {
      await dialog.fillEndDate(options.endDate);
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

  // ========== EXPIRED BADGE ==========

  /**
   * Check if a budget row shows the "Expired" badge
   */
  isExpired(budgetName: string): Locator {
    return this.getBudgetRow(budgetName).locator('[data-slot="badge"]', { hasText: 'Expired' });
  }

  /**
   * Assert that a budget shows the "Expired" badge
   */
  async assertBudgetExpired(budgetName: string): Promise<void> {
    await expect(this.isExpired(budgetName)).toBeVisible();
  }

  /**
   * Assert that a budget does NOT show the "Expired" badge
   */
  async assertBudgetNotExpired(budgetName: string): Promise<void> {
    await expect(this.isExpired(budgetName)).not.toBeVisible();
  }

  // ========== BUDGET GROUPS ==========

  /**
   * Get the "New Group" button
   */
  get newGroupButton(): Locator {
    return this.byQa('btn-new-group');
  }

  /**
   * Click the "New Group" button to create a new budget group
   */
  async clickNewGroup(): Promise<void> {
    await this.newGroupButton.click();
  }

  /**
   * Get a group header row by group ID
   */
  getGroupHeaderById(groupId: number): Locator {
    return this.byQa(`group-header-${groupId}`);
  }

  /**
   * Get the "Ungrouped" section header
   */
  get ungroupedHeader(): Locator {
    return this.byQa('group-header-ungrouped');
  }

  /**
   * Get a group name element (clickable to edit)
   */
  getGroupName(groupId: number): Locator {
    return this.byQa(`group-name-${groupId}`);
  }

  /**
   * Get a group name input (when editing)
   */
  getGroupNameInput(groupId: number): Locator {
    return this.byQa(`group-name-input-${groupId}`);
  }

  /**
   * Get a group toggle button (collapse/expand)
   */
  getGroupToggle(groupId: number): Locator {
    return this.byQa(`group-toggle-${groupId}`);
  }

  /**
   * Get a group menu button
   */
  getGroupMenu(groupId: number): Locator {
    return this.byQa(`group-menu-${groupId}`);
  }

  /**
   * Open the group menu
   */
  async openGroupMenu(groupId: number): Promise<void> {
    await this.getGroupMenu(groupId).click();
  }

  /**
   * Rename a group inline
   */
  async renameGroup(groupId: number, newName: string): Promise<void> {
    // Click the group name to enter edit mode
    await this.getGroupName(groupId).click();

    // Wait for and fill the input
    const input = this.getGroupNameInput(groupId);
    await input.waitFor({ state: 'visible' });
    await input.fill(newName);
    await input.press('Enter');

    // Wait for the input to disappear (edit mode closed)
    await input.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Toggle a group (collapse/expand)
   */
  async toggleGroup(groupId: number): Promise<void> {
    await this.getGroupToggle(groupId).click();
  }

  /**
   * Assert that a group exists
   */
  async assertGroupExists(groupId: number): Promise<void> {
    await expect(this.getGroupHeaderById(groupId)).toBeVisible();
  }

  /**
   * Assert that a group has a specific name
   */
  async assertGroupName(groupId: number, expectedName: string): Promise<void> {
    await expect(this.getGroupName(groupId)).toContainText(expectedName);
  }

  /**
   * Get delete group dialog
   */
  getDeleteGroupDialog(): DeleteGroupDialog {
    return new DeleteGroupDialog(this.page);
  }

  /**
   * Delete a group via menu
   */
  async deleteGroupViaMenu(groupId: number): Promise<DeleteGroupDialog> {
    await this.openGroupMenu(groupId);
    await this.page.getByRole('menuitem', { name: 'Delete Group' }).click();
    const dialog = this.getDeleteGroupDialog();
    await dialog.waitForOpen();
    return dialog;
  }

  // ========== BUDGET DRAG-AND-DROP ==========

  /**
   * Get a budget's drag handle
   */
  getBudgetDragHandle(budgetId: number): Locator {
    return this.byQa(`budget-drag-${budgetId}`);
  }

  /**
   * Get the budget names in display order
   * Reads all budget rows from the table
   */
  async getBudgetNamesInOrder(): Promise<string[]> {
    const rows = this.budgetTable.locator('[data-qa^="budget-row-"]');
    const count = await rows.count();
    const names: string[] = [];

    for (let index = 0; index < count; index++) {
      const row = rows.nth(index);
      const nameCell = row.locator('td:nth-child(2)');
      const name = await nameCell.textContent();
      if (name) {
        // Remove any badge text like "Expired"
        names.push(name.replace('Expired', '').trim());
      }
    }

    return names;
  }

  /**
   * Get budget IDs in display order from data-qa attributes
   */
  async getBudgetIdsInOrder(): Promise<number[]> {
    const rows = this.budgetTable.locator('[data-qa^="budget-row-"]');
    const count = await rows.count();
    const ids: number[] = [];

    for (let index = 0; index < count; index++) {
      const row = rows.nth(index);
      const qaAttribute = await row.getAttribute('data-qa');
      if (qaAttribute) {
        const id = Number.parseInt(qaAttribute.replace('budget-row-', ''), 10);
        if (!Number.isNaN(id)) {
          ids.push(id);
        }
      }
    }

    return ids;
  }

  /**
   * Drag a budget to a new position using the drag handle
   * Note: Playwright doesn't fully support native drag-drop with dnd-kit,
   * so we use mouse events to simulate the drag
   */
  async dragBudgetToPosition(
    budgetId: number,
    targetBudgetId: number
  ): Promise<void> {
    const sourceHandle = this.getBudgetDragHandle(budgetId);
    const targetRow = this.getBudgetRowById(targetBudgetId);

    // Get bounding boxes
    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await targetRow.boundingBox();

    if (!sourceBox || !targetBox) {
      throw new Error('Could not get bounding boxes for drag operation');
    }

    // Calculate center points
    const sourceCenter = {
      x: sourceBox.x + sourceBox.width / 2,
      y: sourceBox.y + sourceBox.height / 2,
    };
    const targetCenter = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    };

    // Perform drag operation
    await this.page.mouse.move(sourceCenter.x, sourceCenter.y);
    await this.page.mouse.down();
    await this.page.mouse.move(targetCenter.x, targetCenter.y, { steps: 10 });
    await this.page.mouse.up();

    // Wait for any animations to complete
    await this.page.waitForTimeout(300);
  }
}

/**
 * Delete Group Dialog
 */
class DeleteGroupDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'dialog-delete-group');
  }

  async confirm(): Promise<void> {
    await this.clickButton('btn-delete-group-confirm');
    await this.waitForClose();
  }

  async cancel(): Promise<void> {
    await this.clickButton('btn-delete-group-cancel');
    await this.waitForClose();
  }
}

/**
 * Move Funds Dialog
 */
class MoveFundsDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'sheet-move-funds');
  }

  async selectSourceBudget(budgetName: string): Promise<void> {
    await this.searchAndSelectOption('select-source-budget', budgetName, budgetName);
  }

  async selectDestinationBudget(budgetName: string): Promise<void> {
    await this.searchAndSelectOption('select-dest-budget', budgetName, budgetName);
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
    super(page, 'sheet-create-budget');
  }

  async fillName(name: string): Promise<void> {
    await this.fillInput('input-budget-name', name);
  }

  async fillTargetAmount(amount: string): Promise<void> {
    await this.fillInput('input-target-amount', amount);
  }

  async fillCadence(count: string, unit: string): Promise<void> {
    await this.fillInput('input-cadence-count', count);
    await this.selectOption('select-cadence-unit', unit);
  }

  async fillTargetDate(date: string): Promise<void> {
    await this.fillInput('input-target-date', date);
  }

  async fillCap(amount: string): Promise<void> {
    await this.fillInput('input-cap', amount);
  }

  get startDateInput(): Locator {
    return this.getInput('input-start-date');
  }

  get endDateInput(): Locator {
    return this.getInput('input-end-date');
  }

  async fillStartDate(date: string): Promise<void> {
    await this.fillInput('input-start-date', date);
  }

  async fillEndDate(date: string): Promise<void> {
    await this.fillInput('input-end-date', date);
  }

  /**
   * Check that there is no type selector in the create form
   */
  async hasNoTypeSelector(): Promise<boolean> {
    const typeSelectors = this.locator.locator('[data-qa*="type"], [data-qa*="budget-type"]');
    return (await typeSelectors.count()) === 0;
  }
}

/**
 * Edit Budget Dialog
 */
class EditBudgetDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'sheet-edit-budget');
  }

  // ========== READ-ONLY SECTION ==========

  /**
   * Get the read-only settings section
   */
  get readOnlySection(): Locator {
    return this.getInput('readonly-settings');
  }

  /**
   * Get the full text of the read-only section
   */
  async getReadOnlyText(): Promise<string> {
    return (await this.readOnlySection.textContent()) ?? '';
  }

  /**
   * Get the currency display value
   */
  async getCurrencyDisplay(): Promise<string> {
    const rows = this.readOnlySection.locator('.flex.justify-between');
    const count = await rows.count();
    for (let index = 0; index < count; index++) {
      const text = (await rows.nth(index).textContent()) ?? '';
      if (text.includes('Currency:')) {
        return (await rows.nth(index).locator('.font-medium').textContent()) ?? '';
      }
    }
    return '';
  }

  /**
   * Get the cadence display value
   */
  async getCadenceDisplay(): Promise<string> {
    const rows = this.readOnlySection.locator('.flex.justify-between');
    const count = await rows.count();
    for (let index = 0; index < count; index++) {
      const text = (await rows.nth(index).textContent()) ?? '';
      if (text.includes('Cadence:')) {
        return (await rows.nth(index).locator('.font-medium').textContent()) ?? '';
      }
    }
    return '';
  }

  /**
   * Get the start date display value
   */
  async getStartDateDisplay(): Promise<string> {
    const rows = this.readOnlySection.locator('.flex.justify-between');
    const count = await rows.count();
    for (let index = 0; index < count; index++) {
      const text = (await rows.nth(index).textContent()) ?? '';
      if (text.includes('Start Date:')) {
        return (await rows.nth(index).locator('.font-medium').textContent()) ?? '';
      }
    }
    return '';
  }

  /**
   * Get the target date display value (if shown)
   */
  async getTargetDateDisplay(): Promise<string> {
    const rows = this.readOnlySection.locator('.flex.justify-between');
    const count = await rows.count();
    for (let index = 0; index < count; index++) {
      const text = (await rows.nth(index).textContent()) ?? '';
      if (text.includes('Target Date:')) {
        return (await rows.nth(index).locator('.font-medium').textContent()) ?? '';
      }
    }
    return '';
  }

  // ========== EDITABLE FIELDS ==========

  async fillName(name: string): Promise<void> {
    await this.fillInput('input-name', name);
  }

  async fillTargetAmount(amount: string): Promise<void> {
    await this.fillInput('input-target-amount', amount);
  }

  async fillCap(amount: string): Promise<void> {
    await this.fillInput('input-cap', amount);
  }

  get endDateInput(): Locator {
    return this.getInput('input-end-date');
  }

  async fillEndDate(date: string): Promise<void> {
    await this.fillInput('input-end-date', date);
  }

  async clearEndDate(): Promise<void> {
    const input = this.getInput('input-end-date');
    await input.fill('');
  }

  /**
   * Get the end date min attribute value
   */
  async getEndDateMin(): Promise<string> {
    return (await this.endDateInput.getAttribute('min')) ?? '';
  }

  /**
   * Check if the target change note is visible
   */
  get targetChangeNote(): Locator {
    return this.locator.locator('.text-blue-600, .text-blue-400');
  }

  async getTargetChangeNoteText(): Promise<string> {
    if (await this.targetChangeNote.isVisible()) {
      return (await this.targetChangeNote.textContent()) ?? '';
    }
    return '';
  }

  // ========== ASSERTIONS ==========

  /**
   * Verify that structural fields are not editable inputs
   */
  async assertStructuralFieldsReadOnly(): Promise<boolean> {
    const readOnlyText = await this.getReadOnlyText();
    return readOnlyText.includes('Currency:') && readOnlyText.includes('Start Date:');
  }

  /**
   * Verify cadence fields are not editable inputs in the edit dialog
   */
  async hasNoCadenceInputs(): Promise<boolean> {
    const cadenceCountInput = this.locator.locator('[data-qa="input-cadence-count"]');
    const cadenceUnitSelect = this.locator.locator('[data-qa="select-cadence-unit"]');
    return (await cadenceCountInput.count()) === 0 && (await cadenceUnitSelect.count()) === 0;
  }
}
