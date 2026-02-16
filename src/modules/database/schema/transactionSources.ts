import {
  index,
  integer,
  pgTable,
  serial,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bankTransactions } from './bankTransactions.ts';
import { transactions } from './transactions.ts';

export const transactionSources = pgTable(
  'transaction_sources',
  {
    id: serial('id').primaryKey(),
    transactionId: integer('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    bankTransactionId: integer('bank_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_transaction_sources_transaction_id').on(table.transactionId),
    index('idx_transaction_sources_bank_transaction_id').on(
      table.bankTransactionId,
    ),
    uniqueIndex('idx_transaction_sources_unique').on(
      table.transactionId,
      table.bankTransactionId,
    ),
  ],
);
