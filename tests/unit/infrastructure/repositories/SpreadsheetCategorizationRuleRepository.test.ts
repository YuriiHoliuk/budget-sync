import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { SpreadsheetCategorizationRuleRepository } from '@infrastructure/repositories/SpreadsheetCategorizationRuleRepository.ts';
import { createMockSpreadsheetsClient } from '../../helpers';

describe('SpreadsheetCategorizationRuleRepository', () => {
  const spreadsheetConfig = { spreadsheetId: 'test-spreadsheet-id' };

  describe('findAll()', () => {
    test('should return all rules from spreadsheet', async () => {
      const mockClient = createMockSpreadsheetsClient([
        ['Правило'],
        ['ATB transactions should be categorized as Продукти'],
        ['Bolt is always Транспорт'],
      ]);

      const repository = new SpreadsheetCategorizationRuleRepository(
        mockClient,
        spreadsheetConfig,
      );

      const rules = await repository.findAll();

      expect(rules).toEqual([
        'ATB transactions should be categorized as Продукти',
        'Bolt is always Транспорт',
      ]);
    });

    test('should filter out empty rows', async () => {
      const mockClient = createMockSpreadsheetsClient([
        ['Правило'],
        ['Rule 1'],
        [''], // Empty row
        ['   '], // Whitespace-only row
        ['Rule 2'],
      ]);

      const repository = new SpreadsheetCategorizationRuleRepository(
        mockClient,
        spreadsheetConfig,
      );

      const rules = await repository.findAll();

      expect(rules).toEqual(['Rule 1', 'Rule 2']);
    });

    test('should trim whitespace from rules', async () => {
      const mockClient = createMockSpreadsheetsClient([
        ['Правило'],
        ['  Rule with leading space'],
        ['Rule with trailing space  '],
      ]);

      const repository = new SpreadsheetCategorizationRuleRepository(
        mockClient,
        spreadsheetConfig,
      );

      const rules = await repository.findAll();

      expect(rules).toEqual([
        'Rule with leading space',
        'Rule with trailing space',
      ]);
    });

    test('should return empty array when no rules exist', async () => {
      const mockClient = createMockSpreadsheetsClient([['Правило']]); // Only header

      const repository = new SpreadsheetCategorizationRuleRepository(
        mockClient,
        spreadsheetConfig,
      );

      const rules = await repository.findAll();

      expect(rules).toEqual([]);
    });
  });
});
