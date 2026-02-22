import {
  bigint,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bankTransactions } from './bankTransactions.ts';

export const bankTransactionReturns = pgTable(
  'bank_transaction_returns',
  {
    id: serial('id').primaryKey(),
    originalBankTransactionId: integer('original_bank_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    returningBankTransactionId: integer('returning_bank_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_bank_transaction_returns_pair').on(
      table.originalBankTransactionId,
      table.returningBankTransactionId,
    ),
  ],
);
