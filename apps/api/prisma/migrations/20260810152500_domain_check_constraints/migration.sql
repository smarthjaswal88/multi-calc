-- Domain invariants that Prisma's schema language cannot express.
--
-- These duplicate rules already enforced by the Zod schemas and the API guards. That is the
-- point: the rules that define a correct pricing document should be impossible to violate
-- through any path into the database, including a direct SQL session, a future endpoint that
-- forgets a guard, or a bad migration.

-- ---------------------------------------------------------------------------------------
-- A line may carry a percent discount OR a fixed discount, never both, and only the field
-- matching its type may be populated.
--
-- This is the specification's third confirmation rule, enforced for the third time — the
-- interface makes the state unreachable, the Zod schema rejects it, and this refuses to
-- store it.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_discount_shape" CHECK (
    ("discountType" = 'NONE'
       AND "discountPercentBp" IS NULL
       AND "discountFixedMinor" IS NULL)
    OR
    ("discountType" = 'PERCENT'
       AND "discountPercentBp" IS NOT NULL
       AND "discountFixedMinor" IS NULL)
    OR
    ("discountType" = 'FIXED'
       AND "discountFixedMinor" IS NOT NULL
       AND "discountPercentBp" IS NULL)
  );

-- ---------------------------------------------------------------------------------------
-- A fixed discount may not exceed the line's own subtotal.
--
-- Both operands live in the same row, so this is expressible as a row-level CHECK. We reject
-- rather than clamp, consistent with the policy: never silently alter a figure the author
-- typed.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_fixed_discount_within_subtotal" CHECK (
    "discountType" <> 'FIXED'
    OR "discountFixedMinor" <= "quantity" * "unitPriceMinor"
  );

-- ---------------------------------------------------------------------------------------
-- Percentages are basis points bounded to 0–100%.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_discount_percent_range" CHECK (
    "discountPercentBp" IS NULL
    OR ("discountPercentBp" >= 0 AND "discountPercentBp" <= 10000)
  );

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_tax_percent_range" CHECK (
    "taxPercentBp" IS NULL
    OR ("taxPercentBp" >= 0 AND "taxPercentBp" <= 10000)
  );

-- ---------------------------------------------------------------------------------------
-- Quantities, prices, and positions.
--
-- Note on quantity: the specification's finalize check ("reject if any line has quantity
-- <= 0") remains implemented in services/finalize.ts and unit-tested, but this constraint
-- means a document can never reach that state through the API in the first place. The check
-- is retained as defence in depth rather than removed.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_quantity_positive" CHECK ("quantity" >= 1);

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_unit_price_non_negative" CHECK ("unitPriceMinor" >= 0);

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_fixed_discount_non_negative" CHECK (
    "discountFixedMinor" IS NULL OR "discountFixedMinor" >= 0
  );

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_position_positive" CHECK ("position" >= 1);

-- ---------------------------------------------------------------------------------------
-- Computed columns can never be negative. A negative total is always a fault in the
-- calculation path, and failing at the write is far cheaper than discovering it on an
-- invoice.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_computed_non_negative" CHECK (
    "lineSubtotalMinor" >= 0
    AND "discountAmountMinor" >= 0
    AND "afterDiscountMinor" >= 0
    AND "taxAmountMinor" >= 0
    AND "lineTotalMinor" >= 0
  );

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_totals_non_negative" CHECK (
    "subtotalMinor" >= 0
    AND "totalDiscountMinor" >= 0
    AND "totalTaxMinor" >= 0
    AND "grandTotalMinor" >= 0
  );

-- ---------------------------------------------------------------------------------------
-- The document totals invariant, enforced in the database.
--
-- subtotal - totalDiscount + totalTax = grandTotal holds because every component is a sum of
-- the same rounded per-line figures. If a future change to the calculation breaks it, the
-- write fails here rather than producing a document whose totals do not reconcile.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_totals_reconcile" CHECK (
    "grandTotalMinor" = "subtotalMinor" - "totalDiscountMinor" + "totalTaxMinor"
  );

-- ---------------------------------------------------------------------------------------
-- finalizedAt is set exactly when the status is FINALIZED. Two representations of the same
-- fact must not disagree.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_finalized_at_matches_status" CHECK (
    ("status" = 'FINALIZED' AND "finalizedAt" IS NOT NULL)
    OR ("status" = 'DRAFT' AND "finalizedAt" IS NULL)
  );
