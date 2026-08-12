'use client';

/**
 * The document's currency.
 *
 * Editable while the document has no line items, locked the moment one exists. The reason is
 * concrete: a draft holding 10000 minor units as USD is $100.00, and reading that same integer
 * as JPY makes it ¥10,000 — a hundredfold re-denomination from a single dropdown change, with no
 * visible sign anything happened.
 *
 * The locked state reads as settled rather than broken, and says why. A disabled control with no
 * explanation is the thing users file bugs about.
 */

import { Lock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '@/lib/money';
import { cn } from '@/lib/utils';

interface CurrencySelectProps {
  value: CurrencyCode;
  editable: boolean;
  onChange: (currency: CurrencyCode) => void;
  className?: string;
}

export function CurrencySelect({ value, editable, onChange, className }: CurrencySelectProps) {
  const currency = CURRENCIES[value];

  if (!editable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex h-9 cursor-default items-center gap-1.5 rounded-md border border-transparent bg-muted px-2.5 text-sm text-muted-foreground',
              className,
            )}
          >
            <Lock className="size-3" />
            <span className="tabular">{currency.code}</span>
            <span className="text-muted-foreground">{currency.symbol}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Currency is set once a document has items. Remove all items to change it.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Select value={value} onValueChange={(next) => onChange(next as CurrencyCode)}>
      <SelectTrigger className={cn('w-[11rem]', className)} aria-label="Document currency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            <span className="flex items-baseline gap-2">
              <span className="tabular w-8">{code}</span>
              <span className="text-muted-foreground">{CURRENCIES[code].name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
