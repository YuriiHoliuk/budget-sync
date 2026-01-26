/**
 * SyncAccountsJob
 *
 * Cloud Run job that synchronizes accounts from Monobank to the spreadsheet.
 * Transactions are handled separately by webhooks.
 */

import { inject, injectable } from 'tsyringe';
import {
  type SyncAccountsResultDTO,
  SyncAccountsUseCase,
} from '../../application/use-cases/SyncAccounts.ts';
import { LOGGER_TOKEN, type Logger } from '../../modules/logging/Logger.ts';
import { Job, type JobResult } from './Job.ts';

@injectable()
export class SyncAccountsJob extends Job<SyncAccountsResultDTO> {
  constructor(
    @inject(LOGGER_TOKEN) protected logger: Logger,
    private syncAccountsUseCase: SyncAccountsUseCase,
  ) {
    super();
  }

  async execute(): Promise<SyncAccountsResultDTO> {
    const result = await this.syncAccountsUseCase.execute();

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        this.logger.error('Sync error', { error });
      }
    }

    return result;
  }

  protected override toJobResult(result: SyncAccountsResultDTO): JobResult {
    return {
      success: result.errors.length === 0,
      exitCode: result.errors.length > 0 ? 1 : 0,
      summary: {
        accountsCreated: result.created,
        accountsUpdated: result.updated,
        accountsUnchanged: result.unchanged,
        errorCount: result.errors.length,
      },
    };
  }
}
