'use client';

/**
 * A numeric table cell.
 *
 * Right-aligned, tabular figures, and one of the three semantic hues. Every state that uses a
 * hue also carries a sign or a label, so meaning never rests on colour alone — which matters
 * for colour-vision deficiency and for the monochrome print view.
 *
 * A computed zero renders as `0.00`; an absent input renders as an em dash. Those are different
 * facts and they look different.
 */

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
  /** Prefix a sign. 'minus' for subtractive amounts, 'plus' for additive. */
  sign?: 'none' | 'minus' | 'plus';
  withSymbol?: boolean;
  /** Muted and gently animated while the server recomputes. */
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

/** An absent value. Visibly different from a computed zero. */
export function EmptyCell({ className }: { className?: string }) {
  return <span className={cn('tabular text-muted-foreground', className)}>—</span>;
}
