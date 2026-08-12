'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MoneyParseError, getCurrency, parseMoney, toInputString, type CurrencyCode } from '@/lib/money';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  valueMinor: number;
  currency: CurrencyCode;
  onCommit: (minor: number) => void;

  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  className?: string;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ valueMinor, currency, onCommit, onParseError, invalid, className, ...props }, ref) => {
    const { symbol } = getCurrency(currency);
    const [text, setText] = React.useState(() => toInputString(valueMinor, currency));
    const [focused, setFocused] = React.useState(false);

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
