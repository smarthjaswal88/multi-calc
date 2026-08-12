'use client';

/**
 * A currency-aware money field.
 *
 * Holds text while focused and integer minor units when committed, so a user can type freely
 * without the value being reformatted under the cursor. On blur the text is parsed and the
 * canonical form is written back.
 *
 * The value renders through `toInputString`, never `formatMoney`. That distinction is load
 * bearing: `formatMoney` is locale-aware, so a euro amount displays as "3200,00" — and feeding
 * that back to the parser is how a value ends up a hundred times too large. `toInputString` is
 * the locale-free canonical form the parser inverts exactly.
 *
 * The symbol sits in a leading affix slot rather than being typed. Symbols vary in width ($ vs
 * ₹ vs KWD), so the slot is measured and the input padded to match — otherwise the decimal
 * alignment of a column of figures shifts with the currency.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MoneyParseError, getCurrency, parseMoney, toInputString, type CurrencyCode } from '@/lib/money';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** The committed value, in minor units. */
  valueMinor: number;
  currency: CurrencyCode;
  onCommit: (minor: number) => void;
  /** Reported when the typed text cannot be parsed, so the caller can show it inline. */
  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  className?: string;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ valueMinor, currency, onCommit, onParseError, invalid, className, ...props }, ref) => {
    const { symbol } = getCurrency(currency);
    const [text, setText] = React.useState(() => toInputString(valueMinor, currency));
    const [focused, setFocused] = React.useState(false);

    // Re-sync when the server sends a different value, or the currency changes the precision —
    // but never while the field is focused, which would fight the person typing.
    React.useEffect(() => {
      if (!focused) setText(toInputString(valueMinor, currency));
    }, [valueMinor, currency, focused]);

    function commit(raw: string): void {
      try {
        const minor = parseMoney(raw, currency);
        onParseError?.(null);
        setText(toInputString(minor, currency));
        if (minor !== valueMinor) onCommit(minor);
      } catch (error) {
        const message =
          error instanceof MoneyParseError ? error.message : 'Enter a valid amount.';
        onParseError?.(message);
      }
    }

    // Leading affix width scales with the symbol so the decimal column stays put.
    const affixWidth = symbol.length <= 1 ? 'pl-6' : symbol.length === 2 ? 'pl-8' : 'pl-11';

    return (
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none text-[0.75rem] text-muted-foreground tabular"
        >
          {symbol}
        </span>
        <input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={invalid || undefined}
          onFocus={() => setFocused(true)}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            setFocused(false);
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit(event.currentTarget.value);
            }
            if (event.key === 'Escape') {
              setText(toInputString(valueMinor, currency));
              onParseError?.(null);
              event.currentTarget.blur();
            }
          }}
          className={cn(
            'h-9 w-full rounded-md border border-input bg-card py-1 pr-2 text-right text-sm tabular transition-colors',
            'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-destructive',
            affixWidth,
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
