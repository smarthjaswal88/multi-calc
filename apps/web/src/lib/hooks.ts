'use client';

/**
 * Server state.
 *
 * The application keeps no parallel copy of a document and derives no totals locally. Every
 * mutation returns the full recomputed document, and the cache is replaced with it — which is
 * how "the client must not be the source of truth" is enforced structurally rather than by
 * discipline.
 *
 * The editing loop:
 *   1. the user edits a field; local input state updates immediately, so typing is never blocked
 *   2. the change is sent on blur or Enter
 *   3. every derived figure enters a pending presentation — muted, gently settling
 *   4. the response carries the whole document; the cache is replaced and the figures settle
 *   5. a rejection maps its field paths back to the originating row
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  api,
  type DocumentDto,
  type LineDto,
  type LineInputDto,
  type ListParams,
  type UserDto,
} from '@/lib/api';
import { todayIso } from '@/lib/money';

export const keys = {
  me: ['me'] as const,
  documents: (params: ListParams) => ['documents', params] as const,
  document: (id: string) => ['document', id] as const,
  report: (from: string, to: string, includeDrafts: boolean) =>
    ['report', from, to, includeDrafts] as const,
};

// ---------------------------------------------------------------------------------- auth

export function useMe(): UseQueryResult<UserDto | null> {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        const { user } = await api.auth.me();
        return user;
      } catch (error) {
        // Not signed in is a legitimate answer, not a failure to report.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

// ----------------------------------------------------------------------------- documents

export function useDocuments(params: ListParams) {
  return useQuery({
    queryKey: keys.documents(params),
    queryFn: () => api.documents.list(params),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: keys.document(id),
    queryFn: async () => (await api.documents.get(id)).document,
  });
}

export function useReport(from: string, to: string, includeDrafts: boolean) {
  return useQuery({
    queryKey: keys.report(from, to, includeDrafts),
    queryFn: () => api.reports.summary({ from, to, includeDrafts, includeDocuments: true }),
    // The range is only valid forward; the screen refuses to fire an inverted one.
    enabled: Boolean(from && to) && to >= from,
  });
}

/**
 * Prefix marking a row that exists only in the local cache, awaiting the server's answer.
 *
 * Such a row has no real id, so editing or deleting it would address a document row that does
 * not exist. The table renders these as read-only until the server replies with the real row.
 */
export const OPTIMISTIC_PREFIX = 'optimistic:';

/**
 * A monotonic counter, not a timestamp.
 *
 * `Math.trunc(performance.now())` can repeat: two adds inside the same millisecond produced the
 * same id, and React would treat two distinct pending rows as one. A counter cannot collide.
 */
let optimisticCounter = 0;
function nextOptimisticId(): string {
  optimisticCounter += 1;
  return String(optimisticCounter);
}

export function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

interface MutationContext {
  previous?: DocumentDto;
}

/**
 * Shared mutation plumbing for anything that returns a document.
 *
 * A conflict is the interesting case: it almost always means this tab is stale because the
 * document was finalized elsewhere. So the message is surfaced and the document refetched,
 * which flips the interface into its read-only presentation without the user having to reload.
 *
 * OPTIMISTIC BOUNDARY
 * -------------------
 * An `optimistic` function may update the cached document before the request completes, and
 * what it is allowed to change is deliberately narrow: **which rows exist and in what order**.
 * It must never touch a computed figure.
 *
 * That line is not fussiness. Predicting the totals locally would mean a second implementation
 * of the discount-and-tax arithmetic in the browser — precisely the duplication the single
 * shared module exists to prevent, and precisely what "the client must not be the source of
 * truth" forbids. So structure appears instantly while the figures visibly dim and wait, which
 * is an honest depiction of what is actually known at that moment.
 */
function useDocumentMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<{ document: DocumentDto }>,
  options: {
    successMessage?: string | ((document: DocumentDto) => string);
    /** Structure-only cache update. Returns the document as it should appear immediately. */
    optimistic?: (document: DocumentDto, args: TArgs) => DocumentDto;
    /**
     * True when the caller renders VALIDATION_ERROR messages itself, against a specific field or
     * row. Only then is the toast suppressed — otherwise the failure would be invisible.
     */
    inlineValidation?: boolean;
    /** Reads the document id out of the mutation arguments. */
    documentIdOf?: (args: TArgs) => string;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation<{ document: DocumentDto }, Error, TArgs, MutationContext>({
    mutationFn,
    onMutate: async (args): Promise<MutationContext> => {
      if (!options.optimistic || !options.documentIdOf) return {};

      const key = keys.document(options.documentIdOf(args));
      // Stop an in-flight refetch from landing after our optimistic write and reverting it.
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<DocumentDto>(key);
      if (previous) {
        queryClient.setQueryData(key, options.optimistic(previous, args));
      }
      return { previous };
    },
    onSuccess: ({ document }) => {
      queryClient.setQueryData(keys.document(document.id), document);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });

      const message =
        typeof options.successMessage === 'function'
          ? options.successMessage(document)
          : options.successMessage;
      if (message) toast.success(message);
    },
    onError: (error, variables, context) => {
      // Roll the optimistic write back before anything else, so the interface never sits
      // showing a row the server refused.
      if (context?.previous && options.documentIdOf) {
        queryClient.setQueryData(
          keys.document(options.documentIdOf(variables)),
          context.previous,
        );
      }

      if (!(error instanceof ApiError)) {
        toast.error('Something went wrong.');
        return;
      }

      // A refused cross-origin request has nothing to refresh, so it must not be handled as a
      // stale document.
      if (error.code === 'FORBIDDEN') {
        toast.error(error.message);
        return;
      }

      if (error.code === 'CONFLICT') {
        const id =
          typeof variables === 'object' && variables && 'documentId' in variables
            ? String((variables as { documentId: string }).documentId)
            : undefined;

        toast.error(error.message, {
          action: id
            ? {
                label: 'Refresh',
                onClick: () => void queryClient.invalidateQueries({ queryKey: keys.document(id) }),
              }
            : undefined,
        });

        if (id) void queryClient.invalidateQueries({ queryKey: keys.document(id) });
        return;
      }

      // A validation error is only suppressed where the caller actually renders it inline.
      //
      // Previously ALL validation errors were suppressed, on the assumption that something
      // downstream displayed them. For line edits that is true — the row shows the message. But
      // for anything with no row to attach to, nothing displayed it at all: hitting the 200-line
      // cap or the document-total ceiling produced no toast, no inline message, and no indication
      // the click had done anything. Silence is the worst possible report.
      if (error.code !== 'VALIDATION_ERROR' || !options.inlineValidation) {
        toast.error(error.message);
      }
    },
  });
}

export function useCreateDocument() {
  return useDocumentMutation(
    (input: { title: string; customer: string; issueDate: string; currency?: UserDto['defaultCurrency'] }) =>
      api.documents.create(input),
  );
}

export function usePatchDocument() {
  return useDocumentMutation(
    ({ documentId, patch }: { documentId: string; patch: Parameters<typeof api.documents.patch>[1] }) =>
      api.documents.patch(documentId, patch),
    // The editor renders field-level messages beside title, customer and issue date. A failure the
    // server does not attribute to a field still toasts, via the fallback in useDocumentMutation.
    { documentIdOf: (args) => args.documentId, inlineValidation: true },
  );
}

export function useFinalizeDocument() {
  return useDocumentMutation(({ documentId }: { documentId: string }) => api.documents.finalize(documentId), {
    successMessage: 'Document finalized.',
  });
}

export function useDuplicateDocument() {
  return useDocumentMutation(
    // todayIso() is the caller's local date, not UTC — see api.documents.duplicate.
    ({ documentId }: { documentId: string }) => api.documents.duplicate(documentId, todayIso()),
    { successMessage: 'Draft created.' },
  );
}

/**
 * Archive a finalized document.
 *
 * The toast carries an Undo action, so archiving is reversible at the point of action rather than
 * only via a trip to the Archive screen. Both the archived list and the report are invalidated,
 * because the document leaves one and joins the other.
 */
export function useArchiveDocument() {
  const queryClient = useQueryClient();
  const unarchive = useUnarchiveDocument();

  return useMutation({
    mutationFn: ({ documentId }: { documentId: string }) => api.documents.archive(documentId),
    onSuccess: ({ document }) => {
      queryClient.setQueryData(keys.document(document.id), document);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });

      toast.success('Document archived.', {
        action: {
          label: 'Undo',
          onClick: () => unarchive.mutate({ documentId: document.id }),
        },
      });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
    },
  });
}

/**
 * Restore an archived document.
 *
 * The server keeps the status untouched — an archived finalized document comes back finalized —
 * so there is nothing for the client to decide here.
 */
export function useUnarchiveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId }: { documentId: string }) => api.documents.unarchive(documentId),
    onSuccess: ({ document }) => {
      queryClient.setQueryData(keys.document(document.id), document);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });
      toast.success('Document restored.');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId }: { documentId: string }) => api.documents.remove(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });
      toast.success('Document deleted.');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
    },
  });
}

// --------------------------------------------------------------------------------- lines

/** A placeholder row. Computed figures are left at zero and shown as pending, never guessed. */
function placeholderLine(input: LineInputDto, position: number): LineDto {
  return {
    id: `${OPTIMISTIC_PREFIX}${position}-${nextOptimisticId()}`,
    position,
    description: input.description,
    quantity: input.quantity,
    unitPriceMinor: input.unitPriceMinor,
    discountType: input.discountType,
    discountPercentBp: input.discountPercentBp ?? null,
    discountFixedMinor: input.discountFixedMinor ?? null,
    taxPercentBp: input.taxPercentBp ?? null,
    lineSubtotalMinor: 0,
    discountAmountMinor: 0,
    afterDiscountMinor: 0,
    taxAmountMinor: 0,
    lineTotalMinor: 0,
  };
}

export function useCreateLine() {
  return useDocumentMutation(
    ({ documentId, input }: { documentId: string; input: LineInputDto }) =>
      api.lines.create(documentId, input),
    {
      documentIdOf: (args) => args.documentId,
      // The row appears at once. Its amounts, and the document totals, stay as they were and
      // render dimmed until the server sends the computed figures.
      optimistic: (document, { input }) => {
        const lines = document.lines ?? [];
        return {
          ...document,
          lines: [...lines, placeholderLine(input, lines.length + 1)],
          lineCount: document.lineCount + 1,
          currencyEditable: false,
        };
      },
    },
  );
}

export function useUpdateLine() {
  return useDocumentMutation(
    ({
      documentId,
      lineId,
      input,
    }: {
      documentId: string;
      lineId: string;
      input: LineInputDto;
    }) => api.lines.update(documentId, lineId, input),
    {
      documentIdOf: (args) => args.documentId,
      // The editor renders this against the row being edited.
      inlineValidation: true,
      // Only the inputs the user just typed are echoed back. Every derived figure on the row is
      // left untouched and dims, because the new ones are not knowable here.
      optimistic: (document, { lineId, input }) => ({
        ...document,
        lines: (document.lines ?? []).map((line) =>
          line.id === lineId
            ? {
                ...line,
                description: input.description,
                quantity: input.quantity,
                unitPriceMinor: input.unitPriceMinor,
                discountType: input.discountType,
                discountPercentBp: input.discountPercentBp ?? null,
                discountFixedMinor: input.discountFixedMinor ?? null,
                taxPercentBp: input.taxPercentBp ?? null,
              }
            : line,
        ),
      }),
    },
  );
}

export function useDeleteLine() {
  return useDocumentMutation(
    ({ documentId, lineId }: { documentId: string; lineId: string }) =>
      api.lines.remove(documentId, lineId),
    {
      documentIdOf: (args) => args.documentId,
      inlineValidation: true,
      optimistic: (document, { lineId }) => {
        const remaining = (document.lines ?? [])
          .filter((line) => line.id !== lineId)
          .map((line, index) => ({ ...line, position: index + 1 }));
        return {
          ...document,
          lines: remaining,
          lineCount: remaining.length,
          currencyEditable: document.status === 'DRAFT' && remaining.length === 0,
        };
      },
    },
  );
}

export function useReorderLines() {
  return useDocumentMutation(
    ({ documentId, order }: { documentId: string; order: string[] }) =>
      api.lines.reorder(documentId, order),
    {
      documentIdOf: (args) => args.documentId,
      // The only fully honest optimistic update in the app: reordering cannot change any
      // amount, so the reordered rows are exactly what the server will return. No figure is
      // predicted, so nothing needs to dim.
      optimistic: (document, { order }) => {
        const byId = new Map((document.lines ?? []).map((line) => [line.id, line]));
        return {
          ...document,
          lines: order.flatMap((id, index) => {
            const line = byId.get(id);
            return line ? [{ ...line, position: index + 1 }] : [];
          }),
        };
      },
    },
  );
}
