'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface PercentInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  valueBp: number | null;
  onCommit: (basisPoints: number | null) => void;
  onParseError?: (message: string | null) => void;
  invalid?: boolean;
  className?: string;
}

function bpToText(bp: number | null): string {
  if (bp === null) return '';
  const percent = bp / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '');
}

export const PercentInput = React.forwardRef<HTMLInputElement, PercentInputProps>(
  ({ valueBp, onCommit, onParseError, invalid, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => bpToText(valueBp));
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) setText(bpToText(valueBp));
    }, [valueBp, focused]);

    function commit(raw: string): void {
      const trimmed = raw.trim();

      if (trimmed === '') {
        onParseError?.(null);
        if (valueBp !== null) onCommit(null);
        return;
      }

      const numeric = Number(trimmed.replace('%', '').trim());

      if (!Number.isFinite(numeric)) {
        onParseError?.('Enter a percentage.');
        return;
      }
      if (numeric < 0 || numeric > 100) {
        onParseError?.('Enter a percentage between 0 and 100.');
        return;
      }

      const bp = Math.round(numeric * 100);
      onParseError?.(null);
      setText(bpToText(bp));
      if (bp !== valueBp) onCommit(bp);
    }

    return (
      <div className="relative">
        <input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={text}
          aria-invalid={invalid || undefined}
          onFocus={() => setFocused(true)}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            setFocused(false);
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(event.currentTarget.value);
            if (event.key === 'Escape') {
              setText(bpToText(valueBp));
              onParseError?.(null);
              event.currentTarget.blur();
            }
          }}
          className={cn(
            'h-9 w-full rounded-md border border-input bg-card py-1 pl-2 pr-6 text-right text-sm tabular transition-colors',
            'placeholder:text-muted-foreground placeholder:tabular disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-destructive',
            className,
          )}
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none text-[0.75rem] text-muted-foreground"
        >
          %
        </span>
      </div>
    );
  },
);
PercentInput.displayName = 'PercentInput';
