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

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    type: varchar('type', { length: 20 }).notNull().default('spending'),
    currency: varchar('currency', { length: 3 }).notNull(),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    targetCadence: varchar('target_cadence', { length: 20 }),
    targetCadenceMonths: integer('target_cadence_months'),
    targetDate: date('target_date'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_budgets_type').on(table.type),
    index('idx_budgets_dates').on(table.startDate, table.endDate),
    index('idx_budgets_active').on(table.isArchived),
  ],
);
