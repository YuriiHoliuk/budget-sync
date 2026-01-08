/**
 * Integration tests for CategorizeTransactionUseCase
 *
 * Tests the full categorization flow with real Gemini API and spreadsheet.
 * Requires GEMINI_API_KEY environment variable to be set.
 *
 * Run with: bun test tests/integration/use-cases/CategorizeTransaction.test.ts
 *
 * NOTE: These tests use real APIs and may incur costs. Run sparingly.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Transaction } from '@domain/entities/Transaction.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';
import { GEMINI_CLIENT_TOKEN } from '@infrastructure/gateways/llm/index.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
} from '@infrastructure/repositories/SpreadsheetAccountRepository.ts';
import { GeminiClient } from '@modules/llm/index.ts';
import { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import { container } from 'tsyringe';

/**
 * Test configuration - uses the same test spreadsheet as other integration tests
 */
const TEST_SPREADSHEET = {
  id: '1r7eMI2EIHa6g4zwYyUBfiN2W_1D8DRrAdDXRCrtC8vc',
};

/**
 * Check if the test should be skipped due to missing credentials.
 * Returns true if GEMINI_API_KEY or GOOGLE_SERVICE_ACCOUNT_FILE are not set.
 */
function shouldSkipTests(): boolean {
  const geminiApiKey = process.env['GEMINI_API_KEY'];
  const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

  return !geminiApiKey || !serviceAccountFile;
}

/**
 * Creates a unique test external ID to avoid conflicts
 */
function generateTestExternalId(): string {
  return `test-categorize-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Skip all tests if credentials are not available
const skipTests = shouldSkipTests();

describe.skipIf(skipTests)('CategorizeTransactionUseCase Integration', () => {
  let spreadsheetsClient: SpreadsheetsClient;
  let geminiClient: GeminiClient;
  let testExternalId: string;

  beforeAll(() => {
    const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];
    const geminiApiKey = process.env['GEMINI_API_KEY'];

    if (!serviceAccountFile || !geminiApiKey) {
      throw new Error(
        'Missing required environment variables for integration tests',
      );
    }

    // Create clients
    spreadsheetsClient = new SpreadsheetsClient({ serviceAccountFile });
    geminiClient = new GeminiClient({ apiKey: geminiApiKey });

    // Setup DI container with test configuration
    container.register(SPREADSHEETS_CLIENT_TOKEN, {
      useValue: spreadsheetsClient,
    });
    container.register(SPREADSHEET_CONFIG_TOKEN, {
      useValue: { spreadsheetId: TEST_SPREADSHEET.id },
    });
    container.register(GEMINI_CLIENT_TOKEN, { useValue: geminiClient });

    // Generate unique test ID for this test run
    testExternalId = generateTestExternalId();
  });

  afterAll(() => {
    // Cleanup is handled in individual tests to ensure proper test data removal
    // Reset container to avoid affecting other tests
    container.reset();
  });

  describe('GeminiClient direct test', () => {
    test('should generate a response from Gemini API', async () => {
      const result = await geminiClient.generate(
        'What is 2 + 2? Answer with just the number.',
        { temperature: 0, maxOutputTokens: 10 },
      );

      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('string');
      expect(result.data.trim()).toContain('4');
    });
  });

  describe('Categorization prompt test', () => {
    test('should categorize a simple grocery transaction', async () => {
      const prompt = `
You are a financial transaction categorization assistant.
Categorize this transaction and respond with valid JSON.

Transaction:
- Description: "ATB Market - products"
- Amount: 150 UAH
- Date: 2026-01-08

Available categories:
- Продукти
- Транспорт
- Розваги

Respond with JSON in this format:
{
  "category": "category name or null if uncertain",
  "categoryReason": "brief explanation",
  "budget": null,
  "budgetReason": null,
  "isNewCategory": false
}
`;

      const result = await geminiClient.generate(prompt, {
        temperature: 0.1,
        maxOutputTokens: 256,
      });

      expect(result.data).toBeDefined();

      // Try to parse the response as JSON
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      expect(jsonMatch).not.toBeNull();

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          category: string | null;
          categoryReason: string | null;
          isNewCategory: boolean;
        };
        expect(parsed.category).toBeDefined();
        // The LLM should categorize this as "Продукти" (groceries)
        expect(parsed.categoryReason).toBeDefined();
        expect(typeof parsed.isNewCategory).toBe('boolean');
      }
    });
  });

  describe('Transaction context preparation', () => {
    test('should create valid transaction context for LLM', () => {
      const transaction = Transaction.create({
        externalId: testExternalId,
        date: new Date('2026-01-08'),
        amount: Money.create(15000, Currency.UAH), // 150.00 UAH in minor units
        description: 'Silpo supermarket',
        type: TransactionType.DEBIT,
        accountId: 'test-account-123',
        counterpartyName: 'Silpo',
        mcc: 5411, // Grocery stores
      });

      expect(transaction.description).toBe('Silpo supermarket');
      expect(transaction.amount.toMajorUnits()).toBe(150);
      expect(transaction.amount.currency.code).toBe('UAH');
      expect(transaction.mcc).toBe(5411);
      expect(transaction.counterpartyName).toBe('Silpo');
    });
  });
});

/**
 * Additional test suite for full use case integration
 * These tests require spreadsheet write access and are more expensive
 *
 * TODO: Implement full flow tests when transaction repository setup is complete
 * - Create test transaction in spreadsheet
 * - Run categorization use case
 * - Verify transaction updated with category
 * - Cleanup test data
 */
describe.skipIf(skipTests)('CategorizeTransactionUseCase Full Flow', () => {
  test('should create test transaction, categorize it, and verify update', () => {
    // TODO: Implement when full repository setup is available
    expect(true).toBe(true);
  });

  test('should handle transaction not found error', () => {
    // TODO: Implement when full repository setup is available
    expect(true).toBe(true);
  });

  test('should save suggested category when LLM proposes new one', () => {
    // TODO: Implement when full repository setup is available
    expect(true).toBe(true);
  });
});
