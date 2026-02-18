/**
 * Fix Returning Data — One-time Production Migration
 *
 * Converts the old returning/cancellation transaction model into the new
 * single-transaction model where refunds reduce the original transaction amount.
 *
 * Phase 1: Make all transaction amounts positive (absolute values)
 * Phase 2: Process cancellation bank_transactions into single-transaction model
 * Phase 3: Clear adjusted_transaction_id references
 *
 * Usage:
 *   bun run scripts/fix-returning-data.ts                # Execute changes
 *   bun run scripts/fix-returning-data.ts --dry-run      # Preview changes without modifying data
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const isDryRun = process.argv.includes('--dry-run');

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

interface CancellationBankTx {
  [key: string]: unknown;
  id: number;
  account_id: number;
  bank_description: string;
  amount: number;
  date: Date;
}

interface OriginalBankTx {
  [key: string]: unknown;
  id: number;
  amount: number;
  date: Date;
}

interface TransactionSource {
  [key: string]: unknown;
  transaction_id: number;
  bank_transaction_id: number;
}

interface TransactionRow {
  [key: string]: unknown;
  id: number;
  amount: number;
}

interface CountResult {
  [key: string]: unknown;
  count: number;
}

async function phase1MakeAmountsPositive() {
  console.log('\n=== Phase 1: Make all transaction amounts positive ===');

  const negativeCountResult = await db.execute<CountResult>(
    sql`SELECT count(*)::int AS count FROM transactions WHERE amount < 0`,
  );
  const negativeCount = negativeCountResult[0]?.count ?? 0;
  console.log(`  Found ${negativeCount} transactions with negative amounts`);

  if (negativeCount === 0) {
    console.log('  Nothing to do.');
    return;
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would update ${negativeCount} transactions to have positive amounts`);
    return;
  }

  await db.execute(sql`UPDATE transactions SET amount = ABS(amount) WHERE amount < 0`);
  console.log(`  Updated ${negativeCount} transactions to positive amounts`);
}

async function phase2ProcessCancellations() {
  console.log('\n=== Phase 2: Process cancellation bank_transactions ===');

  const cancellations = await db.execute<CancellationBankTx>(
    sql`SELECT id, account_id, bank_description, amount, date
        FROM bank_transactions
        WHERE bank_description LIKE 'Скасування. %'
        ORDER BY date ASC`,
  );

  console.log(`  Found ${cancellations.length} cancellation bank_transactions`);

  if (cancellations.length === 0) {
    console.log('  Nothing to do.');
    return;
  }

  let partialRefunds = 0;
  let fullRefunds = 0;
  let skipped = 0;

  for (const cancellation of cancellations) {
    const originalDescription = cancellation.bank_description.replace('Скасування. ', '');
    const refundAmount = Math.abs(cancellation.amount);

    console.log(`\n  Processing cancellation bank_tx #${cancellation.id}: "${cancellation.bank_description}" (amount: ${cancellation.amount})`);

    // Find matching original debit bank_tx:
    // - Same account
    // - Description matches (without "Скасування. " prefix)
    // - Within 30-day window before the cancellation
    // - Prefer exact amount match
    const matchingOriginals = await db.execute<OriginalBankTx>(
      sql`SELECT id, amount, date
          FROM bank_transactions
          WHERE account_id = ${cancellation.account_id}
            AND bank_description = ${originalDescription}
            AND date >= ${cancellation.date}::timestamptz - interval '30 days'
            AND date <= ${cancellation.date}::timestamptz
            AND amount < 0
          ORDER BY
            CASE WHEN ABS(amount) = ${refundAmount} THEN 0 ELSE 1 END,
            date DESC
          LIMIT 1`,
    );

    const originalBankTx = matchingOriginals[0];
    if (!originalBankTx) {
      console.log(`    WARNING: No matching original bank_tx found for description "${originalDescription}". Skipping.`);
      skipped++;
      continue;
    }

    console.log(`    Found matching original bank_tx #${originalBankTx.id} (amount: ${originalBankTx.amount})`);

    // Find the transaction linked to the original bank_tx
    const originalLinks = await db.execute<TransactionSource>(
      sql`SELECT transaction_id, bank_transaction_id
          FROM transaction_sources
          WHERE bank_transaction_id = ${originalBankTx.id}`,
    );

    if (originalLinks.length === 0) {
      // Original bank_tx is already orphaned (e.g., authorization hold).
      // Still need to clean up any standalone cancellation transaction.
      const cancellationLinks = await db.execute<TransactionSource>(
        sql`SELECT transaction_id, bank_transaction_id
            FROM transaction_sources
            WHERE bank_transaction_id = ${cancellation.id}`,
      );
      const cancellationTxId = cancellationLinks[0]?.transaction_id ?? null;

      if (cancellationTxId) {
        console.log(`    Original already orphaned. Deleting standalone cancellation transaction #${cancellationTxId}`);
        if (!isDryRun) {
          await db.execute(sql`DELETE FROM transactions WHERE id = ${cancellationTxId}`);
        } else {
          console.log(`    [DRY RUN] Would delete standalone cancellation transaction #${cancellationTxId}`);
        }
        fullRefunds++;
      } else {
        console.log(`    Both sides already orphaned — nothing to do.`);
        skipped++;
      }
      continue;
    }

    const originalTransactionId = originalLinks[0]!.transaction_id;

    // Get the original transaction
    const originalTxRows = await db.execute<TransactionRow>(
      sql`SELECT id, amount FROM transactions WHERE id = ${originalTransactionId}`,
    );
    const originalTx = originalTxRows[0];
    if (!originalTx) {
      console.log(`    WARNING: Original transaction #${originalTransactionId} not found (may have been deleted). Skipping.`);
      skipped++;
      continue;
    }

    const originalAmount = Math.abs(originalTx.amount);

    // Find any standalone cancellation transaction linked to this cancellation bank_tx
    const cancellationLinks = await db.execute<TransactionSource>(
      sql`SELECT transaction_id, bank_transaction_id
          FROM transaction_sources
          WHERE bank_transaction_id = ${cancellation.id}`,
    );
    const cancellationTransactionId = cancellationLinks[0]?.transaction_id ?? null;

    if (refundAmount < originalAmount) {
      // Partial refund
      const newAmount = originalAmount - refundAmount;
      console.log(`    Partial refund: original amount ${originalAmount} - refund ${refundAmount} = ${newAmount}`);

      if (isDryRun) {
        console.log(`    [DRY RUN] Would update transaction #${originalTx.id} amount from ${originalAmount} to ${newAmount}`);
        console.log(`    [DRY RUN] Would link cancellation bank_tx #${cancellation.id} to transaction #${originalTx.id}`);
        if (cancellationTransactionId && cancellationTransactionId !== originalTx.id) {
          console.log(`    [DRY RUN] Would delete standalone cancellation transaction #${cancellationTransactionId}`);
        }
      } else {
        // Reduce original transaction amount
        await db.execute(
          sql`UPDATE transactions SET amount = ${newAmount} WHERE id = ${originalTx.id}`,
        );

        // Link cancellation bank_tx to the original transaction
        // Check if link already exists
        const existingLink = await db.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM transaction_sources
              WHERE transaction_id = ${originalTx.id} AND bank_transaction_id = ${cancellation.id}`,
        );
        if ((existingLink[0]?.count ?? 0) === 0) {
          await db.execute(
            sql`INSERT INTO transaction_sources (transaction_id, bank_transaction_id)
                VALUES (${originalTx.id}, ${cancellation.id})`,
          );
        }

        // Delete standalone cancellation transaction if it exists and is different from original
        if (cancellationTransactionId && cancellationTransactionId !== originalTx.id) {
          await db.execute(
            sql`DELETE FROM transactions WHERE id = ${cancellationTransactionId}`,
          );
          console.log(`    Deleted standalone cancellation transaction #${cancellationTransactionId}`);
        }

        console.log(`    Updated transaction #${originalTx.id} amount to ${newAmount}`);
      }

      partialRefunds++;
    } else {
      // Full refund
      console.log(`    Full refund: refund ${refundAmount} >= original ${originalAmount}`);

      if (isDryRun) {
        console.log(`    [DRY RUN] Would delete original transaction #${originalTx.id}`);
        if (cancellationTransactionId && cancellationTransactionId !== originalTx.id) {
          console.log(`    [DRY RUN] Would delete standalone cancellation transaction #${cancellationTransactionId}`);
        }
      } else {
        // Delete standalone cancellation transaction first (if different from original)
        if (cancellationTransactionId && cancellationTransactionId !== originalTx.id) {
          await db.execute(
            sql`DELETE FROM transactions WHERE id = ${cancellationTransactionId}`,
          );
          console.log(`    Deleted standalone cancellation transaction #${cancellationTransactionId}`);
        }

        // Delete original transaction (cascade deletes transaction_sources)
        await db.execute(
          sql`DELETE FROM transactions WHERE id = ${originalTx.id}`,
        );
        console.log(`    Deleted original transaction #${originalTx.id}`);
      }

      fullRefunds++;
    }
  }

  console.log(`\n  Phase 2 summary:`);
  console.log(`    Partial refunds: ${partialRefunds}`);
  console.log(`    Full refunds: ${fullRefunds}`);
  console.log(`    Skipped (no match): ${skipped}`);
}

async function phase3ClearAdjustedTransactionId() {
  console.log('\n=== Phase 3: Clear adjusted_transaction_id ===');

  const adjustedCountResult = await db.execute<CountResult>(
    sql`SELECT count(*)::int AS count FROM transactions WHERE adjusted_transaction_id IS NOT NULL`,
  );
  const adjustedCount = adjustedCountResult[0]?.count ?? 0;
  console.log(`  Found ${adjustedCount} transactions with adjusted_transaction_id set`);

  if (adjustedCount === 0) {
    console.log('  Nothing to do.');
    return;
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would clear adjusted_transaction_id on ${adjustedCount} transactions`);
    return;
  }

  await db.execute(
    sql`UPDATE transactions SET adjusted_transaction_id = NULL WHERE adjusted_transaction_id IS NOT NULL`,
  );
  console.log(`  Cleared adjusted_transaction_id on ${adjustedCount} transactions`);
}

async function runVerification() {
  console.log('\n=== Verification ===');

  const returningCount = await db.execute<CountResult>(
    sql`SELECT count(*)::int AS count FROM transactions WHERE type = 'returning'`,
  );
  const negativeCount = await db.execute<CountResult>(
    sql`SELECT count(*)::int AS count FROM transactions WHERE amount < 0`,
  );
  const adjustedCount = await db.execute<CountResult>(
    sql`SELECT count(*)::int AS count FROM transactions WHERE adjusted_transaction_id IS NOT NULL`,
  );

  const returningResult = returningCount[0]?.count ?? -1;
  const negativeResult = negativeCount[0]?.count ?? -1;
  const adjustedResult = adjustedCount[0]?.count ?? -1;

  console.log(`  Transactions with type='returning': ${returningResult} (expect 0)`);
  console.log(`  Transactions with amount < 0: ${negativeResult} (expect 0)`);
  console.log(`  Transactions with adjusted_transaction_id set: ${adjustedResult} (expect 0)`);

  const allPassed =
    returningResult === 0 && negativeResult === 0 && adjustedResult === 0;

  if (isDryRun) {
    console.log('\n  [DRY RUN] Verification reflects pre-migration state. Run without --dry-run to apply changes.');
  } else if (allPassed) {
    console.log('\n  All verification checks passed.');
  } else {
    console.log('\n  WARNING: Some verification checks failed. Review the results above.');
  }
}

async function main() {
  console.log('=== Fix Returning Data Migration ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
  console.log(`Database: ${DATABASE_URL}`);

  try {
    await phase1MakeAmountsPositive();
    await phase2ProcessCancellations();
    await phase3ClearAdjustedTransactionId();
    await runVerification();

    console.log('\nMigration complete.');
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
