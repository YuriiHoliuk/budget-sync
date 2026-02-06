import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { Dialog } from '../components';

/**
 * Accounts Page Object
 * Shows account list grouped by role with CRUD operations for manual accounts
 */
export class AccountsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  protected get url(): string {
    return '/accounts';
  }

  // ========== TABLE ==========

  get table(): Locator {
    return this.byQa('accounts-table');
  }

  get addAccountButton(): Locator {
    return this.byQa('btn-add-account');
  }

  // ========== GROUP HEADERS ==========

  get operationalGroup(): Locator {
    return this.byQa('account-group-operational');
  }

  get savingsGroup(): Locator {
    return this.byQa('account-group-savings');
  }

  /**
   * Get group total balance
   */
  async getGroupTotal(role: 'operational' | 'savings'): Promise<string> {
    return (await this.byQa(`account-group-total-${role}`).textContent()) ?? '';
  }

  // ========== ACCOUNT ROWS ==========

  /**
   * Get account row by ID
   */
  getRowById(accountId: number): Locator {
    return this.byQa(`account-row-${accountId}`);
  }

  /**
   * Get account row by name
   */
  getRowByName(accountName: string): Locator {
    return this.table.locator('tr', { hasText: accountName });
  }

  /**
   * Get account name
   */
  async getAccountName(accountId: number): Promise<string> {
    return (await this.byQa(`account-name-${accountId}`).textContent()) ?? '';
  }

  /**
   * Get account type
   */
  async getAccountType(accountId: number): Promise<string> {
    return (await this.byQa(`account-type-${accountId}`).textContent()) ?? '';
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: number): Promise<string> {
    return (await this.byQa(`account-balance-${accountId}`).textContent()) ?? '';
  }

  /**
   * Get account currency
   */
  async getAccountCurrency(accountId: number): Promise<string> {
    return (await this.byQa(`account-currency-${accountId}`).textContent()) ?? '';
  }

  /**
   * Get account source (Synced/Manual)
   */
  async getAccountSource(accountId: number): Promise<string> {
    return (await this.byQa(`account-source-${accountId}`).textContent()) ?? '';
  }

  /**
   * Check if account is synced
   */
  async isSynced(accountId: number): Promise<boolean> {
    const source = await this.getAccountSource(accountId);
    return source.toLowerCase().includes('sync');
  }

  // ========== MENU ACTIONS ==========

  /**
   * Open account menu
   */
  async openAccountMenu(accountId: number): Promise<void> {
    await this.byQa(`account-menu-${accountId}`).click();
  }

  /**
   * Click edit account in menu
   */
  async clickEditAccount(accountId: number): Promise<void> {
    await this.openAccountMenu(accountId);
    await this.byQa(`account-edit-${accountId}`).click();
  }

  /**
   * Click archive account in menu (manual accounts only)
   */
  async clickArchiveAccount(accountId: number): Promise<void> {
    await this.openAccountMenu(accountId);
    await this.byQa(`account-archive-${accountId}`).click();
  }

  // ========== CREATE ACCOUNT DIALOG ==========

  /**
   * Open create account dialog
   */
  async openCreateAccountDialog(): Promise<CreateAccountDialog> {
    await this.addAccountButton.click();
    const dialog = new CreateAccountDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Create a new manual account (convenience method)
   */
  async createAccount(
    name: string,
    type: 'Debit' | 'Credit' | 'FOP',
    role: 'Operational' | 'Savings',
    balance = '0'
  ): Promise<void> {
    const dialog = await this.openCreateAccountDialog();
    await dialog.fillName(name);
    await dialog.selectType(type);
    await dialog.selectRole(role);
    await dialog.fillBalance(balance);
    await dialog.submit();
    await dialog.waitForClose();
  }

  // ========== ARCHIVE DIALOG ==========

  /**
   * Confirm archive in the confirmation dialog
   */
  async confirmArchive(): Promise<void> {
    const dialog = new Dialog(this.page, 'dialog-archive-account');
    await dialog.waitForOpen();
    await dialog.clickButton('btn-archive-confirm');
    await dialog.waitForClose();
  }

  /**
   * Cancel archive in the confirmation dialog
   */
  async cancelArchive(): Promise<void> {
    const dialog = new Dialog(this.page, 'dialog-archive-account');
    await dialog.waitForOpen();
    await dialog.clickButton('btn-archive-cancel');
    await dialog.waitForClose();
  }

  // ========== ASSERTIONS ==========

  /**
   * Assert account exists
   */
  async assertAccountExists(accountName: string): Promise<void> {
    await expect(this.getRowByName(accountName)).toBeVisible();
  }

  /**
   * Assert account does not exist
   */
  async assertAccountNotExists(accountName: string): Promise<void> {
    await expect(this.getRowByName(accountName)).not.toBeVisible();
  }

  /**
   * Assert account is synced (read-only badge visible)
   */
  async assertAccountIsSynced(accountId: number): Promise<void> {
    await expect(this.byQa(`account-source-${accountId}`)).toContainText(/sync/i);
  }

  /**
   * Assert account is manual
   */
  async assertAccountIsManual(accountId: number): Promise<void> {
    await expect(this.byQa(`account-source-${accountId}`)).toContainText(/manual/i);
  }
}

/**
 * Create Account Dialog
 */
class CreateAccountDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'dialog-create-account');
  }

  async fillName(name: string): Promise<void> {
    await this.fillInput('input-account-name', name);
  }

  async selectType(type: string): Promise<void> {
    await this.selectOption('select-account-type', type);
  }

  async selectRole(role: string): Promise<void> {
    await this.selectOption('select-account-role', role);
  }

  async fillBalance(balance: string): Promise<void> {
    // Fill the balance input using the id since it doesn't have a data-qa
    const input = this.locator.locator('#account-balance');
    await input.fill(balance);
  }

  async fillIban(iban: string): Promise<void> {
    await this.fillInput('input-iban', iban);
  }

  async fillCreditLimit(limit: string): Promise<void> {
    await this.fillInput('input-credit-limit', limit);
  }
}
