'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MAX_QUANTITY, VALIDATION_MESSAGES } from '@/lib/money';

interface QuantityInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onCommit: (quantity: number) => void;

  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  className?: string;
}

function withoutSeparators(raw: string): string {
  return raw.replace(/[\s,]/g, '');
}

export const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  ({ value, onCommit, onParseError, invalid, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => String(value));
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) setText(String(value));
    }, [value, focused]);

    function commit(raw: string): void {
      const cleaned = withoutSeparators(raw);

      if (cleaned === '') {
        onParseError?.(VALIDATION_MESSAGES.quantityMin);
        return;
      }

      const quantity = Number(cleaned);

      if (quantity < 1) {
        onParseError?.(VALIDATION_MESSAGES.quantityMin);
        return;
      }
      if (quantity > MAX_QUANTITY) {
        onParseError?.(VALIDATION_MESSAGES.quantityMax);
        return;
      }

      onParseError?.(null);
      setText(String(quantity));
      if (quantity !== value) onCommit(quantity);
    }

    return (
      <input
        ref={ref}

        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const cleaned = withoutSeparators(event.target.value);

          if (cleaned !== '' && !/^\d+$/.test(cleaned)) {
            onParseError?.(VALIDATION_MESSAGES.quantityInteger);
            return;
          }

          onParseError?.(null);
          setText(cleaned);
        }}
        onBlur={(event) => {
          setFocused(false);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
          if (event.key === 'Escape') {
            setText(String(value));
            onParseError?.(null);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-right text-sm tabular transition-colors',
          'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive',
          className,
        )}
        {...props}
      />
    );
  },
);
QuantityInput.displayName = 'QuantityInput';
