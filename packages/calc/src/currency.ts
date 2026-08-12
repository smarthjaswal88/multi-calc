/**
 * The curated currency list.
 *
 * `exponent` is the number of decimal places the currency uses, and therefore how many
 * minor units make up one major unit. It is the single source of truth for that question —
 * nothing else in the codebase may assume two decimal places.
 */

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'INR'
  | 'AED'
  | 'AUD'
  | 'CAD'
  | 'SGD'
  | 'JPY'
  | 'KRW'
  | 'KWD'
  | 'BHD';

export interface Currency {
  readonly code: CurrencyCode;
  readonly name: string;
  readonly symbol: string;
  /** Locale used for grouping conventions — INR groups 2-2-3, not 3-3. */
  readonly locale: string;
  readonly exponent: 0 | 2 | 3;
}

export const CURRENCIES: Readonly<Record<CurrencyCode, Currency>> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US', exponent: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE', exponent: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB', exponent: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN', exponent: 2 },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', locale: 'en-AE', exponent: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', locale: 'en-AU', exponent: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', locale: 'en-CA', exponent: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', locale: 'en-SG', exponent: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP', exponent: 0 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', locale: 'ko-KR', exponent: 0 },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', locale: 'en-KW', exponent: 3 },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', locale: 'en-BH', exponent: 3 },
} as const;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function getCurrency(code: CurrencyCode): Currency {
  const currency = CURRENCIES[code];
  if (!currency) {
    throw new Error(`Unsupported currency: ${String(code)}`);
  }
  return currency;
}

/** How many minor units make one major unit: 1 for JPY, 100 for USD, 1000 for KWD. */
export function minorUnitsPerMajor(code: CurrencyCode): number {
  return 10 ** getCurrency(code).exponent;
}
