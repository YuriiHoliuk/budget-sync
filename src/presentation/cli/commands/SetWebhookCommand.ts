import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { inject, injectable } from 'tsyringe';
import { Command, type CommandMeta } from '../Command.ts';

type SetWebhookArgs = [url: string];

@injectable()
export class SetWebhookCommand extends Command<
  Record<string, never>,
  SetWebhookArgs
> {
  meta: CommandMeta = {
    name: 'set-webhook',
    description:
      'Register a webhook URL with Monobank for transaction notifications',
    arguments: [
      {
        name: 'url',
        description:
          'The webhook URL to register (e.g., https://your-service.run.app/webhook)',
        required: true,
      },
    ],
  };

  constructor(
    @inject(LOGGER_TOKEN) protected logger: Logger,
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
  ) {
    super();
  }

  protected override validate(
    _options: Record<string, never>,
    args: SetWebhookArgs,
  ): void {
    const [url] = args;
    this.validateWebhookUrl(url);
  }

  async execute(
    _options: Record<string, never>,
    args: SetWebhookArgs,
  ): Promise<void> {
    const [url] = args;

    this.logger.info(`Setting webhook URL: ${url}`);

    await this.bankGateway.setWebhook(url);

    this.logger.info('\nWebhook URL registered successfully!');
    this.logger.info(
      'Note: Monobank will send a GET request to validate the URL.',
    );
    this.logger.info(
      'Ensure your webhook endpoint is accessible and returns HTTP 200.',
    );
  }

  private validateWebhookUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS protocol');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL format: ${url}`);
      }
      throw error;
    }
  }
}
