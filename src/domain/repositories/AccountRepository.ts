import type { Account } from '../entities/Account.ts';
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
  abstract findByExternalId(externalId: string): Promise<Account | null>;
  abstract findByIban(iban: string): Promise<Account | null>;
  abstract findByBank(bank: string): Promise<Account[]>;
  abstract updateLastSyncTime(
    accountId: string,
    timestamp: number,
  ): Promise<void>;
}
