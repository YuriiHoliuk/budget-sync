import { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import type {
  BudgetGroupRow,
  NewBudgetGroupRow,
} from '@modules/database/types.ts';

export class DatabaseBudgetGroupMapper {
  toEntity(row: BudgetGroupRow): BudgetGroup {
    return BudgetGroup.create(
      {
        name: row.name,
        sortOrder: row.sortOrder ?? null,
        dbId: row.id,
      },
      row.name,
    );
  }

  toInsert(group: BudgetGroup): NewBudgetGroupRow {
    return {
      name: group.name,
      sortOrder: group.sortOrder,
    };
  }
}
