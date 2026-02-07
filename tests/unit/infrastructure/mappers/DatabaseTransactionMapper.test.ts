import { describe, expect, test } from 'bun:test';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { DatabaseTransactionMapper } from '@infrastructure/mappers/DatabaseTransactionMapper.ts';
import type {
  NewTransactionRow,
  TransactionRow,
} from '@modules/database/types.ts';

describe('DatabaseTransactionMapper', () => {
  const mapper = new DatabaseTransactionMapper();

  describe('toEntity', () => {
    test('should convert DB row to Transaction entity with all fields', () => {
      const row: TransactionRow = {
        id: 123,
        externalId: 'ext-123',
        date: new Date('2024-01-15T10:30:00Z'),
        amount: -5000,
        currency: 'UAH',
        type: 'debit',
        accountId: 1,
        accountExternalId: 'acc-1',
        categoryId: null,
        budgetId: null,
        categorizationStatus: 'pending',
        categoryReason: null,
        budgetReason: null,
        mcc: 5411,
        originalMcc: 5499,
        bankCategory: null,
        bankDescription: 'ATB Market',
        counterparty: 'ATB Corp',
        counterpartyIban: 'UA123456789',
        counterEdrpou: '12345678',
        balanceAfter: 100000,
        operationAmount: -5000,
        operationCurrency: 'UAH',
        cashback: 50,
        commission: 10,
        hold: false,
        receiptId: 'receipt-123',
        invoiceId: 'invoice-456',
        tags: null,
        notes: 'Test note',
        excludeFromCalculations: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = mapper.toEntity(row);

      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.externalId).toBe('ext-123');
      expect(transaction.date).toEqual(new Date('2024-01-15T10:30:00Z'));
      expect(transaction.amount.amount).toBe(5000);
      expect(transaction.amount.currency.code).toBe('UAH');
      expect(transaction.type).toBe(TransactionType.DEBIT);
      expect(transaction.accountId).toBe('acc-1');
      expect(transaction.description).toBe('ATB Market');
      expect(transaction.mcc).toBe(5411);
      expect(transaction.originalMcc).toBe(5499);
      expect(transaction.comment).toBe('Test note');
      expect(transaction.balance?.amount).toBe(100000);
      expect(transaction.operationAmount?.amount).toBe(-5000);
      expect(transaction.operationAmount?.currency.code).toBe('UAH');
      expect(transaction.counterpartyName).toBe('ATB Corp');
      expect(transaction.counterpartyIban).toBe('UA123456789');
      expect(transaction.counterEdrpou).toBe('12345678');
      expect(transaction.isHold).toBe(false);
      expect(transaction.cashbackAmount?.amount).toBe(50);
      expect(transaction.commissionRate?.amount).toBe(10);
      expect(transaction.receiptId).toBe('receipt-123');
      expect(transaction.invoiceId).toBe('invoice-456');
      expect(transaction.dbId).toBe(123);
    });

    test('should handle null optional fields', () => {
      const row: TransactionRow = {
        id: 456,
        externalId: 'ext-456',
        date: new Date('2024-01-15'),
        amount: 10000,
        currency: 'USD',
        type: 'credit',
        accountId: 2,
        accountExternalId: 'acc-2',
        categoryId: null,
        budgetId: null,
        categorizationStatus: 'pending',
        categoryReason: null,
        budgetReason: null,
        mcc: null,
        originalMcc: null,
        bankCategory: null,
        bankDescription: 'Salary',
        counterparty: null,
        counterpartyIban: null,
        counterEdrpou: null,
        balanceAfter: null,
        operationAmount: null,
        operationCurrency: null,
        cashback: null,
        commission: null,
        hold: null,
        receiptId: null,
        invoiceId: null,
        tags: null,
        notes: null,
        excludeFromCalculations: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = mapper.toEntity(row);

      expect(transaction.mcc).toBeUndefined();
      expect(transaction.originalMcc).toBeUndefined();
      expect(transaction.comment).toBeUndefined();
      expect(transaction.balance).toBeUndefined();
      expect(transaction.operationAmount).toBeUndefined();
      expect(transaction.counterpartyName).toBeUndefined();
      expect(transaction.counterpartyIban).toBeUndefined();
      expect(transaction.counterEdrpou).toBeUndefined();
      expect(transaction.isHold).toBe(false);
      expect(transaction.cashbackAmount).toBeUndefined();
      expect(transaction.commissionRate).toBeUndefined();
      expect(transaction.receiptId).toBeUndefined();
      expect(transaction.invoiceId).toBeUndefined();
    });

    test('should set dbId from row.id', () => {
      const row: TransactionRow = {
        id: 789,
        externalId: 'ext-789',
        date: new Date(),
        amount: 1000,
        currency: 'EUR',
        type: 'credit',
        accountId: 3,
        accountExternalId: 'acc-3',
        categoryId: null,
        budgetId: null,
        categorizationStatus: 'pending',
        categoryReason: null,
        budgetReason: null,
        mcc: null,
        originalMcc: null,
        bankCategory: null,
        bankDescription: 'Test',
        counterparty: null,
        counterpartyIban: null,
        counterEdrpou: null,
        balanceAfter: null,
        operationAmount: null,
        operationCurrency: null,
        cashback: null,
        commission: null,
        hold: null,
        receiptId: null,
        invoiceId: null,
        tags: null,
        notes: null,
        excludeFromCalculations: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = mapper.toEntity(row);

      expect(transaction.dbId).toBe(789);
    });

    test('should correctly map debit type', () => {
      const row: TransactionRow = {
        id: 1,
        externalId: 'ext-1',
        date: new Date(),
        amount: -2000,
        currency: 'UAH',
        type: 'debit',
        accountId: 1,
        accountExternalId: 'acc-1',
        categoryId: null,
        budgetId: null,
        categorizationStatus: 'pending',
        categoryReason: null,
        budgetReason: null,
        mcc: null,
        originalMcc: null,
        bankCategory: null,
        bankDescription: 'Test',
        counterparty: null,
        counterpartyIban: null,
        counterEdrpou: null,
        balanceAfter: null,
        operationAmount: null,
        operationCurrency: null,
        cashback: null,
        commission: null,
        hold: null,
        receiptId: null,
        invoiceId: null,
        tags: null,
        notes: null,
        excludeFromCalculations: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = mapper.toEntity(row);

      expect(transaction.type).toBe(TransactionType.DEBIT);
      expect(transaction.isDebit).toBe(true);
      expect(transaction.isCredit).toBe(false);
      expect(transaction.amount.amount).toBe(2000);
    });

    test('should correctly map credit type', () => {
      const row: TransactionRow = {
        id: 2,
        externalId: 'ext-2',
        date: new Date(),
        amount: 3000,
        currency: 'UAH',
        type: 'credit',
        accountId: 1,
        accountExternalId: 'acc-1',
        categoryId: null,
        budgetId: null,
        categorizationStatus: 'pending',
        categoryReason: null,
        budgetReason: null,
        mcc: null,
        originalMcc: null,
        bankCategory: null,
        bankDescription: 'Test',
        counterparty: null,
        counterpartyIban: null,
        counterEdrpou: null,
        balanceAfter: null,
        operationAmount: null,
        operationCurrency: null,
        cashback: null,
        commission: null,
        hold: null,
        receiptId: null,
        invoiceId: null,
        tags: null,
        notes: null,
        excludeFromCalculations: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = mapper.toEntity(row);

      expect(transaction.type).toBe(TransactionType.CREDIT);
      expect(transaction.isCredit).toBe(true);
      expect(transaction.isDebit).toBe(false);
      expect(transaction.amount.amount).toBe(3000);
    });
  });

  describe('toInsert', () => {
    test('should convert Transaction to insert row with signed amounts (negative for debit)', () => {
      const currency = Currency.UAH;
      // Monobank sends negative amounts for debits, so Transaction is created with negative amount
      const transaction = Transaction.create({
        externalId: 'ext-123',
        date: new Date('2024-01-15T10:30:00Z'),
        amount: Money.create(-5000, currency),
        description: 'ATB Market',
        type: TransactionType.DEBIT,
        accountId: 'acc-1',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction, {
        accountDbId: 10,
      });

      expect(row.externalId).toBe('ext-123');
      expect(row.date).toEqual(new Date('2024-01-15T10:30:00Z'));
      expect(row.amount).toBe(-5000);
      expect(row.currency).toBe('UAH');
      expect(row.type).toBe('debit');
      expect(row.accountId).toBe(10);
      expect(row.accountExternalId).toBe('acc-1');
      expect(row.bankDescription).toBe('ATB Market');
    });

    test('should convert credit transaction with positive signed amount', () => {
      const currency = Currency.UAH;
      const transaction = Transaction.create({
        externalId: 'ext-456',
        date: new Date('2024-01-15'),
        amount: Money.create(10000, currency),
        description: 'Salary',
        type: TransactionType.CREDIT,
        accountId: 'acc-2',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction);

      expect(row.amount).toBe(10000);
      expect(row.type).toBe('credit');
    });

    test('should handle optional refs (accountDbId, categoryDbId, budgetDbId)', () => {
      const currency = Currency.UAH;
      const transaction = Transaction.create({
        externalId: 'ext-789',
        date: new Date(),
        amount: Money.create(1000, currency),
        description: 'Test',
        type: TransactionType.DEBIT,
        accountId: 'acc-3',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction, {
        accountDbId: 20,
        categoryDbId: 5,
        budgetDbId: 7,
      });

      expect(row.accountId).toBe(20);
      expect(row.categoryId).toBe(5);
      expect(row.budgetId).toBe(7);
    });

    test('should set null for missing refs', () => {
      const currency = Currency.UAH;
      const transaction = Transaction.create({
        externalId: 'ext-999',
        date: new Date(),
        amount: Money.create(1000, currency),
        description: 'Test',
        type: TransactionType.DEBIT,
        accountId: 'acc-4',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction);

      expect(row.accountId).toBeNull();
      expect(row.categoryId).toBeNull();
      expect(row.budgetId).toBeNull();
    });

    test('should include all optional transaction fields', () => {
      const currency = Currency.UAH;
      const transaction = Transaction.create({
        externalId: 'ext-full',
        date: new Date(),
        amount: Money.create(5000, currency),
        description: 'Full transaction',
        type: TransactionType.DEBIT,
        accountId: 'acc-5',
        mcc: 5411,
        originalMcc: 5499,
        comment: 'Test comment',
        balance: Money.create(100000, currency),
        operationAmount: Money.create(5000, currency),
        counterpartyName: 'ATB Corp',
        counterpartyIban: 'UA123456789',
        counterEdrpou: '12345678',
        hold: true,
        cashbackAmount: Money.create(50, currency),
        commissionRate: Money.create(10, currency),
        receiptId: 'receipt-123',
        invoiceId: 'invoice-456',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction);

      expect(row.mcc).toBe(5411);
      expect(row.originalMcc).toBe(5499);
      expect(row.notes).toBe('Test comment');
      expect(row.balanceAfter).toBe(100000);
      expect(row.operationAmount).toBe(5000);
      expect(row.operationCurrency).toBe('UAH');
      expect(row.counterparty).toBe('ATB Corp');
      expect(row.counterpartyIban).toBe('UA123456789');
      expect(row.counterEdrpou).toBe('12345678');
      expect(row.hold).toBe(true);
      expect(row.cashback).toBe(50);
      expect(row.commission).toBe(10);
      expect(row.receiptId).toBe('receipt-123');
      expect(row.invoiceId).toBe('invoice-456');
    });

    test('should set default categorization status to pending', () => {
      const currency = Currency.UAH;
      const transaction = Transaction.create({
        externalId: 'ext-cat',
        date: new Date(),
        amount: Money.create(1000, currency),
        description: 'Test',
        type: TransactionType.DEBIT,
        accountId: 'acc-6',
      });

      const row: NewTransactionRow = mapper.toInsert(transaction);

      expect(row.categorizationStatus).toBe('pending');
      expect(row.categoryReason).toBeNull();
      expect(row.budgetReason).toBeNull();
    });
  });
});
