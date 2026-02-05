import type { Account } from '../entities/Account.ts';
import type { Money } from '../value-objects/Money.ts';
import { Repository } from './Repository.ts';

/**
 * Injection token for AccountRepository.
 * Use with @inject(ACCOUNT_REPOSITORY_TOKEN) in classes that depend on AccountRepository.
 */
export const ACCOUNT_REPOSITORY_TOKEN = Symbol('AccountRepository');

/**
 * Account-specific repository with additional query methods.
 * Extends the generic Repository with Account-specific operations.
 */
export abstract class AccountRepository extends Repository<Account, string> {
  /**
   * Find an account by its database ID.
   * @param dbId - The database serial ID
   */
  abstract findByDbId(dbId: number): Promise<Account | null>;

  abstract findByExternalId(externalId: string): Promise<Account | null>;
  abstract findByIban(iban: string): Promise<Account | null>;
  abstract findByBank(bank: string): Promise<Account[]>;

  /**
   * Find all non-archived accounts.
   */
  abstract findActive(): Promise<Account[]>;

  /**
   * Find an account by name.
   * @param name - The account name to search for
   */
  abstract findByName(name: string): Promise<Account | null>;

  abstract updateLastSyncTime(
    accountId: string,
    timestamp: number,
  ): Promise<void>;

  /**
   * Update the balance of an account.
   * @param externalId - The external ID of the account to update
   * @param newBalance - The new balance to set
   * @throws AccountNotFoundError if account with given externalId doesn't exist
   */
  abstract updateBalance(externalId: string, newBalance: Money): Promise<void>;
}
