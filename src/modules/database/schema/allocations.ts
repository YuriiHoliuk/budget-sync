import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { budgets } from './budgets.ts';

export const allocations = pgTable(
  'allocations',
  {
    id: serial('id').primaryKey(),
    budgetId: integer('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    period: varchar('period', { length: 7 }).notNull(),
    date: date('date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_allocations_budget_id').on(table.budgetId),
    index('idx_allocations_period').on(table.period),
    index('idx_allocations_budget_period').on(table.budgetId, table.period),
  ],
);
