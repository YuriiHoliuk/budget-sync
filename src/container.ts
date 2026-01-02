/**
 * Dependency Injection Container Setup
 *
 * Configures TSyringe container with all dependencies for the budget-sync application.
 * Uses type-based injection (abstract classes) rather than string tokens.
 */

import 'reflect-metadata';

import { BANK_GATEWAY_TOKEN } from '@domain/gateways/BankGateway.ts';
import { ACCOUNT_REPOSITORY_TOKEN } from '@domain/repositories/AccountRepository.ts';
import { TRANSACTION_REPOSITORY_TOKEN } from '@domain/repositories/TransactionRepository.ts';
import {
  MONOBANK_CONFIG_TOKEN,
  MonobankGateway,
} from '@infrastructure/gateways/monobank/MonobankGateway.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  SpreadsheetAccountRepository,
} from '@infrastructure/repositories/SpreadsheetAccountRepository.ts';
import {
  ACCOUNT_NAME_RESOLVER_TOKEN,
  SpreadsheetTransactionRepository,
} from '@infrastructure/repositories/SpreadsheetTransactionRepository.ts';
import { SpreadsheetAccountNameResolver } from '@infrastructure/services/AccountNameResolver.ts';
import { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import { container } from 'tsyringe';

/**
 * Retrieves a required environment variable.
 * Throws an error with a descriptive message if the variable is not set.
 */
function getRequiredEnv(variableName: string): string {
  const value = process.env[variableName];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${variableName}. ` +
        'Please ensure it is set in your .env file or environment.',
    );
  }

  return value;
}

/**
 * Sets up the dependency injection container with all required dependencies.
 *
 * This function should be called once at application startup, before
 * resolving any dependencies from the container.
 *
 * @returns The configured TSyringe container
 */
export function setupContainer(): typeof container {
  // Load configuration from environment variables
  const monobankConfig = {
    token: getRequiredEnv('MONOBANK_TOKEN'),
  };

  const spreadsheetConfig = {
    spreadsheetId: getRequiredEnv('SPREADSHEET_ID'),
  };

  const spreadsheetsClient = new SpreadsheetsClient({
    serviceAccountFile: getRequiredEnv('GOOGLE_SERVICE_ACCOUNT_FILE'),
  });

  // Register infrastructure dependencies (config tokens and clients)
  container.register(SPREADSHEETS_CLIENT_TOKEN, {
    useValue: spreadsheetsClient,
  });
  container.register(MONOBANK_CONFIG_TOKEN, { useValue: monobankConfig });
  container.register(SPREADSHEET_CONFIG_TOKEN, { useValue: spreadsheetConfig });

  // Register domain abstractions with their infrastructure implementations
  // Uses Symbol tokens defined in domain layer for type-safe injection
  container.register(BANK_GATEWAY_TOKEN, { useClass: MonobankGateway });
  container.register(ACCOUNT_REPOSITORY_TOKEN, {
    useClass: SpreadsheetAccountRepository,
  });

  // Account name resolver (needed by transaction repository)
  container.register(ACCOUNT_NAME_RESOLVER_TOKEN, {
    useClass: SpreadsheetAccountNameResolver,
  });

  // Transaction repository
  container.register(TRANSACTION_REPOSITORY_TOKEN, {
    useClass: SpreadsheetTransactionRepository,
  });

  return container;
}

export { container };
