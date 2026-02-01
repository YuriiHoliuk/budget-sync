import { Category } from '@domain/entities/Category.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';
import type { CategoryRow, NewCategoryRow } from '@modules/database/types.ts';

const STATUS_MAP: Record<string, CategoryStatus> = {
  active: CategoryStatus.ACTIVE,
  suggested: CategoryStatus.SUGGESTED,
  archived: CategoryStatus.ARCHIVED,
};

export class DatabaseCategoryMapper {
  toEntity(row: CategoryRow, parentName?: string): Category {
    const status = STATUS_MAP[row.status] ?? CategoryStatus.ACTIVE;

    return Category.create(
      {
        name: row.name,
        parent: parentName,
        status,
        dbId: row.id,
      },
      row.name,
    );
  }

  toInsert(category: Category, parentDbId?: number): NewCategoryRow {
    return {
      name: category.name,
      parentId: parentDbId ?? null,
      status: category.status,
    };
  }
}
