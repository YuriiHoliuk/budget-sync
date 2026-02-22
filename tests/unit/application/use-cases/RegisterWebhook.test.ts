import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { RegisterWebhookUseCase } from '@application/use-cases/RegisterWebhook.ts';
import { createMockBankGateway } from '../../helpers/mocks.ts';

describe('RegisterWebhookUseCase', () => {
  test('should register webhook successfully', async () => {
    const setWebhook = mock(() => Promise.resolve());
    const bankGateway = createMockBankGateway({ setWebhook });
    const useCase = new RegisterWebhookUseCase(bankGateway);

    const result = await useCase.execute({
      webhookUrl: 'https://example.com/webhook',
    });

    expect(result).toEqual({ success: true });
    expect(setWebhook).toHaveBeenCalledWith('https://example.com/webhook');
  });

  test('should return error when gateway throws Error', async () => {
    const setWebhook = mock(() =>
      Promise.reject(new Error('Monobank API unavailable')),
    );
    const bankGateway = createMockBankGateway({ setWebhook });
    const useCase = new RegisterWebhookUseCase(bankGateway);

    const result = await useCase.execute({
      webhookUrl: 'https://example.com/webhook',
    });

    expect(result).toEqual({
      success: false,
      error: 'Monobank API unavailable',
    });
  });

  test('should handle non-Error throw', async () => {
    const setWebhook = mock(() => Promise.reject('unexpected string error'));
    const bankGateway = createMockBankGateway({ setWebhook });
    const useCase = new RegisterWebhookUseCase(bankGateway);

    const result = await useCase.execute({
      webhookUrl: 'https://example.com/webhook',
    });

    expect(result).toEqual({
      success: false,
      error: 'unexpected string error',
    });
  });
});
