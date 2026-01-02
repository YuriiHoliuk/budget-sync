const CURRENCY_CODES: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  985: 'PLN',
};

export class Currency {
  private constructor(public readonly code: string) {}

  static fromCode(code: string): Currency {
    const upperCode = code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(upperCode)) {
      throw new Error(`Invalid currency code: ${code}`);
    }
    return new Currency(upperCode);
  }

  static fromNumericCode(numericCode: number): Currency {
    const code = CURRENCY_CODES[numericCode];
    if (!code) {
      throw new Error(`Unknown numeric currency code: ${numericCode}`);
    }
    return new Currency(code);
  }

  static UAH = new Currency('UAH');
  static USD = new Currency('USD');
  static EUR = new Currency('EUR');

  equals(other: Currency): boolean {
    return this.code === other.code;
  }

  toString(): string {
    return this.code;
  }
}
