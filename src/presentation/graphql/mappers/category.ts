import type { Category } from '@domain/entities/Category.ts';
import type { CategoryStatus } from '@domain/value-objects/index.ts';

export const CATEGORY_STATUS_TO_GQL: Record<string, string> = {
  active: 'ACTIVE',
  suggested: 'SUGGESTED',
  archived: 'ARCHIVED',
};

export const GQL_TO_CATEGORY_STATUS: Record<string, CategoryStatus> = {
  ACTIVE: 'active',
  SUGGESTED: 'suggested',
  ARCHIVED: 'archived',
};

export interface CategoryGql {
  id: number;
  name: string;
  parentName: string | null;
  status: string;
  fullPath: string;
}

export function mapCategoryToGql(category: Category): CategoryGql {
  return {
    id: category.dbId ?? 0,
    name: category.name,
    parentName: category.parent ?? null,
    status: CATEGORY_STATUS_TO_GQL[category.status] ?? 'ACTIVE',
    fullPath: category.fullPath,
  };
}

export function mapCategoryStatus(status: string): string {
  return CATEGORY_STATUS_TO_GQL[status] ?? 'ACTIVE';
}
