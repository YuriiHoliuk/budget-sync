/**
 * Dependency Injection Container Setup
 *
 * Configures TSyringe container with all dependencies for the budget-sync application.
 * Uses type-based injection (abstract classes) rather than string tokens.
 */

import 'reflect-metadata';

import { BANK_GATEWAY_TOKEN } from '@domain/gateways/BankGateway.ts';
import { LLM_GATEWAY_TOKEN } from '@domain/gateways/LLMGateway.ts';
import { MESSAGE_QUEUE_GATEWAY_TOKEN } from '@domain/gateways/MessageQueueGateway.ts';
import { ACCOUNT_REPOSITORY_TOKEN } from '@domain/repositories/AccountRepository.ts';
import { BUDGETIZATION_RULE_REPOSITORY_TOKEN } from '@domain/repositories/BudgetizationRuleRepository.ts';
import { BUDGET_REPOSITORY_TOKEN } from '@domain/repositories/BudgetRepository.ts';
import { CATEGORIZATION_RULE_REPOSITORY_TOKEN } from '@domain/repositories/CategorizationRuleRepository.ts';
import { CATEGORY_REPOSITORY_TOKEN } from '@domain/repositories/CategoryRepository.ts';
import { TRANSACTION_REPOSITORY_TOKEN } from '@domain/repositories/TransactionRepository.ts';
import {
  GEMINI_CLIENT_TOKEN,
  GeminiLLMGateway,
} from '@infrastructure/gateways/llm/index.ts';
import {
  MONOBANK_CONFIG_TOKEN,
  MonobankGateway,
} from '@infrastructure/gateways/monobank/MonobankGateway.ts';
import {
  PUBSUB_CLIENT_TOKEN,
  PUBSUB_QUEUE_CONFIG_TOKEN,
  PubSubMessageQueueGateway,
} from '@infrastructure/gateways/pubsub/index.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  SpreadsheetAccountRepository,
} from '@infrastructure/repositories/SpreadsheetAccountRepository.ts';
import { SpreadsheetBudgetizationRuleRepository } from '@infrastructure/repositories/SpreadsheetBudgetizationRuleRepository.ts';
import { SpreadsheetBudgetRepository } from '@infrastructure/repositories/SpreadsheetBudgetRepository.ts';
import { SpreadsheetCategorizationRuleRepository } from '@infrastructure/repositories/SpreadsheetCategorizationRuleRepository.ts';
import { SpreadsheetCategoryRepository } from '@infrastructure/repositories/SpreadsheetCategoryRepository.ts';
import {
  ACCOUNT_NAME_RESOLVER_TOKEN,
  SpreadsheetTransactionRepository,
} from '@infrastructure/repositories/SpreadsheetTransactionRepository.ts';
import { SpreadsheetAccountNameResolver } from '@infrastructure/services/AccountNameResolver.ts';
import { GeminiClient } from '@modules/llm/index.ts';
import { PubSubClient } from '@modules/pubsub/index.ts';
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
 * Retrieves an optional environment variable.
 * Returns undefined if the variable is not set.
 */
function getOptionalEnv(variableName: string): string | undefined {
  return process.env[variableName];
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

  // Service account file is optional - uses ADC on Google Cloud
  const serviceAccountFile = getOptionalEnv('GOOGLE_SERVICE_ACCOUNT_FILE');
  const spreadsheetsClient = new SpreadsheetsClient(
    serviceAccountFile ? { serviceAccountFile } : {},
  );

  // Pub/Sub configuration
  const pubSubQueueConfig = {
    topicName: getOptionalEnv('PUBSUB_TOPIC') ?? 'webhook-transactions',
    subscriptionName:
      getOptionalEnv('PUBSUB_SUBSCRIPTION') ?? 'webhook-transactions-sub',
  };
  const gcpProjectId = getOptionalEnv('GCP_PROJECT_ID');
  const pubSubClient = new PubSubClient({
    projectId: gcpProjectId,
    serviceAccountFile,
  });

  // LLM configuration (Gemini API)
  const geminiApiKey = getOptionalEnv('GEMINI_API_KEY');
  const geminiClient = geminiApiKey
    ? new GeminiClient({ apiKey: geminiApiKey })
    : null;

  // Register infrastructure dependencies (config tokens and clients)
  container.register(SPREADSHEETS_CLIENT_TOKEN, {
    useValue: spreadsheetsClient,
  });
  container.register(MONOBANK_CONFIG_TOKEN, { useValue: monobankConfig });
  container.register(SPREADSHEET_CONFIG_TOKEN, { useValue: spreadsheetConfig });
  container.register(PUBSUB_CLIENT_TOKEN, { useValue: pubSubClient });
  container.register(PUBSUB_QUEUE_CONFIG_TOKEN, {
    useValue: pubSubQueueConfig,
  });

  // LLM Client (optional - categorization disabled if not configured)
  if (geminiClient) {
    container.register(GEMINI_CLIENT_TOKEN, { useValue: geminiClient });
  }

  // Register domain abstractions with their infrastructure implementations
  // Uses Symbol tokens defined in domain layer for type-safe injection
  container.register(BANK_GATEWAY_TOKEN, { useClass: MonobankGateway });
  container.register(MESSAGE_QUEUE_GATEWAY_TOKEN, {
    useClass: PubSubMessageQueueGateway,
  });
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

  // Category, Budget, and Categorization Rule repositories
  container.register(CATEGORY_REPOSITORY_TOKEN, {
    useClass: SpreadsheetCategoryRepository,
  });
  container.register(BUDGET_REPOSITORY_TOKEN, {
    useClass: SpreadsheetBudgetRepository,
  });
  container.register(CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: SpreadsheetCategorizationRuleRepository,
  });
  container.register(BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: SpreadsheetBudgetizationRuleRepository,
  });

  // LLM Gateway (only registered if Gemini client is available)
  if (geminiClient) {
    container.register(LLM_GATEWAY_TOKEN, { useClass: GeminiLLMGateway });
  }

  return container;
}

export { container };
