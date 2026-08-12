'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MoneyInput } from '@/components/money/money-input';
import { PercentInput } from '@/components/money/percent-input';
import { cn } from '@/lib/utils';
import type { CurrencyCode, DiscountType } from '@/lib/money';
import { getCurrency } from '@/lib/money';

export interface DiscountValue {
  discountType: DiscountType;
  discountPercentBp: number | null;
  discountFixedMinor: number | null;
}

interface DiscountControlProps {
  value: DiscountValue;
  currency: CurrencyCode;
  onChange: (value: DiscountValue) => void;
  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DiscountControl({
  value,
  currency,
  onChange,
  onParseError,
  invalid,
  disabled,
  className,
}: DiscountControlProps) {
  const { symbol } = getCurrency(currency);

  function selectType(next: DiscountType): void {
    onParseError?.(null);
    if (next === 'NONE') {
      onChange({ discountType: 'NONE', discountPercentBp: null, discountFixedMinor: null });
      return;
    }
    if (next === 'PERCENT') {
      onChange({
        discountType: 'PERCENT',
        discountPercentBp: value.discountPercentBp ?? 0,
        discountFixedMinor: null,
      });
      return;
    }
    onChange({
      discountType: 'FIXED',
      discountPercentBp: null,
      discountFixedMinor: value.discountFixedMinor ?? 0,
    });
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <ToggleGroup
        type="single"
        value={value.discountType}
        disabled={disabled}
        aria-label="Discount kind"
        onValueChange={(next: string) => {
          if (next) selectType(next as DiscountType);
        }}
      >
        <ToggleGroupItem value="NONE" aria-label="No discount">
          —
        </ToggleGroupItem>
        <ToggleGroupItem value="PERCENT" aria-label="Percent discount">
          %
        </ToggleGroupItem>
        <ToggleGroupItem value="FIXED" aria-label={`Fixed discount in ${currency}`}>
          {symbol.length > 2 ? '$' : symbol}
        </ToggleGroupItem>
      </ToggleGroup>

      {value.discountType === 'PERCENT' && (
        <PercentInput
          valueBp={value.discountPercentBp}
          disabled={disabled}
          invalid={invalid}
          onParseError={onParseError}
          aria-label="Discount percent"
          className="w-20"
          onCommit={(bp) =>
            onChange({ discountType: 'PERCENT', discountPercentBp: bp, discountFixedMinor: null })
          }
        />
      )}

      {value.discountType === 'FIXED' && (
        <MoneyInput
          valueMinor={value.discountFixedMinor ?? 0}
          currency={currency}
          disabled={disabled}
          invalid={invalid}
          onParseError={onParseError}
          aria-label="Discount amount"
          className="w-28"
          onCommit={(minor) =>
            onChange({ discountType: 'FIXED', discountPercentBp: null, discountFixedMinor: minor })
          }
        />
      )}
    </div>
  );
}
