import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { Dialog } from '../components';

/**
 * Categories Page Object
 * Shows hierarchical category tree with CRUD operations
 */
export class CategoriesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  protected get url(): string {
    return '/categories';
  }

  // ========== CONTROLS ==========

  get showArchivedSwitch(): Locator {
    return this.byQa('switch-show-archived');
  }

  get createCategoryButton(): Locator {
    return this.byQa('btn-create-category');
  }

  /**
   * Toggle show archived categories
   */
  async toggleShowArchived(): Promise<void> {
    await this.showArchivedSwitch.click();
  }

  /**
   * Check if show archived is enabled
   */
  async isShowArchivedEnabled(): Promise<boolean> {
    const switchElement = this.showArchivedSwitch;
    const ariaChecked = await switchElement.getAttribute('aria-checked');
    return ariaChecked === 'true';
  }

  // ========== TABLE ==========

  get table(): Locator {
    return this.byQa('categories-table');
  }

  get rows(): Locator {
    return this.table.locator('tbody tr');
  }

  /**
   * Get category row by ID
   */
  getRowById(categoryId: number): Locator {
    return this.byQa(`category-row-${categoryId}`);
  }

  /**
   * Get category row by name
   */
  getRowByName(categoryName: string): Locator {
    return this.rows.filter({ hasText: categoryName });
  }

  /**
   * Get row count
   */
  async getRowCount(): Promise<number> {
    return this.rows.count();
  }

  // ========== CATEGORY DATA ==========

  /**
   * Get category name
   */
  async getCategoryName(categoryId: number): Promise<string> {
    return (await this.byQa(`category-name-${categoryId}`).textContent()) ?? '';
  }

  /**
   * Get category status
   */
  async getCategoryStatus(categoryId: number): Promise<string> {
    return (await this.byQa(`category-status-${categoryId}`).textContent()) ?? '';
  }

  /**
   * Get category children count
   */
  async getChildrenCount(categoryId: number): Promise<string> {
    return (await this.byQa(`category-children-count-${categoryId}`).textContent()) ?? '';
  }

  /**
   * Check if category has children (expand button visible)
   */
  async hasChildren(categoryId: number): Promise<boolean> {
    return this.byQa(`btn-expand-${categoryId}`).isVisible();
  }

  // ========== TREE NAVIGATION ==========

  /**
   * Expand a parent category to show children
   */
  async expandCategory(categoryId: number): Promise<void> {
    await this.byQa(`btn-expand-${categoryId}`).click();
  }

  /**
   * Collapse a parent category
   */
  async collapseCategory(categoryId: number): Promise<void> {
    await this.byQa(`btn-expand-${categoryId}`).click();
  }

  /**
   * Check if category is expanded
   */
  async isExpanded(categoryId: number): Promise<boolean> {
    const button = this.byQa(`btn-expand-${categoryId}`);
    const ariaExpanded = await button.getAttribute('aria-expanded');
    return ariaExpanded === 'true';
  }

  // ========== MENU ACTIONS ==========

  /**
   * Open category menu
   */
  async openCategoryMenu(categoryId: number): Promise<void> {
    await this.byQa(`category-menu-${categoryId}`).click();
  }

  /**
   * Click edit category in menu
   */
  async clickEditCategory(categoryId: number): Promise<void> {
    await this.openCategoryMenu(categoryId);
    await this.byQa(`category-edit-${categoryId}`).click();
  }

  /**
   * Click archive category in menu
   */
  async clickArchiveCategory(categoryId: number): Promise<void> {
    await this.openCategoryMenu(categoryId);
    await this.byQa(`category-archive-${categoryId}`).click();
  }

  // ========== CREATE CATEGORY DIALOG ==========

  /**
   * Open create category dialog
   */
  async openCreateCategoryDialog(): Promise<CreateCategoryDialog> {
    await this.createCategoryButton.click();
    const dialog = new CreateCategoryDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Create a new category (convenience method)
   */
  async createCategory(name: string, parentName?: string): Promise<void> {
    const dialog = await this.openCreateCategoryDialog();
    await dialog.fillName(name);
    if (parentName) {
      await dialog.selectParent(parentName);
    }
    await dialog.submit();
    await dialog.waitForClose();
  }

  // ========== ARCHIVE DIALOG ==========

  /**
   * Confirm archive in the confirmation dialog
   */
  async confirmArchive(): Promise<void> {
    const dialog = new Dialog(this.page, 'dialog-archive-category');
    await dialog.waitForOpen();
    await dialog.clickButton('btn-archive-confirm');
    await dialog.waitForClose();
  }

  /**
   * Cancel archive in the confirmation dialog
   */
  async cancelArchive(): Promise<void> {
    const dialog = new Dialog(this.page, 'dialog-archive-category');
    await dialog.waitForOpen();
    await dialog.clickButton('btn-archive-cancel');
    await dialog.waitForClose();
  }

  // ========== ASSERTIONS ==========

  /**
   * Assert category exists
   */
  async assertCategoryExists(categoryName: string): Promise<void> {
    await expect(this.getRowByName(categoryName)).toBeVisible();
  }

  /**
   * Assert category does not exist
   */
  async assertCategoryNotExists(categoryName: string): Promise<void> {
    await expect(this.getRowByName(categoryName)).not.toBeVisible();
  }

  /**
   * Assert category is active
   */
  async assertCategoryIsActive(categoryId: number): Promise<void> {
    await expect(this.byQa(`category-status-${categoryId}`)).toContainText(/active/i);
  }

  /**
   * Assert category is archived
   */
  async assertCategoryIsArchived(categoryId: number): Promise<void> {
    await expect(this.byQa(`category-status-${categoryId}`)).toContainText(/archived/i);
  }
}

/**
 * Create Category Dialog
 */
class CreateCategoryDialog extends Dialog {
  constructor(page: Page) {
    super(page, 'dialog-create-category');
  }

  async fillName(name: string): Promise<void> {
    await this.fillInput('input-category-name', name);
  }

  async selectStatus(status: string): Promise<void> {
    await this.selectOption('select-category-status', status);
  }

  async selectParent(parentName: string): Promise<void> {
    await this.selectOption('select-parent-category', parentName);
  }
}
