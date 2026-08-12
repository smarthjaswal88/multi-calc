'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Page controls for a server-paginated list.
 *
 * Both list screens previously requested a single large page and rendered no controls at all,
 * while displaying the server's total — so 60 documents showed "60 documents" above 50 rows with
 * no way to reach the other 10. The API paginated correctly the whole time; the interface simply
 * never used it.
 */
export function Pager({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <p className="text-[0.75rem] text-muted-foreground">
        Showing <span className="tabular">{first}</span>&ndash;<span className="tabular">{last}</span>{' '}
        of <span className="tabular">{total}</span>
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft />
            Previous
          </Button>
          <span className="tabular text-[0.75rem] text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
