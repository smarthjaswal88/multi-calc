import 'dotenv/config';
import { guardDestructive } from '../src/config/guardDestructive.js';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

guardDestructive('scripts/verify-api.ts');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

interface Client {
  cookie: string;
  request: (
    method: string,
    path: string,
    body?: unknown,
  ) => Promise<{ status: number; body: any }>;
}

function makeClient(baseUrl: string): Client {
  const client: Client = {
    cookie: '',
    async request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(client.cookie ? { cookie: client.cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        client.cookie = setCookie.split(';')[0] ?? client.cookie;
      }

      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    },
  };
  return client;
}

const REFERENCE_LINES = [
  {
    description: 'Widget A',
    quantity: 2,
    unitPriceMinor: 10000,
    discountType: 'PERCENT' as const,
    discountPercentBp: 1000,
    taxPercentBp: 500,
  },
  {
    description: 'Widget B',
    quantity: 1,
    unitPriceMinor: 5000,
    discountType: 'NONE' as const,
    taxPercentBp: 500,
  },
  {
    description: 'Service fee',
    quantity: 1,
    unitPriceMinor: 20000,
    discountType: 'FIXED' as const,
    discountFixedMinor: 2000,
  },
];

async function main(): Promise<void> {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const stamp = Date.now().toString(36);
  const emailA = `verify-a-${stamp}@example.test`;
  const emailB = `verify-b-${stamp}@example.test`;
  const password = 'verify-password';

  const a = makeClient(baseUrl);
  const b = makeClient(baseUrl);

  try {
    section('Health and authentication');

    const health = await a.request('GET', '/health');
    check('GET /health returns ok', health.status === 200 && health.body?.status === 'ok');

    const noAuth = await makeClient(baseUrl).request('GET', '/api/documents');
    check(
      'an unauthenticated request is refused with 401',
      noAuth.status === 401 && noAuth.body?.error?.code === 'UNAUTHENTICATED',
      `got ${noAuth.status}`,
    );

    const badEmail = await a.request('POST', '/api/auth/signup', {
      email: 'not-an-email',
      password,
    });
    check(
      'signup rejects a malformed email with a specific message',
      badEmail.status === 400 && badEmail.body?.error?.message === 'Enter a valid email address.',
      JSON.stringify(badEmail.body),
    );

    const shortPassword = await a.request('POST', '/api/auth/signup', {
      email: emailA,
      password: 'short',
    });
    check(
      'signup rejects a short password with a specific message',
      shortPassword.status === 400 &&
        shortPassword.body?.error?.message === 'Use at least 8 characters.',
      JSON.stringify(shortPassword.body),
    );

    const signup = await a.request('POST', '/api/auth/signup', { email: emailA, password });
    check('signup succeeds and returns the user', signup.status === 201 && !!signup.body?.user?.id);
    check('signup sets a session cookie', a.cookie.startsWith('mc_session='));

    const duplicate = await makeClient(baseUrl).request('POST', '/api/auth/signup', {
      email: emailA,
      password,
    });
    check(
      'a duplicate signup is refused with 409',
      duplicate.status === 409,
      `got ${duplicate.status}`,
    );

    const wrongPassword = await makeClient(baseUrl).request('POST', '/api/auth/login', {
      email: emailA,
      password: 'wrong-password',
    });
    check(
      'login with a wrong password returns the generic message',
      wrongPassword.status === 401 &&
        wrongPassword.body?.error?.message === 'Email or password is incorrect.',
      JSON.stringify(wrongPassword.body),
    );

    const unknownUser = await makeClient(baseUrl).request('POST', '/api/auth/login', {
      email: `nobody-${stamp}@example.test`,
      password,
    });
    check(
      'login with an unknown email returns the same message, revealing nothing',
      unknownUser.body?.error?.message === wrongPassword.body?.error?.message,
    );

    const me = await a.request('GET', '/api/auth/me');
    check('GET /me returns the signed-in user', me.status === 200 && me.body?.user?.email === emailA);

    await b.request('POST', '/api/auth/signup', { email: emailB, password });

    section('Document creation and the reference calculation');

    const badDate = await a.request('POST', '/api/documents', {
      title: 'Bad date',
      customer: 'Test',
      issueDate: '2026-06-31',
    });
    check(
      'a date that does not exist is rejected, not rolled into the next month',
      badDate.status === 400 && badDate.body?.error?.message === "That date doesn't exist.",
      JSON.stringify(badDate.body),
    );

    const created = await a.request('POST', '/api/documents', {
      title: 'Q3 Platform Retainer',
      customer: 'Northwind Trading Co.',
      issueDate: '2026-08-08',
      currency: 'USD',
    });
    check('POST /documents creates a draft', created.status === 201);
    check('a new document is a DRAFT', created.body?.document?.status === 'DRAFT');
    check('a new document has an editable currency', created.body?.document?.currencyEditable === true);

    const docId = created.body.document.id as string;

    for (const line of REFERENCE_LINES) {
      const added = await a.request('POST', `/api/documents/${docId}/lines`, line);
      check(`line "${line.description}" is added`, added.status === 201, JSON.stringify(added.body));
    }

    const withLines = await a.request('GET', `/api/documents/${docId}`);
    const doc = withLines.body.document;

    check(
      'Widget A: 10% off 200.00 then 5% tax on 180.00 gives 189.00',
      doc.lines[0].lineSubtotalMinor === 20000 &&
        doc.lines[0].discountAmountMinor === 2000 &&
        doc.lines[0].afterDiscountMinor === 18000 &&
        doc.lines[0].taxAmountMinor === 900 &&
        doc.lines[0].lineTotalMinor === 18900,
      JSON.stringify(doc.lines[0]),
    );
    check(
      'Widget B: no discount, 5% tax on 50.00 gives 52.50',
      doc.lines[1].taxAmountMinor === 250 && doc.lines[1].lineTotalMinor === 5250,
    );
    check(
      'Service fee: 20.00 fixed off 200.00, no tax, gives 180.00',
      doc.lines[2].discountAmountMinor === 2000 && doc.lines[2].lineTotalMinor === 18000,
    );
    check(
      'document totals are 450.00 / 40.00 / 11.50 / 421.50',
      doc.subtotalMinor === 45000 &&
        doc.totalDiscountMinor === 4000 &&
        doc.totalTaxMinor === 1150 &&
        doc.grandTotalMinor === 42150,
      JSON.stringify({
        subtotal: doc.subtotalMinor,
        discount: doc.totalDiscountMinor,
        tax: doc.totalTaxMinor,
        grand: doc.grandTotalMinor,
      }),
    );
    check(
      'the grand total equals the sum of the line totals',
      doc.grandTotalMinor ===
        doc.lines.reduce((sum: number, l: any) => sum + l.lineTotalMinor, 0),
    );
    check('positions are 1..n in order', JSON.stringify(doc.lines.map((l: any) => l.position)) === '[1,2,3]');
    check('the currency locks once a line exists', doc.currencyEditable === false);

    section('Validation errors are specific');

    const cases: Array<[string, unknown, string]> = [
      [
        'quantity below 1',
        { ...REFERENCE_LINES[1], quantity: 0 },
        'Quantity must be at least 1.',
      ],
      [
        'a fractional quantity',
        { ...REFERENCE_LINES[1], quantity: 1.5 },
        'Quantity must be a whole number.',
      ],
      [
        'a negative unit price',
        { ...REFERENCE_LINES[1], unitPriceMinor: -100 },
        "Unit price can't be negative.",
      ],
      [
        'an empty description',
        { ...REFERENCE_LINES[1], description: '   ' },
        'Add a description.',
      ],
      [
        'a discount percent above 100',
        { ...REFERENCE_LINES[1], discountType: 'PERCENT', discountPercentBp: 10001 },
        'Discount percent must be between 0 and 100.',
      ],
      [
        'a tax percent above 100',
        { ...REFERENCE_LINES[1], taxPercentBp: 10001 },
        'Tax percent must be between 0 and 100.',
      ],
      [
        'both discount kinds at once',
        {
          ...REFERENCE_LINES[1],
          discountType: 'PERCENT',
          discountPercentBp: 1000,
          discountFixedMinor: 500,
        },
        'A line can have a percent discount or a fixed discount, not both.',
      ],
      [
        'a fixed discount above the line subtotal',
        {
          description: 'Too much off',
          quantity: 1,
          unitPriceMinor: 5000,
          discountType: 'FIXED',
          discountFixedMinor: 9999,
        },
        "Discount can't be more than this line's subtotal of $50.00.",
      ],
      [
        'a quantity x price product that cannot be stored',
        {
          description: 'Overflow',
          quantity: 1000000,
          unitPriceMinor: 100000,
          discountType: 'NONE',
        },
        "This line's subtotal is too large to store. Reduce the quantity or the unit price.",
      ],
    ];

    for (const [name, body, expected] of cases) {
      const result = await a.request('POST', `/api/documents/${docId}/lines`, body);
      check(
        `${name} is refused with its own message`,
        result.status === 400 && result.body?.error?.message === expected,
        `got ${result.status} "${result.body?.error?.message}"`,
      );
    }

    const stillThree = await a.request('GET', `/api/documents/${docId}`);
    check(
      'no rejected line was persisted',
      stillThree.body.document.lines.length === 3 &&
        stillThree.body.document.grandTotalMinor === 42150,
    );

    section('The currency lock');

    const lockedCurrency = await a.request('PATCH', `/api/documents/${docId}`, { currency: 'JPY' });
    check(
      'changing currency on a document with lines is refused with 409',
      lockedCurrency.status === 409 &&
        lockedCurrency.body?.error?.message ===
          "Currency can't change once a document has line items. Remove all lines to change it.",
      `got ${lockedCurrency.status} "${lockedCurrency.body?.error?.message}"`,
    );

    const emptyDoc = await a.request('POST', '/api/documents', {
      title: 'Yen quote',
      customer: 'Sakura Robotics KK',
      issueDate: '2026-08-03',
      currency: 'USD',
    });
    const emptyId = emptyDoc.body.document.id as string;
    const switched = await a.request('PATCH', `/api/documents/${emptyId}`, { currency: 'JPY' });
    check(
      'changing currency on an empty document is allowed',
      switched.status === 200 && switched.body?.document?.currency === 'JPY',
      JSON.stringify(switched.body?.error),
    );

    const yenDecimals = await a.request('POST', `/api/documents/${emptyId}/lines`, {
      description: 'Localization',
      quantity: 1,
      unitPriceMinor: 1200,
      discountType: 'NONE',
      taxPercentBp: 1000,
    });
    check('a yen line is accepted', yenDecimals.status === 201, JSON.stringify(yenDecimals.body));
    check(
      'yen tax rounds to a whole yen',
      yenDecimals.body?.document?.lines?.[0]?.taxAmountMinor === 120,
      JSON.stringify(yenDecimals.body?.document?.lines?.[0]),
    );

    section('Reorder, edit, and delete');

    const before = await a.request('GET', `/api/documents/${docId}`);
    const ids = before.body.document.lines.map((l: any) => l.id) as string[];
    const reversed = [...ids].reverse();

    const reordered = await a.request('PATCH', `/api/documents/${docId}/lines/reorder`, {
      order: reversed,
    });
    check(
      'reordering rewrites positions without a unique-constraint collision',
      reordered.status === 200 &&
        JSON.stringify(reordered.body.document.lines.map((l: any) => l.id)) ===
          JSON.stringify(reversed),
      JSON.stringify(reordered.body?.error),
    );
    check(
      'the grand total is unchanged by reordering',
      reordered.body.document.grandTotalMinor === 42150,
    );

    const partialOrder = await a.request('PATCH', `/api/documents/${docId}/lines/reorder`, {
      order: [ids[0]],
    });
    check(
      'a partial reorder is refused',
      partialOrder.status === 400,
      `got ${partialOrder.status}`,
    );

    const edited = await a.request('PATCH', `/api/documents/${docId}/lines/${ids[0]}`, {
      description: 'Widget A (revised)',
      quantity: 3,
      unitPriceMinor: 10000,
      discountType: 'PERCENT',
      discountPercentBp: 1000,
      taxPercentBp: 500,
    });
    const revised = edited.body.document.lines.find((l: any) => l.id === ids[0]);
    check(
      'editing a line recomputes it: 3 x 100.00, 10% off, 5% tax',
      edited.status === 200 &&
        revised.lineSubtotalMinor === 30000 &&
        revised.discountAmountMinor === 3000 &&
        revised.taxAmountMinor === 1350 &&
        revised.lineTotalMinor === 28350,
      JSON.stringify(revised),
    );
    check(
      'the document total follows the edit',
      edited.body.document.grandTotalMinor === 28350 + 5250 + 18000,
      String(edited.body.document.grandTotalMinor),
    );

    const switchedToFixed = await a.request('PATCH', `/api/documents/${docId}/lines/${ids[0]}`, {
      description: 'Widget A (fixed discount)',
      quantity: 2,
      unitPriceMinor: 10000,
      discountType: 'FIXED',
      discountFixedMinor: 2500,
      taxPercentBp: 500,
    });
    const nowFixed = switchedToFixed.body.document.lines.find((l: any) => l.id === ids[0]);
    check(
      'switching discount type clears the other field rather than leaving it stale',
      nowFixed.discountPercentBp === null && nowFixed.discountFixedMinor === 2500,
      JSON.stringify(nowFixed),
    );

    const deleted = await a.request('DELETE', `/api/documents/${docId}/lines/${ids[1]}`);
    check(
      'deleting a line renumbers the remainder to close the gap',
      deleted.status === 200 &&
        JSON.stringify(deleted.body.document.lines.map((l: any) => l.position)) === '[1,2]',
      JSON.stringify(deleted.body.document.lines.map((l: any) => l.position)),
    );

    section('Finalize preconditions and immutability');

    const emptyFinalize = await a.request('POST', '/api/documents', {
      title: 'Nothing on it',
      customer: 'Empty Co.',
      issueDate: '2026-08-01',
    });
    const emptyFinalizeId = emptyFinalize.body.document.id as string;
    const refused = await a.request('POST', `/api/documents/${emptyFinalizeId}/finalize`);
    check(
      'finalizing an empty document is refused with 422',
      refused.status === 422 &&
        refused.body?.error?.message === 'Add at least one line before finalizing.',
      `got ${refused.status} "${refused.body?.error?.message}"`,
    );

    const finalized = await a.request('POST', `/api/documents/${docId}/finalize`);
    check('finalize succeeds', finalized.status === 200);
    check('the status becomes FINALIZED', finalized.body?.document?.status === 'FINALIZED');
    check('finalizedAt is stamped', !!finalized.body?.document?.finalizedAt);

    const frozenTotal = finalized.body.document.grandTotalMinor as number;

    const mutations: Array<[string, string, string, unknown]> = [
      ['metadata', 'PATCH', `/api/documents/${docId}`, { title: 'Renamed' }],
      ['currency', 'PATCH', `/api/documents/${docId}`, { currency: 'EUR' }],
      ['adding a line', 'POST', `/api/documents/${docId}/lines`, REFERENCE_LINES[1]],
      [
        'editing a line',
        'PATCH',
        `/api/documents/${docId}/lines/${ids[0]}`,
        { ...REFERENCE_LINES[0], description: 'Changed' },
      ],
      ['deleting a line', 'DELETE', `/api/documents/${docId}/lines/${ids[0]}`, undefined],
      ['reordering', 'PATCH', `/api/documents/${docId}/lines/reorder`, { order: [ids[0]] }],
      ['finalizing again', 'POST', `/api/documents/${docId}/finalize`, undefined],
      ['deleting the document', 'DELETE', `/api/documents/${docId}`, undefined],
    ];

    for (const [name, method, path, body] of mutations) {
      const result = await a.request(method, path, body);
      check(
        `${name} on a finalized document is refused with 409`,
        result.status === 409 && result.body?.error?.code === 'CONFLICT',
        `got ${result.status} ${JSON.stringify(result.body?.error?.message)}`,
      );
    }

    const afterAttempts = await a.request('GET', `/api/documents/${docId}`);
    check(
      'the finalized document is byte-for-byte unchanged after every attempt',
      afterAttempts.body.document.grandTotalMinor === frozenTotal &&
        afterAttempts.body.document.title === 'Q3 Platform Retainer' &&
        afterAttempts.body.document.lines.length === 2,
    );

    section('Duplicate');

    const copy = await a.request('POST', `/api/documents/${docId}/duplicate`);
    check('duplicating a finalized document succeeds', copy.status === 201);
    check('the copy is a draft', copy.body?.document?.status === 'DRAFT');
    check('the copy has no finalizedAt', copy.body?.document?.finalizedAt === null);
    check('the copy is titled as a copy', copy.body?.document?.title?.endsWith('(copy)') === true);
    check(
      'the copy carries the same currency and totals',
      copy.body?.document?.currency === 'USD' &&
        copy.body?.document?.grandTotalMinor === frozenTotal,
      `${copy.body?.document?.grandTotalMinor} vs ${frozenTotal}`,
    );
    check(
      'the copy is issued today, not on the original date',
      copy.body?.document?.issueDate === new Date().toISOString().slice(0, 10),
      copy.body?.document?.issueDate,
    );
    const copyEditable = await a.request('PATCH', `/api/documents/${copy.body.document.id}`, {
      title: 'Revised quote',
    });
    check('the copy is editable', copyEditable.status === 200);

    section('Ownership isolation');

    const otherUserGet = await b.request('GET', `/api/documents/${docId}`);
    check(
      "another user gets 404 — not 403 — for a document they do not own",
      otherUserGet.status === 404,
      `got ${otherUserGet.status}`,
    );

    const otherUserPatch = await b.request('PATCH', `/api/documents/${docId}`, { title: 'Hijack' });
    check('another user cannot patch it', otherUserPatch.status === 404);

    const otherUserLine = await b.request('POST', `/api/documents/${docId}/lines`, REFERENCE_LINES[1]);
    check('another user cannot add a line to it', otherUserLine.status === 404);

    const otherUserDelete = await b.request('DELETE', `/api/documents/${docId}`);
    check('another user cannot delete it', otherUserDelete.status === 404);

    const bList = await b.request('GET', '/api/documents');
    check("another user's list is empty", bList.body?.total === 0, JSON.stringify(bList.body?.total));

    section('List filtering and the summary report');

    const listAll = await a.request('GET', '/api/documents?pageSize=100');
    check('the list returns this user documents only', listAll.status === 200);
    const listedIds = listAll.body.items.map((d: any) => d.id);
    check('the list includes the finalized document', listedIds.includes(docId));

    const listDrafts = await a.request('GET', '/api/documents?status=draft&pageSize=100');
    check(
      'filtering by draft excludes finalized documents',
      listDrafts.body.items.every((d: any) => d.status === 'DRAFT'),
    );

    const listSearch = await a.request('GET', '/api/documents?q=northwind&pageSize=100');
    check(
      'search matches the customer name case-insensitively',
      listSearch.body.items.length > 0 &&
        listSearch.body.items.every((d: any) =>
          `${d.title} ${d.customer}`.toLowerCase().includes('northwind'),
        ),
    );

    const inverted = await a.request('GET', '/api/reports/summary?from=2026-08-31&to=2026-08-01');
    check(
      'an inverted report range is refused with a specific message',
      inverted.status === 400 &&
        inverted.body?.error?.message === 'The end date must fall on or after the start date.',
      `got ${inverted.status} "${inverted.body?.error?.message}"`,
    );

    const report = await a.request(
      'GET',
      '/api/reports/summary?from=2026-01-01&to=2026-12-31&includeDocuments=true',
    );
    check('the summary report succeeds', report.status === 200);

    const usdGroup = report.body.groups.find((g: any) => g.currency === 'USD');
    const jpyGroup = report.body.groups.find((g: any) => g.currency === 'JPY');
    check('the report groups by currency', !!usdGroup && !!jpyGroup, JSON.stringify(report.body.groups));

    for (const group of report.body.groups) {
      const contributing = report.body.documents.filter((d: any) => d.currency === group.currency);
      const expected = contributing.reduce(
        (acc: any, d: any) => ({
          count: acc.count + 1,
          subtotal: acc.subtotal + d.subtotalMinor,
          discount: acc.discount + d.totalDiscountMinor,
          tax: acc.tax + d.totalTaxMinor,
          grand: acc.grand + d.grandTotalMinor,
        }),
        { count: 0, subtotal: 0, discount: 0, tax: 0, grand: 0 },
      );

      check(
        `${group.currency} report totals reconcile with the documents in range`,
        group.documentCount === expected.count &&
          group.subtotalMinor === expected.subtotal &&
          group.totalDiscountMinor === expected.discount &&
          group.totalTaxMinor === expected.tax &&
          group.grandTotalMinor === expected.grand,
        `group ${JSON.stringify(group)} vs documents ${JSON.stringify(expected)}`,
      );
    }

    const finalizedOnly = await a.request(
      'GET',
      '/api/reports/summary?from=2026-01-01&to=2026-12-31&includeDrafts=false&includeDocuments=true',
    );
    check(
      'includeDrafts=false is honoured rather than read as truthy',
      finalizedOnly.body.documents.every((d: any) => d.status === 'FINALIZED'),
      JSON.stringify(finalizedOnly.body.documents.map((d: any) => d.status)),
    );
    check(
      'excluding drafts lowers the document count',
      finalizedOnly.body.documentCount < report.body.documentCount,
      `${finalizedOnly.body.documentCount} vs ${report.body.documentCount}`,
    );

    const narrow = await a.request('GET', '/api/reports/summary?from=2026-08-08&to=2026-08-08');
    check(
      'a one-day range counts only that day',
      narrow.body.documentCount >= 1,
      JSON.stringify(narrow.body),
    );

    section('Archive');

    const archiveDraft = await a.request('POST', `/api/documents/${emptyFinalizeId}/archive`);
    check(
      'archiving a draft is refused with 409',
      archiveDraft.status === 409 &&
        archiveDraft.body?.error?.message === 'Only a finalized document can be archived.',
      `got ${archiveDraft.status} "${archiveDraft.body?.error?.message}"`,
    );

    const deleteFinalized = await a.request('DELETE', `/api/documents/${docId}`);
    check(
      'deleting a finalized document is still refused with 409',
      deleteFinalized.status === 409,
      `got ${deleteFinalized.status}`,
    );

    const beforeArchive = await a.request('GET', `/api/documents/${docId}`);
    const updatedAtBefore = beforeArchive.body.document.updatedAt as string;

    const archived = await a.request('POST', `/api/documents/${docId}/archive`);
    check('archiving a finalized document succeeds', archived.status === 200);
    check('the response reports it archived', archived.body?.document?.archived === true);
    check('archivedAt is stamped', !!archived.body?.document?.archivedAt);
    check(
      'archiving does not change the status',
      archived.body?.document?.status === 'FINALIZED',
      archived.body?.document?.status,
    );
    check(
      'archiving leaves updatedAt untouched on a frozen record',
      archived.body?.document?.updatedAt === updatedAtBefore,
      `${archived.body?.document?.updatedAt} vs ${updatedAtBefore}`,
    );
    check(
      'the frozen totals are unchanged by archiving',
      archived.body?.document?.grandTotalMinor === frozenTotal,
    );

    const archiveTwice = await a.request('POST', `/api/documents/${docId}/archive`);
    check(
      'archiving an already-archived document is refused',
      archiveTwice.status === 409,
      `got ${archiveTwice.status}`,
    );

    const listAfterArchive = await a.request('GET', '/api/documents?pageSize=100');
    check(
      'an archived document leaves the default list',
      !listAfterArchive.body.items.some((d: any) => d.id === docId),
    );

    const archiveList = await a.request('GET', '/api/documents?archived=true&pageSize=100');
    check(
      'archived=true returns it',
      archiveList.body.items.some((d: any) => d.id === docId),
    );
    check(
      'archived=true returns ONLY archived documents',
      archiveList.body.items.every((d: any) => d.archived === true),
    );

    const reportAfterArchive = await a.request(
      'GET',
      '/api/reports/summary?from=2026-01-01&to=2026-12-31&includeDocuments=true',
    );
    check('the report declares that it excludes archived documents', reportAfterArchive.body?.excludesArchived === true);
    check(
      'an archived document leaves the report breakdown',
      !reportAfterArchive.body.documents.some((d: any) => d.id === docId),
    );
    const groupSum = reportAfterArchive.body.groups.reduce(
      (sum: number, g: any) => sum + g.documentCount,
      0,
    );
    check(
      'the report still reconciles after archiving — aggregate and breakdown agree',
      groupSum === reportAfterArchive.body.documents.length,
      `groups ${groupSum} vs breakdown ${reportAfterArchive.body.documents.length}`,
    );
    for (const group of reportAfterArchive.body.groups) {
      const rows = reportAfterArchive.body.documents.filter(
        (d: any) => d.currency === group.currency,
      );
      const grand = rows.reduce((s: number, d: any) => s + d.grandTotalMinor, 0);
      check(
        `${group.currency} totals still reconcile after archiving`,
        group.grandTotalMinor === grand,
        `${group.grandTotalMinor} vs ${grand}`,
      );
    }

    const archivedById = await a.request('GET', `/api/documents/${docId}`);
    check(
      'an archived document is still readable by id and says so',
      archivedById.status === 200 && archivedById.body.document.archived === true,
    );

    const dupArchived = await a.request('POST', `/api/documents/${docId}/duplicate`);
    check(
      'an archived document can be duplicated into a live draft',
      dupArchived.status === 201 &&
        dupArchived.body.document.status === 'DRAFT' &&
        dupArchived.body.document.archived === false,
      `got ${dupArchived.status}`,
    );

    const otherArchive = await b.request('POST', `/api/documents/${docId}/unarchive`);
    check(
      'another user cannot restore a document they do not own',
      otherArchive.status === 404,
      `got ${otherArchive.status}`,
    );

    const restored = await a.request('POST', `/api/documents/${docId}/unarchive`);
    check('restoring succeeds', restored.status === 200);
    check(
      'restore returns the document STILL FINALIZED — the un-finalize path stays closed',
      restored.body?.document?.status === 'FINALIZED',
      restored.body?.document?.status,
    );
    check('restore clears archivedAt', restored.body?.document?.archivedAt === null);
    check(
      'restore leaves the frozen totals untouched',
      restored.body?.document?.grandTotalMinor === frozenTotal,
    );
    const restoredIsEditable = await a.request('PATCH', `/api/documents/${docId}`, {
      title: 'Should not be editable',
    });
    check(
      'a restored document is still immutable',
      restoredIsEditable.status === 409,
      `got ${restoredIsEditable.status}`,
    );

    const unarchiveTwice = await a.request('POST', `/api/documents/${docId}/unarchive`);
    check(
      'restoring a document that is not archived is refused',
      unarchiveTwice.status === 409,
      `got ${unarchiveTwice.status}`,
    );

    const backInList = await a.request('GET', '/api/documents?pageSize=100');
    check(
      'a restored document returns to the default list',
      backInList.body.items.some((d: any) => d.id === docId),
    );

    section('Logout');

    const logout = await a.request('POST', '/api/auth/logout');
    check('logout returns 204', logout.status === 204);
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const name of failures) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error('\nVerification run failed:\n', error);
  await prisma.$disconnect();
  process.exit(1);
});
