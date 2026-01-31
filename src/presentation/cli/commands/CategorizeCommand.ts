import { CategorizeTransactionUseCase } from '@application/use-cases/CategorizeTransaction.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging';
import { inject, injectable } from 'tsyringe';
import { Command, type CommandMeta } from '../Command.ts';

interface CategorizeOptions {
  limit: number;
  delay: number;
}

@injectable()
export class CategorizeCommand extends Command<CategorizeOptions> {
  meta: CommandMeta = {
    name: 'categorize',
    description: 'Categorize uncategorized transactions using LLM',
    options: [
      {
        flags: '--limit <count>',
        description: 'Maximum number of transactions to categorize',
        defaultValue: 100,
        parse: (value: string) => Number.parseInt(value, 10),
      },
      {
        flags: '--delay <ms>',
        description: 'Delay between categorizations in milliseconds',
        defaultValue: 3000,
        parse: (value: string) => Number.parseInt(value, 10),
      },
    ],
  };

  constructor(
    private categorizeUseCase: CategorizeTransactionUseCase,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(LOGGER_TOKEN) protected logger: Logger,
  ) {
    super();
  }

  async execute(options: CategorizeOptions): Promise<void> {
    const uncategorized = await this.transactionRepository.findUncategorized();
    const transactions = uncategorized.slice(0, options.limit);
    this.logger.info(
      `Found ${uncategorized.length} uncategorized transactions, processing ${transactions.length}`,
    );

    const { categorized, failed } = await this.categorizeAll(
      transactions,
      options.delay,
    );

    this.logger.info(`\nDone: ${categorized} categorized, ${failed} failed`);

    if (failed > 0) {
      process.exit(1);
    }
  }

  private async categorizeAll(
    transactions: Transaction[],
    delayMs: number,
  ): Promise<{ categorized: number; failed: number }> {
    let categorized = 0;
    let failed = 0;

    for (const transaction of transactions) {
      const success = await this.categorizeTransaction(
        transaction,
        categorized + failed + 1,
        transactions.length,
      );

      if (success) {
        categorized++;
      } else {
        failed++;
      }

      if (categorized + failed < transactions.length) {
        await this.sleep(delayMs);
      }
    }

    return { categorized, failed };
  }

  private async categorizeTransaction(
    transaction: Transaction,
    index: number,
    total: number,
  ): Promise<boolean> {
    try {
      const result = await this.categorizeUseCase.execute({
        transactionExternalId: transaction.externalId,
      });
      this.logger.info(
        `[${index}/${total}] ${transaction.externalId}: ${result.category ?? 'no category'} / ${result.budget ?? 'no budget'}`,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${index}/${total}] ${transaction.externalId}: ${message}`,
      );
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
