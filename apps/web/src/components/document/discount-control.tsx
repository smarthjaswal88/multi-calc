'use client';

/**
 * The discount control — the most delicate part of the editor.
 *
 * A line may carry a percent discount OR a fixed amount, never both. The specification lists
 * that as a rule to confirm, the Zod schema rejects the illegal combination, and the database
 * refuses to store it — but the interface's job is to make the state *unreachable* rather than
 * merely rejected.
 *
 * So the control is a segmented three-way choice — none / % / amount — and selecting one clears
 * the other's value. There is no arrangement of clicks that produces a line with both.
 *
 * The input's affix changes with the selection: a percent sign trailing, or the document's
 * currency symbol leading.
 */

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
    // Switching clears the other representation. Carrying a stale value forward is exactly the
    // shape the database constraint rejects.
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
        onValueChange={(next) => {
          // Radix emits '' when the active item is clicked again; keep the current selection
          // rather than dropping to an unset state the model has no representation for.
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
