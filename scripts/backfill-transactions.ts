/**
 * Backfill Transactions
 *
 * One-time script that processes existing bank_transactions to:
 * 1. Populate transaction_sources (link existing transactions to bank_transactions)
 * 2. Detect and process returnings/cancellations
 * 3. Detect and pair transfers between own accounts
 * 4. Split fee transactions where commission > 0
 *
 * Prerequisites:
 *   - Migration 0009 (bank_transactions_schema) must have run
 *   - Migration 0010 (adjusted_transaction_id) must have run
 *
 * Usage:
 *   bun scripts/backfill-transactions.ts --dry-run   # Preview changes
 *   bun scripts/backfill-transactions.ts              # Apply changes
 *   bun scripts/backfill-transactions.ts --production # Run against production DB
 */

import 'dotenv/config';
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  not,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/modules/database/schema/index.ts';

const {
  accounts,
  bankTransactions,
  transactions,
  transactionSources,
  transferPairs,
} = schema;

// --- Types ---

type Transaction = typeof transactions.$inferInsert;
type Db = PostgresJsDatabase<typeof schema>;

interface Summary {
  // Phase 0: Link existing
  transactionsLinked: number;
  transactionsUnlinked: number;
  // Phase 1: Returnings
  returningsPartial: number;
  returningsFull: number;
  returningsSkipped: number;
  returningsUnmatched: number;
  // Phase 2: Transfers
  transfersDetected: number;
  transfersPaired: number;
  transfersUnpaired: number;
  transfersSkipped: number;
  // Phase 3: Fee splits
  feeSplitsCreated: number;
  feeSplitsSkipped: number;
  // Errors
  errors: number;
}

function createEmptySummary(): Summary {
  return {
    transactionsLinked: 0,
    transactionsUnlinked: 0,
    returningsPartial: 0,
    returningsFull: 0,
    returningsSkipped: 0,
    returningsUnmatched: 0,
    transfersDetected: 0,
    transfersPaired: 0,
    transfersUnpaired: 0,
    transfersSkipped: 0,
    feeSplitsCreated: 0,
    feeSplitsSkipped: 0,
    errors: 0,
  };
}

class DryRunComplete extends Error {
  constructor() {
    super('Dry run complete');
    this.name = 'DryRunComplete';
  }
}

// --- Production safety guard ---

const PRODUCTION_DB_PATTERNS = ['neon.tech', 'supabase.co', '.cloud.'];

function assertDatabaseSafety(url: string, allowProduction: boolean): void {
  const lowerUrl = url.toLowerCase();
  const isProduction = PRODUCTION_DB_PATTERNS.some((pattern) =>
    lowerUrl.includes(pattern),
  );

  if (isProduction && !allowProduction) {
    console.error(
      'Refusing to run on production DB without --production flag.',
    );
    console.error('Use: bun scripts/backfill-transactions.ts --production');
    process.exit(1);
  }

  if (isProduction && allowProduction) {
    console.warn('WARNING: Running against PRODUCTION database!');
  }
}

// --- Constants ---

const CANCELLATION_PREFIX = 'Скасування. ';
const RETURNING_MATCH_WINDOW_DAYS = 30;
const TRANSFER_MATCH_WINDOW_DAYS = 2;

// --- Phase 0: Populate transaction_sources for existing transactions ---

async function populateTransactionSources(
  tx: Db,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  console.log('\n--- Phase 0: Populate transaction_sources ---');

  // Check how many links already exist
  const existingLinks = await tx
    .select({ count: sql<number>`count(*)` })
    .from(transactionSources);
  const existingCount = existingLinks[0]?.count ?? 0;

  if (existingCount > 0) {
    console.log(
      `  Found ${existingCount} existing transaction_sources entries, skipping Phase 0.`,
    );
    return;
  }

  // Match transactions to bank_transactions by external_id
  // Both tables have external_id; bank_transactions were copied from transactions in migration 0009
  const linkResult = await tx.execute(sql`
    INSERT INTO transaction_sources (transaction_id, bank_transaction_id)
    SELECT t.id, bt.id
    FROM transactions t
    JOIN bank_transactions bt ON bt.external_id = t.external_id
    WHERE t.external_id IS NOT NULL
    ON CONFLICT (transaction_id, bank_transaction_id) DO NOTHING
  `);

  const linkedCount = linkResult.count;
  summary.transactionsLinked = linkedCount;

  // Count transactions that have no matching bank_transaction
  const unlinkedResult = await tx.execute(sql`
    SELECT count(*) as count
    FROM transactions t
    LEFT JOIN transaction_sources ts ON ts.transaction_id = t.id
    WHERE ts.id IS NULL
  `);
  const unlinkedCount = Number(unlinkedResult[0]?.count ?? 0);
  summary.transactionsUnlinked = unlinkedCount;

  console.log(`  Linked ${linkedCount} transactions to bank_transactions`);
  if (unlinkedCount > 0) {
    console.log(
      `  ${unlinkedCount} transactions have no matching bank_transaction (manual entries or missing external_id)`,
    );
  }
}

// --- Phase 1: Detect and process returnings/cancellations ---

async function processReturnings(
  tx: Db,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  console.log('\n--- Phase 1: Process returnings/cancellations ---');

  // Find all cancellation bank_transactions, ordered by date
  const cancellations = await tx
    .select()
    .from(bankTransactions)
    .where(sql`${bankTransactions.bankDescription} LIKE ${CANCELLATION_PREFIX + '%'}`)
    .orderBy(bankTransactions.date);

  console.log(`  Found ${cancellations.length} cancellation bank_transactions`);

  for (const cancellation of cancellations) {
    try {
      await processOneCancellation(tx, cancellation, summary, isDryRun);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `  ERROR processing cancellation bank_tx #${cancellation.id} (${cancellation.externalId}): ${message}`,
      );
      summary.errors++;
    }
  }
}

async function processOneCancellation(
  tx: Db,
  cancellation: typeof bankTransactions.$inferSelect,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  // 1. Check if already processed: cancellation bank_tx is linked to a returning-type transaction
  const existingLinkedTx = await tx
    .select({
      transactionId: transactionSources.transactionId,
      txType: transactions.type,
    })
    .from(transactionSources)
    .innerJoin(
      transactions,
      eq(transactions.id, transactionSources.transactionId),
    )
    .where(eq(transactionSources.bankTransactionId, cancellation.id))
    .limit(1);

  if (existingLinkedTx.length > 0 && existingLinkedTx[0]!.txType === 'returning') {
    summary.returningsSkipped++;
    return;
  }

  // 2. Strip "Скасування. " prefix to get the original merchant name
  const originalDescription = (cancellation.bankDescription ?? '').slice(
    CANCELLATION_PREFIX.length,
  );

  if (!originalDescription) {
    console.warn(
      `  WARNING: Cancellation bank_tx #${cancellation.id} has empty description after stripping prefix`,
    );
    summary.returningsUnmatched++;
    return;
  }

  // 3. Find matching original bank_transaction on the same account
  const cancellationDate = cancellation.date;
  const windowStart = new Date(cancellationDate);
  windowStart.setDate(windowStart.getDate() - RETURNING_MATCH_WINDOW_DAYS);

  const matchingOriginals = await tx
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.accountId, cancellation.accountId!),
        eq(bankTransactions.bankDescription, originalDescription),
        eq(bankTransactions.type, 'debit'),
        gte(bankTransactions.date, windowStart),
        lte(bankTransactions.date, cancellationDate),
        not(eq(bankTransactions.id, cancellation.id)),
      ),
    )
    .orderBy(sql`${bankTransactions.date} DESC`)
    .limit(1);

  if (matchingOriginals.length === 0) {
    console.warn(
      `  WARNING: No match for cancellation bank_tx #${cancellation.id}: "${originalDescription}" on account ${cancellation.accountId}`,
    );
    summary.returningsUnmatched++;
    return;
  }

  const originalBankTx = matchingOriginals[0]!;

  // 4. Find the transaction linked to the original via transaction_sources
  const originalSourceLinks = await tx
    .select({
      transactionId: transactionSources.transactionId,
    })
    .from(transactionSources)
    .where(eq(transactionSources.bankTransactionId, originalBankTx.id));

  if (originalSourceLinks.length === 0) {
    console.warn(
      `  WARNING: Original bank_tx #${originalBankTx.id} has no linked transaction`,
    );
    summary.returningsUnmatched++;
    return;
  }

  const originalTxId = originalSourceLinks[0]!.transactionId;

  // Get the original transaction to compare amounts
  const originalTxRows = await tx
    .select()
    .from(transactions)
    .where(eq(transactions.id, originalTxId))
    .limit(1);

  if (originalTxRows.length === 0) {
    console.warn(
      `  WARNING: Transaction #${originalTxId} not found (may have been deleted)`,
    );
    summary.returningsUnmatched++;
    return;
  }

  const originalTx = originalTxRows[0]!;
  const refundAmount = Math.abs(cancellation.amount);
  const originalAmount = Math.abs(originalTx.amount);

  if (isDryRun) {
    if (refundAmount >= originalAmount) {
      console.log(
        `  [DRY RUN] Would FULLY refund tx #${originalTxId} (${originalAmount}) via cancellation bank_tx #${cancellation.id} (${refundAmount})`,
      );
      summary.returningsFull++;
    } else {
      console.log(
        `  [DRY RUN] Would PARTIALLY refund tx #${originalTxId} (${originalAmount} -> ${originalAmount - refundAmount}) via cancellation bank_tx #${cancellation.id} (${refundAmount})`,
      );
      summary.returningsPartial++;
    }
    return;
  }

  // Find and remember the stale credit transaction that Phase 0 linked to this cancellation bank_tx.
  // Phase 0 linked cancellation bank_tx -> a credit-type transaction (the original import).
  // We need to clean it up regardless of partial/full refund.
  const staleTxId =
    existingLinkedTx.length > 0 ? existingLinkedTx[0]!.transactionId : null;

  // 5/6. Apply the refund
  if (refundAmount >= originalAmount) {
    // Full refund: delete the original debit transaction (cascade deletes transaction_sources)
    await tx.delete(transactions).where(eq(transactions.id, originalTxId));

    // Delete the stale credit transaction that Phase 0 created for this cancellation
    if (staleTxId !== null) {
      await tx.delete(transactions).where(eq(transactions.id, staleTxId));
    }

    // Cancellation bank_tx stays orphaned (no transaction_sources entry) -- by design
    console.log(
      `  Full refund: deleted tx #${originalTxId}, cancellation bank_tx #${cancellation.id} orphaned`,
    );
    summary.returningsFull++;
  } else {
    // Partial refund:
    // a. Reduce original transaction amount
    await tx
      .update(transactions)
      .set({ amount: originalAmount - refundAmount })
      .where(eq(transactions.id, originalTxId));

    // b. Delete the stale credit transaction that Phase 0 created for this cancellation
    // (cascade deletes its transaction_sources entry too)
    if (staleTxId !== null) {
      await tx.delete(transactions).where(eq(transactions.id, staleTxId));
    }

    // c. Create returning transaction
    const returningTx: Transaction = {
      date: cancellation.date,
      amount: refundAmount,
      currency: cancellation.currency,
      type: 'returning',
      accountId: cancellation.accountId,
      categoryId: originalTx.categoryId,
      budgetId: originalTx.budgetId,
      categorizationStatus: originalTx.categorizationStatus,
      categoryReason: originalTx.categoryReason,
      budgetReason: originalTx.budgetReason,
      adjustedTransactionId: originalTxId,
      bankDescription: cancellation.bankDescription,
      counterparty: cancellation.counterparty,
    };

    const [insertedReturning] = await tx
      .insert(transactions)
      .values(returningTx)
      .returning({ id: transactions.id });

    // d. Link cancellation bank_tx to the new returning transaction
    await tx.insert(transactionSources).values({
      transactionId: insertedReturning!.id,
      bankTransactionId: cancellation.id,
    });

    console.log(
      `  Partial refund: tx #${originalTxId} reduced by ${refundAmount}, returning tx #${insertedReturning!.id} created`,
    );
    summary.returningsPartial++;
  }
}

// --- Phase 2: Detect transfers ---

async function processTransfers(
  tx: Db,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  console.log('\n--- Phase 2: Detect transfers ---');

  // 1. Load all own account IBANs
  const ownAccounts = await tx
    .select({ id: accounts.id, iban: accounts.iban })
    .from(accounts)
    .where(not(isNull(accounts.iban)));

  const ownIbans = new Map<string, number>();
  for (const account of ownAccounts) {
    if (account.iban) {
      ownIbans.set(account.iban, account.id);
    }
  }

  if (ownIbans.size === 0) {
    console.log('  No accounts with IBANs found, skipping transfer detection');
    return;
  }

  const ibanValues = Array.from(ownIbans.keys());
  console.log(`  Loaded ${ibanValues.length} own account IBANs`);

  // 2. Find bank_transactions where counterparty_iban is in own IBANs
  //    AND the linked transaction is NOT already type='transfer'
  const transferCandidates = await tx
    .select({
      bankTx: bankTransactions,
      txId: transactionSources.transactionId,
      txType: transactions.type,
    })
    .from(bankTransactions)
    .innerJoin(
      transactionSources,
      eq(transactionSources.bankTransactionId, bankTransactions.id),
    )
    .innerJoin(
      transactions,
      eq(transactions.id, transactionSources.transactionId),
    )
    .where(
      and(
        inArray(bankTransactions.counterpartyIban, ibanValues),
        not(eq(transactions.type, 'transfer')),
      ),
    )
    .orderBy(bankTransactions.date);

  console.log(`  Found ${transferCandidates.length} transfer candidates`);

  // Track already-paired transaction IDs to avoid double-pairing
  const alreadyPaired = new Set<number>();

  // Load existing transfer pairs
  const existingPairs = await tx.select().from(transferPairs);
  for (const pair of existingPairs) {
    alreadyPaired.add(pair.outgoingTransactionId);
    alreadyPaired.add(pair.incomingTransactionId);
  }

  for (const candidate of transferCandidates) {
    try {
      await processOneTransfer(
        tx,
        candidate.bankTx,
        candidate.txId,
        ownIbans,
        alreadyPaired,
        summary,
        isDryRun,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `  ERROR processing transfer candidate bank_tx #${candidate.bankTx.id}: ${message}`,
      );
      summary.errors++;
    }
  }
}

async function processOneTransfer(
  tx: Db,
  bankTx: typeof bankTransactions.$inferSelect,
  txId: number,
  ownIbans: Map<string, number>,
  alreadyPaired: Set<number>,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  // Skip if already paired
  if (alreadyPaired.has(txId)) {
    summary.transfersSkipped++;
    return;
  }

  // Check if already marked as transfer
  const txRows = await tx
    .select({ type: transactions.type })
    .from(transactions)
    .where(eq(transactions.id, txId))
    .limit(1);

  if (txRows.length > 0 && txRows[0]!.type === 'transfer') {
    summary.transfersSkipped++;
    return;
  }

  if (isDryRun) {
    console.log(
      `  [DRY RUN] Would mark tx #${txId} as transfer (bank_tx #${bankTx.id}, counterparty IBAN: ${bankTx.counterpartyIban})`,
    );
    summary.transfersDetected++;
    // Try to find counterpart for the report
    const counterpartResult = await findCounterpart(tx, bankTx, ownIbans);
    if (counterpartResult) {
      console.log(
        `  [DRY RUN] Would pair with counterpart tx #${counterpartResult.txId} (bank_tx #${counterpartResult.bankTxId})`,
      );
      summary.transfersPaired++;
    } else {
      summary.transfersUnpaired++;
    }
    return;
  }

  // 3. Update linked transaction to type='transfer'
  await tx
    .update(transactions)
    .set({ type: 'transfer' })
    .where(eq(transactions.id, txId));

  summary.transfersDetected++;

  // 4. Try to find counterpart
  const counterpart = await findCounterpart(tx, bankTx, ownIbans);

  if (counterpart && !alreadyPaired.has(counterpart.txId)) {
    // Update counterpart transaction to type='transfer'
    await tx
      .update(transactions)
      .set({ type: 'transfer' })
      .where(eq(transactions.id, counterpart.txId));

    // Determine outgoing/incoming by bank_transaction type
    const outgoingTxId = bankTx.type === 'debit' ? txId : counterpart.txId;
    const incomingTxId = bankTx.type === 'debit' ? counterpart.txId : txId;

    // Insert transfer_pairs row
    await tx.insert(transferPairs).values({
      outgoingTransactionId: outgoingTxId,
      incomingTransactionId: incomingTxId,
    });

    alreadyPaired.add(txId);
    alreadyPaired.add(counterpart.txId);

    console.log(
      `  Paired transfer: tx #${outgoingTxId} (out) <-> tx #${incomingTxId} (in)`,
    );
    summary.transfersPaired++;
  } else {
    console.log(
      `  Unpaired transfer: tx #${txId} (no counterpart found)`,
    );
    summary.transfersUnpaired++;
  }
}

async function findCounterpart(
  tx: Db,
  bankTx: typeof bankTransactions.$inferSelect,
  ownIbans: Map<string, number>,
): Promise<{ txId: number; bankTxId: number } | null> {
  if (!bankTx.counterpartyIban || !bankTx.accountId) {
    return null;
  }

  const counterpartyAccountId = ownIbans.get(bankTx.counterpartyIban);
  if (counterpartyAccountId === undefined) {
    return null;
  }

  // Get the current account's IBAN for matching
  const currentAccountRows = await tx
    .select({ iban: accounts.iban })
    .from(accounts)
    .where(eq(accounts.id, bankTx.accountId))
    .limit(1);

  const currentIban = currentAccountRows[0]?.iban;
  if (!currentIban) {
    return null;
  }

  // Find counterpart: bank_transaction on the other account with
  // counterparty_iban matching current account's IBAN, within +/- 2 day window
  const windowStart = new Date(bankTx.date);
  windowStart.setDate(windowStart.getDate() - TRANSFER_MATCH_WINDOW_DAYS);
  const windowEnd = new Date(bankTx.date);
  windowEnd.setDate(windowEnd.getDate() + TRANSFER_MATCH_WINDOW_DAYS);

  const counterpartBankTxRows = await tx
    .select({
      bankTxId: bankTransactions.id,
      txId: transactionSources.transactionId,
    })
    .from(bankTransactions)
    .innerJoin(
      transactionSources,
      eq(transactionSources.bankTransactionId, bankTransactions.id),
    )
    .leftJoin(
      transferPairs,
      sql`${transferPairs.outgoingTransactionId} = ${transactionSources.transactionId}
        OR ${transferPairs.incomingTransactionId} = ${transactionSources.transactionId}`,
    )
    .where(
      and(
        eq(bankTransactions.accountId, counterpartyAccountId),
        eq(bankTransactions.counterpartyIban, currentIban),
        gte(bankTransactions.date, windowStart),
        lte(bankTransactions.date, windowEnd),
        not(eq(bankTransactions.id, bankTx.id)),
        isNull(transferPairs.id),
      ),
    )
    .limit(1);

  if (counterpartBankTxRows.length === 0) {
    return null;
  }

  const row = counterpartBankTxRows[0]!;
  return { txId: row.txId, bankTxId: row.bankTxId };
}

// --- Phase 3: Fee splits ---

async function processFeeSplits(
  tx: Db,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  console.log('\n--- Phase 3: Fee splits ---');

  // Find bank_transactions with commission > 0
  const bankTxsWithFees = await tx
    .select({
      bankTx: bankTransactions,
      txId: transactionSources.transactionId,
    })
    .from(bankTransactions)
    .innerJoin(
      transactionSources,
      eq(transactionSources.bankTransactionId, bankTransactions.id),
    )
    .where(sql`${bankTransactions.commission} > 0`)
    .orderBy(bankTransactions.date);

  console.log(
    `  Found ${bankTxsWithFees.length} bank_transactions with commission > 0`,
  );

  for (const row of bankTxsWithFees) {
    try {
      await processOneFeeSplit(
        tx,
        row.bankTx,
        row.txId,
        summary,
        isDryRun,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `  ERROR processing fee split for bank_tx #${row.bankTx.id}: ${message}`,
      );
      summary.errors++;
    }
  }
}

async function processOneFeeSplit(
  tx: Db,
  bankTx: typeof bankTransactions.$inferSelect,
  txId: number,
  summary: Summary,
  isDryRun: boolean,
): Promise<void> {
  const commission = bankTx.commission ?? 0;
  if (commission <= 0) {
    return;
  }

  // Check if a fee split transaction already exists for this bank_transaction
  // (linked via transaction_sources and has description containing 'commission' or 'Bank commission')
  const existingFeeTxs = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(
      transactionSources,
      eq(transactionSources.transactionId, transactions.id),
    )
    .where(
      and(
        eq(transactionSources.bankTransactionId, bankTx.id),
        not(eq(transactions.id, txId)),
      ),
    )
    .limit(1);

  if (existingFeeTxs.length > 0) {
    summary.feeSplitsSkipped++;
    return;
  }

  // Get the main transaction to adjust its amount
  const mainTxRows = await tx
    .select()
    .from(transactions)
    .where(eq(transactions.id, txId))
    .limit(1);

  if (mainTxRows.length === 0) {
    console.warn(
      `  WARNING: Transaction #${txId} not found for fee split`,
    );
    summary.errors++;
    return;
  }

  const mainTx = mainTxRows[0]!;
  const currentAmount = Math.abs(mainTx.amount);

  // Don't create fee split if commission >= transaction amount
  if (commission >= currentAmount) {
    console.warn(
      `  WARNING: Commission (${commission}) >= transaction amount (${currentAmount}) for bank_tx #${bankTx.id}, skipping`,
    );
    summary.feeSplitsSkipped++;
    return;
  }

  if (isDryRun) {
    console.log(
      `  [DRY RUN] Would split fee from tx #${txId}: amount ${currentAmount} -> ${currentAmount - commission}, fee tx amount: ${commission}`,
    );
    summary.feeSplitsCreated++;
    return;
  }

  // 1. Reduce main transaction amount by commission
  const newAmount = currentAmount - commission;
  await tx
    .update(transactions)
    .set({ amount: newAmount })
    .where(eq(transactions.id, txId));

  // 2. Create fee transaction
  const feeTx: Transaction = {
    date: bankTx.date,
    amount: commission,
    currency: bankTx.currency,
    type: 'debit',
    accountId: bankTx.accountId,
    bankDescription: 'Bank commission',
    counterparty: 'Bank',
    categorizationStatus: 'pending',
  };

  const [insertedFeeTx] = await tx
    .insert(transactions)
    .values(feeTx)
    .returning({ id: transactions.id });

  // 3. Link fee transaction to the same bank_transaction
  await tx.insert(transactionSources).values({
    transactionId: insertedFeeTx!.id,
    bankTransactionId: bankTx.id,
  });

  console.log(
    `  Fee split: tx #${txId} reduced to ${newAmount}, fee tx #${insertedFeeTx!.id} created (${commission})`,
  );
  summary.feeSplitsCreated++;
}

// --- Summary ---

function printSummary(summary: Summary): void {
  console.log('\n========================================');
  console.log('Backfill Summary:');
  console.log('========================================');
  console.log(
    `  Transaction sources linked:  ${summary.transactionsLinked}`,
  );
  console.log(
    `  Transactions without bank:   ${summary.transactionsUnlinked}`,
  );
  console.log('');
  console.log(
    `  Returnings processed:        ${summary.returningsPartial + summary.returningsFull} (${summary.returningsPartial} partial, ${summary.returningsFull} full)`,
  );
  console.log(
    `  Returnings skipped:          ${summary.returningsSkipped} (already processed)`,
  );
  console.log(
    `  Returnings unmatched:        ${summary.returningsUnmatched} (no original found)`,
  );
  console.log('');
  console.log(
    `  Transfers detected:          ${summary.transfersDetected} (${summary.transfersPaired} paired, ${summary.transfersUnpaired} unpaired)`,
  );
  console.log(
    `  Transfers skipped:           ${summary.transfersSkipped} (already marked)`,
  );
  console.log('');
  console.log(
    `  Fee splits created:          ${summary.feeSplitsCreated}`,
  );
  console.log(
    `  Fee splits skipped:          ${summary.feeSplitsSkipped} (already existed)`,
  );
  console.log('');
  console.log(`  Errors:                      ${summary.errors}`);
  console.log('========================================\n');
}

// --- Main ---

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const isProduction = process.argv.includes('--production');

  const databaseUrl =
    process.env['DATABASE_URL'] ??
    'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

  assertDatabaseSafety(databaseUrl, isProduction);

  console.log(`Backfill transactions script`);
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`  Database: ${databaseUrl.replace(/\/\/.*@/, '//<credentials>@')}\n`);

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  const summary = createEmptySummary();

  try {
    await db
      .transaction(async (tx) => {
        await populateTransactionSources(tx, summary, isDryRun);
        await processReturnings(tx, summary, isDryRun);
        await processTransfers(tx, summary, isDryRun);
        await processFeeSplits(tx, summary, isDryRun);

        if (isDryRun) {
          throw new DryRunComplete();
        }
      })
      .catch((error) => {
        if (error instanceof DryRunComplete) {
          console.log('\nDry run complete - no changes were made.');
        } else {
          throw error;
        }
      });

    printSummary(summary);
  } catch (error) {
    console.error('\nBackfill FAILED:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
