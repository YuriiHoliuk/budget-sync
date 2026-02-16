import {
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { transactions } from './transactions.ts';

export const transferPairs = pgTable(
  'transfer_pairs',
  {
    id: serial('id').primaryKey(),
    outgoingTransactionId: integer('outgoing_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    incomingTransactionId: integer('incoming_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_transfer_pairs_outgoing').on(table.outgoingTransactionId),
    uniqueIndex('idx_transfer_pairs_incoming').on(table.incomingTransactionId),
  ],
);
