import { describe, expect, it } from 'vitest';
import {
  MoneyParseError,
  formatMoney,
  formatPercentBp,
  parseMoney,
  toDecimalString,
  toMinor,
} from '../src/money.js';
import { computeLine } from '../src/line.js';
import { sumLineResults } from '../src/document.js';

describe('parseMoney', () => {
  it('parses a plain decimal', () => {
    expect(parseMoney('100.00', 'USD')).toBe(10000);
    expect(parseMoney('0.01', 'USD')).toBe(1);
    expect(parseMoney('421.50', 'USD')).toBe(42150);
  });

  it('parses a value with no decimal part', () => {
    expect(parseMoney('100', 'USD')).toBe(10000);
  });

  it('parses a partial decimal part', () => {
    expect(parseMoney('1.5', 'USD')).toBe(150);
  });

  it('tolerates group separators, symbols, and surrounding space', () => {
    expect(parseMoney('  $1,240.50 ', 'USD')).toBe(124050);
    expect(parseMoney('₹5,90,000', 'INR')).toBe(59000000);
  });

  it('parses negative values, leaving the sign rule to validation', () => {
    expect(parseMoney('-5.00', 'USD')).toBe(-500);
  });

  it('rejects an empty value', () => {
    expect(() => parseMoney('   ', 'USD')).toThrow(MoneyParseError);
    expect(() => parseMoney('', 'USD')).toThrow('Enter an amount.');
  });

  it('rejects text that is not a number', () => {
    expect(() => parseMoney('abc', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('1.2.3', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects more decimal places than the currency has', () => {
    expect(() => parseMoney('1.234', 'USD')).toThrow('use at most 2 decimal places');
  });

  it('rejects decimals entirely for a zero-decimal currency', () => {
    expect(() => parseMoney('1200.50', 'JPY')).toThrow(
      "Amounts in Japanese Yen don't use decimals.",
    );
    expect(parseMoney('1200', 'JPY')).toBe(1200);
  });

  it('accepts three decimal places for a three-decimal currency', () => {
    expect(parseMoney('1.250', 'KWD')).toBe(1250);
    expect(() => parseMoney('1.2504', 'KWD')).toThrow('use at most 3 decimal places');
  });

  it('rejects an amount beyond the safe ceiling', () => {
    expect(() => parseMoney('99999999999999', 'USD')).toThrow('too large');
  });

  it('round-trips through formatting without drift', () => {
    for (const value of ['0.01', '0.99', '1.00', '9.99', '1234.56', '999999.99']) {
      const minor = parseMoney(value, 'USD');
      expect(toDecimalString(minor, 'USD')).toBe(
        value.includes('.') ? value : `${value}.00`,
      );
    }
  });
});

describe('float drift the integer representation avoids', () => {
  it('sums 0.1 + 0.2 to exactly 0.30', () => {
    const a = parseMoney('0.10', 'USD');
    const b = parseMoney('0.20', 'USD');
    expect(a + b).toBe(30);
    expect(formatMoney(a + b, 'USD')).toBe('$0.30');
    // For contrast, the float path does not: 0.1 + 0.2 === 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('handles 1.005 without the classic float rounding failure', () => {
    // (1.005).toFixed(2) yields "1.00" because 1.005 is not exactly representable.
    expect((1.005).toFixed(2)).toBe('1.00');
    // Parsed as an integer count of cents, it is unambiguous.
    expect(parseMoney('1.005', 'KWD')).toBe(1005);
  });

  it('accumulates a hundred one-cent lines to exactly one dollar', () => {
    const lines = Array.from({ length: 100 }, () =>
      computeLine({ quantity: 1, unitPriceMinor: 1, discountType: 'NONE' }),
    );
    expect(sumLineResults(lines).grandTotalMinor).toBe(100);
    expect(formatMoney(sumLineResults(lines).grandTotalMinor, 'USD')).toBe('$1.00');
  });
});

describe('formatMoney', () => {
  it('always shows the currency full minor-unit precision', () => {
    expect(formatMoney(18000, 'USD')).toBe('$180.00');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('omits decimals entirely for a zero-decimal currency', () => {
    const formatted = formatMoney(12400, 'JPY');
    expect(formatted).toContain('12,400');
    expect(formatted).not.toContain('.');
  });

  it('shows three decimals for a three-decimal currency', () => {
    expect(formatMoney(1250, 'KWD')).toMatch(/1\.250/);
  });

  it('uses Indian 2-2-3 grouping for INR', () => {
    // Five hundred ninety thousand rupees groups as 5,90,000 — not 590,000.
    expect(formatMoney(59000000, 'INR')).toContain('5,90,000');
  });

  it('uses 3-3 grouping for USD', () => {
    expect(formatMoney(59000000, 'USD')).toContain('590,000');
  });

  it('can omit the symbol, for a table cell with a separate affix', () => {
    expect(formatMoney(42150, 'USD', { withSymbol: false })).toBe('421.50');
  });

  it('can omit grouping, for an input being edited', () => {
    expect(formatMoney(124050, 'USD', { withSymbol: false, grouping: false })).toBe('1240.50');
  });

  it('renders negative amounts with a sign', () => {
    expect(formatMoney(-2000, 'USD')).toContain('20.00');
    expect(formatMoney(-2000, 'USD')).toMatch(/[-−(]/);
  });
});

describe('toDecimalString', () => {
  it('pads a value smaller than one major unit', () => {
    expect(toDecimalString(5, 'USD')).toBe('0.05');
    expect(toDecimalString(50, 'USD')).toBe('0.50');
    expect(toDecimalString(1, 'KWD')).toBe('0.001');
  });

  it('emits no separator for a zero-decimal currency', () => {
    expect(toDecimalString(12400, 'JPY')).toBe('12400');
  });

  it('keeps the sign', () => {
    expect(toDecimalString(-42150, 'USD')).toBe('-421.50');
  });
});

describe('toMinor', () => {
  it('converts major units for each exponent', () => {
    expect(toMinor(100, 'USD')).toBe(10000);
    expect(toMinor(1200, 'JPY')).toBe(1200);
    expect(toMinor(1.25, 'KWD')).toBe(1250);
  });
});

describe('formatPercentBp', () => {
  it('renders whole percentages without decimals', () => {
    expect(formatPercentBp(1000)).toBe('10%');
    expect(formatPercentBp(500)).toBe('5%');
    expect(formatPercentBp(0)).toBe('0%');
  });

  it('renders fractional percentages', () => {
    expect(formatPercentBp(825)).toBe('8.25%');
    expect(formatPercentBp(750)).toBe('7.5%');
  });
});
