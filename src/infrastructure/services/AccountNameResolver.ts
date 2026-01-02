import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import type { AccountNameResolver } from '@infrastructure/repositories/SpreadsheetTransactionRepository.ts';
import { inject, injectable } from 'tsyringe';

/**
 * Resolves account IDs to account names with caching.
 * Used by SpreadsheetTransactionRepository to display account names in spreadsheet.
 */
@injectable()
export class SpreadsheetAccountNameResolver implements AccountNameResolver {
  private cache = new Map<string, string>();

  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
  ) {}

  async getAccountName(accountId: string): Promise<string> {
    // Return from cache if available
    const cached = this.cache.get(accountId);
    if (cached !== undefined) {
      return cached;
    }

    // Lookup from repository
    const account = await this.accountRepository.findByExternalId(accountId);
    const name = account?.name ?? accountId;

    // Cache and return
    this.cache.set(accountId, name);
    return name;
  }
}
