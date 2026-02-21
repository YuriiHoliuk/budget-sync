/**
 * Dependency Injection Container Setup
 *
 * Configures TSyringe container with all dependencies for the budget-sync application.
 * All repository tokens point directly to Database implementations.
 */

import 'reflect-metadata';

import { BANK_GATEWAY_TOKEN } from '@domain/gateways/BankGateway.ts';
import { CATEGORIZATION_QUEUE_GATEWAY_TOKEN } from '@domain/gateways/CategorizationQueueGateway.ts';
import { LLM_GATEWAY_TOKEN } from '@domain/gateways/LLMGateway.ts';
import { MESSAGE_QUEUE_GATEWAY_TOKEN } from '@domain/gateways/MessageQueueGateway.ts';
import { ACCOUNT_REPOSITORY_TOKEN } from '@domain/repositories/AccountRepository.ts';
import { ALLOCATION_REPOSITORY_TOKEN } from '@domain/repositories/AllocationRepository.ts';
import { BANK_TRANSACTION_REPOSITORY_TOKEN } from '@domain/repositories/BankTransactionRepository.ts';
import { BUDGET_GROUP_REPOSITORY_TOKEN } from '@domain/repositories/BudgetGroupRepository.ts';
import { BUDGETIZATION_RULE_REPOSITORY_TOKEN } from '@domain/repositories/BudgetizationRuleRepository.ts';
import { BUDGET_REPOSITORY_TOKEN } from '@domain/repositories/BudgetRepository.ts';
import { BUDGET_TARGET_REPOSITORY_TOKEN } from '@domain/repositories/BudgetTargetRepository.ts';
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
  CATEGORIZATION_TOPIC_TOKEN,
  PUBSUB_CLIENT_TOKEN,
  PUBSUB_QUEUE_CONFIG_TOKEN,
  PubSubCategorizationQueueGateway,
  PubSubMessageQueueGateway,
} from '@infrastructure/gateways/pubsub/index.ts';
import { DatabaseAccountRepository } from '@infrastructure/repositories/database/DatabaseAccountRepository.ts';
import { DatabaseAllocationRepository } from '@infrastructure/repositories/database/DatabaseAllocationRepository.ts';
import { DatabaseBankTransactionRepository } from '@infrastructure/repositories/database/DatabaseBankTransactionRepository.ts';
import { DatabaseBudgetGroupRepository } from '@infrastructure/repositories/database/DatabaseBudgetGroupRepository.ts';
import { DatabaseBudgetizationRuleRepository } from '@infrastructure/repositories/database/DatabaseBudgetizationRuleRepository.ts';
import { DatabaseBudgetRepository } from '@infrastructure/repositories/database/DatabaseBudgetRepository.ts';
import { DatabaseBudgetTargetRepository } from '@infrastructure/repositories/database/DatabaseBudgetTargetRepository.ts';
import { DatabaseCategorizationRuleRepository } from '@infrastructure/repositories/database/DatabaseCategorizationRuleRepository.ts';
import { DatabaseCategoryRepository } from '@infrastructure/repositories/database/DatabaseCategoryRepository.ts';
import { DatabaseTransactionRepository } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
import { DATABASE_CLIENT_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
} from '@infrastructure/repositories/SpreadsheetAccountRepository.ts';
import { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { GeminiClient } from '@modules/llm/index.ts';
import { ConsoleLogger, LOGGER_TOKEN } from '@modules/logging/index.ts';
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
  const categorizationTopic =
    getOptionalEnv('CATEGORIZATION_TOPIC') ?? 'categorization-queue';
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

  // Database configuration
  const databaseUrl = getRequiredEnv('DATABASE_URL');
  const databaseClient = new DatabaseClient({ url: databaseUrl });

  // Register Logger
  container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });

  // Register infrastructure clients
  container.register(SPREADSHEETS_CLIENT_TOKEN, {
    useValue: spreadsheetsClient,
  });
  container.register(MONOBANK_CONFIG_TOKEN, { useValue: monobankConfig });
  container.register(SPREADSHEET_CONFIG_TOKEN, { useValue: spreadsheetConfig });
  container.register(PUBSUB_CLIENT_TOKEN, { useValue: pubSubClient });
  container.register(PUBSUB_QUEUE_CONFIG_TOKEN, {
    useValue: pubSubQueueConfig,
  });
  container.register(DATABASE_CLIENT_TOKEN, { useValue: databaseClient });

  // LLM Client (optional - categorization disabled if not configured)
  if (geminiClient) {
    container.register(GEMINI_CLIENT_TOKEN, { useValue: geminiClient });
  }

  // Register categorization queue config
  container.register(CATEGORIZATION_TOPIC_TOKEN, {
    useValue: categorizationTopic,
  });

  // Register gateways
  container.register(BANK_GATEWAY_TOKEN, { useClass: MonobankGateway });
  container.register(MESSAGE_QUEUE_GATEWAY_TOKEN, {
    useClass: PubSubMessageQueueGateway,
  });
  container.register(CATEGORIZATION_QUEUE_GATEWAY_TOKEN, {
    useClass: PubSubCategorizationQueueGateway,
  });

  // Register repositories (all direct Database implementations)
  container.register(BANK_TRANSACTION_REPOSITORY_TOKEN, {
    useClass: DatabaseBankTransactionRepository,
  });
  container.register(ACCOUNT_REPOSITORY_TOKEN, {
    useClass: DatabaseAccountRepository,
  });
  container.register(TRANSACTION_REPOSITORY_TOKEN, {
    useClass: DatabaseTransactionRepository,
  });
  container.register(CATEGORY_REPOSITORY_TOKEN, {
    useClass: DatabaseCategoryRepository,
  });
  container.register(ALLOCATION_REPOSITORY_TOKEN, {
    useClass: DatabaseAllocationRepository,
  });
  container.register(BUDGET_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetRepository,
  });
  container.register(CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseCategorizationRuleRepository,
  });
  container.register(BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetizationRuleRepository,
  });
  container.register(BUDGET_TARGET_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetTargetRepository,
  });
  container.register(BUDGET_GROUP_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetGroupRepository,
  });

  // LLM Gateway (only registered if Gemini client is available)
  if (geminiClient) {
    container.register(LLM_GATEWAY_TOKEN, { useClass: GeminiLLMGateway });
  }

  return container;
}

export { container };
