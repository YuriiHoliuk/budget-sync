import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { transactions } from './transactions.ts';

export const transactionLinks = pgTable(
  'transaction_links',
  {
    id: serial('id').primaryKey(),
    linkType: varchar('link_type', { length: 50 }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_transaction_links_type').on(table.linkType)],
);

export const transactionLinkMembers = pgTable(
  'transaction_link_members',
  {
    id: serial('id').primaryKey(),
    linkId: integer('link_id')
      .notNull()
      .references(() => transactionLinks.id, { onDelete: 'cascade' }),
    transactionId: integer('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull(),
  },
  (table) => [
    index('idx_transaction_link_members_link').on(table.linkId),
    index('idx_transaction_link_members_transaction').on(table.transactionId),
  ],
);
