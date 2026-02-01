import {
  date,
  decimal,
  index,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    rate: decimal('rate', { precision: 18, scale: 8 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique('exchange_rates_date_currency').on(table.date, table.currency),
    index('idx_exchange_rates_date').on(table.date),
    index('idx_exchange_rates_currency').on(table.currency),
  ],
);
