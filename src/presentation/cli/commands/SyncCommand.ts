import type {
  SyncMonobankOptions,
  SyncMonobankResultDTO,
} from '@application/use-cases/SyncMonobank.ts';
// biome-ignore lint/style/useImportType: Required at runtime for tsyringe DI
import { SyncMonobankUseCase } from '@application/use-cases/SyncMonobank.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging';
import { inject, injectable } from 'tsyringe';
import { Command, type CommandMeta } from '../Command.ts';

interface SyncOptions {
  delay: number;
  from?: Date;
}

@injectable()
export class SyncCommand extends Command<SyncOptions> {
  meta: CommandMeta = {
    name: 'sync',
    description: 'Synchronize accounts and transactions from Monobank',
    options: [
      {
        flags: '--delay <ms>',
        description: 'Delay between API requests in milliseconds',
        defaultValue: 5000,
        parse: (value: string) => Number.parseInt(value, 10),
      },
      {
        flags: '--from <date>',
        description: 'Sync from date (YYYY-MM-DD)',
        parse: (value: string) => {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${value}. Use YYYY-MM-DD`);
          }
          return date;
        },
      },
    ],
  };

  constructor(
    private syncMonobankUseCase: SyncMonobankUseCase,
    @inject(LOGGER_TOKEN) protected logger: Logger,
  ) {
    super();
  }

  async execute(options: SyncOptions): Promise<void> {
    this.logger.info('Starting Monobank synchronization...');
    this.logger.info(
      'Note: This may take several minutes due to API rate limits.\n',
    );

    const syncOptions = this.buildSyncOptions(options);
    this.logSyncFromDate(syncOptions.earliestSyncDate);

    const result = await this.syncMonobankUseCase.execute(syncOptions);

    this.printSummary(result);

    if (result.errors.length > 0) {
      this.printErrors(result.errors);
      process.exit(1);
    }

    this.logger.info('\nDone!');
  }

  private buildSyncOptions(options: SyncOptions): SyncMonobankOptions {
    const syncOptions: SyncMonobankOptions = {
      requestDelayMs: options.delay,
    };

    // CLI --from flag takes precedence over env variable
    const syncFromDate = options.from ?? this.parseSyncFromDateEnv();
    if (syncFromDate) {
      syncOptions.earliestSyncDate = syncFromDate;
      syncOptions.forceFromDate = true;
    }

    return syncOptions;
  }

  private parseSyncFromDateEnv(): Date | undefined {
    const syncFromDateStr = process.env['SYNC_FROM_DATE'];
    if (!syncFromDateStr) {
      return undefined;
    }

    const date = new Date(syncFromDateStr);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid SYNC_FROM_DATE format: ${syncFromDateStr}. Use YYYY-MM-DD`,
      );
    }

    return date;
  }

  private logSyncFromDate(earliestSyncDate: Date | undefined): void {
    if (earliestSyncDate) {
      const dateStr = earliestSyncDate.toISOString().split('T')[0];
      this.logger.info(`Syncing from date: ${dateStr}\n`);
    }
  }

  private printSummary(result: SyncMonobankResultDTO): void {
    this.logger.info('\nSynchronization completed:');
    this.logger.info('\nAccounts:');
    this.logger.info(`  Created:   ${result.accounts.created}`);
    this.logger.info(`  Updated:   ${result.accounts.updated}`);
    this.logger.info(`  Unchanged: ${result.accounts.unchanged}`);

    this.logger.info('\nTransactions:');
    this.logger.info(
      `  Accounts synced: ${result.transactions.syncedAccounts}/${result.transactions.totalAccounts}`,
    );
    this.logger.info(`  New:      ${result.transactions.newTransactions}`);
    this.logger.info(`  Updated:  ${result.transactions.updatedTransactions}`);
    this.logger.info(`  Skipped:  ${result.transactions.skippedTransactions}`);
  }

  private printErrors(errors: string[]): void {
    this.logger.error('\nErrors:');
    for (const error of errors) {
      this.logger.error(`  - ${error}`);
    }
  }
}
