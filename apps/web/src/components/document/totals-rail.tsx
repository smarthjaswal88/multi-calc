"use client";

import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { DocumentDerivationTape } from "@/components/tape/derivation-tape";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CURRENCY,
  getCurrency,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/money";
import type { DocumentDto } from "@/lib/api";

interface TotalsRailProps {
  document: DocumentDto;

  pending?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

export function TotalsRail({
  document,
  pending = false,
  footer,
  className,
}: TotalsRailProps) {
  const currency = isCurrencyCode(document.currency) ? document.currency : DEFAULT_CURRENCY;
  const { exponent } = getCurrency(currency);

  const MINOR_UNIT_NOUN: Partial<Record<CurrencyCode, string>> = {
    JPY: 'yen',
    KRW: 'won',
  };

  const roundingCopy =
    exponent === 0
      ? `Each item is rounded to the nearest whole ${MINOR_UNIT_NOUN[currency] ?? 'unit'} after the discount and again after tax.`
      : `Each item is rounded to ${exponent} decimal places after the discount and again after tax.`;

  return (
    <aside
      className={cn("lg:sticky lg:top-6", className)}
      aria-label="Document totals"
    >
      <div className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="eyebrow">Totals</span>
          <Popover>
            <PopoverTrigger
              aria-label="How these totals are rounded"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <HelpCircle className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="mb-2 eyebrow">Rounding policy</p>
              <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                {roundingCopy} Document totals are the sum of those rounded item
                amounts, so they always match what you see per item.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        <div className="px-4 py-3">
          <DocumentDerivationTape
            subtotalMinor={document.subtotalMinor}
            totalDiscountMinor={document.totalDiscountMinor}
            totalTaxMinor={document.totalTaxMinor}
            grandTotalMinor={document.grandTotalMinor}
            currency={currency}
            pending={pending}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between px-4 py-2 text-[0.75rem] text-muted-foreground">
          <span>
            {document.lineCount} {document.lineCount === 1 ? "Item" : "Items"}
          </span>
          <span className="tabular">{currency}</span>
        </div>

        {footer && (
          <>
            <Separator />
            <div className="p-3">{footer}</div>
          </>
        )}
      </div>

      <p className="mt-2 px-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
        Totals are calculated on the server. Figures dim briefly while they are
        recalculated.
      </p>
    </aside>
  );
}
