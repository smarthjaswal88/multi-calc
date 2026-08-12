import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, getCurrency } from '../src/currency.js';
import { formatMoney, parseMoney, toInputString } from '../src/money.js';

const SAMPLES = [0, 1, 50, 999, 1250, 12400, 124050, 320000, 59000000];

describe('toInputString is the exact inverse of parseMoney', () => {
  for (const code of CURRENCY_CODES) {
    it(`round-trips every sample in ${code}`, () => {
      for (const minor of SAMPLES) {
        const shown = toInputString(minor, code);
        expect(parseMoney(shown, code), `${code} ${minor} rendered "${shown}"`).toBe(minor);
      }
    });
  }
});

describe('formatMoney output parses back to its own value', () => {
  for (const code of CURRENCY_CODES) {
    it(`round-trips with symbol and grouping in ${code}`, () => {
      for (const minor of SAMPLES) {
        const shown = formatMoney(minor, code);
        expect(parseMoney(shown, code), `${code} ${minor} rendered "${shown}"`).toBe(minor);
      }
    });

    it(`round-trips without symbol or grouping in ${code}`, () => {
      for (const minor of SAMPLES) {
        const shown = formatMoney(minor, code, { withSymbol: false, grouping: false });
        expect(parseMoney(shown, code), `${code} ${minor} rendered "${shown}"`).toBe(minor);
      }
    });

    it(`round-trips without a symbol but with grouping in ${code}`, () => {
      for (const minor of SAMPLES) {
        const shown = formatMoney(minor, code, { withSymbol: false });
        expect(parseMoney(shown, code), `${code} ${minor} rendered "${shown}"`).toBe(minor);
      }
    });
  }
});

describe('the specific defect that motivated these tests', () => {
  it('parses a comma-decimal euro amount at its true value, not 100x', () => {
    expect(parseMoney('3200,00', 'EUR')).toBe(320000);
  });

  it('parses a comma-decimal euro amount with a single fractional digit', () => {
    expect(parseMoney('1240,5', 'EUR')).toBe(124050);
  });

  it('parses a fully formatted euro amount, symbol and all', () => {
    expect(parseMoney('1.240,50 €', 'EUR')).toBe(124050);
  });

  it('still reads dot-decimal euro input, which a user may well type', () => {
    expect(parseMoney('3200.50', 'EUR')).toBe(320050);
  });

  it('treats a three-digit run after the euro group separator as grouping', () => {
    expect(parseMoney('3.200', 'EUR')).toBe(320000);
  });
});

describe('currency symbols no longer defeat the parser', () => {
  it('accepts the wide yen symbol Intl emits', () => {
    expect(parseMoney(formatMoney(150, 'JPY'), 'JPY')).toBe(150);
    expect(parseMoney('￥150', 'JPY')).toBe(150);
    expect(parseMoney('¥150', 'JPY')).toBe(150);
  });

  it('accepts a dollar sign for a currency whose table symbol is A$', () => {
    expect(parseMoney('$1,240.50', 'AUD')).toBe(124050);
    expect(parseMoney('A$1,240.50', 'AUD')).toBe(124050);
  });

  it('accepts the three-letter code Intl uses for KWD', () => {
    expect(parseMoney('KWD 1.250', 'KWD')).toBe(1250);
    expect(parseMoney('KD 1.250', 'KWD')).toBe(1250);
  });

  it('accepts a non-breaking space between symbol and digits', () => {
    expect(parseMoney('1 240,50 €', 'EUR')).toBe(124050);
    expect(parseMoney('1 240.50', 'USD')).toBe(124050);
  });
});

describe('separator resolution rules', () => {
  it('treats the last of two separators as the decimal point', () => {
    expect(parseMoney('1,240.50', 'USD')).toBe(124050);
    expect(parseMoney('1.240,50', 'EUR')).toBe(124050);
  });

  it('treats a repeated separator as grouping', () => {
    expect(parseMoney('1,234,567', 'JPY')).toBe(1234567);
    expect(parseMoney('1.234.567', 'EUR')).toBe(123456700);
  });

  it('reads Indian lakh grouping', () => {
    expect(parseMoney('5,90,000.00', 'INR')).toBe(59000000);
    expect(parseMoney('₹5,90,000', 'INR')).toBe(59000000);
  });

  it('still refuses decimals in a zero-decimal currency', () => {
    expect(() => parseMoney('1240,5', 'JPY')).toThrow("don't use decimals");
    expect(() => parseMoney('1240.5', 'JPY')).toThrow("don't use decimals");
  });

  it('accepts grouped yen', () => {
    expect(parseMoney('12,400', 'JPY')).toBe(12400);
  });

  it('still refuses excess precision', () => {
    expect(() => parseMoney('1.2345', 'KWD')).toThrow('at most 3 decimal places');
    expect(() => parseMoney('1.234', 'USD')).toThrow('at most 2 decimal places');
  });
});

describe('malformed grouping is refused rather than silently collapsed', () => {
  it('rejects a separator run that is not a real group', () => {
    expect(() => parseMoney('1.2.3', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('1,2,3', 'USD')).toThrow('Enter a valid amount.');
  });

  it('prefers a decimal reading when a group reading is impossible, and reports it that way', () => {
    expect(() => parseMoney('1,23', 'JPY')).toThrow("don't use decimals");
    expect(() => parseMoney('12,3456', 'JPY')).toThrow("don't use decimals");
  });

  it('reports excess precision as excess precision, not as malformed', () => {
    expect(() => parseMoney('1,2345', 'USD')).toThrow('at most 2 decimal places');
  });

  it('rejects a leading group longer than three digits', () => {
    expect(() => parseMoney('1234,567', 'USD')).toThrow('Enter a valid amount.');
  });

  it('reads a trailing separator leniently, the way a numeric field does', () => {
    expect(parseMoney('1,', 'USD')).toBe(100);
    expect(parseMoney('1.', 'USD')).toBe(100);
  });

  it('rejects a separator with no digits at all', () => {
    expect(() => parseMoney(',', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('.', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('$', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects a fractional part containing a separator', () => {
    expect(() => parseMoney('1,240.50.60', 'USD')).toThrow('Enter a valid amount.');
  });

  it('still accepts both legitimate grouping conventions', () => {
    expect(parseMoney('1,234,567', 'JPY')).toBe(1234567);
    expect(parseMoney('12,34,56,789', 'JPY')).toBe(123456789);
  });
});

describe('a minus is only a sign where a sign can be', () => {
  it('rejects a minus embedded between digits', () => {
    expect(() => parseMoney('12-34', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('1-2', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects a trailing minus', () => {
    expect(() => parseMoney('5-', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('421.50-', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects a repeated minus', () => {
    expect(() => parseMoney('1--2', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('--5', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects an unbalanced parenthesis rather than stripping it', () => {
    expect(() => parseMoney('(12', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('12)', 'USD')).toThrow('Enter a valid amount.');
  });

  it('rejects parentheses combined with a minus', () => {
    expect(() => parseMoney('(-50)', 'USD')).toThrow('Enter a valid amount.');
    expect(() => parseMoney('(−50)', 'USD')).toThrow('Enter a valid amount.');
  });

  it('still reads balanced parentheses as a negative', () => {
    expect(parseMoney('(50)', 'USD')).toBe(-5000);
    expect(parseMoney('(1,240.50)', 'USD')).toBe(-124050);
  });

  it('still accepts a minus that precedes the digits, symbol or not', () => {
    expect(parseMoney('-421.50', 'USD')).toBe(-42150);
    expect(parseMoney('-$421.50', 'USD')).toBe(-42150);
    expect(parseMoney('$-421.50', 'USD')).toBe(-42150);
  });
});

describe('sign handling', () => {
  it('reads a hyphen-minus', () => {
    expect(parseMoney('-421.50', 'USD')).toBe(-42150);
  });

  it('reads the typographic minus Intl emits', () => {
    expect(parseMoney('−421.50', 'USD')).toBe(-42150);
  });

  it('reads parenthesised negatives', () => {
    expect(parseMoney('(421.50)', 'USD')).toBe(-42150);
  });

  it('round-trips a negative through formatMoney for every currency', () => {
    for (const code of CURRENCY_CODES) {
      const minor = -1 * 1250;
      const shown = formatMoney(minor, code);
      expect(parseMoney(shown, code), `${code} rendered "${shown}"`).toBe(minor);
    }
  });
});

describe('the currency table stays consistent with Intl', () => {
  it('renders each currency at exactly its own precision', () => {
    for (const code of CURRENCY_CODES) {
      const { exponent } = getCurrency(code);
      const shown = formatMoney(12345, code, { withSymbol: false, grouping: false });
      const fraction = shown.includes('.') || shown.includes(',') ? shown.split(/[.,]/)[1] : '';
      expect(fraction?.length ?? 0, `${code} rendered "${shown}"`).toBe(exponent);
    }
  });
});
