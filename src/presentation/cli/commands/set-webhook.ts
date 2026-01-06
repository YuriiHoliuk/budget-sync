import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';

export function createSetWebhookCommand(
  container: DependencyContainer,
): Command {
  const command = new Command('set-webhook');

  command
    .description(
      'Register a webhook URL with Monobank for transaction notifications',
    )
    .argument(
      '<url>',
      'The webhook URL to register (e.g., https://your-service.run.app/webhook)',
    )
    .action(async (url: string) => {
      try {
        validateWebhookUrl(url);

        console.log(`Setting webhook URL: ${url}`);

        const bankGateway = container.resolve<BankGateway>(BANK_GATEWAY_TOKEN);
        await bankGateway.setWebhook(url);

        console.log('\nWebhook URL registered successfully!');
        console.log(
          'Note: Monobank will send a GET request to validate the URL.',
        );
        console.log(
          'Ensure your webhook endpoint is accessible and returns HTTP 200.',
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`\nFailed to set webhook: ${message}`);
        process.exit(1);
      }
    });

  return command;
}

function validateWebhookUrl(url: string): void {
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
