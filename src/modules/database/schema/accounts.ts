import {
  bigint,
  boolean,
  index,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    externalId: varchar('external_id', { length: 255 }).unique(),
    name: varchar('name', { length: 255 }),
    externalName: varchar('external_name', { length: 255 }),
    type: varchar('type', { length: 50 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    role: varchar('role', { length: 50 }).notNull().default('operational'),
    creditLimit: bigint('credit_limit', { mode: 'number' }).default(0),
    iban: varchar('iban', { length: 34 }).unique(),
    bank: varchar('bank', { length: 100 }),
    source: varchar('source', { length: 20 }).notNull().default('bank_sync'),
    isArchived: boolean('is_archived').notNull().default(false),
    lastSyncTime: timestamp('last_sync_time', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_accounts_bank').on(table.bank),
    index('idx_accounts_role').on(table.role),
  ],
);
