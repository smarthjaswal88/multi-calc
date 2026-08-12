import { getCurrency, minorUnitsPerMajor, type CurrencyCode } from './currency.js';

export const PG_INT4_MAX = 2_147_483_647;

export const MAX_AMOUNT_MINOR = 2_000_000_000;

export const MAX_QUANTITY = 1_000_000;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

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

export function toInputString(amountMinor: number, code: CurrencyCode): string {
  return toDecimalString(amountMinor, code);
}

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

const GROUP_RUN_LENGTH = 3;

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

  const trimmed = raw.trim();
  const parenthesised = /^\(.+\)$/.test(trimmed);
  const inner = parenthesised ? trimmed.slice(1, -1) : trimmed;

  if (!parenthesised && /[()]/.test(trimmed)) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  const minusPositions = [...inner].flatMap((char, index) =>
    char === '-' || char === '−' ? [index] : [],
  );
  const firstDigit = [...inner].findIndex((char) => char >= '0' && char <= '9');

  const hasLeadingSign =
    minusPositions.length === 1 && firstDigit !== -1 && minusPositions[0]! < firstDigit;

  if (minusPositions.length > (hasLeadingSign ? 1 : 0)) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  if (parenthesised && hasLeadingSign) {
    throw new MoneyParseError('Enter a valid amount.');
  }

  const negative = parenthesised || hasLeadingSign;

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
      decimalChar = digitsAfter === GROUP_RUN_LENGTH ? null : only;
    } else {
      decimalChar = only;
    }
  }

  let whole: string;
  let fraction = '';

  if (decimalChar === null) {
    whole = stripGroupSeparators(cleaned);
  } else {
    const index = cleaned.lastIndexOf(decimalChar);
    whole = stripGroupSeparators(cleaned.slice(0, index));
    fraction = cleaned.slice(index + 1);

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

export function toMinor(major: number, code: CurrencyCode): number {
  return parseMoney(major.toFixed(getCurrency(code).exponent), code);
}

export function fromMinor(amountMinor: number, code: CurrencyCode): number {
  return amountMinor / minorUnitsPerMajor(code);
}

interface FormatOptions {
  withSymbol?: boolean;

  grouping?: boolean;

  signDisplay?: 'auto' | 'always' | 'never';
}

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
    return formatter.format(decimal as unknown as number);
  } catch {
    return formatter.format(fromMinor(amountMinor, code));
  }
}

export function formatPercentBp(basisPoints: number): string {
  const percent = basisPoints / 100;
  const text = Number.isInteger(percent) ? percent.toString() : percent.toFixed(2).replace(/0$/, '');
  return `${text}%`;
}
