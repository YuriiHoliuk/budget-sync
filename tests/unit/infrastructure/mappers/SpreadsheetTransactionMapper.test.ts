import { describe, expect, test } from 'bun:test';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import {
  SpreadsheetTransactionMapper,
  type TransactionRecord,
} from '@infrastructure/mappers/SpreadsheetTransactionMapper.ts';

describe('SpreadsheetTransactionMapper', () => {
  const mapper = new SpreadsheetTransactionMapper();

  describe('toRecord', () => {
    test('should map debit Transaction to TransactionRecord', () => {
      const transaction = Transaction.create({
        externalId: 'tx-123',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH), // 150.00 UAH
        description: 'ATB Market',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        mcc: 5411,
        comment: 'Grocery shopping',
        counterpartyName: 'ATB',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.externalId).toBe('tx-123');
      expect(record.date.getTime()).toBe(
        new Date('2024-01-15T10:30:00.000Z').getTime(),
      );
      expect(record.amount).toBe(-150); // Negative for debit, major units
      expect(record.currency).toBe('UAH');
      expect(record.account).toBe('My Card');
      expect(record.accountExternalId).toBe('account-123');
      expect(record.mcc).toBe(5411);
      expect(record.bankDescription).toBe('ATB Market');
      expect(record.counterparty).toBe('ATB');
      expect(record.notes).toBe('Grocery shopping');
    });

    test('should map credit Transaction to TransactionRecord', () => {
      const transaction = Transaction.create({
        externalId: 'tx-456',
        date: new Date('2024-01-20T14:00:00.000Z'),
        amount: Money.create(5000000, Currency.UAH), // 50000.00 UAH
        description: 'Salary',
        type: TransactionType.CREDIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'Salary Card');

      expect(record.amount).toBe(50000); // Positive for credit
      expect(record.account).toBe('Salary Card');
    });

    test('should leave optional fields undefined', () => {
      const transaction = Transaction.create({
        externalId: 'tx-789',
        date: new Date('2024-01-25'),
        amount: Money.create(10000, Currency.UAH),
        description: 'Transfer',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.category).toBeUndefined();
      expect(record.budget).toBeUndefined();
      expect(record.bankCategory).toBeUndefined();
      expect(record.tags).toBeUndefined();
      expect(record.mcc).toBeUndefined();
      expect(record.counterparty).toBeUndefined();
      expect(record.notes).toBeUndefined();
    });

    test('should handle USD currency', () => {
      const transaction = Transaction.create({
        externalId: 'tx-usd',
        date: new Date('2024-01-15'),
        amount: Money.create(5000, Currency.USD), // 50.00 USD
        description: 'Online Purchase',
        type: TransactionType.DEBIT,
        accountId: 'usd-account',
      });

      const record = mapper.toRecord(transaction, 'USD Card');

      expect(record.currency).toBe('USD');
      expect(record.amount).toBe(-50); // Negative for debit
    });

    test('should handle EUR currency', () => {
      const transaction = Transaction.create({
        externalId: 'tx-eur',
        date: new Date('2024-01-15'),
        amount: Money.create(3000, Currency.EUR), // 30.00 EUR
        description: 'Subscription',
        type: TransactionType.DEBIT,
        accountId: 'eur-account',
      });

      const record = mapper.toRecord(transaction, 'EUR Card');

      expect(record.currency).toBe('EUR');
      expect(record.amount).toBe(-30);
    });

    test('should handle zero amount transaction', () => {
      const transaction = Transaction.create({
        externalId: 'tx-zero',
        date: new Date('2024-01-15'),
        amount: Money.create(0, Currency.UAH),
        description: 'Zero transaction',
        type: TransactionType.CREDIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.amount).toBe(0);
    });

    test('should handle large amounts', () => {
      const transaction = Transaction.create({
        externalId: 'tx-large',
        date: new Date('2024-01-15'),
        amount: Money.create(100000000, Currency.UAH), // 1,000,000.00 UAH
        description: 'Large Transfer',
        type: TransactionType.CREDIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.amount).toBe(1000000);
    });
  });

  describe('toEntity', () => {
    test('should map TransactionRecord to debit Transaction', () => {
      const record: TransactionRecord = {
        externalId: 'tx-123',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: -150, // Negative = debit
        currency: 'UAH',
        account: 'My Card',
        accountExternalId: 'account-123',
        mcc: 5411,
        bankDescription: 'ATB Market',
        counterparty: 'ATB',
        notes: 'Grocery shopping',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.externalId).toBe('tx-123');
      expect(transaction.date.getTime()).toBe(
        new Date('2024-01-15T10:30:00.000Z').getTime(),
      );
      expect(transaction.amount.amount).toBe(15000); // 150 * 100 kopecks
      expect(transaction.amount.currency.code).toBe('UAH');
      expect(transaction.type).toBe(TransactionType.DEBIT);
      expect(transaction.accountId).toBe('account-123');
      expect(transaction.mcc).toBe(5411);
      expect(transaction.description).toBe('ATB Market');
      expect(transaction.counterpartyName).toBe('ATB');
      expect(transaction.comment).toBe('Grocery shopping');
    });

    test('should map TransactionRecord to credit Transaction', () => {
      const record: TransactionRecord = {
        externalId: 'tx-456',
        date: new Date('2024-01-20'),
        amount: 50000, // Positive = credit
        currency: 'UAH',
        account: 'Salary Card',
        bankDescription: 'Salary',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.type).toBe(TransactionType.CREDIT);
      expect(transaction.amount.amount).toBe(5000000); // 50000 * 100
      expect(transaction.isCredit).toBe(true);
    });

    test('should use provided accountId parameter', () => {
      const record: TransactionRecord = {
        externalId: 'tx-789',
        date: new Date('2024-01-25'),
        amount: -100,
        currency: 'UAH',
        account: 'Some Card',
        accountExternalId: 'different-account', // This is ignored
      };

      const transaction = mapper.toEntity(record, 'my-account-id');

      expect(transaction.accountId).toBe('my-account-id');
    });

    test('should handle missing optional fields', () => {
      const record: TransactionRecord = {
        date: new Date('2024-01-15'),
        amount: -50,
        currency: 'UAH',
        account: 'My Card',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.externalId).toBe('');
      expect(transaction.description).toBe('');
      expect(transaction.mcc).toBeUndefined();
      expect(transaction.comment).toBeUndefined();
      expect(transaction.counterpartyName).toBeUndefined();
    });

    test('should handle zero amount as credit', () => {
      const record: TransactionRecord = {
        externalId: 'tx-zero',
        date: new Date('2024-01-15'),
        amount: 0,
        currency: 'UAH',
        account: 'My Card',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.type).toBe(TransactionType.CREDIT);
      expect(transaction.amount.amount).toBe(0);
    });

    test('should handle USD currency', () => {
      const record: TransactionRecord = {
        externalId: 'tx-usd',
        date: new Date('2024-01-15'),
        amount: -50,
        currency: 'USD',
        account: 'USD Card',
      };

      const transaction = mapper.toEntity(record, 'usd-account');

      expect(transaction.amount.currency.code).toBe('USD');
      expect(transaction.amount.amount).toBe(5000); // 50 * 100 cents
    });

    test('should handle EUR currency', () => {
      const record: TransactionRecord = {
        externalId: 'tx-eur',
        date: new Date('2024-01-15'),
        amount: 100,
        currency: 'EUR',
        account: 'EUR Card',
      };

      const transaction = mapper.toEntity(record, 'eur-account');

      expect(transaction.amount.currency.code).toBe('EUR');
      expect(transaction.amount.amount).toBe(10000);
    });

    test('should convert fractional amounts correctly', () => {
      const record: TransactionRecord = {
        externalId: 'tx-frac',
        date: new Date('2024-01-15'),
        amount: -99.99, // 99.99 UAH
        currency: 'UAH',
        account: 'My Card',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.amount.amount).toBe(9999);
    });
  });

  describe('round trip conversion', () => {
    test('should preserve debit transaction data through toRecord -> toEntity', () => {
      const original = Transaction.create({
        externalId: 'tx-123',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH),
        description: 'ATB Market',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        mcc: 5411,
        comment: 'Grocery shopping',
        counterpartyName: 'ATB',
      });

      const record = mapper.toRecord(original, 'My Card');
      const restored = mapper.toEntity(record, 'account-123');

      expect(restored.externalId).toBe(original.externalId);
      expect(restored.date.getTime()).toBe(original.date.getTime());
      expect(restored.amount.amount).toBe(original.amount.amount);
      expect(restored.type).toBe(original.type);
      expect(restored.mcc).toBe(original.mcc);
      expect(restored.comment).toBe(original.comment);
      expect(restored.counterpartyName).toBe(original.counterpartyName);
    });

    test('should preserve credit transaction data through round trip', () => {
      const original = Transaction.create({
        externalId: 'tx-credit',
        date: new Date('2024-01-20'),
        amount: Money.create(5000000, Currency.UAH),
        description: 'Salary',
        type: TransactionType.CREDIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(original, 'Salary Card');
      const restored = mapper.toEntity(record, 'account-123');

      expect(restored.type).toBe(TransactionType.CREDIT);
      expect(restored.amount.amount).toBe(original.amount.amount);
    });
  });

  describe('edge cases', () => {
    test('should handle very small amounts', () => {
      const transaction = Transaction.create({
        externalId: 'tx-small',
        date: new Date('2024-01-15'),
        amount: Money.create(1, Currency.UAH), // 0.01 UAH
        description: 'Tiny amount',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.amount).toBe(-0.01);
    });

    test('should handle transaction with all optional fields', () => {
      const transaction = Transaction.create({
        externalId: 'tx-full',
        date: new Date('2024-01-15'),
        amount: Money.create(10000, Currency.UAH),
        description: 'Full transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        mcc: 5411,
        comment: 'Comment here',
        counterpartyName: 'Counter Party',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.mcc).toBe(5411);
      expect(record.notes).toBe('Comment here');
      expect(record.counterparty).toBe('Counter Party');
      expect(record.bankDescription).toBe('Full transaction');
    });
  });
});
