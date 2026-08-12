'use client';

import { cn } from '@/lib/utils';
import { formatMoney, formatPercentBp, type CurrencyCode } from '@/lib/money';
import type { LineDto } from '@/lib/api';

type Density = 'compact' | 'expanded' | 'rail';

interface TapeRowProps {
  label: string;
  value: string;
  tone?: 'ink' | 'discount' | 'tax' | 'total' | 'muted';
  rule?: 'none' | 'single' | 'double';
  density: Density;
  emphasis?: boolean;
}

const TONE_CLASS: Record<NonNullable<TapeRowProps['tone']>, string> = {
  ink: 'text-foreground',
  discount: 'text-[color:var(--amount-discount)]',
  tax: 'text-[color:var(--amount-tax)]',
  total: 'text-[color:var(--amount-total)]',
  muted: 'text-muted-foreground',
};

const DENSITY_CLASS: Record<Density, { row: string; label: string; value: string }> = {
  compact: { row: 'py-[1px]', label: 'text-[0.6875rem]', value: 'text-[0.6875rem]' },
  expanded: { row: 'py-0.5', label: 'text-[0.75rem]', value: 'text-[0.75rem]' },
  rail: { row: 'py-1', label: 'text-[0.8125rem]', value: 'text-sm' },
};

function TapeRow({ label, value, tone = 'ink', rule = 'none', density, emphasis }: TapeRowProps) {
  const size = DENSITY_CLASS[density];

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6',
        size.row,
        rule === 'single' && 'border-t border-[color:var(--tape-rule)] mt-1 pt-1',

        rule === 'double' &&
          'mt-1 pt-1.5 border-t-[3px] border-double border-[color:var(--tape-rule)]',
      )}
    >
      <span className={cn(size.label, tone === 'ink' ? 'text-muted-foreground' : TONE_CLASS[tone])}>
        {label}
      </span>
      <span
        className={cn(
          'tabular whitespace-nowrap',
          size.value,
          TONE_CLASS[tone],
          emphasis && 'font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface LineTapeProps {
  line: LineDto;
  currency: CurrencyCode;
  density?: Density;
  className?: string;
}

export function LineDerivationTape({ line, currency, density = 'expanded', className }: LineTapeProps) {
  const money = (minor: number) => formatMoney(minor, currency, { withSymbol: false });

  const hasDiscount = line.discountType !== 'NONE' && line.discountAmountMinor !== 0;

  const hasTax = line.taxPercentBp !== null;

  const discountLabel =
    line.discountType === 'PERCENT' && line.discountPercentBp !== null
      ? formatPercentBp(line.discountPercentBp)
      : 'discount';

  return (
    <div className={cn('min-w-56', className)} role="table" aria-label="How this item was calculated">
      <TapeRow
        density={density}
        label={`${line.quantity} × ${money(line.unitPriceMinor)}`}
        value={money(line.lineSubtotalMinor)}
      />

      {hasDiscount && (
        <TapeRow
          density={density}
          tone="discount"
          label={`− ${discountLabel}`}
          value={`− ${money(line.discountAmountMinor)}`}
        />
      )}

      {hasDiscount && (
        <TapeRow
          density={density}
          rule="single"
          label="after discount"
          value={money(line.afterDiscountMinor)}
        />
      )}

      {hasTax && (
        <TapeRow
          density={density}
          tone="tax"
          label={`+ ${formatPercentBp(line.taxPercentBp ?? 0)} tax`}
          value={`+ ${money(line.taxAmountMinor)}`}
        />
      )}

      <TapeRow
        density={density}
        rule="double"
        tone="total"
        emphasis
        label="item total"
        value={money(line.lineTotalMinor)}
      />
    </div>
  );
}

interface DocumentTapeProps {
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  grandTotalMinor: number;
  currency: CurrencyCode;

  pending?: boolean;
  className?: string;
}

export function DocumentDerivationTape({
  subtotalMinor,
  totalDiscountMinor,
  totalTaxMinor,
  grandTotalMinor,
  currency,
  pending = false,
  className,
}: DocumentTapeProps) {
  const money = (minor: number) => formatMoney(minor, currency, { withSymbol: false });

  return (
    <div className={cn('space-y-0', pending && 'recalculating', className)}>
      <TapeRow density="rail" label="Subtotal" value={money(subtotalMinor)} />
      <TapeRow
        density="rail"
        tone="discount"
        label="Total discount"
        value={totalDiscountMinor === 0 ? money(0) : `− ${money(totalDiscountMinor)}`}
      />
      <TapeRow
        density="rail"
        tone="tax"
        label="Total tax"
        value={totalTaxMinor === 0 ? money(0) : `+ ${money(totalTaxMinor)}`}
      />

      <div className="mt-2 border-t-[3px] border-double border-[color:var(--tape-rule)] pt-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="eyebrow">Grand total</span>
          <span className="tabular text-2xl font-semibold text-[color:var(--amount-total)] whitespace-nowrap">
            {formatMoney(grandTotalMinor, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
