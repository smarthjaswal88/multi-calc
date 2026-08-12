-- Fix an int4 overflow inside a CHECK expression, and mirror the calc package's ceilings.
--
-- PROBLEM
-- The fixed-discount constraint multiplied two INTEGER columns:
--
--     "discountFixedMinor" <= "quantity" * "unitPriceMinor"
--
-- Postgres evaluates that product in int4. Neither operand was bounded from above, so for a
-- large-but-legal pair the statement aborted with SQLSTATE 22003 "integer out of range"
-- instead of 23514 naming the constraint.
--
-- It failed closed, so no row violating the rule could ever be stored — the invariant held.
-- The defect is in *error classification*: an error mapper keyed on constraint names sees an
-- unrecognised code and returns 500 where the correct answer is a 400 naming the field.
-- Reproduced with quantity 1000000000 x unitPriceMinor 100 and discountFixedMinor 2000000000,
-- which is a genuine violation of the rule yet produced no constraint name.
--
-- FIX
-- Cast the multiplication to bigint, whose range (~9.22e18) exceeds the worst case of
-- 2.147e9 squared (~4.6e18). Then add the upper bounds the calc package derives, so the
-- database's accepted range matches the validation layer's rather than merely containing it.

ALTER TABLE "line_items"
  DROP CONSTRAINT "line_items_fixed_discount_within_subtotal";

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_fixed_discount_within_subtotal" CHECK (
    "discountType" <> 'FIXED'
    OR "discountFixedMinor" <= "quantity"::bigint * "unitPriceMinor"::bigint
  );

-- ---------------------------------------------------------------------------------------
-- Upper bounds mirroring @multi-calc/calc: MAX_QUANTITY = 1,000,000 and
-- MAX_AMOUNT_MINOR = 2,000,000,000. Previously the only ceiling was the INTEGER type itself
-- (2,147,483,647), which is looser than what validation enforces. Aligning them means a
-- request that bypasses the Zod layer is refused by a named constraint rather than by a
-- driver-level range error.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_quantity_max" CHECK ("quantity" <= 1000000);

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_unit_price_max" CHECK ("unitPriceMinor" <= 2000000000);

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_fixed_discount_max" CHECK (
    "discountFixedMinor" IS NULL OR "discountFixedMinor" <= 2000000000
  );

-- The product, not just the factors. Both bounds above can hold while their product cannot be
-- stored, which is the same class of gap the calc package closes in lineInputSchema.
ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_subtotal_within_ceiling" CHECK (
    "quantity"::bigint * "unitPriceMinor"::bigint <= 2000000000
  );

ALTER TABLE "line_items"
  ADD CONSTRAINT "line_items_computed_within_ceiling" CHECK (
    "lineSubtotalMinor" <= 2000000000
    AND "discountAmountMinor" <= 2000000000
    AND "afterDiscountMinor" <= 2000000000
    AND "taxAmountMinor" <= 2000000000
    AND "lineTotalMinor" <= 2000000000
  );

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_totals_within_ceiling" CHECK (
    "subtotalMinor" <= 2000000000
    AND "totalDiscountMinor" <= 2000000000
    AND "totalTaxMinor" <= 2000000000
    AND "grandTotalMinor" <= 2000000000
  );
