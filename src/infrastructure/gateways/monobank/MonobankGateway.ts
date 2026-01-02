import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import { BankGateway } from '@domain/gateways/BankGateway.ts';
import { inject, injectable } from 'tsyringe';
import {
  MonobankApiError,
  MonobankAuthError,
  MonobankRateLimitError,
} from './errors.ts';
import { MonobankMapper } from './MonobankMapper.ts';
import type {
  MonobankClientInfo,
  MonobankErrorResponse,
  MonobankStatementItem,
} from './types.ts';

export interface MonobankConfig {
  token: string;
  baseUrl?: string;
}

export const MONOBANK_CONFIG_TOKEN = Symbol('MonobankConfig');

@injectable()
export class MonobankGateway extends BankGateway {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly mapper: MonobankMapper;

  constructor(@inject(MONOBANK_CONFIG_TOKEN) config: MonobankConfig) {
    super();
    this.baseUrl = config.baseUrl ?? 'https://api.monobank.ua';
    this.token = config.token;
    this.mapper = new MonobankMapper();
  }

  async getAccounts(): Promise<Account[]> {
    const clientInfo = await this.request<MonobankClientInfo>(
      '/personal/client-info',
    );
    return clientInfo.accounts.map((account) => this.mapper.toAccount(account));
  }

  async getTransactions(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]> {
    this.validateDateRange(from, to);

    const fromTimestamp = Math.floor(from.getTime() / 1000);
    const toTimestamp = Math.floor(to.getTime() / 1000);

    const path = `/personal/statement/${accountId}/${fromTimestamp}/${toTimestamp}`;
    const items = await this.request<MonobankStatementItem[]>(path);

    return items.map((item) => this.mapper.toTransaction(item, accountId));
  }

  private async request<TResponse>(path: string): Promise<TResponse> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Token': this.token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<TResponse>;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorDescription: string | undefined;

    try {
      const errorBody = (await response.json()) as MonobankErrorResponse;
      errorDescription = errorBody.errorDescription;
    } catch {
      // Response body is not JSON
    }

    const message =
      errorDescription ?? `Monobank API error: ${response.status}`;

    switch (response.status) {
      case 401:
      case 403:
        throw new MonobankAuthError(message);
      case 429:
        throw new MonobankRateLimitError(message);
      default:
        throw new MonobankApiError(message, response.status, errorDescription);
    }
  }

  private validateDateRange(from: Date, to: Date): void {
    if (from > to) {
      throw new Error('Start date must be before end date');
    }

    const maxRangeMs = 31 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000; // 31 days + 1 hour
    const rangeMs = to.getTime() - from.getTime();

    if (rangeMs > maxRangeMs) {
      throw new Error('Date range cannot exceed 31 days and 1 hour');
    }
  }
}
