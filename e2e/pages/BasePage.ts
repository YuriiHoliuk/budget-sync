import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Base Page Object class with common selectors and utilities
 * All page objects extend this class
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigate to this page's URL
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  /**
   * URL path for this page (override in subclasses)
   */
  protected get url(): string {
    return '/';
  }

  /**
   * Wait for page to be fully loaded
   * Override in subclasses for page-specific loading indicators
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get element by data-qa attribute
   */
  byQa(qaAttribute: string): Locator {
    return this.page.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Assert that the page URL matches expected
   */
  async assertUrl(): Promise<void> {
    await expect(this.page).toHaveURL(this.url);
  }

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    const heading = this.page.getByRole('heading', { level: 1 });
    const text = await heading.textContent();
    return text ?? '';
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(qaAttribute: string, timeout = 10000): Promise<void> {
    await this.byQa(qaAttribute).waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for an element to be hidden
   */
  async waitForElementHidden(qaAttribute: string, timeout = 10000): Promise<void> {
    await this.byQa(qaAttribute).waitFor({ state: 'hidden', timeout });
  }

  /**
   * Check if an element is visible
   */
  async isVisible(qaAttribute: string): Promise<boolean> {
    return this.byQa(qaAttribute).isVisible();
  }

  // Common navigation elements
  get sidebar() {
    return {
      budgetLink: this.byQa('nav-budget'),
      accountsLink: this.byQa('nav-accounts'),
      transactionsLink: this.byQa('nav-transactions'),
      categoriesLink: this.byQa('nav-categories'),
      settingsLink: this.byQa('nav-settings'),
      logoutButton: this.byQa('btn-logout'),
    };
  }

  get monthSelector() {
    return {
      prevButton: this.byQa('btn-prev-month'),
      nextButton: this.byQa('btn-next-month'),
      currentMonth: this.byQa('text-current-month'),
    };
  }

  /**
   * Navigate to previous month
   */
  async goToPreviousMonth(): Promise<void> {
    await this.monthSelector.prevButton.click();
  }

  /**
   * Navigate to next month
   */
  async goToNextMonth(): Promise<void> {
    await this.monthSelector.nextButton.click();
  }

  /**
   * Get current month text
   */
  async getCurrentMonth(): Promise<string> {
    return (await this.monthSelector.currentMonth.textContent()) ?? '';
  }

  /**
   * Navigate to a specific page via sidebar
   */
  async navigateTo(page: 'budget' | 'accounts' | 'transactions' | 'categories' | 'settings'): Promise<void> {
    const links = {
      budget: this.sidebar.budgetLink,
      accounts: this.sidebar.accountsLink,
      transactions: this.sidebar.transactionsLink,
      categories: this.sidebar.categoriesLink,
      settings: this.sidebar.settingsLink,
    };
    await links[page].click();
  }
}
