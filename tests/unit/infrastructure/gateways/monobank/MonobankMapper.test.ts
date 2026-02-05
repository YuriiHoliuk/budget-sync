import { describe, expect, test } from 'bun:test';
import { TransactionType } from '@domain/value-objects/index.ts';
import { MonobankMapper } from '@infrastructure/gateways/monobank/MonobankMapper.ts';
import type {
  MonobankAccount,
  MonobankStatementItem,
} from '@infrastructure/gateways/monobank/types.ts';

describe('MonobankMapper', () => {
  const mapper = new MonobankMapper();

  describe('toAccount', () => {
    test('should map Monobank account to domain Account', () => {
      const raw: MonobankAccount = {
        id: 'account-123',
        sendId: 'send-123',
        balance: 1000000, // 10000.00 UAH in kopecks
        creditLimit: 0,
        type: 'black',
        currencyCode: 980, // UAH
        maskedPan: ['**** **** **** 1234'],
        iban: 'UA213223130000026201234567890',
      };

      const account = mapper.toAccount(raw);

      expect(account.externalId).toBe('account-123');
      expect(account.currency.code).toBe('UAH');
      expect(account.balance.amount).toBe(1000000);
      expect(account.type).toBe('debit');
      expect(account.iban).toBe('UA213223130000026201234567890');
      expect(account.bank).toBe('monobank');
    });

    test('should map account with credit limit', () => {
      const raw: MonobankAccount = {
        id: 'credit-123',
        sendId: 'send-123',
        balance: 5000000, // 50000.00 UAH
        creditLimit: 2000000, // 20000.00 UAH credit limit
        type: 'iron',
        currencyCode: 980,
        iban: 'UA213223130000026201234567890',
      };

      const account = mapper.toAccount(raw);

      expect(account.creditLimit).toBeDefined();
      expect(account.creditLimit?.amount).toBe(2000000);
      expect(account.balance.amount).toBe(5000000);
    });

    test('should not set credit limit when zero', () => {
      const raw: MonobankAccount = {
        id: 'account-123',
        sendId: 'send-123',
        balance: 1000000,
        creditLimit: 0,
        type: 'black',
        currencyCode: 980,
        iban: 'UA213223130000026201234567890',
      };

      const account = mapper.toAccount(raw);

      expect(account.creditLimit).toBeUndefined();
    });

    test('should map USD account', () => {
      const raw: MonobankAccount = {
        id: 'usd-account',
        sendId: 'send-123',
        balance: 50000, // 500.00 USD
        creditLimit: 0,
        type: 'black',
        currencyCode: 840, // USD
        maskedPan: ['**** **** **** 5678'],
        iban: 'UA213223130000026201234567890',
      };

      const account = mapper.toAccount(raw);

      expect(account.currency.code).toBe('USD');
      expect(account.balance.amount).toBe(50000);
    });

    test('should map EUR account', () => {
      const raw: MonobankAccount = {
        id: 'eur-account',
        sendId: 'send-123',
        balance: 30000, // 300.00 EUR
        creditLimit: 0,
        type: 'platinum',
        currencyCode: 978, // EUR
        iban: 'UA213223130000026201234567890',
      };

      const account = mapper.toAccount(raw);

      expect(account.currency.code).toBe('EUR');
    });

    describe('account name building', () => {
      test('should build name with last 4 digits of masked PAN', () => {
        const raw: MonobankAccount = {
          id: 'account-123',
          sendId: 'send-123',
          balance: 1000000,
          creditLimit: 0,
          type: 'black',
          currencyCode: 980,
          maskedPan: ['**** **** **** 4530'],
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('Black Card *4530 (UAH)');
      });

      test('should build name without PAN when not available', () => {
        const raw: MonobankAccount = {
          id: 'account-123',
          sendId: 'send-123',
          balance: 1000000,
          creditLimit: 0,
          type: 'black',
          currencyCode: 980,
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('Black Card (UAH)');
      });

      test('should build name for FOP account', () => {
        const raw: MonobankAccount = {
          id: 'fop-123',
          sendId: 'send-123',
          balance: 5000000,
          creditLimit: 0,
          type: 'fop',
          currencyCode: 980,
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('FOP Account (UAH)');
      });

      test('should build name for iron (credit) card', () => {
        const raw: MonobankAccount = {
          id: 'iron-123',
          sendId: 'send-123',
          balance: 5000000,
          creditLimit: 2000000,
          type: 'iron',
          currencyCode: 980,
          maskedPan: ['**** **** **** 9999'],
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('Iron Card *9999 (UAH)');
      });

      test('should build name for eAid account', () => {
        const raw: MonobankAccount = {
          id: 'eaid-123',
          sendId: 'send-123',
          balance: 100000,
          creditLimit: 0,
          type: 'eAid',
          currencyCode: 980,
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('eSupport (UAH)');
      });

      test('should use type as fallback for unknown types', () => {
        const raw: MonobankAccount = {
          id: 'unknown-123',
          sendId: 'send-123',
          balance: 100000,
          creditLimit: 0,
          type: 'newCardType',
          currencyCode: 980,
          iban: 'UA213223130000026201234567890',
        };

        const account = mapper.toAccount(raw);

        expect(account.name).toBe('newCardType (UAH)');
      });
    });
  });

  describe('toTransaction', () => {
    test('should map Monobank statement item to domain Transaction', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-123',
        time: 1704067200, // 2024-01-01 00:00:00 UTC
        description: 'ATB Market',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -15000, // -150.00 UAH (debit)
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 150,
        balance: 985000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.externalId).toBe('tx-123');
      expect(transaction.date.getTime()).toBe(1704067200000);
      expect(transaction.amount.amount).toBe(-15000);
      expect(transaction.amount.currency.code).toBe('UAH');
      expect(transaction.description).toBe('ATB Market');
      expect(transaction.type).toBe(TransactionType.DEBIT);
      expect(transaction.accountId).toBe('account-123');
      expect(transaction.mcc).toBe(5411);
      expect(transaction.isHold).toBe(false);
    });

    test('should map credit transaction', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-456',
        time: 1704153600,
        description: 'Salary',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: 5000000, // 50000.00 UAH (credit)
        operationAmount: 5000000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 6000000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.type).toBe(TransactionType.CREDIT);
      expect(transaction.amount.amount).toBe(5000000);
      expect(transaction.isCredit).toBe(true);
    });

    test('should map hold transaction', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-789',
        time: 1704240000,
        description: 'Hold Transaction',
        mcc: 5411,
        originalMcc: 5411,
        hold: true,
        amount: -5000,
        operationAmount: -5000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 995000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.isHold).toBe(true);
    });

    test('should map transaction with comment', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-comment',
        time: 1704326400,
        description: 'Transfer',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: -10000,
        operationAmount: -10000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 990000,
        comment: 'Payment for services',
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.comment).toBe('Payment for services');
    });

    test('should map transaction with counterparty', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-counter',
        time: 1704412800,
        description: 'Transfer to friend',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: -100000,
        operationAmount: -100000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 900000,
        counterName: 'John Doe',
        counterIban: 'UA123456789012345678901234567',
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.counterpartyName).toBe('John Doe');
      expect(transaction.counterpartyIban).toBe(
        'UA123456789012345678901234567',
      );
    });

    test('should map balance and operation amount', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-balance',
        time: 1704499200,
        description: 'Purchase',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -25000,
        operationAmount: -25000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 250,
        balance: 875000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.balance?.amount).toBe(875000);
      expect(transaction.operationAmount?.amount).toBe(-25000);
    });

    test('should correctly determine transaction type for zero amount', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-zero',
        time: 1704585600,
        description: 'Zero transaction',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: 0,
        operationAmount: 0,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 1000000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      // Zero amount is treated as credit per the mapper logic
      expect(transaction.type).toBe(TransactionType.CREDIT);
    });

    test('should map cashbackAmount when greater than zero', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-cashback',
        time: 1704067200,
        description: 'Purchase with cashback',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 150, // 1.50 UAH cashback
        balance: 985000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.cashbackAmount).toBeDefined();
      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.cashbackAmount?.currency.code).toBe('UAH');
    });

    test('should not map cashbackAmount when zero', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-no-cashback',
        time: 1704067200,
        description: 'Purchase without cashback',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 985000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.cashbackAmount).toBeUndefined();
    });

    test('should map commissionRate when greater than zero', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-commission',
        time: 1704067200,
        description: 'Transfer with commission',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: -100000,
        operationAmount: -100000,
        currencyCode: 980,
        commissionRate: 500, // 5.00 UAH commission
        cashbackAmount: 0,
        balance: 900000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.commissionRate).toBeDefined();
      expect(transaction.commissionRate?.amount).toBe(500);
      expect(transaction.commissionRate?.currency.code).toBe('UAH');
    });

    test('should not map commissionRate when zero', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-no-commission',
        time: 1704067200,
        description: 'Transfer without commission',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: -100000,
        operationAmount: -100000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 900000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.commissionRate).toBeUndefined();
    });

    test('should map originalMcc when different from mcc', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-original-mcc',
        time: 1704067200,
        description: 'Purchase with corrected MCC',
        mcc: 5411, // Corrected by bank
        originalMcc: 5999, // Original MCC
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 985000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.originalMcc).toBe(5999);
    });

    test('should not map originalMcc when same as mcc', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-same-mcc',
        time: 1704067200,
        description: 'Purchase with same MCC',
        mcc: 5411,
        originalMcc: 5411, // Same as mcc
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 985000,
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.originalMcc).toBeUndefined();
    });

    test('should map receiptId when present', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-receipt',
        time: 1704067200,
        description: 'Purchase with receipt',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 985000,
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
    });

    test('should map invoiceId when present (FOP accounts)', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-invoice',
        time: 1704067200,
        description: 'FOP payment',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: 50000,
        operationAmount: 50000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 1050000,
        invoiceId: 'invoice-12345',
      };

      const transaction = mapper.toTransaction(raw, 'fop-account');

      expect(transaction.invoiceId).toBe('invoice-12345');
    });

    test('should map counterEdrpou when present', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-edrpou',
        time: 1704067200,
        description: 'Payment to company',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: -100000,
        operationAmount: -100000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 900000,
        counterEdrpou: '12345678',
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.counterEdrpou).toBe('12345678');
    });

    test('should map all Group B fields together', () => {
      const raw: MonobankStatementItem = {
        id: 'tx-all-group-b',
        time: 1704067200,
        description: 'Full transaction with all Group B fields',
        mcc: 5411,
        originalMcc: 5999,
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 100,
        cashbackAmount: 150,
        balance: 985000,
        receiptId: 'XXXX-XXXX-XXXX-XXXX',
        invoiceId: 'invoice-123',
        counterEdrpou: '12345678',
      };

      const transaction = mapper.toTransaction(raw, 'account-123');

      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.commissionRate?.amount).toBe(100);
      expect(transaction.originalMcc).toBe(5999);
      expect(transaction.receiptId).toBe('XXXX-XXXX-XXXX-XXXX');
      expect(transaction.invoiceId).toBe('invoice-123');
      expect(transaction.counterEdrpou).toBe('12345678');
    });
  });
});
