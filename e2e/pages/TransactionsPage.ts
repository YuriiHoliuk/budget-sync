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

  get filtersButton(): Locator {
    return this.byQa('btn-filters');
  }

  get clearFiltersButton(): Locator {
    return this.byQa('btn-clear-filters');
  }

  get activeFiltersBadge(): Locator {
    return this.byQa('badge-active-filters');
  }

  /**
   * Search for transactions by description
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  /**
   * Open filters popover
   */
  async openFilters(): Promise<void> {
    await this.filtersButton.click();
  }

  /**
   * Clear all filters
   */
  async clearFilters(): Promise<void> {
    if (await this.clearFiltersButton.isVisible()) {
      await this.clearFiltersButton.click();
    }
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
   * Filter by account
   */
  async filterByAccount(accountName: string): Promise<void> {
    await this.openFilters();
    await this.byQa('select-account-filter').click();
    await this.page.getByRole('option', { name: accountName }).click();
    await this.page.keyboard.press('Escape'); // Close popover
  }

  /**
   * Filter by category
   */
  async filterByCategory(categoryName: string): Promise<void> {
    await this.openFilters();
    await this.byQa('select-category-filter').click();
    await this.page.getByRole('option', { name: categoryName }).click();
    await this.page.keyboard.press('Escape');
  }

  /**
   * Filter by budget
   */
  async filterByBudget(budgetName: string): Promise<void> {
    await this.openFilters();
    await this.byQa('select-budget-filter').click();
    await this.page.getByRole('option', { name: budgetName }).click();
    await this.page.keyboard.press('Escape');
  }

  /**
   * Filter by transaction type
   */
  async filterByType(type: 'Income' | 'Expense'): Promise<void> {
    await this.openFilters();
    await this.byQa('select-type-filter').click();
    await this.page.getByRole('option', { name: type }).click();
    await this.page.keyboard.press('Escape');
  }

  /**
   * Filter by status
   */
  async filterByStatus(status: 'Pending' | 'Categorized' | 'Verified'): Promise<void> {
    await this.openFilters();
    await this.byQa('select-status-filter').click();
    await this.page.getByRole('option', { name: status }).click();
    await this.page.keyboard.press('Escape');
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
