'use client';

/**
 * The printable view.
 *
 * No application chrome, and legible in monochrome — so the amber/indigo semantics fall back to
 * explicit signs and column labels rather than relying on hue, which a black-and-white printer
 * discards. All four intermediate columns are visible here: on paper there is no hover to reveal
 * a derivation, so the arithmetic has to be on the page.
 */

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocument } from '@/lib/hooks';
import {
  formatDateLong,
  formatDiscountInput,
  formatMoney,
  formatTaxInput,
  getCurrency,
  type CurrencyCode,
} from '@/lib/money';

export default function PrintPage() {
  const params = useParams<{ id: string }>();
  const { data: document, isLoading } = useDocument(params.id);

  if (isLoading || !document) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }

  const currency = document.currency as CurrencyCode;
  const { name: currencyName } = getCurrency(currency);
  const money = (minor: number) => formatMoney(minor, currency, { withSymbol: false });
  const lines = document.lines ?? [];

  return (
    <div className="mx-auto max-w-4xl bg-background p-8 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between border-b border-border pb-4">
        <p className="text-[0.8125rem] text-muted-foreground">
          Print preview. Amounts are shown in {currencyName}.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>

      <header className="mb-8 flex items-start justify-between gap-8 border-b-2 border-foreground pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          <p className="mt-1 text-sm">{document.customer}</p>
        </div>
        <dl className="shrink-0 space-y-0.5 text-right text-[0.8125rem]">
          <div>
            <dt className="inline text-muted-foreground">Issued </dt>
            <dd className="inline tabular">{formatDateLong(document.issueDate)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Currency </dt>
            <dd className="inline tabular">{currency}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Status </dt>
            <dd className="inline uppercase tracking-wide">
              {document.status === 'FINALIZED' ? 'Finalized' : 'Draft'}
            </dd>
          </div>
        </dl>
      </header>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-foreground">
            <th className="py-1.5 pr-2 text-left font-medium">#</th>
            <th className="py-1.5 pr-2 text-left font-medium">Description</th>
            <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
            <th className="py-1.5 pr-2 text-right font-medium">Unit price</th>
            <th className="py-1.5 pr-2 text-right font-medium">Subtotal</th>
            <th className="py-1.5 pr-2 text-right font-medium">Discount</th>
            <th className="py-1.5 pr-2 text-right font-medium">Less discount</th>
            <th className="py-1.5 pr-2 text-right font-medium">Tax rate</th>
            <th className="py-1.5 pr-2 text-right font-medium">Plus tax</th>
            <th className="py-1.5 text-right font-medium">Item total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="print-break-avoid border-b border-border">
              <td className="py-1.5 pr-2 tabular text-muted-foreground">{line.position}</td>
              <td className="py-1.5 pr-2">{line.description}</td>
              <td className="py-1.5 pr-2 text-right tabular">{line.quantity}</td>
              <td className="py-1.5 pr-2 text-right tabular">{money(line.unitPriceMinor)}</td>
              <td className="py-1.5 pr-2 text-right tabular">{money(line.lineSubtotalMinor)}</td>
              <td className="py-1.5 pr-2 text-right tabular">
                {formatDiscountInput(
                  line.discountType,
                  line.discountPercentBp,
                  line.discountFixedMinor,
                  currency,
                )}
              </td>
              <td className="py-1.5 pr-2 text-right tabular">
                {line.discountAmountMinor === 0 ? money(0) : `− ${money(line.discountAmountMinor)}`}
              </td>
              <td className="py-1.5 pr-2 text-right tabular">{formatTaxInput(line.taxPercentBp)}</td>
              <td className="py-1.5 pr-2 text-right tabular">
                {line.taxAmountMinor === 0 ? money(0) : `+ ${money(line.taxAmountMinor)}`}
              </td>
              <td className="py-1.5 text-right tabular font-medium">{money(line.lineTotalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-break-avoid mt-6 flex justify-end">
        <dl className="w-64 space-y-1 text-[0.8125rem]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{money(document.subtotalMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total discount</dt>
            <dd className="tabular">
              {document.totalDiscountMinor === 0
                ? money(0)
                : `− ${money(document.totalDiscountMinor)}`}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border pb-1">
            <dt className="text-muted-foreground">Total tax</dt>
            <dd className="tabular">
              {document.totalTaxMinor === 0 ? money(0) : `+ ${money(document.totalTaxMinor)}`}
            </dd>
          </div>
          <div className="flex justify-between border-t-[3px] border-double border-foreground pt-1.5">
            <dt className="font-semibold">Grand total</dt>
            <dd className="tabular text-base font-semibold">
              {formatMoney(document.grandTotalMinor, currency)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-8 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
        Each item is rounded to the {currencyName} minor unit after the discount and again after
        tax. Document totals are the sum of those rounded item amounts.
      </p>
    </div>
  );
}
