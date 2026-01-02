import type { Currency } from './Currency.ts';

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {}

  static create(amount: number, currency: Currency): Money {
    if (!Number.isInteger(amount)) {
      throw new Error('Amount must be an integer (minor units)');
    }
    return new Money(amount, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  abs(): Money {
    return new Money(Math.abs(this.amount), this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  toMajorUnits(): number {
    return this.amount / 100;
  }

  format(): string {
    const major = this.toMajorUnits();
    return `${major.toFixed(2)} ${this.currency.code}`;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency.equals(other.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      throw new Error(
        `Cannot operate on different currencies: ${this.currency.code} and ${other.currency.code}`,
      );
    }
  }
}
