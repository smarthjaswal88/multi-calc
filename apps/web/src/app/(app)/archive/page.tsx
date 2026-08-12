'use client';

import * as React from 'react';
import Link from 'next/link';
import { Archive as ArchiveIcon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useDocuments, useUnarchiveDocument } from '@/lib/hooks';
import { formatDateLong, type CurrencyCode } from '@/lib/money';

const PAGE_SIZE = 25;

export default function ArchivePage() {
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useDocuments({ archived: true, page, pageSize: PAGE_SIZE });
  const unarchive = useUnarchiveDocument();

  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Archive"
        description="Finalized documents you've filed away. They stay here until you restore them."
      />

      {isLoading ? (
        <div className="space-y-2 border border-border p-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          Icon={ArchiveIcon}
          title="Nothing archived"
          description="Archiving a finalized document moves it here and takes it out of the report. Nothing is ever deleted."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/documents">Back to documents</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-[0.8125rem] text-muted-foreground">
            {data?.total ?? 0} archived {(data?.total ?? 0) === 1 ? 'document' : 'documents'}. These
            are excluded from the summary report.
          </p>

          <div className="overflow-x-auto border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-32">Issue date</TableHead>
                  <TableHead className="w-32">Archived</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead numeric className="w-36">
                    Grand total
                  </TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">
                      <Link href={`/documents/${document.id}`} className="hover:underline">
                        {document.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{document.customer}</TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {formatDateLong(document.issueDate)}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {document.archivedAt ? formatDateLong(document.archivedAt.slice(0, 10)) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={document.status} />
                    </TableCell>
                    <TableCell numeric>
                      <NumericCell
                        amountMinor={document.grandTotalMinor}
                        currency={document.currency as CurrencyCode}
                        withSymbol
                        emphasis
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={unarchive.isPending}
                        onClick={() => unarchive.mutate({ documentId: document.id })}
                      >
                        <RotateCcw />
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data && (
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
