import { describe, expect, test } from 'bun:test';
import {
  type BankTransactionData,
  type ProcessingContext,
  TransactionProcessingService,
} from '@domain/services/TransactionProcessingService.ts';

describe('TransactionProcessingService', () => {
  const service = new TransactionProcessingService();

  const defaultContext: ProcessingContext = {
    accountId: 1,
  };

  function makeBankTransaction(
    overrides: Partial<BankTransactionData> = {},
  ): BankTransactionData {
    return {
      externalId: 'ext-123',
      date: new Date('2026-02-15T12:00:00Z'),
      amount: -10000,
      currency: 'UAH',
      type: 'debit',
      bankDescription: 'Silpo',
      counterparty: 'Silpo LLC',
      mcc: 5411,
      ...overrides,
    };
  }

  describe('normal transactions', () => {
    test('processes a normal debit transaction', () => {
      const bankTx = makeBankTransaction({
        amount: -10000,
        type: 'debit',
        bankDescription: 'Silpo',
        counterparty: 'Silpo LLC',
        mcc: 5411,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(false);
      expect(result.hasFee).toBe(false);
      expect(result.transaction).not.toBeNull();
      expect(result.transaction?.amount).toBe(10000);
      expect(result.transaction?.type).toBe('debit');
      expect(result.transaction?.currency).toBe('UAH');
      expect(result.transaction?.accountId).toBe(1);
      expect(result.transaction?.description).toBe('Silpo');
      expect(result.transaction?.counterparty).toBe('Silpo LLC');
      expect(result.transaction?.mcc).toBe(5411);
    });

    test('processes a normal credit transaction', () => {
      const bankTx = makeBankTransaction({
        amount: 50000,
        type: 'credit',
        bankDescription: 'Salary',
        counterparty: 'Employer Inc',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(false);
      expect(result.hasFee).toBe(false);
      expect(result.transaction).not.toBeNull();
      expect(result.transaction?.amount).toBe(50000);
      expect(result.transaction?.type).toBe('credit');
      expect(result.transaction?.description).toBe('Salary');
    });

    test('amount is always positive regardless of sign in bank transaction', () => {
      const debitTx = makeBankTransaction({ amount: -25000, type: 'debit' });
      const creditTx = makeBankTransaction({ amount: 25000, type: 'credit' });

      const debitResult = service.process(debitTx, defaultContext);
      const creditResult = service.process(creditTx, defaultContext);

      expect(debitResult.transaction?.amount).toBe(25000);
      expect(creditResult.transaction?.amount).toBe(25000);
    });

    test('uses empty string for description when bankDescription is undefined', () => {
      const bankTx = makeBankTransaction({ bankDescription: undefined });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.description).toBe('');
    });

    test('passes through optional fields', () => {
      const bankTx = makeBankTransaction({
        counterpartyIban: 'UA111111111111111111111111111',
        mcc: 5812,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.counterpartyIban).toBe(
        'UA111111111111111111111111111',
      );
      expect(result.transaction?.mcc).toBe(5812);
    });

    test('handles transaction with zero commission as normal', () => {
      const bankTx = makeBankTransaction({ commission: 0 });

      const result = service.process(bankTx, defaultContext);

      expect(result.hasFee).toBe(false);
      expect(result.isReturning).toBe(false);
    });

    test('handles transaction with undefined commission as normal', () => {
      const bankTx = makeBankTransaction({ commission: undefined });

      const result = service.process(bankTx, defaultContext);

      expect(result.hasFee).toBe(false);
    });
  });

  describe('cancellation/returning detection', () => {
    test('detects cancellation by "Скасування. " prefix', () => {
      const bankTx = makeBankTransaction({
        amount: 40059,
        type: 'credit',
        bankDescription: 'Скасування. Glovo',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(true);
      expect(result.hasFee).toBe(false);
      expect(result.returningOriginalDescription).toBe('Glovo');
    });

    test('returning transaction has type "returning"', () => {
      const bankTx = makeBankTransaction({
        amount: 26812,
        type: 'credit',
        bankDescription: 'Скасування. ОККО',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.type).toBe('returning');
    });

    test('returning amount is absolute value of bank transaction amount', () => {
      const bankTx = makeBankTransaction({
        amount: 100,
        type: 'credit',
        bankDescription: 'Скасування. Львівавтодор',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.amount).toBe(100);
    });

    test('strips cancellation prefix to get original description', () => {
      const bankTx = makeBankTransaction({
        amount: 100,
        type: 'credit',
        bankDescription: 'Скасування. Some Merchant Name',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.description).toBe('Some Merchant Name');
      expect(result.returningOriginalDescription).toBe('Some Merchant Name');
    });

    test('cancellation takes priority over fee detection', () => {
      const bankTx = makeBankTransaction({
        amount: 5000,
        type: 'credit',
        bankDescription: 'Скасування. Some Transaction',
        commission: 100,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(true);
      expect(result.hasFee).toBe(false);
    });

    test('preserves counterparty info on returning transaction', () => {
      const bankTx = makeBankTransaction({
        amount: 1000,
        type: 'credit',
        bankDescription: 'Скасування. Restaurant',
        counterparty: 'Restaurant LLC',
        counterpartyIban: 'UA111111111111111111111111111',
        mcc: 5812,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.counterparty).toBe('Restaurant LLC');
      expect(result.transaction?.counterpartyIban).toBe(
        'UA111111111111111111111111111',
      );
      expect(result.transaction?.mcc).toBe(5812);
    });

    test('does not detect as cancellation when prefix is only partial', () => {
      const bankTx = makeBankTransaction({
        bankDescription: 'Скасування',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(false);
    });

    test('does not detect as cancellation when prefix appears mid-string', () => {
      const bankTx = makeBankTransaction({
        bankDescription: 'Some Скасування. Merchant',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(false);
    });
  });

  describe('fee split detection', () => {
    test('detects fee when commission is positive', () => {
      const bankTx = makeBankTransaction({
        amount: -50000,
        type: 'debit',
        commission: 2500,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.hasFee).toBe(true);
      expect(result.feeAmount).toBe(2500);
      expect(result.isReturning).toBe(false);
    });

    test('main transaction amount is reduced by commission', () => {
      const bankTx = makeBankTransaction({
        amount: -50000,
        type: 'debit',
        commission: 2500,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.amount).toBe(47500);
    });

    test('preserves type from bank transaction for fee split', () => {
      const bankTx = makeBankTransaction({
        amount: -50000,
        type: 'debit',
        commission: 1000,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.type).toBe('debit');
    });

    test('fee amount is provided in result', () => {
      const bankTx = makeBankTransaction({
        amount: -20000,
        type: 'debit',
        commission: 500,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.feeAmount).toBe(500);
    });

    test('no feeAmount when hasFee is false', () => {
      const bankTx = makeBankTransaction({ commission: 0 });

      const result = service.process(bankTx, defaultContext);

      expect(result.hasFee).toBe(false);
      expect(result.feeAmount).toBeUndefined();
    });
  });

  describe('detection priority', () => {
    test('cancellation > fee > normal', () => {
      // All flags set: cancellation prefix + commission
      const bankTx = makeBankTransaction({
        amount: 10000,
        type: 'credit',
        bankDescription: 'Скасування. Transfer payment',
        commission: 500,
      });

      const result = service.process(bankTx, defaultContext);

      // Cancellation wins
      expect(result.isReturning).toBe(true);
      expect(result.hasFee).toBe(false);
      expect(result.transaction?.type).toBe('returning');
    });

    test('fee > normal (no cancellation)', () => {
      const bankTx = makeBankTransaction({
        amount: -50000,
        type: 'debit',
        counterpartyIban: 'UA000000000000000000000000000',
        commission: 2500,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.hasFee).toBe(true);
      expect(result.transaction?.type).toBe('debit');
    });
  });

  describe('real-world scenarios from production data', () => {
    test('hold cancellation: Львівавтодор parking +1 UAH return', () => {
      const bankTx = makeBankTransaction({
        externalId: 'cancel-2',
        amount: 100,
        type: 'credit',
        bankDescription: 'Скасування. Львівавтодор',
        counterparty: 'Львівавтодор',
        mcc: 7523,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(true);
      expect(result.transaction?.type).toBe('returning');
      expect(result.transaction?.amount).toBe(100);
      expect(result.returningOriginalDescription).toBe('Львівавтодор');
    });

    test('full refund: Glovo cancellation', () => {
      const bankTx = makeBankTransaction({
        externalId: 'cancel-175',
        amount: 40059,
        type: 'credit',
        bankDescription: 'Скасування. Glovo',
        counterparty: 'Glovo',
        mcc: 5812,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(true);
      expect(result.transaction?.amount).toBe(40059);
      expect(result.returningOriginalDescription).toBe('Glovo');
    });

    test('partial refund: OKKO fuel cancellation', () => {
      const bankTx = makeBankTransaction({
        externalId: 'cancel-273',
        amount: 26812,
        type: 'credit',
        bankDescription: 'Скасування. ОККО',
        counterparty: 'ОККО',
        mcc: 5541,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(true);
      expect(result.transaction?.amount).toBe(26812);
      expect(result.returningOriginalDescription).toBe('ОККО');
    });

    test('normal grocery purchase', () => {
      const bankTx = makeBankTransaction({
        externalId: 'tx-100',
        amount: -35000,
        type: 'debit',
        bankDescription: 'АТБ',
        counterparty: 'АТБ-Маркет',
        mcc: 5411,
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.isReturning).toBe(false);
      expect(result.hasFee).toBe(false);
      expect(result.transaction?.type).toBe('debit');
      expect(result.transaction?.amount).toBe(35000);
    });

    test('salary credit', () => {
      const bankTx = makeBankTransaction({
        externalId: 'tx-200',
        amount: 5000000,
        type: 'credit',
        bankDescription: 'Зарплата',
        counterparty: 'Company LLC',
        counterpartyIban: 'UA000000000000000000000000000',
      });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.type).toBe('credit');
      expect(result.transaction?.amount).toBe(5000000);
    });
  });

  describe('edge cases', () => {
    test('processes bank transaction with all optional fields undefined', () => {
      const bankTx: BankTransactionData = {
        externalId: 'ext-minimal',
        date: new Date('2026-02-15T12:00:00Z'),
        amount: -1000,
        currency: 'UAH',
        type: 'debit',
      };

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction).not.toBeNull();
      expect(result.transaction?.amount).toBe(1000);
      expect(result.transaction?.description).toBe('');
      expect(result.transaction?.counterparty).toBeUndefined();
      expect(result.transaction?.counterpartyIban).toBeUndefined();
      expect(result.transaction?.mcc).toBeUndefined();
    });

    test('handles zero amount bank transaction', () => {
      const bankTx = makeBankTransaction({ amount: 0 });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.amount).toBe(0);
    });

    test('preserves date from bank transaction', () => {
      const specificDate = new Date('2026-01-15T08:30:00Z');
      const bankTx = makeBankTransaction({ date: specificDate });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.date).toEqual(specificDate);
    });

    test('preserves currency from bank transaction', () => {
      const bankTx = makeBankTransaction({ currency: 'USD' });

      const result = service.process(bankTx, defaultContext);

      expect(result.transaction?.currency).toBe('USD');
    });

    test('uses accountId from context, not derived from bank transaction', () => {
      const context: ProcessingContext = {
        accountId: 42,
      };
      const bankTx = makeBankTransaction();

      const result = service.process(bankTx, context);

      expect(result.transaction?.accountId).toBe(42);
    });
  });
});
