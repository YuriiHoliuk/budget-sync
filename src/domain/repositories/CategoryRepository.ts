import type { Category } from '../entities/Category.ts';

/**
 * Injection token for CategoryRepository.
 * Use with @inject(CATEGORY_REPOSITORY_TOKEN) in classes that depend on CategoryRepository.
 */
export const CATEGORY_REPOSITORY_TOKEN = Symbol('CategoryRepository');

/**
 * Category repository for managing category entities.
 * Provides methods to query and persist categories.
 */
export abstract class CategoryRepository {
  abstract findAll(): Promise<Category[]>;
  abstract findByName(name: string): Promise<Category | null>;
  abstract findActive(): Promise<Category[]>;
  abstract save(category: Category): Promise<void>;
}
