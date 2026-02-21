import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { Dialog } from '../components/Dialog';

/**
 * Page object for the Settings page (/settings)
 * Handles interactions with categorization and budgetization rule sections.
 */
export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  protected get url(): string {
    return '/settings';
  }

  // --- Section locators ---

  private section(type: 'categorization' | 'budgetization') {
    return this.byQa(`rules-section-${type}`);
  }

  // --- Rule rows ---

  getRuleRows(type: 'categorization' | 'budgetization') {
    return this.section(type).locator('[data-qa="rule-row"]');
  }

  async getRuleCount(type: 'categorization' | 'budgetization'): Promise<number> {
    return this.getRuleRows(type).count();
  }

  async getRuleTexts(type: 'categorization' | 'budgetization'): Promise<string[]> {
    const rows = this.getRuleRows(type);
    const count = await rows.count();
    const texts: string[] = [];
    for (let index = 0; index < count; index++) {
      const text = await rows.nth(index).locator('td').nth(1).textContent();
      texts.push(text?.trim() ?? '');
    }
    return texts;
  }

  async assertRuleExists(type: 'categorization' | 'budgetization', ruleText: string): Promise<void> {
    const row = this.section(type).locator('[data-qa="rule-row"]', { hasText: ruleText });
    await expect(row).toBeVisible();
  }

  async assertRuleNotExists(type: 'categorization' | 'budgetization', ruleText: string): Promise<void> {
    const row = this.section(type).locator('[data-qa="rule-row"]', { hasText: ruleText });
    await expect(row).toBeHidden();
  }

  async assertEmptyState(type: 'categorization' | 'budgetization'): Promise<void> {
    const emptyMessage = this.section(type).locator('.border-dashed');
    await expect(emptyMessage).toBeVisible();
  }

  // --- Create rule ---

  async openCreateRuleSheet(type: 'categorization' | 'budgetization'): Promise<Dialog> {
    await this.section(type).locator('[data-qa="btn-add-rule"]').click();
    const sheet = new Dialog(this.page, 'sheet-create-rule');
    await sheet.waitForOpen();
    return sheet;
  }

  async createRule(type: 'categorization' | 'budgetization', ruleText: string, priority?: number): Promise<void> {
    const sheet = await this.openCreateRuleSheet(type);
    await sheet.fillInput('input-rule-text', ruleText);
    if (priority !== undefined) {
      await sheet.fillInput('input-rule-priority', String(priority));
    }
    await sheet.clickButton('btn-rule-submit');
    await sheet.waitForClose();
  }

  // --- Edit rule ---

  async openRuleActionsMenu(type: 'categorization' | 'budgetization', ruleText: string): Promise<void> {
    const row = this.section(type).locator('[data-qa="rule-row"]', { hasText: ruleText });
    await row.locator('[data-qa="btn-rule-actions"]').click();
  }

  async openEditRuleSheet(type: 'categorization' | 'budgetization', ruleText: string): Promise<Dialog> {
    await this.openRuleActionsMenu(type, ruleText);
    await this.page.locator('[data-qa="btn-edit-rule"]').click();
    const sheet = new Dialog(this.page, 'sheet-edit-rule');
    await sheet.waitForOpen();
    return sheet;
  }

  async editRule(type: 'categorization' | 'budgetization', ruleText: string, newRuleText: string, newPriority?: number): Promise<void> {
    const sheet = await this.openEditRuleSheet(type, ruleText);
    await sheet.fillInput('input-rule-text', newRuleText);
    if (newPriority !== undefined) {
      await sheet.fillInput('input-rule-priority', String(newPriority));
    }
    await sheet.clickButton('btn-rule-submit');
    await sheet.waitForClose();
  }

  // --- Delete rule ---

  async openDeleteRuleDialog(type: 'categorization' | 'budgetization', ruleText: string): Promise<Dialog> {
    await this.openRuleActionsMenu(type, ruleText);
    await this.page.locator('[data-qa="btn-delete-rule"]').click();
    const dialog = new Dialog(this.page, 'dialog-delete-rule');
    await dialog.waitForOpen();
    return dialog;
  }

  async deleteRule(type: 'categorization' | 'budgetization', ruleText: string): Promise<void> {
    const dialog = await this.openDeleteRuleDialog(type, ruleText);
    await dialog.clickButton('btn-delete-confirm');
    await dialog.waitForClose();
  }
}
