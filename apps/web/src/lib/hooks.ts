'use client';

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

export function useMe(): UseQueryResult<UserDto | null> {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        const { user } = await api.auth.me();
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

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

    enabled: Boolean(from && to) && to >= from,
  });
}

export const OPTIMISTIC_PREFIX = 'optimistic:';

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

function useDocumentMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<{ document: DocumentDto }>,
  options: {
    successMessage?: string | ((document: DocumentDto) => string);

    optimistic?: (document: DocumentDto, args: TArgs) => DocumentDto;

    inlineValidation?: boolean;

    documentIdOf?: (args: TArgs) => string;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation<{ document: DocumentDto }, Error, TArgs, MutationContext>({
    mutationFn,
    onMutate: async (args): Promise<MutationContext> => {
      if (!options.optimistic || !options.documentIdOf) return {};

      const key = keys.document(options.documentIdOf(args));

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
    ({ documentId }: { documentId: string }) => api.documents.duplicate(documentId, todayIso()),
    { successMessage: 'Draft created.' },
  );
}

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

      inlineValidation: true,

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
