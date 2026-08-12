/**
 * Response shapes.
 *
 * Monetary values cross the wire as integers in minor units, and percentages as basis points —
 * the same representation used in the database and the engine. No decimal strings, no floats.
 * The client formats for display using the same @multi-calc/calc functions the server uses, so
 * a figure cannot be rendered under different rules at each end.
 *
 * `currency` travels with every document because a minor-unit integer is meaningless without
 * it: 12400 is ¥12,400 or $124.00 depending entirely on this field.
 */

import type { Document, LineItem } from '../generated/prisma/client.js';

export interface LineResponse {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: 'NONE' | 'PERCENT' | 'FIXED';
  discountPercentBp: number | null;
  discountFixedMinor: number | null;
  taxPercentBp: number | null;
  lineSubtotalMinor: number;
  discountAmountMinor: number;
  afterDiscountMinor: number;
  taxAmountMinor: number;
  lineTotalMinor: number;
}

export interface DocumentResponse {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'DRAFT' | 'FINALIZED';
  currency: string;
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  grandTotalMinor: number;
  finalizedAt: string | null;
  /** Non-null when the document is archived. Present so a client fetching by id can tell. */
  archivedAt: string | null;
  archived: boolean;
  /** False once a line exists: reinterpreting stored minor units would re-denominate them. */
  currencyEditable: boolean;
  lineCount: number;
  lines?: LineResponse[];
  createdAt: string;
  updatedAt: string;
}

/** A date column stored as DATE, rendered as YYYY-MM-DD with no time component. */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function serializeLine(line: LineItem): LineResponse {
  return {
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountType: line.discountType,
    discountPercentBp: line.discountPercentBp,
    discountFixedMinor: line.discountFixedMinor,
    taxPercentBp: line.taxPercentBp,
    lineSubtotalMinor: line.lineSubtotalMinor,
    discountAmountMinor: line.discountAmountMinor,
    afterDiscountMinor: line.afterDiscountMinor,
    taxAmountMinor: line.taxAmountMinor,
    lineTotalMinor: line.lineTotalMinor,
  };
}

export function serializeDocument(
  document: Document & { lines?: LineItem[]; _count?: { lines: number } },
  options: { includeLines?: boolean } = {},
): DocumentResponse {
  const { includeLines = true } = options;
  const lines = document.lines ?? [];
  const lineCount = document._count?.lines ?? lines.length;

  return {
    id: document.id,
    title: document.title,
    customer: document.customer,
    issueDate: toDateString(document.issueDate),
    status: document.status,
    currency: document.currency,
    subtotalMinor: document.subtotalMinor,
    totalDiscountMinor: document.totalDiscountMinor,
    totalTaxMinor: document.totalTaxMinor,
    grandTotalMinor: document.grandTotalMinor,
    finalizedAt: document.finalizedAt ? document.finalizedAt.toISOString() : null,
    archivedAt: document.archivedAt ? document.archivedAt.toISOString() : null,
    archived: document.archivedAt !== null,
    currencyEditable: document.status === 'DRAFT' && lineCount === 0,
    lineCount,
    ...(includeLines
      ? { lines: [...lines].sort((a, b) => a.position - b.position).map(serializeLine) }
      : {}),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
