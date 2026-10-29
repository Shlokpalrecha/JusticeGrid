-- Persist the remaining comparator key so case-list priority ordering matches
-- the canonical action queue. Refresh the cache without altering historical facts.
ALTER TABLE "Case" ADD COLUMN "queueActivatedAt" TIMESTAMP(3);
CREATE INDEX "Case_queueNextEvaluationAt_idx" ON "Case" ("queueNextEvaluationAt");
UPDATE "Case" SET "queueNextEvaluationAt" = NULL;
