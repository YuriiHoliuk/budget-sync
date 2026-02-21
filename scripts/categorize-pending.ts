/**
 * Categorize Pending Transactions
 *
 * One-time script that runs LLM categorization for pending/failed transactions
 * within a date range. Uses the same CategorizeTransactionUseCase as production.
 *
 * Usage:
 *   bun scripts/categorize-pending.ts --from 2026-02-06
 *   bun scripts/categorize-pending.ts --from 2026-02-06 --to 2026-02-21
 *   bun scripts/categorize-pending.ts --from 2026-02-06 --delay 5000
 *   bun scripts/categorize-pending.ts --from 2026-02-06 --dry-run
 */

import 'reflect-metadata';
import 'dotenv/config';

import { CategorizeTransactionUseCase } from '../src/application/use-cases/CategorizeTransaction.ts';
import { setupContainer } from '../src/container.ts';
import { DATABASE_CLIENT_TOKEN } from '../src/infrastructure/repositories/database/tokens.ts';
import type { DatabaseClient } from '../src/modules/database/DatabaseClient.ts';
import { transactions } from '../src/modules/database/schema/index.ts';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';

// --- CLI args ---

function parseArgs() {
  const args = process.argv.slice(2);
  let from: string | undefined;
  let to: string | undefined;
  let delay = 3000;
  let dryRun = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--from' && args[index + 1]) {
      from = args[++index];
    } else if (arg === '--to' && args[index + 1]) {
      to = args[++index];
    } else if (arg === '--delay' && args[index + 1]) {
      delay = Number.parseInt(args[++index]!, 10);
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  if (!from) {
    console.error('Usage: bun scripts/categorize-pending.ts --from YYYY-MM-DD [--to YYYY-MM-DD] [--delay ms] [--dry-run]');
    process.exit(1);
  }

  return { from: new Date(from), to: to ? new Date(to) : new Date(), delay, dryRun };
}

// --- Main ---

async function main() {
  const { from, to, delay, dryRun } = parseArgs();

  console.log('Categorize pending transactions');
  console.log(`  From: ${from.toISOString().slice(0, 10)}`);
  console.log(`  To:   ${to.toISOString().slice(0, 10)}`);
  console.log(`  Delay: ${delay}ms`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  const container = setupContainer();

  const databaseClient = container.resolve<DatabaseClient>(DATABASE_CLIENT_TOKEN);
  const categorizeUseCase = container.resolve(CategorizeTransactionUseCase);

  // Find pending/failed transactions in date range
  const pendingTransactions = await databaseClient.db
    .select({ id: transactions.id, bankDescription: transactions.bankDescription, date: transactions.date, categorizationStatus: transactions.categorizationStatus })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, from),
        lte(transactions.date, to),
        or(
          eq(transactions.categorizationStatus, 'pending'),
          eq(transactions.categorizationStatus, 'failed'),
          isNull(transactions.categorizationStatus),
        ),
      ),
    )
    .orderBy(transactions.date);

  console.log(`Found ${pendingTransactions.length} uncategorized transactions\n`);

  if (dryRun) {
    for (const tx of pendingTransactions) {
      console.log(`  [DRY RUN] Would categorize tx #${tx.id}: ${tx.bankDescription?.slice(0, 60)} (${tx.date.toISOString().slice(0, 10)}, status: ${tx.categorizationStatus})`);
    }
    await databaseClient.disconnect();
    return;
  }

  let categorized = 0;
  let failed = 0;

  for (const tx of pendingTransactions) {
    const index = categorized + failed + 1;
    try {
      const result = await categorizeUseCase.execute({ transactionDbId: tx.id });
      console.log(
        `[${index}/${pendingTransactions.length}] tx #${tx.id}: ${result.category ?? 'no category'} / ${result.budget ?? 'no budget'}`,
      );
      categorized++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${index}/${pendingTransactions.length}] tx #${tx.id}: ERROR - ${message}`,
      );
      failed++;
    }

    // Delay between LLM calls to avoid rate limits
    if (index < pendingTransactions.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.log(`\nDone: ${categorized} categorized, ${failed} failed`);

  await databaseClient.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

main();
