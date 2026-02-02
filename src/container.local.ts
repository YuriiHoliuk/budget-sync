/**
 * Local Development DI Container Setup
 *
 * Uses real database, mocks external services (Spreadsheet, Monobank, PubSub).
 * Repositories use database directly (no dual-write).
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
import { DatabaseTransactionRepository } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
import {
  DATABASE_CLIENT_TOKEN,
  DATABASE_TRANSACTION_REPOSITORY_TOKEN,
} from '@infrastructure/repositories/database/tokens.ts';
import { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { ConsoleLogger, LOGGER_TOKEN } from '@modules/logging/index.ts';
import { container } from 'tsyringe';

/**
 * Sets up the DI container for local development.
 *
 * - Real PostgreSQL database (local Docker instance)
 * - Database repositories directly (no dual-write, no spreadsheet)
 * - Mocked external gateways (bank, message queue)
 */
export function setupLocalContainer(): typeof container {
  const databaseUrl =
    process.env['DATABASE_URL'] ??
    'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

  const databaseClient = new DatabaseClient({ url: databaseUrl });

  // Logger
  container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });

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
  container.register(DATABASE_TRANSACTION_REPOSITORY_TOKEN, {
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

  // Mock gateways
  container.register(BANK_GATEWAY_TOKEN, { useClass: MockBankGateway });
  container.register(MESSAGE_QUEUE_GATEWAY_TOKEN, {
    useClass: MockMessageQueueGateway,
  });
  container.register(LLM_GATEWAY_TOKEN, { useClass: MockLLMGateway });

  return container;
}
