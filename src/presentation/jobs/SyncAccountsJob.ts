/**
 * SyncAccountsJob
 *
 * Cloud Run job that synchronizes accounts from Monobank to the spreadsheet.
 * Transactions are handled separately by webhooks.
 *
 * After sync, re-registers the webhook URL with Monobank as a safety net.
 * If the webhook was disabled (e.g., due to timeouts), it's restored within 3 hours.
 */

import { inject, injectable } from 'tsyringe';
import {
  type RegisterWebhookResult,
  RegisterWebhookUseCase,
} from '../../application/use-cases/RegisterWebhook.ts';
import {
  type SyncAccountsResultDTO,
  SyncAccountsUseCase,
} from '../../application/use-cases/SyncAccounts.ts';
import { LOGGER_TOKEN, type Logger } from '../../modules/logging/Logger.ts';
import { Job, type JobResult } from './Job.ts';

interface SyncAccountsJobResult extends SyncAccountsResultDTO {
  webhookRegistration?: RegisterWebhookResult;
}

@injectable()
export class SyncAccountsJob extends Job<SyncAccountsJobResult> {
  private webhookUrl: string | undefined;

  constructor(
    @inject(LOGGER_TOKEN) protected logger: Logger,
    private syncAccountsUseCase: SyncAccountsUseCase,
    private registerWebhookUseCase: RegisterWebhookUseCase,
  ) {
    super();
  }

  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  async execute(): Promise<SyncAccountsJobResult> {
    const syncResult = await this.syncAccountsUseCase.execute();

    if (syncResult.errors.length > 0) {
      for (const error of syncResult.errors) {
        this.logger.error('Sync error', { error });
      }
    }

    const webhookResult = await this.registerWebhook();

    return { ...syncResult, webhookRegistration: webhookResult };
  }

  protected override toJobResult(result: SyncAccountsJobResult): JobResult {
    return {
      success: result.errors.length === 0,
      exitCode: result.errors.length > 0 ? 1 : 0,
      summary: {
        accountsCreated: result.created,
        accountsUpdated: result.updated,
        accountsUnchanged: result.unchanged,
        errorCount: result.errors.length,
        webhookRegistered: result.webhookRegistration?.success ?? 'skipped',
      },
    };
  }

  private async registerWebhook(): Promise<RegisterWebhookResult | undefined> {
    if (!this.webhookUrl) {
      this.logger.info('WEBHOOK_URL not set, skipping webhook registration');
      return undefined;
    }

    const result = await this.registerWebhookUseCase.execute({
      webhookUrl: this.webhookUrl,
    });

    if (result.success) {
      this.logger.info('Webhook registered successfully', {
        url: this.webhookUrl,
      });
    } else {
      this.logger.warn('Webhook registration failed (non-fatal)', {
        error: result.error,
      });
    }

    return result;
  }
}
