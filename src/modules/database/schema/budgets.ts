import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { budgetGroups } from './budgetGroups.ts';

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    currency: varchar('currency', { length: 3 }).notNull(),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    cadenceUnit: varchar('cadence_unit', { length: 10 }),
    cadenceCount: integer('cadence_count'),
    targetDate: date('target_date'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    cap: bigint('cap', { mode: 'number' }),
    sortOrder: varchar('sort_order', { length: 50 }),
    budgetGroupId: integer('budget_group_id').references(
      () => budgetGroups.id,
      { onDelete: 'set null' },
    ),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_budgets_dates').on(table.startDate, table.endDate),
    index('idx_budgets_active').on(table.isArchived),
    index('idx_budgets_sort_order').on(table.sortOrder),
    index('idx_budgets_group').on(table.budgetGroupId),
  ],
);
