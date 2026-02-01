import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const budgetizationRules = pgTable('budgetization_rules', {
  id: serial('id').primaryKey(),
  rule: text('rule').notNull(),
  priority: integer('priority').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
