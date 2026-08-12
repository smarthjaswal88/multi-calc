/**
 * Display helpers, re-exported from the shared engine.
 *
 * The web app imports formatters and types from @multi-calc/calc but never computes a total.
 * Every figure shown to a user arrives from the server already calculated; these functions only
 * decide how it is rendered.
 *
 * The one distinction that matters: `formatMoney` is locale-aware and belongs in read-only
 * display, while `toInputString` is the canonical, locale-free form that `parseMoney` inverts.
 * Rendering an editable field with `formatMoney` is how a euro amount gets read back a hundred
 * times too large.
 */

export {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  MAX_QUANTITY,
  MoneyParseError,
  VALIDATION_MESSAGES,
  formatMoney,
  formatPercentBp,
  getCurrency,
  isCurrencyCode,
  parseMoney,
  toInputString,
  type Currency,
  type CurrencyCode,
  type DiscountType,
} from '@multi-calc/calc';

import { formatMoney, formatPercentBp, type CurrencyCode } from '@multi-calc/calc';

/** A subtractive amount: leading minus, discount hue applied by the caller. */
export function formatSubtractive(amountMinor: number, currency: CurrencyCode): string {
  if (amountMinor === 0) return formatMoney(0, currency, { withSymbol: false });
  return `− ${formatMoney(amountMinor, currency, { withSymbol: false })}`;
}

/** An additive amount: leading plus, tax hue applied by the caller. */
export function formatAdditive(amountMinor: number, currency: CurrencyCode): string {
  if (amountMinor === 0) return formatMoney(0, currency, { withSymbol: false });
  return `+ ${formatMoney(amountMinor, currency, { withSymbol: false })}`;
}

/**
 * A discount as it appears in a table cell: the percentage or the amount, never both.
 * An absent discount renders as an em dash — distinct from a computed zero, which is `0.00`.
 */
export function formatDiscountInput(
  discountType: 'NONE' | 'PERCENT' | 'FIXED',
  percentBp: number | null,
  fixedMinor: number | null,
  currency: CurrencyCode,
): string {
  // Null, not falsy: a 0% discount or a zero fixed amount is a stated choice, not an absent one.
  if (discountType === 'PERCENT' && percentBp !== null) return formatPercentBp(percentBp);
  if (discountType === 'FIXED' && fixedMinor !== null) {
    return formatMoney(fixedMinor, currency);
  }
  return '—';
}

/** A tax rate as it appears in a table cell. Absent renders as an em dash. */
export function formatTaxInput(taxPercentBp: number | null): string {
  // An em dash means "no rate set"; 0% means "explicitly zero-rated". These are different facts,
  // and PercentInput's own docstring promises the distinction is visible — collapsing them here
  // erased it, so a deliberately zero-rated line was indistinguishable from an untaxed one.
  return taxPercentBp === null ? '—' : formatPercentBp(taxPercentBp);
}

/** `MMM D, YYYY` for prose. Table columns keep the ISO form so they sort as text. */
export function formatDateLong(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Today in the user's own timezone, as the YYYY-MM-DD the API expects.
 *
 * `toISOString()` is UTC, so for anyone east of Greenwich it names yesterday for part of every
 * day — in IST, any document created before 05:30 defaulted to the previous date, silently filing
 * it into the wrong reporting range. The offset is subtracted so the calendar date matches the one
 * on the user's wall.
 */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
