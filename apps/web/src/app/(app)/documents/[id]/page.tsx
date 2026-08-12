'use client';

/**
 * The document screen.
 *
 * One route, two presentations. A draft is fully editable; a finalized document is a read-only
 * record — not the editor with everything disabled, which reads as broken, but a genuinely
 * different treatment where inputs resolve into static typeset values.
 */

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ArrowLeft, Copy, Lock, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CurrencySelect } from '@/components/document/currency-select';
import { LineItemsTable } from '@/components/document/line-items-table';
import { TotalsRail } from '@/components/document/totals-rail';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ApiError, type LineInputDto } from '@/lib/api';
import {
  useCreateLine,
  useDeleteDocument,
  useDeleteLine,
  useDocument,
  useArchiveDocument,
  useDuplicateDocument,
  useUnarchiveDocument,
  useFinalizeDocument,
  usePatchDocument,
  useReorderLines,
  useUpdateLine,
} from '@/lib/hooks';
import { formatDateLong, formatMoney, type CurrencyCode } from '@/lib/money';

export default function DocumentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: document, isLoading, error } = useDocument(id);

  const patchDocument = usePatchDocument();
  const createLine = useCreateLine();
  const updateLine = useUpdateLine();
  const deleteLine = useDeleteLine();
  const reorderLines = useReorderLines();
  const finalize = useFinalizeDocument();
  const duplicate = useDuplicateDocument();
  const archive = useArchiveDocument();
  const unarchive = useUnarchiveDocument();
  const removeDocument = useDeleteDocument();

  const pending =
    patchDocument.isPending ||
    createLine.isPending ||
    updateLine.isPending ||
    deleteLine.isPending ||
    reorderLines.isPending ||
    finalize.isPending;

  /**
   * Attribute each rejection to the row that actually caused it.
   *
   * Taken from the mutation's own `variables` rather than a separate piece of sticky state. The
   * previous version kept one `editingLineId` and read whichever of three mutations happened to
   * hold an error, so a stale failed edit would surface under whichever row you touched next — the
   * message pointed at an innocent line.
   *
   * `createLine` is deliberately absent: a rejected add has no row to attach to, so its message
   * toasts instead (see `inlineValidation` in lib/hooks.ts). That is the gap which previously made
   * the 200-line cap and the document-total ceiling fail in total silence.
   */
  const lineErrors: Record<string, string> = {};
  for (const mutation of [updateLine, deleteLine]) {
    const { error, variables } = mutation;
    if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') continue;
    const lineId = variables?.lineId;
    if (lineId) lineErrors[lineId] = error.fields[0]?.message ?? error.message;
  }

  /**
   * Metadata rejections, keyed by field.
   *
   * `patchDocument.error` was never read at all, so a title over 200 characters failed silently.
   * A message the server does not attribute to a field is toasted by the mutation instead.
   */
  const metaErrors: Record<string, string> =
    patchDocument.error instanceof ApiError && patchDocument.error.code === 'VALIDATION_ERROR'
      ? Object.fromEntries(patchDocument.error.fields.map((f) => [f.path, f.message]))
      : {};

  const finalizeIssues =
    finalize.error instanceof ApiError && finalize.error.code === 'PRECONDITION_FAILED'
      ? finalize.error.fields
      : [];

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <EmptyState
        title="That document does not exist"
        description="It may have been deleted, or the link may be wrong."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/documents">Back to documents</Link>
          </Button>
        }
      />
    );
  }

  const editable = document.status === 'DRAFT';
  const archived = document.archived;
  const currency = document.currency as CurrencyCode;


  /**
   * Commit a metadata field on blur.
   *
   * An emptied required field visibly RESTORES the saved value rather than silently doing nothing.
   * Previously the guard was `if (value && value !== current)`, so clearing a title sent no request
   * and left the input showing empty — the screen disagreed with what was saved, which is exactly
   * the failure the QuantityInput docstring says a pricing tool cannot allow.
   *
   * Restoring is chosen over submitting-and-showing-an-error because the empty state is not a
   * change the user can meaningfully save: the field is required, so the only valid outcomes are
   * the old value or a new non-empty one.
   */
  function commitMeta(
    field: 'title' | 'customer' | 'issueDate',
    raw: string,
    input: HTMLInputElement,
  ): void {
    const next = field === 'issueDate' ? raw : raw.trim();
    const current = document![field];

    if (!next) {
      input.value = current;
      return;
    }
    if (next === current) return;

    patchDocument.mutate({ documentId: id, patch: { [field]: next } });
  }

  function updateLineAndTrack(lineId: string, input: LineInputDto): void {
    updateLine.mutate({ documentId: id, lineId, input });
  }

  function addLine(): void {
    createLine.mutate({
      documentId: id,
      input: {
        description: 'New item',
        quantity: 1,
        unitPriceMinor: 0,
        discountType: 'NONE',
        taxPercentBp: null,
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Back to the list is a real destination, so it gets a real button rather than a line of
          quiet grey text. The secondary variant carries the border and card fill. */}
      <div className="no-print flex items-center gap-2">
        <Button
          asChild
          variant="secondary"
          size="sm"
          // Ledger green on hover — the same --primary the default Button variant fills with,
          // rather than the secondary variant's neutral grey wash.
          className="hover:border-primary hover:bg-primary hover:text-primary-foreground"
        >
          <Link href="/documents">
            <ArrowLeft />
            Documents
          </Link>
        </Button>
      </div>

      {/* ---- header ---- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={document.status} withIcon />
            {document.finalizedAt && (
              <span className="text-[0.75rem] text-muted-foreground">
                Finalized {formatDateLong(document.finalizedAt.slice(0, 10))}
              </span>
            )}
          </div>

          {editable ? (
            <Input
              defaultValue={document.title}
              aria-label="Document title"
              className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight focus-visible:bg-muted/50"
              aria-invalid={Boolean(metaErrors.title) || undefined}
              onBlur={(event) => commitMeta('title', event.target.value, event.target)}
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <>
                <Input
                  defaultValue={document.customer}
                  aria-label="Customer"
                  className="w-56"
                  aria-invalid={Boolean(metaErrors.customer) || undefined}
                  onBlur={(event) => commitMeta('customer', event.target.value, event.target)}
                />
                <Input
                  type="date"
                  defaultValue={document.issueDate}
                  aria-label="Issue date"
                  className="w-40 tabular"
                  aria-invalid={Boolean(metaErrors.issueDate) || undefined}
                  onBlur={(event) => commitMeta('issueDate', event.target.value, event.target)}
                />
                <CurrencySelect
                  value={currency}
                  editable={document.currencyEditable}
                  onChange={(next: CurrencyCode) =>
                    patchDocument.mutate({ documentId: id, patch: { currency: next } })
                  }
                />
              </>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                {document.customer} · issued {formatDateLong(document.issueDate)} · {currency}
              </p>
            )}
          </div>

          {/* Field-level metadata messages. patchDocument.error used to go unread entirely, so a
              title over 200 characters failed with no visible result at all. */}
          {Object.entries(metaErrors).length > 0 && (
            <ul className="space-y-0.5">
              {Object.entries(metaErrors).map(([field, message]) => (
                <li key={field} className="text-[0.8125rem] text-destructive">
                  {message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="no-print flex shrink-0 items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/documents/${id}/print`} target="_blank">
              <Printer />
              Print
            </Link>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(
                { documentId: id },
                { onSuccess: ({ document: copy }) => router.push(`/documents/${copy.id}`) },
              )
            }
          >
            <Copy />
            Duplicate
          </Button>

          {!editable && !archived && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Archive />
                  Archive
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this document?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It moves to the Archive and stops counting in the summary report. Nothing is
                    deleted — you can restore it at any time, and it will come back finalized.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      archive.mutate(
                        { documentId: id },
                        // Archiving is how you get a finished document out of the way, so leaving
                        // the user staring at it would undo the point of the action.
                        { onSuccess: () => router.push('/documents') },
                      )
                    }
                  >
                    Archive document
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {archived && (
            <Button
              variant="secondary"
              size="sm"
              disabled={unarchive.isPending}
              onClick={() => unarchive.mutate({ documentId: id })}
            >
              <RotateCcw />
              Restore
            </Button>
          )}

          {editable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                {/* Quiet until hovered, then unmistakably destructive — the ghost variant's
                    neutral hover said nothing about what this button does. */}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete this document"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{document.title}” and its {document.lineCount}{' '}
                    {document.lineCount === 1 ? 'item' : 'items'} will be removed. This can&apos;t be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      removeDocument.mutate(
                        { documentId: id },
                        { onSuccess: () => router.push('/documents') },
                      )
                    }
                  >
                    Delete document
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* ---- the locked banner: what is fixed, and what is still possible ---- */}
      {archived && (
        <Alert>
          <Archive />
          <AlertTitle>This document is archived</AlertTitle>
          <AlertDescription>
            It is excluded from the document list and the summary report. Restore it to bring it
            back — it will return finalized, exactly as it is now.
          </AlertDescription>
        </Alert>
      )}

      {!editable && !archived && (
        <Alert>
          <Lock />
          <AlertTitle>This document is finalized</AlertTitle>
          <AlertDescription>
            Its lines, amounts, and details are fixed, and it can never be deleted. You can print
            it, duplicate it into a new draft to make changes, or archive it to take it out of the
            document list and the summary report.
          </AlertDescription>
        </Alert>
      )}

      {finalizeIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {finalizeIssues.length === 1
              ? 'One item needs attention'
              : `${finalizeIssues.length} items need attention`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5">
              {finalizeIssues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ---- table + rail ---- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <LineItemsTable
          document={document}
          editable={editable}
          pending={pending}
          errors={lineErrors}
          onUpdate={updateLineAndTrack}
          onDelete={(lineId) => deleteLine.mutate({ documentId: id, lineId })}
          onAdd={addLine}
          onReorder={(order) => reorderLines.mutate({ documentId: id, order })}
        />

        <TotalsRail
          document={document}
          pending={pending}
          footer={
            editable ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full" disabled={finalize.isPending}>
                    <Lock />
                    Finalize document
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Finalize this document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Once finalized, this document can&apos;t be edited. You can duplicate it into
                      a new draft at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="my-1 border border-border bg-muted/40 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="eyebrow">Grand total</span>
                      <span className="tabular text-lg font-semibold text-[color:var(--amount-total)]">
                        {formatMoney(document.grandTotalMinor, currency)}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.75rem] text-muted-foreground">
                      {document.lineCount} {document.lineCount === 1 ? 'Item' : 'Items'} ·{' '}
                      {currency}
                    </p>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => finalize.mutate({ documentId: id })}>
                      Finalize document
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
