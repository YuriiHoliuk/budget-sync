/**
 * Test DI Container Setup
 *
 * Configures TSyringe container for API integration tests:
 * - Real PostgreSQL database (local Docker instance)
 * - Database repositories (no dual-write to spreadsheet)
 * - Mocked external gateways (bank, message queue, LLM)
 *
 * This is similar to container.local.ts but optimized for testing.
 *
 * SAFETY:
 * - Validates DATABASE_URL doesn't point to production (neon.tech, supabase.co, etc.)
 * - Run tests via `just test-api` which sets DATABASE_URL to test database
 * - Defaults to local Docker test database on port 5433
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
import { MockBankGateway } from '@infrastructure/gateways/mocks/MockBankGateway.ts';
import { MockLLMGateway } from '@infrastructure/gateways/mocks/MockLLMGateway.ts';
import { MockMessageQueueGateway } from '@infrastructure/gateways/mocks/MockMessageQueueGateway.ts';
import { DatabaseAccountRepository } from '@infrastructure/repositories/database/DatabaseAccountRepository.ts';
import { DatabaseAllocationRepository } from '@infrastructure/repositories/database/DatabaseAllocationRepository.ts';
import { DatabaseBudgetizationRuleRepository } from '@infrastructure/repositories/database/DatabaseBudgetizationRuleRepository.ts';
import { DatabaseBudgetRepository } from '@infrastructure/repositories/database/DatabaseBudgetRepository.ts';
import { DatabaseCategorizationRuleRepository } from '@infrastructure/repositories/database/DatabaseCategorizationRuleRepository.ts';
import { DatabaseCategoryRepository } from '@infrastructure/repositories/database/DatabaseCategoryRepository.ts';
import { DatabaseTransactionLinkRepository } from '@infrastructure/repositories/database/DatabaseTransactionLinkRepository.ts';
import { DatabaseTransactionRepository } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
import { DATABASE_CLIENT_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
import { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import {
  ConsoleLogger,
  LOGGER_TOKEN,
  SilentLogger,
} from '@modules/logging/index.ts';
import { container } from 'tsyringe';

/**
 * Patterns that indicate a production database.
 * If the database URL matches any of these, tests will be blocked.
 */
const PRODUCTION_DB_PATTERNS = [
  'neon.tech', // Neon Serverless Postgres (production)
  'supabase.co', // Supabase
  'aws.neon.tech', // Neon AWS endpoints
  '.cloud.', // Generic cloud indicators
];

/**
 * Check if the database URL looks like a production database.
 * This is a safety check to prevent running destructive tests on production.
 */
function looksLikeProductionDatabase(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return PRODUCTION_DB_PATTERNS.some((pattern) => lowerUrl.includes(pattern));
}

/**
 * Get the database URL for tests.
 *
 * SAFETY: Validates that DATABASE_URL doesn't point to a production database.
 * Tests should be run via `just test-api` which sets DATABASE_URL to the test database.
 *
 * If DATABASE_URL is not set, falls back to local Docker default.
 *
 * @throws Error if the database URL looks like a production database
 */
function getTestDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];

  // If DATABASE_URL is set, validate it doesn't point to production
  if (databaseUrl) {
    if (looksLikeProductionDatabase(databaseUrl)) {
      throw new Error(
        'SAFETY: DATABASE_URL appears to point to a production database!\n' +
          `URL contains a production pattern: ${PRODUCTION_DB_PATTERNS.join(', ')}\n` +
          'Integration tests can TRUNCATE ALL DATA. Use a local database for testing.\n' +
          'Run tests via: just test-api',
      );
    }
    return databaseUrl;
  }

  // Default to local Docker test database
  return 'postgresql://budget_sync_test:budget_sync_test@localhost:5433/budget_sync_test';
}

/**
 * Sets up the DI container for API integration tests.
 *
 * Key differences from production container:
 * - Uses local Docker PostgreSQL
 * - No spreadsheet writes (database-only)
 * - All external gateways mocked
 * - Silent logger (unless DEBUG is set)
 */
export function setupTestContainer(): typeof container {
  const databaseUrl = getTestDatabaseUrl();
  const databaseClient = new DatabaseClient({ url: databaseUrl });

  // Logger: silent in tests unless DEBUG is set
  if (process.env['DEBUG'] !== undefined) {
    container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });
  } else {
    container.register(LOGGER_TOKEN, { useClass: SilentLogger });
  }

  // Database
  container.register(DATABASE_CLIENT_TOKEN, { useValue: databaseClient });

  // Repositories - direct database access (no dual-write)
  container.register(ALLOCATION_REPOSITORY_TOKEN, {
    useClass: DatabaseAllocationRepository,
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
  container.register(BUDGET_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetRepository,
  });
  container.register(CATEGORIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseCategorizationRuleRepository,
  });
  container.register(BUDGETIZATION_RULE_REPOSITORY_TOKEN, {
    useClass: DatabaseBudgetizationRuleRepository,
  });
  container.register(TRANSACTION_LINK_REPOSITORY_TOKEN, {
    useClass: DatabaseTransactionLinkRepository,
  });

  // Mock gateways
  container.register(BANK_GATEWAY_TOKEN, { useClass: MockBankGateway });
  container.register(MESSAGE_QUEUE_GATEWAY_TOKEN, {
    useClass: MockMessageQueueGateway,
  });
  container.register(LLM_GATEWAY_TOKEN, { useClass: MockLLMGateway });

  return container;
}
