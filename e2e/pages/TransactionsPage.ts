import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Transactions Page Object
 * Shows transaction list with filtering and pagination
 */
export class TransactionsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  protected get url(): string {
    return '/transactions';
  }

  // ========== FILTERS ==========

  get searchInput(): Locator {
    return this.byQa('input-search');
  }

  get filtersSidebar(): Locator {
    return this.byQa('filters-sidebar');
  }

  get clearFiltersButton(): Locator {
    return this.byQa('btn-clear-filters');
  }

  get applyFiltersButton(): Locator {
    return this.byQa('btn-apply-filters');
  }

  get resetFiltersButton(): Locator {
    return this.byQa('btn-reset-filters');
  }

  get activeFiltersBadge(): Locator {
    return this.byQa('badge-active-filters');
  }

  /**
   * Search for transactions by description and apply
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for debounce (300ms) to update draft filters
    await this.page.waitForTimeout(400);
    await this.applyFilters();
  }

  /**
   * Apply draft filters
   */
  async applyFilters(): Promise<void> {
    await this.applyFiltersButton.click();
  }

  /**
   * Reset all filters
   */
  async clearFilters(): Promise<void> {
    await this.resetFiltersButton.click();
  }

  /**
   * Get number of active filters
   */
  async getActiveFilterCount(): Promise<number> {
    if (await this.activeFiltersBadge.isVisible()) {
      const text = await this.activeFiltersBadge.textContent();
      return parseInt(text ?? '0', 10);
    }
    return 0;
  }

  /**
   * Filter by account and apply
   */
  async filterByAccount(accountName: string): Promise<void> {
    await this.byQa('select-account-filter').click();
    await this.page.getByRole('option', { name: accountName }).click();
    await this.applyFilters();
  }

  /**
   * Filter by category and apply (uses searchable combobox)
   */
  async filterByCategory(categoryName: string): Promise<void> {
    await this.byQa('select-category-filter').click();
    const searchInput = this.page.locator('[cmdk-input]');
    await searchInput.fill(categoryName);
    await this.page.locator('[cmdk-item]').filter({ hasText: categoryName }).first().click();
    await this.applyFilters();
  }

  /**
   * Filter by budget and apply (uses searchable combobox)
   */
  async filterByBudget(budgetName: string): Promise<void> {
    await this.byQa('select-budget-filter').click();
    const searchInput = this.page.locator('[cmdk-input]');
    await searchInput.fill(budgetName);
    await this.page.locator('[cmdk-item]').filter({ hasText: budgetName }).first().click();
    await this.applyFilters();
  }

  /**
   * Filter by transaction type and apply
   */
  async filterByType(type: 'Income' | 'Expense'): Promise<void> {
    await this.byQa('select-type-filter').click();
    await this.page.getByRole('option', { name: type }).click();
    await this.applyFilters();
  }

  /**
   * Filter by status and apply
   */
  async filterByStatus(status: 'Pending' | 'Categorized' | 'Verified'): Promise<void> {
    await this.byQa('select-status-filter').click();
    await this.page.getByRole('option', { name: status }).click();
    await this.applyFilters();
  }

  // ========== TABLE ==========

  get table(): Locator {
    return this.byQa('transactions-table');
  }

  get rows(): Locator {
    return this.table.locator('tbody tr');
  }

  /**
   * Get transaction row by ID
   */
  getRowById(transactionId: number): Locator {
    return this.byQa(`transaction-row-${transactionId}`);
  }

  /**
   * Get transaction row by description text
   */
  getRowByDescription(description: string): Locator {
    return this.rows.filter({ hasText: description });
  }

  /**
   * Get row count
   */
  async getRowCount(): Promise<number> {
    return this.rows.count();
  }

  /**
   * Check if table is empty
   */
  async isEmpty(): Promise<boolean> {
    return this.byQa('text-no-transactions').isVisible();
  }

  /**
   * Click on a transaction row to select it
   */
  async selectTransaction(transactionId: number): Promise<void> {
    await this.getRowById(transactionId).click();
  }

  /**
   * Get transaction amount
   */
  async getAmount(transactionId: number): Promise<string> {
    return (await this.byQa(`transaction-amount-${transactionId}`).textContent()) ?? '';
  }

  /**
   * Get transaction status
   */
  async getStatus(transactionId: number): Promise<string> {
    return (await this.byQa(`transaction-status-${transactionId}`).textContent()) ?? '';
  }

  // ========== EDITING ==========

  /**
   * Change transaction category
   */
  async changeCategory(transactionId: number, categoryName: string): Promise<void> {
    // Click the category cell to open dropdown
    const categoryCell = this.byQa(`transaction-category-${transactionId}`);
    const addButton = this.byQa(`btn-add-category-${transactionId}`);

    if (await addButton.isVisible()) {
      await addButton.click();
    } else {
      await categoryCell.click();
    }

    // Select from dropdown
    await this.page.getByRole('option', { name: categoryName }).click();
  }

  /**
   * Change transaction budget
   */
  async changeBudget(transactionId: number, budgetName: string): Promise<void> {
    const budgetCell = this.byQa(`transaction-budget-${transactionId}`);
    const addButton = this.byQa(`btn-add-budget-${transactionId}`);

    if (await addButton.isVisible()) {
      await addButton.click();
    } else {
      await budgetCell.click();
    }

    await this.page.getByRole('option', { name: budgetName }).click();
  }

  /**
   * Verify a transaction
   */
  async verifyTransaction(transactionId: number): Promise<void> {
    await this.byQa(`btn-verify-${transactionId}`).click();
  }

  // ========== PAGINATION ==========

  get paginationInfo(): Locator {
    return this.byQa('text-pagination-info');
  }

  get paginationPrev(): Locator {
    return this.byQa('btn-pagination-previous');
  }

  get paginationNext(): Locator {
    return this.byQa('btn-pagination-next');
  }

  get paginationPage(): Locator {
    return this.byQa('text-pagination-page');
  }

  /**
   * Navigate directly to a specific page via URL
   */
  async gotoPage(pageNumber: number): Promise<void> {
    const url = pageNumber <= 1
      ? '/transactions'
      : `/transactions?page=${pageNumber}`;
    await this.page.goto(url);
    await this.waitForLoad();
  }

  /**
   * Go to next page
   */
  async nextPage(): Promise<void> {
    await this.paginationNext.click();
  }

  /**
   * Go to previous page
   */
  async prevPage(): Promise<void> {
    await this.paginationPrev.click();
  }

  /**
   * Get current page info
   */
  async getCurrentPage(): Promise<string> {
    return (await this.paginationPage.textContent()) ?? '';
  }

  /**
   * Check if next page is available
   */
  async hasNextPage(): Promise<boolean> {
    return this.paginationNext.isEnabled();
  }

  /**
   * Check if previous page is available
   */
  async hasPrevPage(): Promise<boolean> {
    return this.paginationPrev.isEnabled();
  }

  // ========== CREATE TRANSACTION ==========

  get addTransactionButton(): Locator {
    return this.byQa('btn-add-transaction');
  }

  get createTransactionSheet(): Locator {
    return this.byQa('sheet-create-transaction');
  }

  /**
   * Open the create transaction sheet
   */
  async openCreateTransaction(): Promise<void> {
    await this.addTransactionButton.click();
    await this.createTransactionSheet.waitFor({ state: 'visible' });
  }

  /**
   * Fill and submit the create transaction form
   */
  async createTransaction(options: {
    account: string;
    amount: string;
    description: string;
    type?: 'Expense' | 'Income';
    date?: string;
    counterparty?: string;
    notes?: string;
  }): Promise<void> {
    await this.openCreateTransaction();

    // Select account
    await this.createTransactionSheet.locator('[data-qa="select-tx-account"]').click();
    await this.page.getByRole('option', { name: options.account }).click();

    // Set date if provided
    if (options.date) {
      await this.createTransactionSheet.locator('[data-qa="input-tx-date"]').fill(options.date);
    }

    // Set amount
    await this.createTransactionSheet.locator('[data-qa="input-tx-amount"]').fill(options.amount);

    // Set type if not default (Expense)
    if (options.type === 'Income') {
      await this.createTransactionSheet.locator('[data-qa="select-tx-type"]').click();
      await this.page.getByRole('option', { name: 'Income' }).click();
    }

    // Set description
    await this.createTransactionSheet.locator('[data-qa="input-tx-description"]').fill(options.description);

    // Set counterparty if provided
    if (options.counterparty) {
      await this.createTransactionSheet.locator('[data-qa="input-tx-counterparty"]').fill(options.counterparty);
    }

    // Set notes if provided
    if (options.notes) {
      await this.createTransactionSheet.locator('[data-qa="input-tx-notes"]').fill(options.notes);
    }

    // Submit
    await this.createTransactionSheet.locator('[data-qa="btn-create-transaction"]').click();

    // Wait for sheet to close
    await this.createTransactionSheet.waitFor({ state: 'hidden' });
  }

  // ========== DETAIL PANEL ==========

  /**
   * Wait for the transaction detail panel (sheet) to open
   */
  async waitForDetailPanel(): Promise<void> {
    await this.page.locator('[role="dialog"]').first().waitFor({ state: 'visible' });
  }

  /**
   * Wait for the transaction detail panel (sheet) to close
   */
  async waitForDetailPanelClosed(): Promise<void> {
    await this.page.locator('[role="dialog"]').first().waitFor({ state: 'hidden' });
  }

  // ========== RETURNING FLOW ==========

  /**
   * Click "Mark as Returning" button in the detail panel.
   * The detail panel must already be open on a credit transaction.
   */
  async clickMarkAsReturning(): Promise<void> {
    await this.byQa('btn-mark-as-returning').click();
  }

  /**
   * Click "Has Returning" button in the detail panel.
   * The detail panel must already be open on a debit transaction without
   * existing returning info.
   */
  async clickMarkAsHasReturning(): Promise<void> {
    await this.byQa('btn-mark-as-has-returning').click();
  }

  /**
   * Get the returning selection banner element
   */
  get returningSelectionBanner(): Locator {
    return this.byQa('returning-selection-banner');
  }

  /**
   * Cancel the returning selection via the banner's Cancel button
   */
  async cancelReturningSelection(): Promise<void> {
    await this.byQa('btn-cancel-returning-selection').click();
  }

  /**
   * Get the returning confirmation dialog element
   */
  get returningConfirmationDialog(): Locator {
    return this.byQa('dialog-returning-confirmation');
  }

  /**
   * Confirm the returning in the confirmation dialog
   */
  async confirmReturning(): Promise<void> {
    await this.byQa('btn-returning-confirm').click();
  }

  /**
   * Click the Done button in the returning selection banner once one or more
   * compatible rows have been toggled on. Opens the confirmation dialog.
   */
  async clickReturningDone(): Promise<void> {
    await this.byQa('btn-returning-done').click();
  }

  /**
   * Cancel the returning in the confirmation dialog
   */
  async cancelReturningConfirmation(): Promise<void> {
    await this.byQa('btn-returning-cancel').click();
  }

  // ========== SPLIT FLOW ==========

  /**
   * Click the "Split Transaction" button in the detail panel.
   * The detail panel must already be open.
   */
  async clickSplitButton(): Promise<void> {
    await this.byQa('btn-split-transaction').click();
  }

  /**
   * Get the split transaction form locator
   */
  get splitForm(): Locator {
    return this.byQa('split-transaction-form');
  }

  /**
   * Fill a split part row in the split form
   */
  async fillSplitPart(
    index: number,
    options: { amount?: string; description?: string },
  ): Promise<void> {
    if (options.amount !== undefined) {
      await this.byQa(`input-split-amount-${index}`).fill(options.amount);
    }
    if (options.description !== undefined) {
      await this.byQa(`input-split-description-${index}`).fill(options.description);
    }
  }

  /**
   * Click "Add another split" button
   */
  async addSplitPart(): Promise<void> {
    await this.byQa('btn-add-split-part').click();
  }

  /**
   * Submit the split form
   */
  async submitSplit(): Promise<void> {
    await this.byQa('btn-split-submit').click();
  }

  /**
   * Cancel the split form
   */
  async cancelSplit(): Promise<void> {
    await this.byQa('btn-split-cancel').click();
  }

  /**
   * Get the split group section locator (visible when transaction has siblings)
   */
  get splitGroup(): Locator {
    return this.byQa('split-group');
  }

  /**
   * Get sibling transaction items in the split group section
   */
  getSiblingItem(index: number): Locator {
    return this.byQa(`sibling-item-${index}`);
  }

  /**
   * Get the description text of a sibling item
   */
  async getSiblingDescription(index: number): Promise<string> {
    return (await this.byQa(`sibling-description-${index}`).textContent()) ?? '';
  }

  /**
   * Get the amount text of a sibling item
   */
  async getSiblingAmount(index: number): Promise<string> {
    return (await this.byQa(`sibling-amount-${index}`).textContent()) ?? '';
  }

  /**
   * Click "Join" button on a specific sibling item
   */
  async clickJoinOnSibling(index: number): Promise<void> {
    await this.byQa(`btn-join-sibling-${index}`).click();
  }

  // ========== JOIN FLOW ==========

  /**
   * Get the join confirmation dialog locator
   */
  get joinConfirmationDialog(): Locator {
    return this.byQa('dialog-join-confirmation');
  }

  /**
   * Confirm the join in the confirmation dialog
   */
  async confirmJoin(): Promise<void> {
    await this.byQa('btn-join-confirm').click();
  }

  /**
   * Cancel the join in the confirmation dialog
   */
  async cancelJoin(): Promise<void> {
    await this.byQa('btn-join-cancel').click();
  }

  /**
   * Get the detail panel amount text
   */
  async getDetailPanelAmount(): Promise<string> {
    return (await this.byQa('detail-panel-amount').textContent()) ?? '';
  }

  // ========== ASSERTIONS ==========

  /**
   * Assert transaction exists in table
   */
  async assertTransactionExists(description: string): Promise<void> {
    await expect(this.getRowByDescription(description)).toBeVisible();
  }

  /**
   * Assert transaction has specific status
   */
  async assertTransactionStatus(transactionId: number, status: string): Promise<void> {
    await expect(this.byQa(`transaction-status-${transactionId}`)).toContainText(status);
  }

  /**
   * Assert row count
   */
  async assertRowCount(expectedCount: number): Promise<void> {
    await expect(this.rows).toHaveCount(expectedCount);
  }
}
