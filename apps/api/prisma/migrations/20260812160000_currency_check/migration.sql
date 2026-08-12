-- documents.currency was the one domain invariant with no database CHECK.
--
-- Every other rule in this schema is enforced at the storage layer — the discount shape, the
-- totals reconciliation, finalizedAt matching status, archived implying finalized. Currency was
-- plain TEXT, so a bad code could be stored and would then reach the client, which looks it up in
-- the CURRENCIES table and would throw on an unrecognised key.
--
-- The list is deliberately enumerated rather than expressed as a shape test (three uppercase
-- letters). The currency set is curated and small, and its minor-unit exponents are hand-verified
-- in packages/calc/src/currency.ts — a code the engine has no exponent for is not storable data,
-- it is a bug. Enumerating means adding a currency requires touching this constraint too.
--
-- That coupling fails CLOSED: forget the migration and inserts of the new code are rejected, which
-- forces the exponent question to be answered rather than defaulted. Keep this list in step with
-- CURRENCY_CODES in packages/calc/src/currency.ts.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_currency_supported" CHECK (
    "currency" IN ('USD','EUR','GBP','INR','AED','AUD','CAD','SGD','JPY','KRW','KWD','BHD')
  );
