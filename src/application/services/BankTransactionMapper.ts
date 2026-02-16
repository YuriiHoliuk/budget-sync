import { BankTransaction } from '@domain/entities/BankTransaction.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';

/**
 * Maps a Transaction entity to a BankTransaction entity.
 *
 * Used when saving bank transaction records alongside regular transactions.
 * The BankTransaction preserves the raw bank data for auditing and future use.
 *
 * @param transaction - The Transaction entity (from bank gateway)
 * @param accountDbId - The numeric database ID of the account
 * @returns A new BankTransaction entity ready for persistence
 */
export function transactionToBankTransaction(
  transaction: Transaction,
  accountDbId: number,
): BankTransaction {
  return BankTransaction.create({
    externalId: transaction.externalId,
    accountId: accountDbId,
    accountExternalId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    currency: transaction.amount.currency,
    type: transaction.type,
    mcc: transaction.mcc,
    originalMcc: transaction.originalMcc,
    bankDescription: transaction.description,
    counterparty: transaction.counterpartyName,
    counterpartyIban: transaction.counterpartyIban,
    counterEdrpou: transaction.counterEdrpou,
    balanceAfter: transaction.balance,
    operationAmount: transaction.operationAmount,
    cashback: transaction.cashbackAmount,
    commission: transaction.commissionRate,
    hold: transaction.isHold,
    receiptId: transaction.receiptId,
    invoiceId: transaction.invoiceId,
  });
}
