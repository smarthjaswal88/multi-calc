/**
 * The typed API client.
 *
 * Two responsibilities beyond fetching: send credentials so the session cookie travels, and
 * normalise every failure into one shape so a caller can map a field path back to the row that
 * produced it without knowing which endpoint failed.
 */

import type { CurrencyCode, DiscountType } from '@multi-calc/calc';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface FieldError {
  path: string;
  message: string;
  lineId?: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'PRECONDITION_FAILED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: FieldError[];

  constructor(status: number, code: ApiErrorCode, message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /**
   * True only for the lifecycle rule, which the UI answers with a Refresh action.
   *
   * A blocked cross-origin request is FORBIDDEN, not CONFLICT — it used to borrow this code because
   * no forbidden member existed, so a CSRF rejection surfaced as "the document changed, refresh".
   * There is nothing to refresh, and the advice was misleading.
   */
  get isFinalizedConflict(): boolean {
    return this.code === 'CONFLICT';
  }

  /** The message for a given field path, if the server named one. */
  fieldMessage(path: string): string | undefined {
    return this.fields.find((field) => field.path === path)?.message;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Couldn't reach the server. Check your connection.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; fields?: FieldError[] } })
      ?.error;
    throw new ApiError(
      response.status,
      (envelope?.code as ApiErrorCode) ?? 'INTERNAL_ERROR',
      envelope?.message ?? 'Something went wrong.',
      envelope?.fields ?? [],
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------- shapes

export interface LineDto {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: DiscountType;
  discountPercentBp: number | null;
  discountFixedMinor: number | null;
  taxPercentBp: number | null;
  lineSubtotalMinor: number;
  discountAmountMinor: number;
  afterDiscountMinor: number;
  taxAmountMinor: number;
  lineTotalMinor: number;
}

export interface DocumentDto {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'DRAFT' | 'FINALIZED';
  currency: CurrencyCode;
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  grandTotalMinor: number;
  finalizedAt: string | null;
  archivedAt: string | null;
  archived: boolean;
  currencyEditable: boolean;
  lineCount: number;
  lines?: LineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  defaultCurrency: CurrencyCode;
}

export interface DocumentListDto {
  items: DocumentDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReportGroupDto {
  currency: CurrencyCode;
  documentCount: number;
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  grandTotalMinor: number;
}

export interface ReportDto {
  range: { from: string; to: string };
  includeDrafts: boolean;
  /** Always true — archiving removes a document from the report. */
  excludesArchived: boolean;
  documentCount: number;
  currencyCount: number;
  /** True when the breakdown list was capped by the server. The grouped totals stay complete. */
  breakdownTruncated?: boolean;
  groups: ReportGroupDto[];
  documents?: DocumentDto[];
}

export interface LineInputDto {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: DiscountType;
  discountPercentBp?: number | null;
  discountFixedMinor?: number | null;
  taxPercentBp?: number | null;
}

export interface ListParams {
  /** True fetches only archived documents; the default excludes them. */
  archived?: boolean;
  status?: 'draft' | 'finalized' | 'all';
  currency?: CurrencyCode;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

// ---------------------------------------------------------------------------- endpoints

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      request<{ user: UserDto }>('POST', '/api/auth/signup', { email, password }),
    login: (email: string, password: string) =>
      request<{ user: UserDto }>('POST', '/api/auth/login', { email, password }),
    logout: () => request<void>('POST', '/api/auth/logout'),
    me: () => request<{ user: UserDto }>('GET', '/api/auth/me'),
  },

  documents: {
    list: (params: ListParams = {}) =>
      request<DocumentListDto>('GET', `/api/documents${toQuery({ ...params })}`),
    create: (input: { title: string; customer: string; issueDate: string; currency?: CurrencyCode }) =>
      request<{ document: DocumentDto }>('POST', '/api/documents', input),
    get: (id: string) => request<{ document: DocumentDto }>('GET', `/api/documents/${id}`),
    patch: (
      id: string,
      patch: Partial<{ title: string; customer: string; issueDate: string; currency: CurrencyCode }>,
    ) => request<{ document: DocumentDto }>('PATCH', `/api/documents/${id}`, patch),
    remove: (id: string) => request<void>('DELETE', `/api/documents/${id}`),
    finalize: (id: string) =>
      request<{ document: DocumentDto }>('POST', `/api/documents/${id}/finalize`),
    /**
     * The issue date is sent explicitly, in the caller's timezone.
     *
     * The server defaults to the UTC date when no body arrives, which for anyone east of Greenwich
     * names yesterday for part of every day — in IST, any duplicate made before 05:30. The server
     * gained the ability to accept a date; without this argument that fix did nothing.
     */
    duplicate: (id: string, issueDate: string) =>
      request<{ document: DocumentDto }>('POST', `/api/documents/${id}/duplicate`, { issueDate }),
    archive: (id: string) =>
      request<{ document: DocumentDto }>('POST', `/api/documents/${id}/archive`),
    unarchive: (id: string) =>
      request<{ document: DocumentDto }>('POST', `/api/documents/${id}/unarchive`),
  },

  lines: {
    create: (documentId: string, input: LineInputDto) =>
      request<{ document: DocumentDto }>('POST', `/api/documents/${documentId}/lines`, input),
    update: (documentId: string, lineId: string, input: LineInputDto) =>
      request<{ document: DocumentDto }>(
        'PATCH',
        `/api/documents/${documentId}/lines/${lineId}`,
        input,
      ),
    remove: (documentId: string, lineId: string) =>
      request<{ document: DocumentDto }>(
        'DELETE',
        `/api/documents/${documentId}/lines/${lineId}`,
      ),
    reorder: (documentId: string, order: string[]) =>
      request<{ document: DocumentDto }>('PATCH', `/api/documents/${documentId}/lines/reorder`, {
        order,
      }),
  },

  reports: {
    summary: (params: { from: string; to: string; includeDrafts?: boolean; includeDocuments?: boolean }) =>
      request<ReportDto>('GET', `/api/reports/summary${toQuery({ ...params })}`),
  },
};
