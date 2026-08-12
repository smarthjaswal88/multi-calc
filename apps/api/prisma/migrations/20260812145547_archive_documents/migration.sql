-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documents_userId_archivedAt_idx" ON "documents"("userId", "archivedAt");

-- ---------------------------------------------------------------------------------------
-- Archiving is only meaningful for a closed record.
--
-- Written as an IMPLICATION (archived ⇒ finalized) rather than the two-branch shape used by
-- documents_finalized_at_matches_status. The two-branch form has to enumerate every status, so
-- it starts rejecting rows the day the enum gains a value; an implication constrains only the
-- case it cares about and stays correct.
--
-- Note what this CANNOT do. A row-level CHECK sees only the new row, never the previous one, so
-- it cannot express the rule that actually protects immutability — that status must never move
-- away from FINALIZED. Restore-preserves-FINALIZED is guaranteed by the service guard and the
-- end-to-end test, not by the database. Closing it at the storage layer needs a BEFORE UPDATE
-- trigger; see docs/archive-feature.md §6.1 for why that was left out.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_archived_only_when_finalized" CHECK (
    "archivedAt" IS NULL OR "status" = 'FINALIZED'
  );

-- A document cannot be archived before it was finalized. A NULL on either side yields NULL,
-- which a CHECK treats as satisfied, so this is safe for every draft.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_archived_after_finalized" CHECK (
    "archivedAt" IS NULL OR "archivedAt" >= "finalizedAt"
  );
