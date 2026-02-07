/**
 * Dependency Injection Container Setup
 *
 * Configures TSyringe container with all dependencies for the budget-sync application.
 * Uses dual-write pattern: DB primary + Spreadsheet mirror.
 */

import 'reflect-metadata';

import { BANK_GATEWAY_TOKEN } from '@domain/gateways/BankGateway.ts';
import { LLM_GATEWAY_TOKEN } from '@domain/gateways/LLMGateway.ts';
import { MESSAGE_QUEUE_GATEWAY_TOKEN } from '@domain/gateways/MessageQueueGateway.ts';
import { ACCOUNT_REPOSITORY_TOKEN } from '@domain/repositories/AccountRepository.ts';
import { ALLOCATION_REPOSITORY_TOKEN } from '@domain/repositories/AllocationRepository.ts';
import { BUDGETIZATION_RULE_REPOSITORY_TOKEN } from '@domain/repositories/BudgetizationRuleRepository.ts';
import { BUDGET_REPOSITORY_TOKEN } from '@domain/repositories/BudgetRepository.ts';
import { CATEGORIZATION_RULE_REPOSITORY_TOKEN } from '@domain/repositories/CategorizationRuleRepository.ts';
import { CATEGORY_REPOSITORY_TOKEN } from '@domain/repositories/CategoryRepository.ts';
import { TRANSACTION_LINK_REPOSITORY_TOKEN } from '@domain/repositories/TransactionLinkRepository.ts';
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
import { DualWriteAccountRepository } from '@infrastructure/repositories/DualWriteAccountRepository.ts';
import { DualWriteBudgetizationRuleRepository } from '@infrastructure/repositories/DualWriteBudgetizationRuleRepository.ts';
import { DualWriteBudgetRepository } from '@infrastructure/repositories/DualWriteBudgetRepository.ts';
import { DualWriteCategorizationRuleRepository } from '@infrastructure/repositories/DualWriteCategorizationRuleRepository.ts';
import { DualWriteCategoryRepository } from '@infrastructure/repositories/DualWriteCategoryRepository.ts';
import { DualWriteTransactionRepository } from '@infrastructure/repositories/DualWriteTransactionRepository.ts';
import { DatabaseAccountRepository } from '@infrastructure/repositories/database/DatabaseAccountRepository.ts';
import { DatabaseAllocationRepository } from '@infrastructure/repositories/database/DatabaseAllocationRepository.ts';
import { DatabaseBudgetizationRuleRepository } from '@infrastructure/repositories/database/DatabaseBudgetizationRuleRepository.ts';
import { DatabaseBudgetRepository } from '@infrastructure/repositories/database/DatabaseBudgetRepository.ts';
import { DatabaseCategorizationRuleRepository } from '@infrastructure/repositories/database/DatabaseCategorizationRuleRepository.ts';
import { DatabaseCategoryRepository } from '@infrastructure/repositories/database/DatabaseCategoryRepository.ts';
import { DatabaseTransactionLinkRepository } from '@infrastructure/repositories/database/DatabaseTransactionLinkRepository.ts';
import { DatabaseTransactionRepository } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
import {
  DATABASE_ACCOUNT_REPOSITORY_TOKEN,
  DATABASE_ALLOCATION_REPOSITORY_TOKEN,
  DATABASE_BUDGET_REPOSITORY_TOKEN,
  DATABASE_BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  DATABASE_CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  DATABASE_CATEGORY_REPOSITORY_TOKEN,
  DATABASE_CLIENT_TOKEN,
  DATABASE_TRANSACTION_LINK_REPOSITORY_TOKEN,
  DATABASE_TRANSACTION_REPOSITORY_TOKEN,
} from '@infrastructure/repositories/database/tokens.ts';
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
import {
  SPREADSHEET_ACCOUNT_REPOSITORY_TOKEN,
  SPREADSHEET_BUDGET_REPOSITORY_TOKEN,
  SPREADSHEET_BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  SPREADSHEET_CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  SPREADSHEET_CATEGORY_REPOSITORY_TOKEN,
  SPREADSHEET_TRANSACTION_REPOSITORY_TOKEN,
} from '@infrastructure/repositories/spreadsheet/tokens.ts';
import { SpreadsheetAccountNameResolver } from '@infrastructure/services/AccountNameResolver.ts';
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

  // Register gateways
  container.register(BANK_GATEWAY_TOKEN, { useClass: MonobankGateway });
  container.register(MESSAGE_QUEUE_GATEWAY_TOKEN, {
    useClass: PubSubMessageQueueGateway,
  });

  // Account name resolver (needed by spreadsheet transaction repository)
  container.register(ACCOUNT_NAME_RESOLVER_TOKEN, {
    useClass: SpreadsheetAccountNameResolver,
  });

  // Register internal database repositories (used by dual-write orchestrators)
  container.register(DATABASE_ACCOUNT_REPOSITORY_TOKEN, {
    useClass: DatabaseAccountRepository,
  });
  container.register(DATABASE_TRANSACTION_REPOSITORY_TOKEN, {
    useClass: DatabaseTransactionRepository,
  });
  container.register(DATABASE_CATEGORY_REPOSITORY_TOKEN, {
    useClass: DatabaseCategoryRepository,
  });
  container.register(DATABASE_ALLOCATION_REPOSITORY_TOKEN, {
    useClass: DatabaseAllocationRepository,
  });
  container.register(DATABASE_BUDGET_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetRepository,
  });
  container.register(DATABASE_CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseCategorizationRuleRepository,
  });
  container.register(DATABASE_BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetizationRuleRepository,
  });
  container.register(DATABASE_TRANSACTION_LINK_REPOSITORY_TOKEN, {
    useClass: DatabaseTransactionLinkRepository,
  });

  // Register internal spreadsheet repositories (used by dual-write orchestrators)
  container.register(SPREADSHEET_ACCOUNT_REPOSITORY_TOKEN, {
    useClass: SpreadsheetAccountRepository,
  });
  container.register(SPREADSHEET_TRANSACTION_REPOSITORY_TOKEN, {
    useClass: SpreadsheetTransactionRepository,
  });
  container.register(SPREADSHEET_CATEGORY_REPOSITORY_TOKEN, {
    useClass: SpreadsheetCategoryRepository,
  });
  container.register(SPREADSHEET_BUDGET_REPOSITORY_TOKEN, {
    useClass: SpreadsheetBudgetRepository,
  });
  container.register(SPREADSHEET_CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: SpreadsheetCategorizationRuleRepository,
  });
  container.register(SPREADSHEET_BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: SpreadsheetBudgetizationRuleRepository,
  });

  // Register domain tokens → dual-write orchestrators (or direct DB for new features)
  container.register(ALLOCATION_REPOSITORY_TOKEN, {
    useClass: DatabaseAllocationRepository,
  });
  container.register(ACCOUNT_REPOSITORY_TOKEN, {
    useClass: DualWriteAccountRepository,
  });
  container.register(TRANSACTION_REPOSITORY_TOKEN, {
    useClass: DualWriteTransactionRepository,
  });
  container.register(CATEGORY_REPOSITORY_TOKEN, {
    useClass: DualWriteCategoryRepository,
  });
  container.register(BUDGET_REPOSITORY_TOKEN, {
    useClass: DualWriteBudgetRepository,
  });
  container.register(CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DualWriteCategorizationRuleRepository,
  });
  container.register(BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DualWriteBudgetizationRuleRepository,
  });
  container.register(TRANSACTION_LINK_REPOSITORY_TOKEN, {
    useClass: DatabaseTransactionLinkRepository,
  });

  // LLM Gateway (only registered if Gemini client is available)
  if (geminiClient) {
    container.register(LLM_GATEWAY_TOKEN, { useClass: GeminiLLMGateway });
  }

  return container;
}

export { container };
