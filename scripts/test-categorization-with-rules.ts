/**
 * Test script for LLM categorization with custom rules from spreadsheet.
 *
 * Tests that user-defined category and budget rules are loaded and applied with priority.
 *
 * Usage: bun scripts/test-categorization-with-rules.ts
 */

import 'reflect-metadata';
import { setupContainer } from '../src/container.ts';
import {
  CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  type CategorizationRuleRepository,
} from '../src/domain/repositories/CategorizationRuleRepository.ts';
import {
  BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  type BudgetizationRuleRepository,
} from '../src/domain/repositories/BudgetizationRuleRepository.ts';
import type { CategoryInfo } from '../src/domain/gateways/LLMGateway.ts';
import { GeminiLLMGateway } from '../src/infrastructure/gateways/llm/index.ts';

async function main() {
  const container = setupContainer();

  // Load rules from spreadsheet
  const categoryRulesRepository = container.resolve<CategorizationRuleRepository>(
    CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  );
  const budgetRulesRepository = container.resolve<BudgetizationRuleRepository>(
    BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  );

  console.log('Loading categorization rules from spreadsheet...\n');
  const categoryRules = await categoryRulesRepository.findAll();

  if (categoryRules.length === 0) {
    console.log('No category rules found in the spreadsheet.');
  } else {
    console.log(`Found ${categoryRules.length} category rules:`);
    for (const rule of categoryRules) {
      console.log(`  - ${rule}`);
    }
  }

  console.log('\nLoading budgetization rules from spreadsheet...\n');
  const budgetRules = await budgetRulesRepository.findAll();

  if (budgetRules.length === 0) {
    console.log('No budget rules found in the spreadsheet.');
  } else {
    console.log(`Found ${budgetRules.length} budget rules:`);
    for (const rule of budgetRules) {
      console.log(`  - ${rule}`);
    }
  }
  console.log('\n' + '='.repeat(60) + '\n');

  // Resolve LLM gateway
  let gateway: GeminiLLMGateway;
  try {
    gateway = container.resolve(GeminiLLMGateway);
  } catch {
    console.error('GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Test categories
  const categories: CategoryInfo[] = [
    { name: 'Їжа', parent: undefined },
    { name: 'Продукти', parent: 'Їжа' },
    { name: 'Ресторани', parent: 'Їжа' },
    { name: "Кав'ярні", parent: 'Їжа' },
    { name: 'Транспорт', parent: undefined },
    { name: 'Громадський транспорт', parent: 'Транспорт' },
    { name: 'Таксі', parent: 'Транспорт' },
    { name: 'Розваги', parent: undefined },
  ];

  const availableBudgets = ['Їжа', 'Транспорт', 'Розваги'];

  // Test transactions that should match rules
  const testCases = [
    {
      name: 'Uklon taxi (rule: Uklon - Таксі)',
      transaction: {
        description: 'Uklon',
        amount: -120.0,
        currency: 'UAH',
        date: new Date(),
        counterpartyName: 'UKLON',
        mcc: 4121,
      },
    },
    {
      name: 'OKKO small (rule: ОККО <1200 грн - Фаст-фуд)',
      transaction: {
        description: 'OKKO',
        amount: -85.0,
        currency: 'UAH',
        date: new Date(),
        counterpartyName: 'OKKO',
        mcc: 5541,
      },
    },
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`  Description: ${testCase.transaction.description}`);
    console.log(`  Amount: ${testCase.transaction.amount} ${testCase.transaction.currency}`);

    try {
      // First call: assign category with category rules
      const categoryResult = await gateway.assignCategory({
        transaction: testCase.transaction,
        availableCategories: categories,
        categoryRules: categoryRules.length > 0 ? categoryRules : undefined,
      });

      console.log(`  Category: ${categoryResult.category}`);
      console.log(`  Category Reason: ${categoryResult.categoryReason}`);

      // Second call: assign budget with budget rules
      const budgetResult = await gateway.assignBudget({
        transaction: testCase.transaction,
        availableBudgets,
        budgetRules: budgetRules.length > 0 ? budgetRules : undefined,
        assignedCategory: categoryResult.category,
      });

      console.log(`  Budget: ${budgetResult.budget}`);
      console.log(`  Budget Reason: ${budgetResult.budgetReason}`);
    } catch (error) {
      console.error('  Error:', error);
    }
    console.log();
  }
}

main();
