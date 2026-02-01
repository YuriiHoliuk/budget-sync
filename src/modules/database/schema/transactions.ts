import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.ts';
import { budgets } from './budgets.ts';
import { categories } from './categories.ts';

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    externalId: varchar('external_id', { length: 255 }).unique(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    type: varchar('type', { length: 10 }).notNull(),
    accountId: integer('account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    accountExternalId: varchar('account_external_id', { length: 255 }),
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    budgetId: integer('budget_id').references(() => budgets.id, {
      onDelete: 'set null',
    }),
    categorizationStatus: varchar('categorization_status', {
      length: 20,
    }).default('pending'),
    categoryReason: text('category_reason'),
    budgetReason: text('budget_reason'),
    mcc: integer('mcc'),
    originalMcc: integer('original_mcc'),
    bankCategory: varchar('bank_category', { length: 255 }),
    bankDescription: text('bank_description'),
    counterparty: varchar('counterparty', { length: 255 }),
    counterpartyIban: varchar('counterparty_iban', { length: 34 }),
    counterEdrpou: varchar('counter_edrpou', { length: 20 }),
    balanceAfter: bigint('balance_after', { mode: 'number' }),
    operationAmount: bigint('operation_amount', { mode: 'number' }),
    operationCurrency: varchar('operation_currency', { length: 3 }),
    cashback: bigint('cashback', { mode: 'number' }).default(0),
    commission: bigint('commission', { mode: 'number' }).default(0),
    hold: boolean('hold').default(false),
    receiptId: varchar('receipt_id', { length: 255 }),
    invoiceId: varchar('invoice_id', { length: 255 }),
    tags: text('tags').array(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_transactions_date').on(table.date),
    index('idx_transactions_account_id').on(table.accountId),
    index('idx_transactions_account_external_id').on(table.accountExternalId),
    index('idx_transactions_category_id').on(table.categoryId),
    index('idx_transactions_budget_id').on(table.budgetId),
    index('idx_transactions_categorization_status').on(
      table.categorizationStatus,
    ),
    index('idx_transactions_counterparty').on(table.counterparty),
    index('idx_transactions_type').on(table.type),
    index('idx_transactions_date_category').on(table.date, table.categoryId),
    index('idx_transactions_date_budget').on(table.date, table.budgetId),
    index('idx_transactions_account_date').on(table.accountId, table.date),
  ],
);
