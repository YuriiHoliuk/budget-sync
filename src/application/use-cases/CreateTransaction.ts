import type { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  AccountNotFoundError,
  ManualTransactionNotAllowedError,
} from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { Money, TransactionType } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateTransactionRequestDTO {
  /** Account database ID - must be a manual account */
  accountId: number;
  /** Transaction date as ISO string */
  date: string;
  /** Amount in major units (e.g., 100.50) - always positive */
  amount: number;
  /** Transaction type */
  type: 'CREDIT' | 'DEBIT';
  /** Description of the transaction */
  description: string;
  /** Optional counterparty name */
  counterpartyName?: string | null;
  /** Optional counterparty IBAN */
  counterpartyIban?: string | null;
  /** Optional MCC code */
  mcc?: number | null;
  /** Optional notes */
  notes?: string | null;
}

@injectable()
export class CreateTransactionUseCase extends UseCase<
  CreateTransactionRequestDTO,
  Transaction
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: CreateTransactionRequestDTO): Promise<Transaction> {
    const account = await this.findAndValidateAccount(request.accountId);
    const transaction = this.buildTransaction(request, account);
    const saved = await this.transactionRepository.saveManyAndReturn([
      transaction,
    ]);
    const savedTransaction = saved[0];
    if (!savedTransaction) {
      throw new Error('Failed to save transaction');
    }
    return savedTransaction;
  }

  private async findAndValidateAccount(accountId: number): Promise<Account> {
    const account = await this.accountRepository.findByDbId(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId.toString(), 'id');
    }
    if (account.isSynced) {
      throw new ManualTransactionNotAllowedError(accountId);
    }
    return account;
  }

  private buildTransaction(
    request: CreateTransactionRequestDTO,
    account: Account,
  ): Transaction {
    const amountInMinor = Math.round(request.amount * 100);
    const amount = Money.create(amountInMinor, account.currency);
    const type =
      request.type === 'CREDIT'
        ? TransactionType.CREDIT
        : TransactionType.DEBIT;

    return Transaction.create({
      externalId: this.generateExternalId(),
      date: new Date(request.date),
      amount,
      description: request.description,
      type,
      accountId: account.externalId,
      counterpartyName: request.counterpartyName ?? undefined,
      counterpartyIban: request.counterpartyIban ?? undefined,
      mcc: request.mcc ?? undefined,
      comment: request.notes ?? undefined,
    });
  }

  private generateExternalId(): string {
    return `manual-txn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
