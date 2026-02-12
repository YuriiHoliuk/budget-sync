import {
  bigint,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { budgets } from './budgets.ts';

export const budgetTargets = pgTable(
  'budget_targets',
  {
    id: serial('id').primaryKey(),
    budgetId: integer('budget_id')
      .notNull()
      .references(() => budgets.id),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    effectiveFrom: varchar('effective_from', { length: 7 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_budget_targets_budget').on(table.budgetId, table.effectiveFrom),
  ],
);
