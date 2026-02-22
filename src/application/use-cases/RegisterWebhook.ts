import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface RegisterWebhookRequest {
  webhookUrl: string;
}

export interface RegisterWebhookResult {
  success: boolean;
  error?: string;
}

@injectable()
export class RegisterWebhookUseCase extends UseCase<
  RegisterWebhookRequest,
  RegisterWebhookResult
> {
  constructor(@inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway) {
    super();
  }

  async execute(
    request: RegisterWebhookRequest,
  ): Promise<RegisterWebhookResult> {
    try {
      await this.bankGateway.setWebhook(request.webhookUrl);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}
