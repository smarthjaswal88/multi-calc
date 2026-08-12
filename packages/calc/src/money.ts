/**
 * Integer minor-unit money primitives.
 *
 * Every monetary value in the system is a signed integer count of a currency's minor units —
 * cents for USD, yen for JPY, fils for KWD. No floating-point number ever holds an amount.
 * This module is the only place allowed to convert between that representation and the
 * decimal strings a human reads or types.
 */

import { getCurrency, minorUnitsPerMajor, type CurrencyCode } from './currency.js';

/**
 * The largest value a PostgreSQL `INTEGER` column can hold.
 *
 * Every monetary column in the schema is an INTEGER, so this is a hard storage ceiling, not a
 * preference. Validation bounds are derived from it rather than chosen independently: if the
 * schemas accepted an amount this type cannot store, the write would fail inside the database
 * driver and surface as a 500 instead of a specific 400.
 */
export const PG_INT4_MAX = 2_147_483_647;

/**
 * Upper bound on any single amount, in minor units — INT4's ceiling with headroom.
 *
 * In USD this is $20,000,000.00; in JPY, ¥2,000,000,000; in KWD, 2,000,000.000 dinars. Ample
 * for a quoting tool, and every value below it is storable.
 *
 * Intermediate arithmetic multiplies an amount by up to 10,000 (the basis-point scale),
 * giving a worst case of 2e13 — comfortably inside the safe-integer range of ~9.007e15.
 */
export const MAX_AMOUNT_MINOR = 2_000_000_000; // 2e9

/**
 * Upper bound on a line quantity.
 *
 * Bounded because quantity multiplies the unit price: an unbounded quantity can overflow the
 * storage ceiling even when the price itself is modest.
 */
export const MAX_QUANTITY = 1_000_000;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

/** The exact decimal representation of an integer minor-unit amount. No float involved. */
export function toDecimalString(amountMinor: number, code: CurrencyCode): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('toDecimalString requires an integer minor-unit amount');
  }
  const { exponent } = getCurrency(code);
  const sign = amountMinor < 0 ? '-' : '';
  const digits = Math.abs(amountMinor).toString().padStart(exponent + 1, '0');

  if (exponent === 0) {
    return `${sign}${digits}`;
  }
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${sign}${whole}.${fraction}`;
}

/**
 * The canonical string form for an editable input: no symbol, no grouping, always `.` as the
 * decimal point, always the currency's full precision.
 *
 * Deliberately distinct from `formatMoney`, which is locale-aware and therefore not a safe
 * inverse of `parseMoney` on its own — a euro amount formats as `3200,00`, where `,` is the
 * decimal point. Editable inputs render through this function so the value a user edits is
 * unambiguous whatever the document's currency.
 */
export function toInputString(amountMinor: number, code: CurrencyCode): string {
  return toDecimalString(amountMinor, code);
}

/**
 * The group and decimal separators a currency's own locale uses.
 *
 * Asked of Intl rather than assumed, because the two conventions are inverses of each other
 * and both appear in this currency list: en-US writes `1,240.50` while de-DE writes
 * `1.240,50`.
 */
function separatorsFor(code: CurrencyCode): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(getCurrency(code).locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: true,
  }).formatToParts(1234.5);

  return {
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  };
}

/** A group separator always has exactly three digits behind it. A decimal point need not. */
const GROUP_RUN_LENGTH = 3;

/**
 * Remove group separators from an integer part, rejecting runs that are not real groups.
 *
 * Without this check, treating any repeated separator as grouping accepts nonsense: `1.2.3`
 * would collapse to `123` and parse as $1.23 rather than being refused.
 *
 * Both grouping conventions in this currency list are accommodated. Western grouping runs in
 * threes (`1,234,567`); Indian grouping puts pairs ahead of a final triple (`5,90,000`). So a
 * trailing group must be exactly three digits, an interior group two or three, and the leading
 * group at most three.
 */
function stripGroupSeparators(integerPart: string): string {
  if (!/[.,]/.test(integerPart)) {
    return integerPart;
  }

  const segments = integerPart.split(/[.,]/);
  const invalid = new MoneyParseError('Enter a valid amount.');

  const first = segments[0] ?? '';
  if (first.length === 0 || first.length > GROUP_RUN_LENGTH) {
    throw invalid;
  }

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index] ?? '';
    const isLast = index === segments.length - 1;
    const acceptable = isLast ? [3] : [2, 3];
    if (!acceptable.includes(segment.length)) {
      throw invalid;
    }
  }

  return segments.join('');
}

/**
 * Parse a human-entered amount into integer minor units.
 *
 * Tolerant of anything a user or a formatter can realistically produce: a currency symbol in
 * any position, spaces of any width, either separator convention, and a sign written as `-`,
 * as the typographic minus Intl sometimes emits, or as surrounding parentheses.
 *
 * Separator resolution is the delicate part, because a single separator is genuinely
 * ambiguous. The rules, in order:
 *
 *   - Both separators present: the *last* one is the decimal point. `1.240,50` and `1,240.50`
 *     both mean one thousand two hundred forty and a half.
 *   - One separator, repeated: it groups. `1,234,567` has no fractional part.
 *   - One separator, once: it is the decimal point if the locale says so, or if its trailing
 *     digit run cannot be a group. `3.200` groups for EUR; `3.2` cannot, so it is a decimal.
 *
 * This function is the inverse of `toInputString`. A round-trip test across every currency,
 * in both grouped and ungrouped forms, holds the two together.
 */
export function parseMoney(input: string | number, code: CurrencyCode): number {
  const currency = getCurrency(code);

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new MoneyParseError('Enter a valid amount.');
    }
    return parseMoney(input.toFixed(currency.exponent), code);
  }

  const raw = input.trim();
  if (raw === '') {
    throw new MoneyParseError('Enter an amount.');
  }

  // A sign is only a sign in the position a sign can occupy.
  //
  // The previous test was `/[-−]/.test(raw)` — "contains a minus anywhere" — which turned garbage
  // into a plausible negative amount instead of an error. Measured: "12-34" parsed to −123400 and
  // "1-2" to −1200. A mistyped figure became a large negative one, silently, and every downstream
  // bound was satisfied by it.
  //
  // Valid forms are a leading minus (before any digit, so a currency symbol may precede it) or
  // surrounding parentheses, which is how some locales render negatives. Anything else is
  // malformed. U+2212 is the typographic minus Intl emits in place of a hyphen.
  const trimmed = raw.trim();
  const parenthesised = /^\(.+\)$/.test(trimmed);
  const inner = parenthesised ? trimmed.slice(1, -1) : trimmed;

  // An unbalanced parenthesis is malformed, not decoration. Without this, "(12" and "12)" had their
  // stray bracket stripped by the character filter below and parsed as 12 — a typo silently
  // becoming a value.
  if (!parenthesised && /[()]/.test(trimmed)) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  const minusPositions = [...inner].flatMap((char, index) =>
    char === '-' || char === '−' ? [index] : [],
  );
  const firstDigit = [...inner].findIndex((char) => char >= '0' && char <= '9');

  // At most one sign, and it must come before the first digit.
  const hasLeadingSign =
    minusPositions.length === 1 && firstDigit !== -1 && minusPositions[0]! < firstDigit;

  if (minusPositions.length > (hasLeadingSign ? 1 : 0)) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  // Parentheses and a minus each mean negative, so together they cancel — "(-50)" is arguably
  // positive fifty. Rather than pick a reading, refuse: nobody types that intending either.
  if (parenthesised && hasLeadingSign) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  const negative = parenthesised || hasLeadingSign;

  // Keep only digits and the two candidate separators. This strips every currency symbol —
  // '$', '€', '￥', 'A$', 'KWD' — without needing to know which to expect, along with
  // ordinary, non-breaking, and narrow no-break spaces.
  const cleaned = inner.replace(/[^\d.,]/g, '');
  if (!/^[\d.,]*\d[\d.,]*$/.test(cleaned)) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  const { group: localeGroup, decimal: localeDecimal } = separatorsFor(code);

  const dots = (cleaned.match(/\./g) ?? []).length;
  const commas = (cleaned.match(/,/g) ?? []).length;

  let decimalChar: string | null = null;

  if (dots > 0 && commas > 0) {
    decimalChar = cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',') ? '.' : ',';
  } else if (dots + commas === 1) {
    const only = dots === 1 ? '.' : ',';
    const digitsAfter = cleaned.length - cleaned.lastIndexOf(only) - 1;

    if (only === localeDecimal) {
      decimalChar = only;
    } else if (only === localeGroup) {
      // A group separator is followed by exactly three digits. Anything else cannot be one,
      // so it must be a decimal point despite the locale's convention.
      decimalChar = digitsAfter === GROUP_RUN_LENGTH ? null : only;
    } else {
      decimalChar = only;
    }
  }
  // dots > 1 or commas > 1 leaves decimalChar null: a repeated separator groups.

  let whole: string;
  let fraction = '';

  if (decimalChar === null) {
    whole = stripGroupSeparators(cleaned);
  } else {
    const index = cleaned.lastIndexOf(decimalChar);
    whole = stripGroupSeparators(cleaned.slice(0, index));
    fraction = cleaned.slice(index + 1);

    // A decimal part cannot itself contain a separator.
    if (/[.,]/.test(fraction)) {
      throw new MoneyParseError('Enter a valid amount.');
    }
  }

  if (fraction.length > currency.exponent) {
    throw new MoneyParseError(
      currency.exponent === 0
        ? `Amounts in ${currency.name} don't use decimals.`
        : `Amounts in ${currency.name} use at most ${currency.exponent} decimal places.`,
    );
  }

  const padded = fraction.padEnd(currency.exponent, '0');
  const magnitude = Number(`${whole || '0'}${padded}`);

  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_AMOUNT_MINOR) {
    throw new MoneyParseError('That amount is too large.');
  }

  return negative ? -magnitude : magnitude;
}

/** Convert a major-unit number to minor units. Convenience for tests and seed data. */
export function toMinor(major: number, code: CurrencyCode): number {
  return parseMoney(major.toFixed(getCurrency(code).exponent), code);
}

/** Convert minor units back to a major-unit number. For display only — never for arithmetic. */
export function fromMinor(amountMinor: number, code: CurrencyCode): number {
  return amountMinor / minorUnitsPerMajor(code);
}

interface FormatOptions {
  /** Include the currency symbol. Default true. */
  withSymbol?: boolean;
  /** Include group separators. Default true. */
  grouping?: boolean;
  /** Render a leading + on positive values. Default 'auto'. */
  signDisplay?: 'auto' | 'always' | 'never';
}

/**
 * Format an integer minor-unit amount for display.
 *
 * Delegates to Intl so locale grouping is correct — Indian numbering groups 2-2-3, which
 * renders five hundred ninety thousand rupees as ₹5,90,000 rather than ₹590,000.
 *
 * The exact decimal string is handed to Intl rather than a divided float, so no precision is
 * lost on the way to the screen.
 *
 * For read-only display. Use `toInputString` for a field the user will edit.
 */
export function formatMoney(
  amountMinor: number,
  code: CurrencyCode,
  options: FormatOptions = {},
): string {
  const { withSymbol = true, grouping = true, signDisplay = 'auto' } = options;
  const currency = getCurrency(code);
  const decimal = toDecimalString(amountMinor, code);

  const formatter = new Intl.NumberFormat(currency.locale, {
    ...(withSymbol
      ? { style: 'currency' as const, currency: code, currencyDisplay: 'narrowSymbol' as const }
      : { style: 'decimal' as const }),
    minimumFractionDigits: currency.exponent,
    maximumFractionDigits: currency.exponent,
    useGrouping: grouping,
    signDisplay,
  });

  try {
    // Intl.NumberFormat v3 accepts a decimal string, preserving exactness.
    return formatter.format(decimal as unknown as number);
  } catch {
    return formatter.format(fromMinor(amountMinor, code));
  }
}

/** Format a percentage held in basis points: 825 becomes "8.25%". */
export function formatPercentBp(basisPoints: number): string {
  const percent = basisPoints / 100;
  const text = Number.isInteger(percent) ? percent.toString() : percent.toFixed(2).replace(/0$/, '');
  return `${text}%`;
}
