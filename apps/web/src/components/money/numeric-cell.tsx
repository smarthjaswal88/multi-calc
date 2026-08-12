'use client';

import { cn } from '@/lib/utils';
import { formatMoney, type CurrencyCode } from '@/lib/money';

type Tone = 'ink' | 'discount' | 'tax' | 'total' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  ink: 'text-foreground',
  discount: 'text-[color:var(--amount-discount)]',
  tax: 'text-[color:var(--amount-tax)]',
  total: 'text-[color:var(--amount-total)]',
  muted: 'text-muted-foreground',
};

interface NumericCellProps {
  amountMinor: number;
  currency: CurrencyCode;
  tone?: Tone;

  sign?: 'none' | 'minus' | 'plus';
  withSymbol?: boolean;

  pending?: boolean;
  emphasis?: boolean;
  className?: string;
}

export function NumericCell({
  amountMinor,
  currency,
  tone = 'ink',
  sign = 'none',
  withSymbol = false,
  pending = false,
  emphasis = false,
  className,
}: NumericCellProps) {
  const formatted = formatMoney(amountMinor, currency, { withSymbol });
  const prefix = amountMinor === 0 || sign === 'none' ? '' : sign === 'minus' ? '− ' : '+ ';

  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        TONE_CLASS[tone],
        emphasis && 'font-semibold',
        pending && 'recalculating',
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  );
}

export function EmptyCell({ className }: { className?: string }) {
  return <span className={cn('tabular text-muted-foreground', className)}>—</span>;
}
