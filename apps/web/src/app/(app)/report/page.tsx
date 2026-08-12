'use client';

/**
 * The summary report.
 *
 * Grouped by currency, never summed across them — adding an INR grand total to a USD one gives a
 * meaningless figure, and there is no FX conversion anywhere in this product. A single-currency
 * range must not look like "a group of one", so the grouping chrome only appears when there is
 * more than one currency to separate.
 *
 * The breakdown table exists so the KPI figures are checkable: its footer row must equal the
 * cards above it, and a reader can add the column up by hand if they want to.
 */

import * as React from 'react';
import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
import { NumericCell } from '@/components/money/numeric-cell';
import { useReport } from '@/lib/hooks';
import {
  CURRENCIES,
  formatDateLong,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/money';
import type { ReportGroupDto } from '@/lib/api';

/** Presets do most of the work; the custom inputs stay visible rather than hiding behind a mode. */
function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  return [
    {
      label: 'This month',
      from: iso(new Date(Date.UTC(year, month, 1))),
      to: iso(new Date(Date.UTC(year, month + 1, 0))),
    },
    {
      label: 'Last month',
      from: iso(new Date(Date.UTC(year, month - 1, 1))),
      to: iso(new Date(Date.UTC(year, month, 0))),
    },
    {
      label: 'Last 90 days',
      from: iso(new Date(Date.UTC(year, month, now.getUTCDate() - 90))),
      to: iso(now),
    },
    { label: 'Year to date', from: `${year}-01-01`, to: iso(now) },
  ];
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'total' | 'tax' | 'discount';
}) {
  const toneClass =
    tone === 'total'
      ? 'text-[color:var(--amount-total)]'
      : tone === 'tax'
        ? 'text-[color:var(--amount-tax)]'
        : tone === 'discount'
          ? 'text-[color:var(--amount-discount)]'
          : 'text-foreground';

  return (
    <div className="border border-border bg-card p-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 tabular text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function CurrencySection({
  group,
  documents,
  multiCurrency,
}: {
  group: ReportGroupDto;
  documents: NonNullable<ReturnType<typeof useReport>['data']>['documents'];
  multiCurrency: boolean;
}) {
  const currency = group.currency as CurrencyCode;
  const rows = (documents ?? []).filter((document) => document.currency === currency);

  // A code the engine does not know would throw on CURRENCIES[currency].name and take the whole
  // page down. The server is the source here, so fall back to showing the raw code.
  const currencyName = isCurrencyCode(currency)
    ? CURRENCIES[currency].name
    : String(group.currency);

  return (
    <section className="space-y-3">
      {multiCurrency && (
        <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
          <h2 className="text-base font-semibold">{currencyName}</h2>
          <span className="tabular text-[0.75rem] text-muted-foreground">{currency}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Documents" value={String(group.documentCount)} />
        <KpiCard
          label="Sum of grand totals"
          value={formatMoney(group.grandTotalMinor, currency)}
          tone="total"
        />
        <KpiCard
          label="Sum of total tax"
          value={formatMoney(group.totalTaxMinor, currency)}
          tone="tax"
        />
        <KpiCard
          label="Sum of total discount"
          value={formatMoney(group.totalDiscountMinor, currency)}
          tone="discount"
        />
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="w-32">Issue date</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead numeric className="w-28">
                Subtotal
              </TableHead>
              <TableHead numeric className="w-28">
                Discount
              </TableHead>
              <TableHead numeric className="w-28">
                Tax
              </TableHead>
              <TableHead numeric className="w-32">
                Grand total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((document) => (
              <TableRow key={document.id}>
                <TableCell>
                  <Link href={`/documents/${document.id}`} className="hover:underline">
                    {document.title}
                  </Link>
                  <span className="block text-[0.75rem] text-muted-foreground">
                    {document.customer}
                  </span>
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {formatDateLong(document.issueDate)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={document.status} />
                </TableCell>
                <TableCell numeric>
                  <NumericCell amountMinor={document.subtotalMinor} currency={currency} />
                </TableCell>
                <TableCell numeric>
                  <NumericCell
                    amountMinor={document.totalDiscountMinor}
                    currency={currency}
                    tone={document.totalDiscountMinor === 0 ? 'muted' : 'discount'}
                    sign="minus"
                  />
                </TableCell>
                <TableCell numeric>
                  <NumericCell
                    amountMinor={document.totalTaxMinor}
                    currency={currency}
                    tone={document.totalTaxMinor === 0 ? 'muted' : 'tax'}
                    sign="plus"
                  />
                </TableCell>
                <TableCell numeric>
                  <NumericCell
                    amountMinor={document.grandTotalMinor}
                    currency={currency}
                    emphasis
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          {/* This row must equal the cards above. It is the reconciliation, made visible. */}
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="eyebrow">
                {group.documentCount} {group.documentCount === 1 ? 'document' : 'documents'}
              </TableCell>
              <TableCell numeric>
                <NumericCell amountMinor={group.subtotalMinor} currency={currency} emphasis />
              </TableCell>
              <TableCell numeric>
                <NumericCell
                  amountMinor={group.totalDiscountMinor}
                  currency={currency}
                  tone="discount"
                  sign="minus"
                  emphasis
                />
              </TableCell>
              <TableCell numeric>
                <NumericCell
                  amountMinor={group.totalTaxMinor}
                  currency={currency}
                  tone="tax"
                  sign="plus"
                  emphasis
                />
              </TableCell>
              <TableCell numeric>
                <NumericCell
                  amountMinor={group.grandTotalMinor}
                  currency={currency}
                  tone="total"
                  emphasis
                />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}

export default function ReportPage() {
  // Computed every render rather than memoised. Four Date objects cost nothing, and a memo with
  // an empty dependency list meant a tab left open overnight kept offering yesterday's ranges —
  // "This month" would still point at the previous month after midnight on the 1st.
  const options = presets();
  const [from, setFrom] = React.useState(() => presets()[0]!.from);
  const [to, setTo] = React.useState(() => presets()[0]!.to);
  const [includeDrafts, setIncludeDrafts] = React.useState(true);

  const inverted = Boolean(from && to) && to < from;
  const { data, isLoading } = useReport(from, to, includeDrafts);

  const multiCurrency = (data?.groups.length ?? 0) > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Summary report"
        description="Totals across documents issued in a date range."
      />

      <div className="space-y-3 border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from" className="eyebrow">
              From
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              className="w-40 tabular"
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="eyebrow">
              To
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              aria-invalid={inverted || undefined}
              className="w-40 tabular"
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <Button
                key={option.label}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFrom(option.from);
                  setTo(option.to);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {inverted && (
          <p className="text-[0.8125rem] text-destructive">
            The end date must fall on or after the start date.
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Switch id="drafts" checked={includeDrafts} onCheckedChange={setIncludeDrafts} />
          <Label htmlFor="drafts" className="text-[0.8125rem] font-normal text-muted-foreground">
            {/* The active mode stated in words, so a reader never has to infer it. */}
            {includeDrafts
              ? 'Counting drafts and finalized documents'
              : 'Counting finalized documents only'}
          </Label>
        </div>

        {data?.excludesArchived && (
          <p className="text-[0.75rem] text-muted-foreground">
            Archived documents are always excluded. Restore one from the Archive to bring it back
            into these totals.
          </p>
        )}
      </div>

      {inverted ? null : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : !data || data.groups.length === 0 ? (
        <EmptyState
          Icon={CalendarRange}
          title="No documents in this range"
          description={`Nothing was issued between ${formatDateLong(from)} and ${formatDateLong(to)}.`}
        />
      ) : (
        <div className="space-y-8">
          {multiCurrency && (
            <p className="text-[0.8125rem] text-muted-foreground">
              {data.documentCount} documents across {data.currencyCount} currencies. Amounts in
              different currencies are never added together — there is no conversion.
            </p>
          )}

          {data.breakdownTruncated && (
            <p className="border border-border bg-muted/40 p-3 text-[0.8125rem] text-muted-foreground">
              The breakdown lists the first 500 documents in this range. The totals above cover
              every document — they are computed by the database, not by summing these rows.
            </p>
          )}

          {data.groups.map((group) => (
            <CurrencySection
              key={group.currency}
              group={group}
              documents={data.documents}
              multiCurrency={multiCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
