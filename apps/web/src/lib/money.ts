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

export function formatSubtractive(amountMinor: number, currency: CurrencyCode): string {
  if (amountMinor === 0) return formatMoney(0, currency, { withSymbol: false });
  return `− ${formatMoney(amountMinor, currency, { withSymbol: false })}`;
}

export function formatAdditive(amountMinor: number, currency: CurrencyCode): string {
  if (amountMinor === 0) return formatMoney(0, currency, { withSymbol: false });
  return `+ ${formatMoney(amountMinor, currency, { withSymbol: false })}`;
}

export function formatDiscountInput(
  discountType: 'NONE' | 'PERCENT' | 'FIXED',
  percentBp: number | null,
  fixedMinor: number | null,
  currency: CurrencyCode,
): string {
  if (discountType === 'PERCENT' && percentBp !== null) return formatPercentBp(percentBp);
  if (discountType === 'FIXED' && fixedMinor !== null) {
    return formatMoney(fixedMinor, currency);
  }
  return '—';
}

export function formatTaxInput(taxPercentBp: number | null): string {
  return taxPercentBp === null ? '—' : formatPercentBp(taxPercentBp);
}

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

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
