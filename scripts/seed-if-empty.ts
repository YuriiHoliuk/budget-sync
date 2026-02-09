/**
 * Conditional Seed Script
 *
 * Checks if the database already has data (accounts table) and only
 * seeds if empty. This makes `just dev` idempotent — seeds on first
 * run, skips on subsequent runs.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun scripts/seed-if-empty.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function isDatabaseSeeded(): Promise<boolean> {
  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM accounts`,
  );
  const count = Number.parseInt(result[0]?.count ?? '0', 10);
  return count > 0;
}

async function runSeed(): Promise<void> {
  const proc = Bun.spawn(['bun', 'scripts/seed-local-db.ts'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Seed script exited with code ${exitCode}`);
  }
}

async function main() {
  try {
    const seeded = await isDatabaseSeeded();

    if (seeded) {
      console.log('Database already has data, skipping seed.');
      return;
    }

    console.log('Database is empty, running seed...');
    await runSeed();
  } catch (error) {
    console.error('Seed check failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
