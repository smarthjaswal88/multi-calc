import 'dotenv/config';
import { guardDestructive } from '../src/config/guardDestructive.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

guardDestructive('scripts/verify-constraints.ts');

const prisma = new PrismaClient();

interface Case {
  name: string;
  constraint: string;
  sql: (documentId: string) => string;

  expectRejected?: boolean;
}

const LINE_COLUMNS = `
  "id", "documentId", "position", "description", "quantity", "unitPriceMinor",
  "discountType", "discountPercentBp", "discountFixedMinor", "taxPercentBp",
  "lineSubtotalMinor", "discountAmountMinor", "afterDiscountMinor",
  "taxAmountMinor", "lineTotalMinor", "updatedAt"
`;

function insertLine(documentId: string, overrides: Record<string, string>): string {
  const base: Record<string, string> = {
    id: `'probe_${Math.abs(Date.now() % 1_000_000)}_${Math.abs((Date.now() * 7) % 9973)}'`,
    documentId: `'${documentId}'`,
    position: '999',
    description: `'constraint probe'`,
    quantity: '1',
    unitPriceMinor: '10000',
    discountType: `'NONE'`,
    discountPercentBp: 'NULL',
    discountFixedMinor: 'NULL',
    taxPercentBp: 'NULL',
    lineSubtotalMinor: '10000',
    discountAmountMinor: '0',
    afterDiscountMinor: '10000',
    taxAmountMinor: '0',
    lineTotalMinor: '10000',
    updatedAt: 'NOW()',
  };
  const merged = { ...base, ...overrides };
  const order = [
    'id',
    'documentId',
    'position',
    'description',
    'quantity',
    'unitPriceMinor',
    'discountType',
    'discountPercentBp',
    'discountFixedMinor',
    'taxPercentBp',
    'lineSubtotalMinor',
    'discountAmountMinor',
    'afterDiscountMinor',
    'taxAmountMinor',
    'lineTotalMinor',
    'updatedAt',
  ];
  return `INSERT INTO "line_items" (${LINE_COLUMNS}) VALUES (${order.map((k) => merged[k]).join(', ')})`;
}

const CASES: Case[] = [
  {
    name: 'a line carrying both a percent and a fixed discount',
    constraint: 'line_items_discount_shape',
    sql: (id) =>
      insertLine(id, {
        discountType: `'PERCENT'`,
        discountPercentBp: '1000',
        discountFixedMinor: '500',
      }),
  },
  {
    name: 'a PERCENT line with no percentage stored',
    constraint: 'line_items_discount_shape',
    sql: (id) => insertLine(id, { discountType: `'PERCENT'`, discountPercentBp: 'NULL' }),
  },
  {
    name: 'a NONE line that still carries a discount value',
    constraint: 'line_items_discount_shape',
    sql: (id) => insertLine(id, { discountType: `'NONE'`, discountPercentBp: '1000' }),
  },
  {
    name: 'a fixed discount larger than the line subtotal',
    constraint: 'line_items_fixed_discount_within_subtotal',
    sql: (id) =>
      insertLine(id, {
        quantity: '1',
        unitPriceMinor: '5000',
        discountType: `'FIXED'`,
        discountFixedMinor: '9999',
      }),
  },
  {
    name: 'a discount percent above 100%',
    constraint: 'line_items_discount_percent_range',
    sql: (id) => insertLine(id, { discountType: `'PERCENT'`, discountPercentBp: '10001' }),
  },
  {
    name: 'a tax percent above 100%',
    constraint: 'line_items_tax_percent_range',
    sql: (id) => insertLine(id, { taxPercentBp: '10001' }),
  },
  {
    name: 'a negative tax percent',
    constraint: 'line_items_tax_percent_range',
    sql: (id) => insertLine(id, { taxPercentBp: '-1' }),
  },
  {
    name: 'a quantity of zero',
    constraint: 'line_items_quantity_positive',
    sql: (id) => insertLine(id, { quantity: '0', lineSubtotalMinor: '0', afterDiscountMinor: '0', lineTotalMinor: '0' }),
  },
  {
    name: 'a negative unit price',
    constraint: 'line_items_unit_price_non_negative',
    sql: (id) => insertLine(id, { unitPriceMinor: '-100' }),
  },
  {
    name: 'a position of zero',
    constraint: 'line_items_position_positive',
    sql: (id) => insertLine(id, { position: '0' }),
  },
  {
    name: 'a negative computed line total',
    constraint: 'line_items_computed_non_negative',
    sql: (id) => insertLine(id, { lineTotalMinor: '-1' }),
  },
  {
    name: 'a duplicate position within the same document',
    constraint: 'line_items_documentId_position_key',
    sql: (id) => insertLine(id, { position: '1' }),
  },
  {
    name: 'document totals that do not reconcile',
    constraint: 'documents_totals_reconcile',
    sql: () =>
      `INSERT INTO "documents" ("id","userId","title","customer","issueDate","status","currency",
        "subtotalMinor","totalDiscountMinor","totalTaxMinor","grandTotalMinor","updatedAt")
       SELECT 'probe_doc_reconcile', "id", 'probe', 'probe', DATE '2026-08-01', 'DRAFT', 'USD',
              45000, 4000, 1150, 42151, NOW()
       FROM "users" LIMIT 1`,
  },
  {
    name: 'a FINALIZED document with no finalizedAt timestamp',
    constraint: 'documents_finalized_at_matches_status',
    sql: () =>
      `INSERT INTO "documents" ("id","userId","title","customer","issueDate","status","currency",
        "subtotalMinor","totalDiscountMinor","totalTaxMinor","grandTotalMinor","finalizedAt","updatedAt")
       SELECT 'probe_doc_finalized', "id", 'probe', 'probe', DATE '2026-08-01', 'FINALIZED', 'USD',
              0, 0, 0, 0, NULL, NOW()
       FROM "users" LIMIT 1`,
  },
  {
    name: 'a DRAFT document carrying a finalizedAt timestamp',
    constraint: 'documents_finalized_at_matches_status',
    sql: () =>
      `INSERT INTO "documents" ("id","userId","title","customer","issueDate","status","currency",
        "subtotalMinor","totalDiscountMinor","totalTaxMinor","grandTotalMinor","finalizedAt","updatedAt")
       SELECT 'probe_doc_draft', "id", 'probe', 'probe', DATE '2026-08-01', 'DRAFT', 'USD',
              0, 0, 0, 0, NOW(), NOW()
       FROM "users" LIMIT 1`,
  },

  {
    name: 'a quantity x unit price product that overflows int4 (was a driver range error)',
    constraint: 'line_items_subtotal_within_ceiling',
    sql: (id) =>
      insertLine(id, {
        quantity: '2',
        unitPriceMinor: '2000000000',
        discountType: `'FIXED'`,
        discountFixedMinor: '100',
      }),
  },
  {
    name: 'a large quantity with a small price, overflowing on multiplication',
    constraint: 'line_items_subtotal_within_ceiling',
    sql: (id) =>
      insertLine(id, { quantity: '1000000', unitPriceMinor: '3000' }),
  },
  {
    name: 'a genuine fixed-discount violation at overflow magnitudes',
    constraint: 'line_items_quantity_max',
    sql: (id) =>
      insertLine(id, {
        quantity: '1000000000',
        unitPriceMinor: '100',
        discountType: `'FIXED'`,
        discountFixedMinor: '2000000000',
      }),
  },
  {
    name: 'a quantity above MAX_QUANTITY',
    constraint: 'line_items_quantity_max',
    sql: (id) => insertLine(id, { quantity: '1000001', unitPriceMinor: '1' }),
  },
  {
    name: 'a unit price above MAX_AMOUNT_MINOR',
    constraint: 'line_items_unit_price_max',
    sql: (id) => insertLine(id, { unitPriceMinor: '2000000001' }),
  },

  {
    name: 'archiving a DRAFT document',
    constraint: 'documents_archived_only_when_finalized',
    sql: (id) =>
      `UPDATE "documents" SET "archivedAt" = NOW() WHERE "id" = (
         SELECT "id" FROM "documents" WHERE "status" = 'DRAFT' AND "id" = (
           SELECT "documentId" FROM "line_items" WHERE "documentId" = '${id}' LIMIT 1
         ) LIMIT 1
       )`,
  },
  {
    name: 'an archivedAt earlier than finalizedAt',
    constraint: 'documents_archived_after_finalized',
    sql: () =>
      `INSERT INTO "documents" ("id","userId","title","customer","issueDate","status","currency",
        "subtotalMinor","totalDiscountMinor","totalTaxMinor","grandTotalMinor","finalizedAt","archivedAt","updatedAt")
       SELECT 'probe_doc_archive_order', "id", 'probe', 'probe', DATE '2026-08-01', 'FINALIZED', 'USD',
              0, 0, 0, 0, TIMESTAMP '2026-08-10 12:00:00', TIMESTAMP '2026-08-01 12:00:00', NOW()
       FROM "users" LIMIT 1`,
  },
  {
    name: 'negative document totals',
    constraint: 'documents_totals_non_negative',
    sql: () =>
      `INSERT INTO "documents" ("id","userId","title","customer","issueDate","status","currency",
        "subtotalMinor","totalDiscountMinor","totalTaxMinor","grandTotalMinor","updatedAt")
       SELECT 'probe_doc_negative', "id", 'probe', 'probe', DATE '2026-08-01', 'DRAFT', 'USD',
              -100, 0, 0, -100, NOW()
       FROM "users" LIMIT 1`,
  },
];

const CONTROL: Case = {
  name: 'CONTROL — a valid line is accepted',
  constraint: '(none)',
  sql: (id) => insertLine(id, { position: '998' }),
  expectRejected: false,
};

async function main() {
  const document = await prisma.document.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'asc' },
  });

  if (!document) {
    throw new Error('No draft document found. Run the seed first: npx prisma db seed');
  }

  console.log(`Probing constraints against document ${document.id}\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of [CONTROL, ...CASES]) {
    const shouldReject = testCase.expectRejected !== false;
    let rejected = false;
    let detail = '';

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(testCase.sql(document.id));
        throw new Error('__ROLLBACK__');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('__ROLLBACK__')) {
        rejected = false;
      } else {
        rejected = true;
        detail =
          message.match(/violates check constraint "([^"]+)"/)?.[1] ??
          message.match(/Unique constraint failed on the fields: \(([^)]+)\)/)?.[0] ??
          message.split('\n').find((l) => l.includes('constraint'))?.trim() ??
          'rejected';
      }
    }

    const ok = rejected === shouldReject;
    if (ok) passed += 1;
    else failed += 1;

    const mark = ok ? '✓' : '✗';
    const verdict = shouldReject
      ? rejected
        ? `rejected by ${detail}`
        : 'ACCEPTED — constraint missing!'
      : rejected
        ? `REJECTED unexpectedly — ${detail}`
        : 'accepted';

    console.log(`${mark} ${testCase.name}\n    ${verdict}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('\nProbe run failed:\n', error);
    await prisma.$disconnect();
    process.exit(1);
  });
