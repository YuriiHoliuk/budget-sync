import { type Page, type Locator } from '@playwright/test';

/**
 * Reusable Table component for E2E tests
 * Provides common table operations like row selection, sorting
 */
export class Table {
  private readonly tableLocator: Locator;

  constructor(
    private readonly page: Page,
    qaAttribute: string
  ) {
    this.tableLocator = page.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Get the table locator
   */
  get locator(): Locator {
    return this.tableLocator;
  }

  /**
   * Get all rows in the table body
   */
  get rows(): Locator {
    return this.tableLocator.locator('tbody tr');
  }

  /**
   * Get row count
   */
  async getRowCount(): Promise<number> {
    return this.rows.count();
  }

  /**
   * Get a specific row by index (0-based)
   */
  getRow(index: number): Locator {
    return this.rows.nth(index);
  }

  /**
   * Get a row by data-qa attribute
   */
  getRowByQa(qaAttribute: string): Locator {
    return this.tableLocator.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Click on a column header to sort
   */
  async sortByColumn(headerQa: string): Promise<void> {
    await this.page.locator(`[data-qa="${headerQa}"]`).click();
  }

  /**
   * Get cell text from a specific row and column
   */
  async getCellText(rowQa: string, cellQa: string): Promise<string> {
    const cell = this.tableLocator.locator(`[data-qa="${rowQa}"] [data-qa="${cellQa}"]`);
    return (await cell.textContent()) ?? '';
  }

  /**
   * Check if the table is empty (has no rows)
   */
  async isEmpty(): Promise<boolean> {
    const count = await this.getRowCount();
    return count === 0;
  }

  /**
   * Wait for table to have at least one row
   */
  async waitForRows(timeout = 10000): Promise<void> {
    await this.rows.first().waitFor({ state: 'visible', timeout });
  }
}
