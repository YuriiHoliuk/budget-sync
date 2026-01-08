import { describe, expect, test } from 'bun:test';
import {
  Transaction,
  type TransactionProps,
} from '@domain/entities/Transaction.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';

function createDefaultProps(
  overrides?: Partial<TransactionProps>,
): TransactionProps {
  return {
    externalId: 'ext-123',
    date: new Date('2024-01-15T10:30:00Z'),
    amount: Money.create(10000, Currency.UAH),
    description: 'Test transaction',
    type: TransactionType.DEBIT,
    accountId: 'account-456',
    ...overrides,
  };
}

describe('Transaction', () => {
  describe('create', () => {
    test('should create transaction with all required props', () => {
      const props = createDefaultProps();

      const transaction = Transaction.create(props);

      expect(transaction.externalId).toBe('ext-123');
      expect(transaction.date).toEqual(new Date('2024-01-15T10:30:00Z'));
      expect(transaction.amount.amount).toBe(10000);
      expect(transaction.amount.currency.code).toBe('UAH');
      expect(transaction.description).toBe('Test transaction');
      expect(transaction.type).toBe(TransactionType.DEBIT);
      expect(transaction.accountId).toBe('account-456');
    });

    test('should use externalId as id when id not provided', () => {
      const props = createDefaultProps({ externalId: 'external-id-789' });

      const transaction = Transaction.create(props);

      expect(transaction.id).toBe('external-id-789');
    });

    test('should use provided id when given', () => {
      const props = createDefaultProps();

      const transaction = Transaction.create(props, 'custom-id-999');

      expect(transaction.id).toBe('custom-id-999');
      expect(transaction.externalId).toBe('ext-123');
    });

    test('should create transaction with all optional props', () => {
      const props = createDefaultProps({
        operationAmount: Money.create(5000, Currency.USD),
        mcc: 5411,
        comment: 'Grocery shopping',
        balance: Money.create(50000, Currency.UAH),
        counterpartyName: 'Grocery Store',
        counterpartyIban: 'UA123456789012345678901234567',
        hold: true,
        cashbackAmount: Money.create(150, Currency.UAH),
        commissionRate: Money.create(50, Currency.UAH),
        originalMcc: 5412,
        receiptId: 'receipt-123',
        invoiceId: 'invoice-456',
        counterEdrpou: '12345678',
      });

      const transaction = Transaction.create(props);

      expect(transaction.operationAmount?.amount).toBe(5000);
      expect(transaction.operationAmount?.currency.code).toBe('USD');
      expect(transaction.mcc).toBe(5411);
      expect(transaction.comment).toBe('Grocery shopping');
      expect(transaction.balance?.amount).toBe(50000);
      expect(transaction.counterpartyName).toBe('Grocery Store');
      expect(transaction.counterpartyIban).toBe(
        'UA123456789012345678901234567',
      );
      expect(transaction.isHold).toBe(true);
      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.cashbackAmount?.currency.code).toBe('UAH');
      expect(transaction.commissionRate?.amount).toBe(50);
      expect(transaction.commissionRate?.currency.code).toBe('UAH');
      expect(transaction.originalMcc).toBe(5412);
      expect(transaction.receiptId).toBe('receipt-123');
      expect(transaction.invoiceId).toBe('invoice-456');
      expect(transaction.counterEdrpou).toBe('12345678');
    });
  });

  describe('getters', () => {
    describe('externalId', () => {
      test('should return externalId', () => {
        const transaction = Transaction.create(
          createDefaultProps({ externalId: 'mono-tx-abc' }),
        );

        expect(transaction.externalId).toBe('mono-tx-abc');
      });
    });

    describe('date', () => {
      test('should return date', () => {
        const transactionDate = new Date('2024-06-20T14:00:00Z');
        const transaction = Transaction.create(
          createDefaultProps({ date: transactionDate }),
        );

        expect(transaction.date).toEqual(transactionDate);
      });
    });

    describe('amount', () => {
      test('should return amount', () => {
        const amount = Money.create(-25000, Currency.UAH);
        const transaction = Transaction.create(createDefaultProps({ amount }));

        expect(transaction.amount.amount).toBe(-25000);
        expect(transaction.amount.currency.code).toBe('UAH');
      });
    });

    describe('operationAmount', () => {
      test('should return operationAmount when set', () => {
        const operationAmount = Money.create(10000, Currency.USD);
        const transaction = Transaction.create(
          createDefaultProps({ operationAmount }),
        );

        expect(transaction.operationAmount?.amount).toBe(10000);
        expect(transaction.operationAmount?.currency.code).toBe('USD');
      });

      test('should return undefined when operationAmount not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.operationAmount).toBeUndefined();
      });
    });

    describe('description', () => {
      test('should return description', () => {
        const transaction = Transaction.create(
          createDefaultProps({ description: 'Coffee purchase' }),
        );

        expect(transaction.description).toBe('Coffee purchase');
      });
    });

    describe('type', () => {
      test('should return DEBIT type', () => {
        const transaction = Transaction.create(
          createDefaultProps({ type: TransactionType.DEBIT }),
        );

        expect(transaction.type).toBe(TransactionType.DEBIT);
      });

      test('should return CREDIT type', () => {
        const transaction = Transaction.create(
          createDefaultProps({ type: TransactionType.CREDIT }),
        );

        expect(transaction.type).toBe(TransactionType.CREDIT);
      });
    });

    describe('accountId', () => {
      test('should return accountId', () => {
        const transaction = Transaction.create(
          createDefaultProps({ accountId: 'acc-main-001' }),
        );

        expect(transaction.accountId).toBe('acc-main-001');
      });
    });

    describe('mcc', () => {
      test('should return mcc when set', () => {
        const transaction = Transaction.create(
          createDefaultProps({ mcc: 5812 }),
        );

        expect(transaction.mcc).toBe(5812);
      });

      test('should return undefined when mcc not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.mcc).toBeUndefined();
      });
    });

    describe('comment', () => {
      test('should return comment when set', () => {
        const transaction = Transaction.create(
          createDefaultProps({ comment: 'Birthday gift' }),
        );

        expect(transaction.comment).toBe('Birthday gift');
      });

      test('should return undefined when comment not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.comment).toBeUndefined();
      });
    });

    describe('balance', () => {
      test('should return balance when set', () => {
        const balance = Money.create(100000, Currency.UAH);
        const transaction = Transaction.create(createDefaultProps({ balance }));

        expect(transaction.balance?.amount).toBe(100000);
        expect(transaction.balance?.currency.code).toBe('UAH');
      });

      test('should return undefined when balance not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.balance).toBeUndefined();
      });
    });

    describe('counterpartyName', () => {
      test('should return counterpartyName when set', () => {
        const transaction = Transaction.create(
          createDefaultProps({ counterpartyName: 'John Doe' }),
        );

        expect(transaction.counterpartyName).toBe('John Doe');
      });

      test('should return undefined when counterpartyName not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.counterpartyName).toBeUndefined();
      });
    });

    describe('counterpartyIban', () => {
      test('should return counterpartyIban when set', () => {
        const transaction = Transaction.create(
          createDefaultProps({
            counterpartyIban: 'UA123456789012345678901234567',
          }),
        );

        expect(transaction.counterpartyIban).toBe(
          'UA123456789012345678901234567',
        );
      });

      test('should return undefined when counterpartyIban not provided', () => {
        const transaction = Transaction.create(createDefaultProps());

        expect(transaction.counterpartyIban).toBeUndefined();
      });
    });
  });

  describe('isHold', () => {
    test('should return false when hold is undefined', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.isHold).toBe(false);
    });

    test('should return true when hold is true', () => {
      const transaction = Transaction.create(
        createDefaultProps({ hold: true }),
      );

      expect(transaction.isHold).toBe(true);
    });

    test('should return false when hold is false', () => {
      const transaction = Transaction.create(
        createDefaultProps({ hold: false }),
      );

      expect(transaction.isHold).toBe(false);
    });
  });

  describe('cashbackAmount', () => {
    test('should return cashbackAmount when set', () => {
      const cashback = Money.create(150, Currency.UAH);
      const transaction = Transaction.create(
        createDefaultProps({ cashbackAmount: cashback }),
      );

      expect(transaction.cashbackAmount?.amount).toBe(150);
      expect(transaction.cashbackAmount?.currency.code).toBe('UAH');
    });

    test('should return undefined when cashbackAmount not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.cashbackAmount).toBeUndefined();
    });
  });

  describe('commissionRate', () => {
    test('should return commissionRate when set', () => {
      const commission = Money.create(50, Currency.UAH);
      const transaction = Transaction.create(
        createDefaultProps({ commissionRate: commission }),
      );

      expect(transaction.commissionRate?.amount).toBe(50);
      expect(transaction.commissionRate?.currency.code).toBe('UAH');
    });

    test('should return undefined when commissionRate not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.commissionRate).toBeUndefined();
    });
  });

  describe('originalMcc', () => {
    test('should return originalMcc when set', () => {
      const transaction = Transaction.create(
        createDefaultProps({ originalMcc: 5412 }),
      );

      expect(transaction.originalMcc).toBe(5412);
    });

    test('should return undefined when originalMcc not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.originalMcc).toBeUndefined();
    });
  });

  describe('receiptId', () => {
    test('should return receiptId when set', () => {
      const transaction = Transaction.create(
        createDefaultProps({ receiptId: 'receipt-123' }),
      );

      expect(transaction.receiptId).toBe('receipt-123');
    });

    test('should return undefined when receiptId not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.receiptId).toBeUndefined();
    });
  });

  describe('invoiceId', () => {
    test('should return invoiceId when set', () => {
      const transaction = Transaction.create(
        createDefaultProps({ invoiceId: 'invoice-456' }),
      );

      expect(transaction.invoiceId).toBe('invoice-456');
    });

    test('should return undefined when invoiceId not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.invoiceId).toBeUndefined();
    });
  });

  describe('counterEdrpou', () => {
    test('should return counterEdrpou when set', () => {
      const transaction = Transaction.create(
        createDefaultProps({ counterEdrpou: '12345678' }),
      );

      expect(transaction.counterEdrpou).toBe('12345678');
    });

    test('should return undefined when counterEdrpou not provided', () => {
      const transaction = Transaction.create(createDefaultProps());

      expect(transaction.counterEdrpou).toBeUndefined();
    });
  });

  describe('isCredit', () => {
    test('should return true when type is CREDIT', () => {
      const transaction = Transaction.create(
        createDefaultProps({ type: TransactionType.CREDIT }),
      );

      expect(transaction.isCredit).toBe(true);
    });

    test('should return false when type is DEBIT', () => {
      const transaction = Transaction.create(
        createDefaultProps({ type: TransactionType.DEBIT }),
      );

      expect(transaction.isCredit).toBe(false);
    });
  });

  describe('isDebit', () => {
    test('should return true when type is DEBIT', () => {
      const transaction = Transaction.create(
        createDefaultProps({ type: TransactionType.DEBIT }),
      );

      expect(transaction.isDebit).toBe(true);
    });

    test('should return false when type is CREDIT', () => {
      const transaction = Transaction.create(
        createDefaultProps({ type: TransactionType.CREDIT }),
      );

      expect(transaction.isDebit).toBe(false);
    });
  });
});
