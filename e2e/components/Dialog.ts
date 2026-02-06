import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Reusable Dialog component for E2E tests
 * Provides common dialog operations like open/close, form submission
 */
export class Dialog {
  private readonly dialogLocator: Locator;

  constructor(
    private readonly page: Page,
    qaAttribute: string
  ) {
    this.dialogLocator = page.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Get the dialog locator
   */
  get locator(): Locator {
    return this.dialogLocator;
  }

  /**
   * Check if dialog is visible
   */
  async isOpen(): Promise<boolean> {
    return this.dialogLocator.isVisible();
  }

  /**
   * Wait for dialog to be visible
   */
  async waitForOpen(timeout = 10000): Promise<void> {
    await this.dialogLocator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for dialog to be hidden
   */
  async waitForClose(timeout = 10000): Promise<void> {
    await this.dialogLocator.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Get an input field within the dialog by data-qa
   */
  getInput(qaAttribute: string): Locator {
    return this.dialogLocator.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Fill a text input field
   */
  async fillInput(qaAttribute: string, value: string): Promise<void> {
    await this.getInput(qaAttribute).fill(value);
  }

  /**
   * Get a select element within the dialog
   */
  getSelect(qaAttribute: string): Locator {
    return this.dialogLocator.locator(`[data-qa="${qaAttribute}"]`);
  }

  /**
   * Select an option from a select element
   * Note: For ShadCN Select, this clicks the trigger and then the option
   */
  async selectOption(qaAttribute: string, optionText: string): Promise<void> {
    const trigger = this.getSelect(qaAttribute);
    await trigger.click();
    // ShadCN Select uses a portal, so we need to look in the page
    await this.page.getByRole('option', { name: optionText }).click();
  }

  /**
   * Click a button within the dialog by data-qa
   */
  async clickButton(qaAttribute: string): Promise<void> {
    await this.dialogLocator.locator(`[data-qa="${qaAttribute}"]`).click();
  }

  /**
   * Submit the dialog form (clicks the primary action button)
   */
  async submit(): Promise<void> {
    // Look for common submit button patterns
    const submitButton = this.dialogLocator.locator('button[type="submit"], [data-qa*="submit"], [data-qa*="save"], [data-qa*="confirm"]').first();
    await submitButton.click();
  }

  /**
   * Cancel the dialog (clicks the cancel button)
   */
  async cancel(): Promise<void> {
    const cancelButton = this.dialogLocator.locator('[data-qa*="cancel"]').first();
    await cancelButton.click();
  }

  /**
   * Close dialog using the X button or escape key
   */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.waitForClose();
  }

  /**
   * Assert dialog title
   */
  async assertTitle(expectedTitle: string): Promise<void> {
    const title = this.dialogLocator.getByRole('heading');
    await expect(title).toContainText(expectedTitle);
  }

  /**
   * Get error message text within the dialog
   */
  async getErrorMessage(): Promise<string> {
    const errorElement = this.dialogLocator.locator('[data-qa*="error"], .text-destructive, [role="alert"]').first();
    if (await errorElement.isVisible()) {
      return (await errorElement.textContent()) ?? '';
    }
    return '';
  }
}
