'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/common/page-header';
import { Pager } from '@/components/common/pager';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
import { NumericCell } from '@/components/money/numeric-cell';
import { CurrencySelect } from '@/components/document/currency-select';
import { useCreateDocument, useDocuments, useMe } from '@/lib/hooks';
import { DEFAULT_CURRENCY, formatDateLong, todayIso, type CurrencyCode } from '@/lib/money';

type StatusFilter = 'all' | 'draft' | 'finalized';

const PAGE_SIZE = 25;

export default function DocumentsPage() {
  const router = useRouter();
  const { data: user } = useMe();
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());

      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useDocuments({
    status,
    q: query || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: '-issueDate',
  });

  const create = useCreateDocument();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [customer, setCustomer] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(todayIso());

  const [pickedCurrency, setPickedCurrency] = React.useState<CurrencyCode | null>(null);
  const currency = pickedCurrency ?? user?.defaultCurrency ?? DEFAULT_CURRENCY;

  const items = data?.items ?? [];
  const filtering = status !== 'all' || query !== '';

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    create.mutate(
      { title: title.trim(), customer: customer.trim(), issueDate, currency },
      {
        onSuccess: ({ document }) => {
          setOpen(false);
          setTitle('');
          setCustomer('');
          router.push(`/documents/${document.id}`);
        },
      },
    );
  }

  const newDocumentDialog = (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);

        if (!next) setPickedCurrency(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          New document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>
              You can change any of this later, and add items once it exists.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                required
                autoFocus
                placeholder="Q3 platform retainer"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="customer">Customer</FieldLabel>
              <Input
                id="customer"
                required
                placeholder="Northwind Trading Co."
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
              />
            </Field>

            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="issueDate">Issue date</FieldLabel>
                <Input
                  id="issueDate"
                  type="date"
                  required
                  className="tabular"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>Currency</FieldLabel>
                <CurrencySelect value={currency} editable onChange={setPickedCurrency} />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Quotes and proposals, with per-item discounts and tax."
        actions={newDocumentDialog}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(next: string) => {
            if (!next) return;
            setStatus(next as StatusFilter);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <ToggleGroupItem value="all" className="px-3">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="draft" className="px-3">
            Draft
          </ToggleGroupItem>
          <ToggleGroupItem value="finalized" className="px-3">
            Finalized
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="relative min-w-56 flex-1 sm:max-w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title or customer"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {data && (
          <span className="text-[0.75rem] text-muted-foreground tabular">
            {data.total} {data.total === 1 ? 'document' : 'documents'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 border border-border p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState
            Icon={Search}
            title="No documents match"
            description="Try a different search, or clear the filters."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStatus('all');
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            Icon={FileText}
            title="No documents yet"
            description="Create your first quote to start pricing work."
            action={newDocumentDialog}
          />
        )
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="w-32">Issue date</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead numeric className="w-16">
                  Items
                </TableHead>
                <TableHead numeric className="w-40">
                  Grand total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((document) => (
                <TableRow key={document.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/documents/${document.id}`} className="block hover:underline">
                      {document.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link href={`/documents/${document.id}`} className="block">
                      {document.customer}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {formatDateLong(document.issueDate)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={document.status} />
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {document.lineCount}
                  </TableCell>
                  <TableCell numeric>
                    <NumericCell
                      amountMinor={document.grandTotalMinor}
                      currency={document.currency as CurrencyCode}
                      withSymbol
                      emphasis
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && items.length > 0 && (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          onPage={setPage}
        />
      )}
    </div>
  );
}
