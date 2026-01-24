/**
 * Test script for LLM categorization with real Gemini API.
 *
 * Usage: bun scripts/test-categorization.ts
 */

import 'reflect-metadata';
import { GeminiClient } from '../src/modules/llm/index.ts';
import { GeminiLLMGateway, GEMINI_CLIENT_TOKEN } from '../src/infrastructure/gateways/llm/index.ts';
import { container } from 'tsyringe';
import type { CategoryInfo } from '../src/domain/gateways/LLMGateway.ts';

async function main() {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Setup DI
  const geminiClient = new GeminiClient({ apiKey });
  container.register(GEMINI_CLIENT_TOKEN, { useValue: geminiClient });

  const gateway = container.resolve(GeminiLLMGateway);

  // Test categories with hierarchy
  const categories: CategoryInfo[] = [
    { name: 'Їжа', parent: undefined },
    { name: 'Продукти', parent: 'Їжа' },
    { name: 'Ресторани', parent: 'Їжа' },
    { name: 'Кав\'ярні', parent: 'Їжа' },
    { name: 'Транспорт', parent: undefined },
    { name: 'Громадський транспорт', parent: 'Транспорт' },
    { name: 'Таксі', parent: 'Транспорт' },
    { name: 'Розваги', parent: undefined },
  ];

  // Test transactions
  const testCases = [
    {
      name: 'Grocery store',
      transaction: {
        description: 'АТБ-Маркет',
        amount: -245.50,
        currency: 'UAH',
        date: new Date(),
        counterpartyName: 'АТБ',
        mcc: 5411,
      },
      expected: 'Продукти',
    },
    {
      name: 'Restaurant',
      transaction: {
        description: 'Пузата Хата',
        amount: -189.00,
        currency: 'UAH',
        date: new Date(),
        counterpartyName: 'Пузата Хата',
        mcc: 5812,
      },
      expected: 'Ресторани',
    },
    {
      name: 'Public transport',
      transaction: {
        description: 'Київпастранс',
        amount: -8.00,
        currency: 'UAH',
        date: new Date(),
        mcc: 4111,
      },
      expected: 'Громадський транспорт',
    },
  ];

  console.log('Categories:', categories.map(c => c.parent ? `${c.name} (parent: ${c.parent})` : c.name));
  console.log('\n' + '='.repeat(60) + '\n');

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log('Transaction:', testCase.transaction.description);

    try {
      const result = await gateway.categorize({
        transaction: testCase.transaction,
        availableCategories: categories,
        availableBudgets: ['Їжа', 'Транспорт', 'Розваги'],
      });

      console.log('  Category:', result.category);
      console.log('  Reason:', result.categoryReason);

      // Check if it returned full path (the bug we fixed)
      if (result.category?.includes(' > ')) {
        console.error('  ❌ BUG: Category contains full path!');
      } else if (result.category === testCase.expected) {
        console.log('  ✅ Correct');
      } else {
        console.log(`  ⚠️  Expected "${testCase.expected}", got "${result.category}"`);
      }
    } catch (error) {
      console.error('  Error:', error);
    }
    console.log();
  }
}

main();
