/**
 * Seed script.
 *
 * Creates a demo account holding the specification's reference document plus a spread of
 * sibling documents across currencies, statuses, and three months of issue dates — enough for
 * the document list, the summary report's per-currency grouping, and the print view to be
 * exercised with realistic data.
 *
 * Every total here is computed by @multi-calc/calc rather than written by hand. A seed with
 * hardcoded totals would happily contradict the engine; this one cannot.
 *
 * Idempotent: re-running replaces the demo user's documents.
 */

import 'dotenv/config';
import { guardDestructive } from '../src/config/guardDestructive.js';
import bcrypt from 'bcryptjs';
import {
  computeDocument,
  formatMoney,
  toMinor,
  type CurrencyCode,
  type DiscountType,
} from '@multi-calc/calc';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Writes to the database — refuse to touch production. See src/config/guardDestructive.ts.
guardDestructive('prisma/seed.ts');

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@multicalc.app';
const DEMO_PASSWORD = 'demo1234';

/** A line as authored in this file: amounts in major units, percentages as human percents. */
interface SeedLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountFixed?: number;
  taxPercent?: number;
}

interface SeedDocument {
  title: string;
  customer: string;
  issueDate: string;
  currency: CurrencyCode;
  finalized: boolean;
  lines: SeedLine[];
}

/**
 * The specification's reference document, left as a draft so a reviewer can edit it and watch
 * the totals recompute. Expected grand total: $421.50.
 */
const REFERENCE_DOCUMENT: SeedDocument = {
  title: 'Q3 Platform Retainer',
  customer: 'Northwind Trading Co.',
  issueDate: '2026-08-08',
  currency: 'USD',
  finalized: false,
  lines: [
    { description: 'Widget A', quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 5 },
    { description: 'Widget B', quantity: 1, unitPrice: 50, taxPercent: 5 },
    { description: 'Service fee', quantity: 1, unitPrice: 200, discountFixed: 20 },
  ],
};

const DOCUMENTS: SeedDocument[] = [
  REFERENCE_DOCUMENT,

  // A finalized twin of the reference, so the read-only record state is visible immediately.
  {
    title: 'Q2 Platform Retainer',
    customer: 'Northwind Trading Co.',
    issueDate: '2026-05-08',
    currency: 'USD',
    finalized: true,
    lines: [
      { description: 'Widget A', quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 5 },
      { description: 'Widget B', quantity: 1, unitPrice: 50, taxPercent: 5 },
      { description: 'Service fee', quantity: 1, unitPrice: 200, discountFixed: 20 },
    ],
  },

  {
    title: 'Brand refresh — phase 2',
    customer: 'Helios Design Studio',
    issueDate: '2026-08-05',
    currency: 'USD',
    finalized: true,
    lines: [
      { description: 'Discovery workshop', quantity: 2, unitPrice: 1200, taxPercent: 8.25 },
      { description: 'Identity system', quantity: 1, unitPrice: 6500, discountPercent: 12.5, taxPercent: 8.25 },
      { description: 'Brand guidelines document', quantity: 1, unitPrice: 1800, taxPercent: 8.25 },
      { description: 'Asset handover', quantity: 1, unitPrice: 0 },
    ],
  },

  {
    title: 'Annual support retainer',
    customer: 'Cedar & Pine LLP',
    issueDate: '2026-07-28',
    currency: 'USD',
    finalized: true,
    lines: [
      { description: 'Support hours (monthly block)', quantity: 12, unitPrice: 850, discountPercent: 7.5, taxPercent: 6 },
      { description: 'Onboarding and handover', quantity: 1, unitPrice: 1500, discountFixed: 250, taxPercent: 6 },
    ],
  },

  {
    title: 'Data migration engagement',
    customer: 'Kestrel Analytics',
    issueDate: '2026-07-15',
    currency: 'USD',
    finalized: false,
    lines: [
      { description: 'Schema mapping', quantity: 3, unitPrice: 9.99, discountPercent: 7.5, taxPercent: 8.25 },
      { description: 'ETL pipeline build', quantity: 1, unitPrice: 4750, taxPercent: 8.25 },
      { description: 'Validation and reconciliation', quantity: 2, unitPrice: 640, discountFixed: 80, taxPercent: 8.25 },
    ],
  },

  {
    title: 'Website rebuild — milestone 1',
    customer: 'Aarav Textiles Pvt Ltd',
    issueDate: '2026-08-01',
    currency: 'INR',
    finalized: true,
    lines: [
      { description: 'Design system', quantity: 1, unitPrice: 185000, discountPercent: 10, taxPercent: 18 },
      { description: 'Frontend implementation', quantity: 1, unitPrice: 240000, taxPercent: 18 },
      { description: 'CMS integration', quantity: 1, unitPrice: 95000, discountFixed: 15000, taxPercent: 18 },
    ],
  },

  {
    title: 'Mobile app QA sprint',
    customer: 'Sundar Logistics',
    issueDate: '2026-07-20',
    currency: 'INR',
    finalized: false,
    lines: [
      { description: 'Test plan authoring', quantity: 1, unitPrice: 45000, taxPercent: 18 },
      { description: 'Manual regression pass', quantity: 4, unitPrice: 18500, discountPercent: 5, taxPercent: 18 },
    ],
  },

  // The zero-decimal currency. Any layout or formatter that assumes two decimal places will
  // show its seam on this document.
  {
    title: 'Localization package — JA',
    customer: 'Sakura Robotics KK',
    issueDate: '2026-08-03',
    currency: 'JPY',
    finalized: true,
    lines: [
      { description: 'String extraction', quantity: 1, unitPrice: 180000, taxPercent: 10 },
      { description: 'Translation (per 1,000 words)', quantity: 24, unitPrice: 12000, discountPercent: 8, taxPercent: 10 },
      { description: 'In-context review', quantity: 3, unitPrice: 45000, discountFixed: 20000, taxPercent: 10 },
    ],
  },

  {
    title: 'Security audit — external perimeter',
    customer: 'Meridian Bank',
    issueDate: '2026-06-22',
    currency: 'GBP',
    finalized: true,
    lines: [
      { description: 'Automated scanning', quantity: 1, unitPrice: 2400, taxPercent: 20 },
      { description: 'Manual penetration testing', quantity: 5, unitPrice: 1150, discountPercent: 10, taxPercent: 20 },
      { description: 'Findings report and debrief', quantity: 1, unitPrice: 1600, taxPercent: 20 },
    ],
  },

  {
    title: 'Cloud cost review',
    customer: 'Vector Freight',
    issueDate: '2026-06-30',
    currency: 'EUR',
    finalized: false,
    lines: [
      { description: 'Usage analysis', quantity: 1, unitPrice: 3200, discountPercent: 15, taxPercent: 19 },
      { description: 'Rightsizing recommendations', quantity: 1, unitPrice: 1850, taxPercent: 19 },
    ],
  },

  {
    title: 'Training workshop — two days',
    customer: 'Orchid Hospitality Group',
    issueDate: '2026-07-05',
    currency: 'AED',
    finalized: true,
    lines: [
      { description: 'Facilitation (per day)', quantity: 2, unitPrice: 4400, taxPercent: 5 },
      { description: 'Course materials (per attendee)', quantity: 18, unitPrice: 145, discountPercent: 10, taxPercent: 5 },
    ],
  },

  // The three-decimal currency, exercising the other end of the exponent range.
  {
    title: 'Infrastructure retainer — Q3',
    customer: 'Gulf Petroleum Services',
    issueDate: '2026-08-06',
    currency: 'KWD',
    finalized: false,
    lines: [
      { description: 'Managed hosting (monthly)', quantity: 3, unitPrice: 1.875, taxPercent: 5 },
      { description: 'On-call engineering', quantity: 12, unitPrice: 42.5, discountPercent: 7.5, taxPercent: 5 },
      { description: 'Incident credit', quantity: 1, unitPrice: 250, discountFixed: 62.5 },
    ],
  },
];

/** Translate an authored line into the storage shape, in minor units and basis points. */
function toStorage(line: SeedLine, currency: CurrencyCode) {
  const hasPercent = line.discountPercent !== undefined;
  const hasFixed = line.discountFixed !== undefined;

  if (hasPercent && hasFixed) {
    throw new Error(`Seed line "${line.description}" sets both discount kinds.`);
  }

  const discountType: DiscountType = hasPercent ? 'PERCENT' : hasFixed ? 'FIXED' : 'NONE';

  return {
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: toMinor(line.unitPrice, currency),
    discountType,
    discountPercentBp: hasPercent ? Math.round(line.discountPercent! * 100) : null,
    discountFixedMinor: hasFixed ? toMinor(line.discountFixed!, currency) : null,
    taxPercentBp: line.taxPercent !== undefined ? Math.round(line.taxPercent * 100) : null,
  };
}

async function createDocument(userId: string, seed: SeedDocument) {
  const stored = seed.lines.map((line) => toStorage(line, seed.currency));

  // The engine is the only source of every figure below.
  const { lines: computed, totals } = computeDocument(stored);

  const document = await prisma.document.create({
    data: {
      userId,
      title: seed.title,
      customer: seed.customer,
      issueDate: new Date(`${seed.issueDate}T00:00:00Z`),
      currency: seed.currency,
      status: seed.finalized ? 'FINALIZED' : 'DRAFT',
      finalizedAt: seed.finalized ? new Date(`${seed.issueDate}T12:00:00Z`) : null,
      subtotalMinor: totals.subtotalMinor,
      totalDiscountMinor: totals.totalDiscountMinor,
      totalTaxMinor: totals.totalTaxMinor,
      grandTotalMinor: totals.grandTotalMinor,
      lines: {
        create: stored.map((line, index) => ({
          position: index + 1,
          ...line,
          lineSubtotalMinor: computed[index]!.lineSubtotalMinor,
          discountAmountMinor: computed[index]!.discountAmountMinor,
          afterDiscountMinor: computed[index]!.afterDiscountMinor,
          taxAmountMinor: computed[index]!.taxAmountMinor,
          lineTotalMinor: computed[index]!.lineTotalMinor,
        })),
      },
    },
  });

  return { document, totals };
}

async function main() {
  console.log('Seeding…\n');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, defaultCurrency: 'USD' },
    create: { email: DEMO_EMAIL, passwordHash, defaultCurrency: 'USD' },
  });

  // Cascades to line items.
  const removed = await prisma.document.deleteMany({ where: { userId: user.id } });
  if (removed.count > 0) {
    console.log(`Cleared ${removed.count} existing document(s) for ${DEMO_EMAIL}\n`);
  }

  const rows: string[] = [];
  for (const seed of DOCUMENTS) {
    const { totals } = await createDocument(user.id, seed);
    rows.push(
      [
        seed.issueDate,
        seed.currency.padEnd(3),
        (seed.finalized ? 'finalized' : 'draft').padEnd(9),
        formatMoney(totals.grandTotalMinor, seed.currency).padStart(16),
        seed.title,
      ].join('  '),
    );
  }

  console.log(rows.join('\n'));

  // The one figure that must be exactly right.
  const reference = await prisma.document.findFirst({
    where: { userId: user.id, title: REFERENCE_DOCUMENT.title },
  });

  console.log('\n--- reference document check ---');
  console.log(`subtotal        ${formatMoney(reference!.subtotalMinor, 'USD')}`);
  console.log(`total discount  ${formatMoney(reference!.totalDiscountMinor, 'USD')}`);
  console.log(`total tax       ${formatMoney(reference!.totalTaxMinor, 'USD')}`);
  console.log(`grand total     ${formatMoney(reference!.grandTotalMinor, 'USD')}`);

  if (reference!.grandTotalMinor !== 42150) {
    throw new Error(
      `Reference document grand total is ${reference!.grandTotalMinor}, expected 42150 ($421.50).`,
    );
  }
  console.log('\n✓ reference document matches the specification ($421.50)');
  console.log(`✓ ${DOCUMENTS.length} documents seeded for ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('\nSeed failed:\n', error);
    await prisma.$disconnect();
    process.exit(1);
  });
