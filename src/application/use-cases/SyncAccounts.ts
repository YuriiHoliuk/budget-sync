import type { Account } from '@domain/entities/Account.ts';
import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { inject, injectable } from 'tsyringe';

export interface SyncAccountsResultDTO {
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

@injectable()
export class SyncAccountsUseCase {
  constructor(
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
  ) {}

  async execute(): Promise<SyncAccountsResultDTO> {
    const result: SyncAccountsResultDTO = {
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
    };

    let bankAccounts: Account[];
    try {
      bankAccounts = await this.bankGateway.getAccounts();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to fetch accounts from bank: ${errorMessage}`);
      return result;
    }

    for (const incomingAccount of bankAccounts) {
      try {
        await this.processAccount(incomingAccount, result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(
          `Failed to process account ${incomingAccount.externalId}: ${errorMessage}`,
        );
      }
    }

    return result;
  }

  private async processAccount(
    incomingAccount: Account,
    result: SyncAccountsResultDTO,
  ): Promise<void> {
    const existingAccount = await this.findExistingAccount(incomingAccount);

    if (existingAccount) {
      if (this.hasAccountChanged(existingAccount, incomingAccount)) {
        await this.accountRepository.update(incomingAccount);
        result.updated++;
      } else {
        result.unchanged++;
      }
    } else {
      await this.accountRepository.save(incomingAccount);
      result.created++;
    }
  }

  private async findExistingAccount(
    incomingAccount: Account,
  ): Promise<Account | null> {
    const accountByExternalId = await this.accountRepository.findByExternalId(
      incomingAccount.externalId,
    );

    if (accountByExternalId) {
      return accountByExternalId;
    }

    if (incomingAccount.iban) {
      return this.accountRepository.findByIban(incomingAccount.iban);
    }

    return null;
  }

  private hasAccountChanged(
    existingAccount: Account,
    incomingAccount: Account,
  ): boolean {
    if (!existingAccount.balance.equals(incomingAccount.balance)) {
      return true;
    }

    if (existingAccount.name !== incomingAccount.name) {
      return true;
    }

    if (existingAccount.type !== incomingAccount.type) {
      return true;
    }

    if (existingAccount.iban !== incomingAccount.iban) {
      return true;
    }

    const existingMaskedPan = existingAccount.maskedPan ?? [];
    const incomingMaskedPan = incomingAccount.maskedPan ?? [];

    if (existingMaskedPan.length !== incomingMaskedPan.length) {
      return true;
    }

    for (let panIndex = 0; panIndex < existingMaskedPan.length; panIndex++) {
      if (existingMaskedPan[panIndex] !== incomingMaskedPan[panIndex]) {
        return true;
      }
    }

    return false;
  }
}
