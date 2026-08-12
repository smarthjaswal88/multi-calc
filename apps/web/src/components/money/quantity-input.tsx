'use client';

/**
 * A whole-number quantity field.
 *
 * Digits, and nothing else. `type="number"` looks like the control for this job and is not: it
 * accepts `+`, `-`, `e` and `.` into its text buffer, and then reports an *empty* value for text
 * it cannot parse. So "++" and "2.5" both reach a blur handler as "nothing to commit", and the
 * field goes on displaying a quantity the document does not hold — the value on screen stops
 * being the value that was saved, which is the one thing a pricing tool cannot allow.
 *
 * A quantity is a count of units, so there is no decimal form to accept and round away: 2.5
 * widgets is a different line, not a different number. A rejected character is therefore refused
 * outright rather than stripped, because stripping the dot out of "2.5" silently commits 25.
 *
 * Commit-on-blur-or-Enter, Escape to revert, messages from the shared schema: the same contract
 * as the money and percent fields beside it.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MAX_QUANTITY, VALIDATION_MESSAGES } from '@/lib/money';

interface QuantityInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** The committed quantity. Always a positive integer. */
  value: number;
  onCommit: (quantity: number) => void;
  /** Reported when the typed text is not a usable quantity, so the caller can show it inline. */
  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  className?: string;
}

/** Thousands separators and stray spaces are a paste artefact, not input. Everything else stands. */
function withoutSeparators(raw: string): string {
  return raw.replace(/[\s,]/g, '');
}

export const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  ({ value, onCommit, onParseError, invalid, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => String(value));
    const [focused, setFocused] = React.useState(false);

    // Re-sync when the server sends a different quantity — but never mid-edit, which would fight
    // the person typing. On blur this also discards text that failed to commit, so the field
    // always shows what was actually saved while the message explains what was refused.
    React.useEffect(() => {
      if (!focused) setText(String(value));
    }, [value, focused]);

    function commit(raw: string): void {
      const cleaned = withoutSeparators(raw);

      if (cleaned === '') {
        onParseError?.(VALIDATION_MESSAGES.quantityMin);
        return;
      }

      // Only digits can be present by now, so this cannot be NaN or fractional.
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
      setText(String(quantity)); // Normalizes "007" to "7".
      if (quantity !== value) onCommit(quantity);
    }

    return (
      <input
        ref={ref}
        // Not type="number": see the note above. inputMode still asks for the numeric keypad.
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const cleaned = withoutSeparators(event.target.value);

          // Refuse the character instead of dropping it. Dropping the dot from "2.5" would
          // commit 25, and a signed or exponent form has no meaning for a count.
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
          // Right-aligned by nature, as the money and percent fields are; the line items table
          // overrides the alignment for its own columns.
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
