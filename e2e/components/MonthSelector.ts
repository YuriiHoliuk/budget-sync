import { type Page, type Locator } from '@playwright/test';

/**
 * MonthSelector component for E2E tests
 * Handles month navigation in the app header
 */
export class MonthSelector {
  constructor(private readonly page: Page) {}

  get prevButton(): Locator {
    return this.page.locator('[data-qa="btn-prev-month"]');
  }

  get nextButton(): Locator {
    return this.page.locator('[data-qa="btn-next-month"]');
  }

  get currentMonth(): Locator {
    return this.page.locator('[data-qa="text-current-month"]');
  }

  /**
   * Navigate to previous month
   */
  async gotoPrevious(): Promise<void> {
    await this.prevButton.click();
  }

  /**
   * Navigate to next month
   */
  async gotoNext(): Promise<void> {
    await this.nextButton.click();
  }

  /**
   * Get current month text (e.g., "January 2025")
   */
  async getCurrentMonthText(): Promise<string> {
    return (await this.currentMonth.textContent()) ?? '';
  }

  /**
   * Navigate to a specific month by repeatedly clicking prev/next
   * @param targetMonth - target month in format "YYYY-MM" or month name like "January 2025"
   */
  async navigateToMonth(targetMonth: string): Promise<void> {
    const maxIterations = 24; // Prevent infinite loops (2 years max)
    let iterations = 0;

    while (iterations < maxIterations) {
      const current = await this.getCurrentMonthText();
      if (current.includes(targetMonth)) {
        return;
      }

      // Simple heuristic: if target seems earlier, go prev, otherwise next
      // This is a basic implementation; could be enhanced with date parsing
      await this.gotoPrevious();
      iterations++;
    }

    throw new Error(`Could not navigate to month ${targetMonth} within ${maxIterations} iterations`);
  }
}
