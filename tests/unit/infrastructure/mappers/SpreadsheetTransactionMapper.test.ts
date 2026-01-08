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
      expect(record.balanceAfter).toBeUndefined();
      expect(record.operationAmount).toBeUndefined();
      expect(record.operationCurrency).toBeUndefined();
      expect(record.counterpartyIban).toBeUndefined();
      expect(record.hold).toBeUndefined();
    });

    test('should map balance to balanceAfter in major units', () => {
      const transaction = Transaction.create({
        externalId: 'tx-balance',
        date: new Date('2024-01-15'),
        amount: Money.create(5000, Currency.UAH), // 50.00 UAH
        description: 'Purchase',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        balance: Money.create(100000, Currency.UAH), // 1000.00 UAH balance
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.balanceAfter).toBe(1000);
    });

    test('should map operationAmount and operationCurrency', () => {
      const transaction = Transaction.create({
        externalId: 'tx-fx',
        date: new Date('2024-01-15'),
        amount: Money.create(4100, Currency.UAH), // 41.00 UAH
        description: 'Foreign purchase',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        operationAmount: Money.create(100, Currency.USD), // 1.00 USD
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.operationAmount).toBe(1);
      expect(record.operationCurrency).toBe('USD');
    });

    test('should map counterpartyIban', () => {
      const transaction = Transaction.create({
        externalId: 'tx-iban',
        date: new Date('2024-01-15'),
        amount: Money.create(50000, Currency.UAH),
        description: 'Transfer',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        counterpartyIban: 'UA213223130000026007233566001',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.counterpartyIban).toBe('UA213223130000026007233566001');
    });

    test('should map hold only when true', () => {
      const holdTransaction = Transaction.create({
        externalId: 'tx-hold',
        date: new Date('2024-01-15'),
        amount: Money.create(5000, Currency.UAH),
        description: 'Hold transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        hold: true,
      });

      const nonHoldTransaction = Transaction.create({
        externalId: 'tx-nonhold',
        date: new Date('2024-01-15'),
        amount: Money.create(5000, Currency.UAH),
        description: 'Normal transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        hold: false,
      });

      const holdRecord = mapper.toRecord(holdTransaction, 'My Card');
      const nonHoldRecord = mapper.toRecord(nonHoldTransaction, 'My Card');

      expect(holdRecord.hold).toBe(true);
      expect(nonHoldRecord.hold).toBeUndefined();
    });

    test('should map all Group A fields together', () => {
      const transaction = Transaction.create({
        externalId: 'tx-full-group-a',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH), // 150.00 UAH
        description: 'Full transaction with all fields',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        balance: Money.create(850000, Currency.UAH), // 8500.00 UAH
        operationAmount: Money.create(400, Currency.USD), // 4.00 USD
        counterpartyIban: 'UA213223130000026007233566001',
        hold: true,
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.balanceAfter).toBe(8500);
      expect(record.operationAmount).toBe(4);
      expect(record.operationCurrency).toBe('USD');
      expect(record.counterpartyIban).toBe('UA213223130000026007233566001');
      expect(record.hold).toBe(true);
    });

    test('should map cashback to major units', () => {
      const transaction = Transaction.create({
        externalId: 'tx-cashback',
        date: new Date('2024-01-15'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Purchase with cashback',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        cashbackAmount: Money.create(150, Currency.UAH), // 1.50 UAH
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.cashback).toBe(1.5);
    });

    test('should map commission to major units', () => {
      const transaction = Transaction.create({
        externalId: 'tx-commission',
        date: new Date('2024-01-15'),
        amount: Money.create(100000, Currency.UAH),
        description: 'Transfer with commission',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        commissionRate: Money.create(500, Currency.UAH), // 5.00 UAH
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.commission).toBe(5);
    });

    test('should map originalMcc directly', () => {
      const transaction = Transaction.create({
        externalId: 'tx-original-mcc',
        date: new Date('2024-01-15'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Purchase with original MCC',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        mcc: 5411,
        originalMcc: 5999,
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.mcc).toBe(5411);
      expect(record.originalMcc).toBe(5999);
    });

    test('should map receiptId directly', () => {
      const transaction = Transaction.create({
        externalId: 'tx-receipt',
        date: new Date('2024-01-15'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Purchase with receipt',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
    });

    test('should map invoiceId directly', () => {
      const transaction = Transaction.create({
        externalId: 'tx-invoice',
        date: new Date('2024-01-15'),
        amount: Money.create(50000, Currency.UAH),
        description: 'FOP payment',
        type: TransactionType.CREDIT,
        accountId: 'fop-account',
        invoiceId: 'invoice-12345',
      });

      const record = mapper.toRecord(transaction, 'FOP Account');

      expect(record.invoiceId).toBe('invoice-12345');
    });

    test('should map counterEdrpou directly', () => {
      const transaction = Transaction.create({
        externalId: 'tx-edrpou',
        date: new Date('2024-01-15'),
        amount: Money.create(100000, Currency.UAH),
        description: 'Payment to company',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        counterEdrpou: '12345678',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.counterEdrpou).toBe('12345678');
    });

    test('should map all Group B fields together', () => {
      const transaction = Transaction.create({
        externalId: 'tx-full-group-b',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Full transaction with all Group B fields',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        cashbackAmount: Money.create(150, Currency.UAH),
        commissionRate: Money.create(50, Currency.UAH),
        originalMcc: 5999,
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
        invoiceId: 'invoice-123',
        counterEdrpou: '12345678',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.cashback).toBe(1.5);
      expect(record.commission).toBe(0.5);
      expect(record.originalMcc).toBe(5999);
      expect(record.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
      expect(record.invoiceId).toBe('invoice-123');
      expect(record.counterEdrpou).toBe('12345678');
    });

    test('should leave Group B fields undefined when not present', () => {
      const transaction = Transaction.create({
        externalId: 'tx-no-group-b',
        date: new Date('2024-01-15'),
        amount: Money.create(10000, Currency.UAH),
        description: 'Simple transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
      });

      const record = mapper.toRecord(transaction, 'My Card');

      expect(record.cashback).toBeUndefined();
      expect(record.commission).toBeUndefined();
      expect(record.originalMcc).toBeUndefined();
      expect(record.receiptId).toBeUndefined();
      expect(record.invoiceId).toBeUndefined();
      expect(record.counterEdrpou).toBeUndefined();
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
      expect(transaction.balance).toBeUndefined();
      expect(transaction.operationAmount).toBeUndefined();
      expect(transaction.counterpartyIban).toBeUndefined();
      expect(transaction.isHold).toBe(false);
    });

    test('should map balanceAfter to balance entity field', () => {
      const record: TransactionRecord = {
        externalId: 'tx-balance',
        date: new Date('2024-01-15'),
        amount: -50,
        currency: 'UAH',
        account: 'My Card',
        balanceAfter: 1000, // 1000.00 UAH
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.balance).toBeDefined();
      expect(transaction.balance?.amount).toBe(100000); // In kopecks
      expect(transaction.balance?.currency.code).toBe('UAH');
    });

    test('should map operationAmount with operationCurrency', () => {
      const record: TransactionRecord = {
        externalId: 'tx-fx',
        date: new Date('2024-01-15'),
        amount: -4100, // 4100 UAH
        currency: 'UAH',
        account: 'My Card',
        operationAmount: 100, // 100.00 USD
        operationCurrency: 'USD',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.operationAmount).toBeDefined();
      expect(transaction.operationAmount?.amount).toBe(10000); // In cents
      expect(transaction.operationAmount?.currency.code).toBe('USD');
    });

    test('should use account currency when operationCurrency missing', () => {
      const record: TransactionRecord = {
        externalId: 'tx-same-currency',
        date: new Date('2024-01-15'),
        amount: -50,
        currency: 'UAH',
        account: 'My Card',
        operationAmount: 50,
        // operationCurrency not provided
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.operationAmount?.currency.code).toBe('UAH');
    });

    test('should map counterpartyIban', () => {
      const record: TransactionRecord = {
        externalId: 'tx-iban',
        date: new Date('2024-01-15'),
        amount: -500,
        currency: 'UAH',
        account: 'My Card',
        counterpartyIban: 'UA213223130000026007233566001',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.counterpartyIban).toBe(
        'UA213223130000026007233566001',
      );
    });

    test('should map hold status', () => {
      const holdRecord: TransactionRecord = {
        externalId: 'tx-hold',
        date: new Date('2024-01-15'),
        amount: -50,
        currency: 'UAH',
        account: 'My Card',
        hold: true,
      };

      const transaction = mapper.toEntity(holdRecord, 'account-123');

      expect(transaction.isHold).toBe(true);
    });

    test('should map all Group A fields from record to entity', () => {
      const record: TransactionRecord = {
        externalId: 'tx-full-group-a',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: -150,
        currency: 'UAH',
        account: 'My Card',
        balanceAfter: 8500,
        operationAmount: 4,
        operationCurrency: 'USD',
        counterpartyIban: 'UA213223130000026007233566001',
        hold: true,
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.balance?.amount).toBe(850000);
      expect(transaction.balance?.currency.code).toBe('UAH');
      expect(transaction.operationAmount?.amount).toBe(400);
      expect(transaction.operationAmount?.currency.code).toBe('USD');
      expect(transaction.counterpartyIban).toBe(
        'UA213223130000026007233566001',
      );
      expect(transaction.isHold).toBe(true);
    });

    test('should map cashback from major units to entity', () => {
      const record: TransactionRecord = {
        externalId: 'tx-cashback',
        date: new Date('2024-01-15'),
        amount: -150,
        currency: 'UAH',
        account: 'My Card',
        cashback: 1.5, // 1.50 UAH
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.cashbackAmount?.currency.code).toBe('UAH');
    });

    test('should map commission from major units to entity', () => {
      const record: TransactionRecord = {
        externalId: 'tx-commission',
        date: new Date('2024-01-15'),
        amount: -1000,
        currency: 'UAH',
        account: 'My Card',
        commission: 5, // 5.00 UAH
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.commissionRate?.amount).toBe(500);
      expect(transaction.commissionRate?.currency.code).toBe('UAH');
    });

    test('should map originalMcc directly from record', () => {
      const record: TransactionRecord = {
        externalId: 'tx-original-mcc',
        date: new Date('2024-01-15'),
        amount: -150,
        currency: 'UAH',
        account: 'My Card',
        mcc: 5411,
        originalMcc: 5999,
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.mcc).toBe(5411);
      expect(transaction.originalMcc).toBe(5999);
    });

    test('should map receiptId directly from record', () => {
      const record: TransactionRecord = {
        externalId: 'tx-receipt',
        date: new Date('2024-01-15'),
        amount: -150,
        currency: 'UAH',
        account: 'My Card',
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
    });

    test('should map invoiceId directly from record', () => {
      const record: TransactionRecord = {
        externalId: 'tx-invoice',
        date: new Date('2024-01-15'),
        amount: 500,
        currency: 'UAH',
        account: 'FOP Account',
        invoiceId: 'invoice-12345',
      };

      const transaction = mapper.toEntity(record, 'fop-account');

      expect(transaction.invoiceId).toBe('invoice-12345');
    });

    test('should map counterEdrpou directly from record', () => {
      const record: TransactionRecord = {
        externalId: 'tx-edrpou',
        date: new Date('2024-01-15'),
        amount: -1000,
        currency: 'UAH',
        account: 'My Card',
        counterEdrpou: '12345678',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.counterEdrpou).toBe('12345678');
    });

    test('should map all Group B fields from record to entity', () => {
      const record: TransactionRecord = {
        externalId: 'tx-full-group-b',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: -150,
        currency: 'UAH',
        account: 'My Card',
        cashback: 1.5,
        commission: 0.5,
        originalMcc: 5999,
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
        invoiceId: 'invoice-123',
        counterEdrpou: '12345678',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.cashbackAmount?.currency.code).toBe('UAH');
      expect(transaction.commissionRate?.amount).toBe(50);
      expect(transaction.commissionRate?.currency.code).toBe('UAH');
      expect(transaction.originalMcc).toBe(5999);
      expect(transaction.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
      expect(transaction.invoiceId).toBe('invoice-123');
      expect(transaction.counterEdrpou).toBe('12345678');
    });

    test('should leave Group B fields undefined when not in record', () => {
      const record: TransactionRecord = {
        externalId: 'tx-no-group-b',
        date: new Date('2024-01-15'),
        amount: -100,
        currency: 'UAH',
        account: 'My Card',
      };

      const transaction = mapper.toEntity(record, 'account-123');

      expect(transaction.cashbackAmount).toBeUndefined();
      expect(transaction.commissionRate).toBeUndefined();
      expect(transaction.originalMcc).toBeUndefined();
      expect(transaction.receiptId).toBeUndefined();
      expect(transaction.invoiceId).toBeUndefined();
      expect(transaction.counterEdrpou).toBeUndefined();
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

    test('should preserve Group A fields through round trip', () => {
      const original = Transaction.create({
        externalId: 'tx-group-a-roundtrip',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Full Group A transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        balance: Money.create(850000, Currency.UAH),
        operationAmount: Money.create(400, Currency.USD),
        counterpartyIban: 'UA213223130000026007233566001',
        hold: true,
      });

      const record = mapper.toRecord(original, 'My Card');
      const restored = mapper.toEntity(record, 'account-123');

      expect(restored.balance?.amount).toBe(original.balance?.amount);
      expect(restored.balance?.currency.code).toBe(
        original.balance?.currency.code,
      );
      expect(restored.operationAmount?.amount).toBe(
        original.operationAmount?.amount,
      );
      expect(restored.operationAmount?.currency.code).toBe(
        original.operationAmount?.currency.code,
      );
      expect(restored.counterpartyIban).toBe(original.counterpartyIban);
      expect(restored.isHold).toBe(original.isHold);
    });

    test('should preserve Group B fields through round trip', () => {
      const original = Transaction.create({
        externalId: 'tx-group-b-roundtrip',
        date: new Date('2024-01-15T10:30:00.000Z'),
        amount: Money.create(15000, Currency.UAH),
        description: 'Full Group B transaction',
        type: TransactionType.DEBIT,
        accountId: 'account-123',
        cashbackAmount: Money.create(150, Currency.UAH),
        commissionRate: Money.create(50, Currency.UAH),
        originalMcc: 5999,
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
        invoiceId: 'invoice-123',
        counterEdrpou: '12345678',
      });

      const record = mapper.toRecord(original, 'My Card');
      const restored = mapper.toEntity(record, 'account-123');

      expect(restored.cashbackAmount?.amount).toBe(
        original.cashbackAmount?.amount,
      );
      expect(restored.cashbackAmount?.currency.code).toBe(
        original.cashbackAmount?.currency.code,
      );
      expect(restored.commissionRate?.amount).toBe(
        original.commissionRate?.amount,
      );
      expect(restored.commissionRate?.currency.code).toBe(
        original.commissionRate?.currency.code,
      );
      expect(restored.originalMcc).toBe(original.originalMcc);
      expect(restored.receiptId).toBe(original.receiptId);
      expect(restored.invoiceId).toBe(original.invoiceId);
      expect(restored.counterEdrpou).toBe(original.counterEdrpou);
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
