import { type Page } from '@playwright/test';

/**
 * Reusable Inline Editor component for E2E tests
 * Handles inline editing patterns (click to edit, enter value, save/cancel)
 */
export class InlineEditor {
  constructor(private readonly page: Page) {}

  /**
   * Edit a value inline
   * 1. Click the display element to enter edit mode
   * 2. Clear and type new value
   * 3. Save the change
   *
   * @param displayQa - data-qa of the clickable display element
   * @param inputQa - data-qa of the input field that appears in edit mode
   * @param newValue - the new value to enter
   * @param saveQa - optional data-qa of save button (if not provided, presses Enter)
   */
  async edit(
    displayQa: string,
    inputQa: string,
    newValue: string,
    saveQa?: string
  ): Promise<void> {
    // Click to enter edit mode
    await this.page.locator(`[data-qa="${displayQa}"]`).click();

    // Wait for input to be visible
    const input = this.page.locator(`[data-qa="${inputQa}"]`);
    await input.waitFor({ state: 'visible' });

    // Clear and enter new value
    await input.fill(newValue);

    // Save
    if (saveQa) {
      await this.page.locator(`[data-qa="${saveQa}"]`).click();
    } else {
      await input.press('Enter');
    }
  }

  /**
   * Cancel an inline edit
   *
   * @param displayQa - data-qa of the clickable display element
   * @param inputQa - data-qa of the input field
   * @param cancelQa - optional data-qa of cancel button (if not provided, presses Escape)
   */
  async cancel(displayQa: string, inputQa: string, cancelQa?: string): Promise<void> {
    // Click to enter edit mode if not already
    const input = this.page.locator(`[data-qa="${inputQa}"]`);
    const isEditing = await input.isVisible();

    if (!isEditing) {
      await this.page.locator(`[data-qa="${displayQa}"]`).click();
      await input.waitFor({ state: 'visible' });
    }

    // Cancel
    if (cancelQa) {
      await this.page.locator(`[data-qa="${cancelQa}"]`).click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  /**
   * Get the current display value before editing
   */
  async getDisplayValue(displayQa: string): Promise<string> {
    return (await this.page.locator(`[data-qa="${displayQa}"]`).textContent()) ?? '';
  }

  /**
   * Check if currently in edit mode
   */
  async isEditing(inputQa: string): Promise<boolean> {
    return this.page.locator(`[data-qa="${inputQa}"]`).isVisible();
  }
}
